import { Proxy } from './proxy';
import { socks5Tunnel } from './socks5';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string;
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

function parseHttpResponse(data: Uint8Array): { status: number; statusText: string; headers: Headers; body: Uint8Array } {
	const text = new TextDecoder().decode(data);
	const headerEnd = text.indexOf('\r\n\r\n');
	const headersPart = text.substring(0, headerEnd);
	const bodyStart = headerEnd + 4;
	const body = data.slice(bodyStart);

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

	return { status, statusText, headers, body };
}

export async function fetch(
	url: string | URL,
	options?: ProxyFetchOptions,
): Promise<Response> {
	const target = new URL(url);
	const method = (options?.method ?? 'GET').toUpperCase();
	const proxy = parseProxyUri(options?.proxy ?? '');

	const socksProxy = new Proxy(socks5Tunnel, {
		hostname: proxy.hostname,
		port: proxy.port,
		username: proxy.username,
		password: proxy.password,
	});

	const isTls = target.protocol === 'https:';
	const targetPort = target.port ? Number(target.port) : (isTls ? 443 : 80);

	let conn;
	try {
		conn = await socksProxy.acquire(
			{ host: target.hostname, port: targetPort, tls: isTls },
		);

		const requestBytes = buildRequest(target, method, options?.headers, options?.body);
		await conn.write(requestBytes);

		const reader = conn.readable.getReader();
		const chunks: Uint8Array[] = [];

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push(value);
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

		const { status, statusText, headers, body } = parseHttpResponse(allData);
		return new Response(body, { status, statusText, headers });
	} finally {
		if (conn) {
			conn.close();
		}
		socksProxy.close();
	}
}
