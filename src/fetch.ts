import { Proxy } from './proxy';
import { buildRequest } from './http/request';
import { readHeaders } from './http/response';
import { createGunzipStream, drainReader, pipeReaderToWriter } from './http/stream';
import { checkProxyError } from './errors';
import type { ProxyConnection } from './connection';
import { MAX_REDIRECT, REDIRECT_STATUSES } from './constants';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
}

async function performRequest(conn: ProxyConnection, url: URL, method: string, headers?: HeadersInit, body?: BodyInit | null) {
	await conn.write(buildRequest(url, method, headers, body));
	const reader = conn.readable.getReader();
	const parsed = await readHeaders(reader);
	checkProxyError(parsed.status, new TextDecoder().decode(parsed.initialBytes));
	return { reader, ...parsed };
}

function streamResponse(
	conn: ProxyConnection,
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	status: number,
	statusText: string,
	headers: Headers,
	isGzip: boolean,
): Response {
	if (isGzip) {
		headers.delete('Content-Encoding');
		headers.delete('Content-Length');
		return new Response(
			createGunzipStream(conn.readable, initialBytes, () => conn.close()),
			{ status, statusText, headers },
		);
	}
	const { readable, writable } = new TransformStream();
	pipeReaderToWriter(reader, writable.getWriter(), initialBytes, () => conn.close());
	return new Response(readable, { status, statusText, headers });
}

export async function socksFetch(urlOrString: string | URL, options: ProxyFetchOptions): Promise<Response> {
	const proxyStr = typeof options.proxy === 'string' ? options.proxy : null;
	const proxy = proxyStr ? Proxy.acquireProxy(proxyStr) : (options.proxy as Proxy);
	const release = (conn: ProxyConnection) => (proxyStr ? proxy.closeConnection(conn) : (proxy as Proxy).revokeConnection(conn));
	let url = new URL(urlOrString);
	let method = (options.method ?? 'GET').toUpperCase();
	let { headers, body } = options;

	for (let i = 0; i < MAX_REDIRECT; i++) {
		const isTls = url.protocol === 'https:';
		const port = url.port ? Number(url.port) : isTls ? 443 : 80;
		const conOpts = { host: url.hostname, port, tls: isTls };
		const conn = proxyStr ? await proxy.createConnection(conOpts) : await (proxy as Proxy).acquireConnection(conOpts);
		let freed = false;
		const free = () => {
			if (!freed) {
				freed = true;
				release(conn);
			}
		};

		try {
			const { reader, status, statusText, headers: rh, initialBytes } = await performRequest(conn, url, method, headers, body);

			if (!REDIRECT_STATUSES.has(status)) {
				return streamResponse(conn, reader, initialBytes, status, statusText, rh, rh.get('Content-Encoding') === 'gzip');
			}

			await drainReader(reader);
			free();
			const location = rh.get('Location');
			if (!location) return new Response(initialBytes, { status, statusText, headers: rh });
			url = new URL(location, url);
			if (status !== 307 && status !== 308) {
				method = 'GET';
				body = undefined;
			}
		} catch (e) {
			if (!freed) conn.close();
			throw e;
		}
	}

	return new Response('Too many redirects', { status: 499 });
}
