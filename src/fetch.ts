import { Proxy } from './proxy';
import { buildRequest } from './http/request';
import { readHeaders } from './http/response';
import { createGunzipStream, drainReader, pipeReaderToWriter } from './http/stream';
import { checkProxyError } from './errors';
import type { ProxyConnection } from './connection';
import { MAX_REDIRECT, REDIRECT_STATUSES } from './constants';
import { createDebugger } from './debug';
import type { DebugContext } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean;
}

async function performRequest(conn: ProxyConnection, url: URL, method: string, headers?: HeadersInit, body?: BodyInit | null, debug?: DebugContext) {
	const reqBytes = buildRequest(url, method, headers, body);
	debug?.dump(reqBytes, 'http.request');

	debug?.time('http.send');
	await conn.write(reqBytes);
	debug?.timeEnd('http.send');

	const reader = conn.readable.getReader();
	debug?.time('http.ttfb');
	const parsed = await readHeaders(reader);
	debug?.timeEnd('http.ttfb');

	checkProxyError(parsed.status, new TextDecoder().decode(parsed.initialBytes));
	debug?.log(`<- ${parsed.status} ${parsed.statusText}`);
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
	const debug = createDebugger(options.debug);
	const proxyStr = typeof options.proxy === 'string' ? options.proxy : null;
	const proxy = proxyStr ? Proxy.acquireProxy(proxyStr) : (options.proxy as Proxy);
	const release = (conn: ProxyConnection) => {
		debug?.log(`Releasing connection to ${conn.target.host}:${conn.target.port}`);
		proxyStr ? proxy.closeConnection(conn) : (proxy as Proxy).revokeConnection(conn);
	};
	let url = new URL(urlOrString);
	let method = (options.method ?? 'GET').toUpperCase();
	let { headers, body } = options;

	debug?.log(`-> ${method} ${url.toString()}`);
	debug?.time('total');

	for (let i = 0; i < MAX_REDIRECT; i++) {
		const isTls = url.protocol === 'https:';
		const port = url.port ? Number(url.port) : isTls ? 443 : 80;
		const conOpts = { host: url.hostname, port, tls: isTls };

		if (i > 0) debug?.log(`Redirect #${i}: ${method} ${url.toString()}`);

		const conn = proxyStr
			? await proxy.createConnection(conOpts, undefined, debug)
			: await (proxy as Proxy).acquireConnection(conOpts, undefined, debug);
		let freed = false;
		const free = () => {
			if (!freed) {
				freed = true;
				release(conn);
			}
		};

		try {
			const { reader, status, statusText, headers: rh, initialBytes } = await performRequest(conn, url, method, headers, body, debug);

			if (!REDIRECT_STATUSES.has(status)) {
				const cl = rh.get('Content-Length');
				const ce = rh.get('Content-Encoding');
				debug?.log(`Response: ${status}, content-length: ${cl ?? 'chunked'}, encoding: ${ce ?? 'none'}`);

				debug?.timeEnd('total');
				const entries = debug?.getEntries() ?? [];
				if (entries.length > 0) {
					debug?.log('── waterfall ──');
					const maxLabel = Math.max(...entries.map(e => e.label.length), 5);
					for (const e of entries) {
						debug?.log(` ${e.label.padEnd(maxLabel)} ${e.duration.toFixed(1)}ms`);
					}
				}
				return streamResponse(conn, reader, initialBytes, status, statusText, rh, ce === 'gzip');
			}

			await drainReader(reader);
			free();
			const location = rh.get('Location');
			if (!location) {
				debug?.log('Redirect without Location header');
				debug?.timeEnd('total');
				return new Response(initialBytes, { status, statusText, headers: rh });
			}
			url = new URL(location, url);
			if (status !== 307 && status !== 308) {
				method = 'GET';
				body = undefined;
			}
		} catch (e) {
			debug?.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			if (!freed) conn.close();
			throw e;
		}
	}

	debug?.log('Too many redirects');
	debug?.timeEnd('total');
	return new Response('Too many redirects', { status: 499 });
}
