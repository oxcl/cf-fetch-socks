import { Proxy } from './proxy';
import { buildRequest, readHeaders, drainReader, createGunzipStream } from './http';
import { checkProxyError } from './errors';
import type { ProxyConnection } from './connection';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
}

export async function socksFetch(url: string | URL, options?: ProxyFetchOptions): Promise<Response> {
	const proxyOpt = options?.proxy;
	const isOwned = typeof proxyOpt === 'string';
	const proxy = isOwned
		? Proxy.acquireProxy(proxyOpt)
		: (proxyOpt as Proxy);

	const cleanup = (conn: ProxyConnection) => {
		if (isOwned) {
			proxy.closeConnection(conn);
		} else {
			proxy.revokeConnection(conn);
		}
	};

	let currentUrl = new URL(url);
	let method = (options?.method ?? 'GET').toUpperCase();
	let headers = options?.headers;
	let body = options?.body;

	try {
		for (let i = 0; i < 20; i++) {
			const isTls = currentUrl.protocol === 'https:';
			const targetPort = currentUrl.port ? Number(currentUrl.port) : isTls ? 443 : 80;
			const target = { host: currentUrl.hostname, port: targetPort, tls: isTls };

			const conn = isOwned
				? await proxy.createConnection(target)
				: await proxy.acquireConnection(target);

			let connCleanedUp = false;
			const safeCleanup = () => {
				if (!connCleanedUp) {
					connCleanedUp = true;
					cleanup(conn);
				}
			};

			try {
				const requestBytes = buildRequest(currentUrl, method, headers, body);
				await conn.write(requestBytes);

				const reader = conn.readable.getReader();
				const { status, statusText, headers: respHeaders, initialBytes } = await readHeaders(reader);

				const initialText = new TextDecoder().decode(initialBytes);
				checkProxyError(status, initialText);

				if (!REDIRECT_STATUSES.has(status)) {
					const contentEncoding = respHeaders.get('Content-Encoding');

					if (contentEncoding === 'gzip') {
						const bodyStream = createGunzipStream(conn.readable, initialBytes, safeCleanup);
						respHeaders.delete('Content-Encoding');
						respHeaders.delete('Content-Length');
						return new Response(bodyStream, { status, statusText, headers: respHeaders });
					}

					const { readable, writable } = new TransformStream();
					const writer = writable.getWriter();
					(async () => {
						try {
							if (initialBytes.length > 0) await writer.write(initialBytes);
							while (true) {
								const { value, done } = await reader.read();
								if (done) break;
								await writer.write(value);
							}
						} finally {
							await writer.close();
							safeCleanup();
						}
					})();
					return new Response(readable, { status, statusText, headers: respHeaders });
				}

				await drainReader(reader);
				safeCleanup();

				const location = respHeaders.get('Location');
				if (!location) {
					return new Response(initialBytes, { status, statusText, headers: respHeaders });
				}

				currentUrl = new URL(location, currentUrl);

				if (status === 301 || status === 302 || status === 303) {
					method = 'GET';
					body = undefined;
				}
			} catch (error) {
				if (!connCleanedUp) {
					conn.close();
				}
				throw error;
			}
		}

		return new Response('Too many redirects', { status: 499 });
	} catch (error) {
		throw error;
	}
}
