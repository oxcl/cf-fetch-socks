import { readHeaders } from './response';
import { checkProxyError } from '../errors';
import type { ProxyConnection } from '../connection';
import type { DebugContext } from '../debug';

function serializeBody(body: BodyInit | null | undefined): Uint8Array | undefined {
	if (body == null) return undefined;
	if (body instanceof Uint8Array) return body;
	if (body instanceof ArrayBuffer) return new Uint8Array(body);
	if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
	return new TextEncoder().encode(String(body));
}

export function buildRequest(
	target: URL,
	method: string,
	headers?: HeadersInit,
	body?: BodyInit | null,
): Uint8Array {
	const path = target.pathname + target.search;
	const lines = [
		`${method} ${path} HTTP/1.1`,
		`Host: ${target.host}`,
		`User-Agent: undici`,
		`Accept: */*`,
		`Connection: keep-alive`,
	];

	const extraHeaders = new Headers(headers);
	const bodyBytes = serializeBody(body);

	if (bodyBytes) {
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

	lines.push('', '');
	const headerBytes = new TextEncoder().encode(lines.join('\r\n'));

	if (bodyBytes && bodyBytes.length > 0) {
		const result = new Uint8Array(headerBytes.length + bodyBytes.length);
		result.set(headerBytes);
		result.set(bodyBytes, headerBytes.length);
		return result;
	}

	return headerBytes;
}

export async function performRequest(
	conn: ProxyConnection,
	url: URL,
	method: string,
	headers?: HeadersInit,
	body?: BodyInit | null,
	debug?: DebugContext,
	reader?: ReadableStreamDefaultReader<Uint8Array> | null,
) {
	const reqBytes = buildRequest(url, method, headers, body);
	debug?.dump(reqBytes, 'http.request');

	debug?.time('http.send');
	await conn.write(reqBytes);
	debug?.timeEnd('http.send');

	if (!reader) {
		reader = conn.readable.getReader();
	}
	debug?.time('http.ttfb');
	const parsed = await readHeaders(reader);
	debug?.timeEnd('http.ttfb');

	checkProxyError(parsed.status, new TextDecoder().decode(parsed.initialBytes));
	debug?.log(`<- ${parsed.status} ${parsed.statusText}`);
	return { reader, ...parsed };
}
