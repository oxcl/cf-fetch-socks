import { Proxy } from './proxy';
import { socks5Tunnel } from './socks5';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ProxyFetchOptions extends RequestInit {
	proxy: string;
	maxRedirects?: number;
}

function parseProxyUri(proxy: string) {
	const url = new URL(proxy);
	return {
		hostname: url.hostname,
		port: Number(url.port),
		username: url.username || undefined,
		password: url.password || undefined,
	};
}

function buildRequest(target: URL, method: string, headers?: HeadersInit, body?: BodyInit | null): Uint8Array {
	const path = target.pathname + target.search;
	const lines = [
		`${method} ${path} HTTP/1.1`,
		`Host: ${target.host}`,
		`User-Agent: undici`,
		`Accept: */*`,
		`Connection: close`,
	];

	const extraHeaders = new Headers(headers);
	let bodyBytes: Uint8Array | undefined;
	if (body != null) {
		if (body instanceof Uint8Array) {
			bodyBytes = body;
		} else if (body instanceof ArrayBuffer) {
			bodyBytes = new Uint8Array(body);
		} else if (ArrayBuffer.isView(body)) {
			bodyBytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
		} else if (typeof body === 'string') {
			bodyBytes = new TextEncoder().encode(body);
		} else {
			bodyBytes = new TextEncoder().encode(String(body));
		}
		if (!extraHeaders.has('Content-Length')) {
			extraHeaders.set('Content-Length', String(bodyBytes.length));
		}
		if (!extraHeaders.has('Content-Type')) {
			extraHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
		}
	}

	for (const [key, value] of extraHeaders) {
		lines.push(`${key}: ${value}`);
	}

	lines.push(``, ``);
	const headerBytes = new TextEncoder().encode(lines.join('\r\n'));

	if (bodyBytes && bodyBytes.length > 0) {
		const result = new Uint8Array(headerBytes.length + bodyBytes.length);
		result.set(headerBytes);
		result.set(bodyBytes, headerBytes.length);
		return result;
	}
	return headerBytes;
}

function parseHttpHeaders(data: Uint8Array): { status: number; statusText: string; headers: Headers; bodyStart: number } {
	const text = new TextDecoder().decode(data);
	const headerEnd = text.indexOf('\r\n\r\n');
	const headersPart = text.substring(0, headerEnd);

	const lines = headersPart.split('\r\n');
	const [httpVersion, statusCode, ...statusTextParts] = lines[0].split(' ');
	const status = Number(statusCode);
	const statusText = statusTextParts.join(' ');

	const headers = new Headers();
	for (let i = 1; i < lines.length; i++) {
		const colonIndex = lines[i].indexOf(':');
		if (colonIndex === -1) continue;
		const key = lines[i].substring(0, colonIndex).trim();
		const value = lines[i].substring(colonIndex + 1).trim();
		headers.set(key, value);
	}

	return { status, statusText, headers, bodyStart: headerEnd + 4 };
}

async function readHeaders(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ status: number; statusText: string; headers: Headers; initialBytes: Uint8Array }> {
	const chunks: Uint8Array[] = [];
	let headerEndOffset = -1;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		chunks.push(value);

		let accumulated = '';
		for (const chunk of chunks) {
			accumulated += new TextDecoder().decode(chunk, { stream: true });
		}
		const idx = accumulated.indexOf('\r\n\r\n');
		if (idx !== -1) {
			headerEndOffset = new TextEncoder().encode(accumulated.substring(0, idx)).length;
			break;
		}
	}

	let totalLen = 0;
	for (const chunk of chunks) {
		totalLen += chunk.length;
	}
	const allData = new Uint8Array(totalLen);
	let offset = 0;
	for (const chunk of chunks) {
		allData.set(chunk, offset);
		offset += chunk.length;
	}

	const { status, statusText, headers, bodyStart } = parseHttpHeaders(allData);
	const initialBytes = allData.slice(bodyStart);
	return { status, statusText, headers, initialBytes };
}

async function drainReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
	while (true) {
		const { done } = await reader.read();
		if (done) break;
	}
}

async function openConnection(target: URL, socksProxy: Proxy) {
	const isTls = target.protocol === 'https:';
	const targetPort = target.port ? Number(target.port) : (isTls ? 443 : 80);
	return socksProxy.acquire({ host: target.hostname, port: targetPort, tls: isTls });
}

export async function fetch(
	url: string | URL,
	options?: ProxyFetchOptions,
): Promise<Response> {
	const maxRedirects = options?.maxRedirects ?? 20;
	const proxy = parseProxyUri(options?.proxy ?? '');

	const socksProxy = new Proxy(socks5Tunnel, {
		hostname: proxy.hostname,
		port: proxy.port,
		username: proxy.username,
		password: proxy.password,
	});

	let currentUrl = new URL(url);
	let method = (options?.method ?? 'GET').toUpperCase();
	let headers = options?.headers;
	let body = options?.body;

	try {
		for (let i = 0; i <= maxRedirects; i++) {
			const conn = await openConnection(currentUrl, socksProxy);
			const requestBytes = buildRequest(currentUrl, method, headers, body);
			await conn.write(requestBytes);

			const reader = conn.readable.getReader();
			const { status, statusText, headers: respHeaders, initialBytes } = await readHeaders(reader);

			if (!REDIRECT_STATUSES.has(status)) {
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
						conn.close();
						socksProxy.close();
					}
				})();
				return new Response(readable, { status, statusText, headers: respHeaders });
			}

			await drainReader(reader);
			conn.close();

			const location = respHeaders.get('Location');
			if (!location) {
				socksProxy.close();
				return new Response(initialBytes, { status, statusText, headers: respHeaders });
			}

			currentUrl = new URL(location, currentUrl);

			if (status === 301 || status === 302 || status === 303) {
				method = 'GET';
				body = undefined;
			}
		}

		socksProxy.close();
		return new Response('Too many redirects', { status: 499 });
	} catch (error) {
		socksProxy.close();
		throw error;
	}
}
