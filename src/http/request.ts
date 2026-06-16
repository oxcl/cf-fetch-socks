import { debug } from '../debug';
import { readHeaders } from './response';
import { checkProxyError } from '../errors';
import type { ProxyConnection } from '../connection';
import type { PerformResult } from '../executor/types';

function serializeBody(body: BodyInit | null | undefined): Uint8Array | undefined {
	if (body == null) return undefined;
	if (body instanceof Uint8Array) return body;
	if (body instanceof ArrayBuffer) return new Uint8Array(body);
	if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
	return new TextEncoder().encode(String(body));
}

export function buildRequest(target: URL, method: string, headers?: HeadersInit, body?: BodyInit | null): Uint8Array {
	const path = target.pathname + target.search;
	const defaultPort = target.protocol === 'https:' ? 443 : 80;
	const host = target.port && Number(target.port) !== defaultPort ? target.host : target.hostname;
	const lines = [`${method} ${path} HTTP/1.1`, `Host: ${host}`, `User-Agent: undici`, `Accept: */*`, `Connection: keep-alive`];

	const extraHeaders = new Headers(headers);
	const bodyBytes = serializeBody(body);

	if (bodyBytes) {
		if (!extraHeaders.has('Content-Length')) {
			extraHeaders.set('Content-Length', String(bodyBytes.length));
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

export async function drainBodyStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let len = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		len += value.length;
	}
	const buf = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) {
		buf.set(c, off);
		off += c.length;
	}
	return buf;
}

export async function performRequest(
	conn: ProxyConnection,
	request: Request,
	bodyBytes?: Uint8Array,
	signal?: AbortSignal,
): Promise<PerformResult> {
	if (signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');

	return new Promise<PerformResult>((resolve, reject) => {
		const onAbort = () => {
			reject(new DOMException('The operation was aborted', 'AbortError'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });

		(async () => {
			try {
				const url = new URL(request.url);
				const reqBytes = buildRequest(url, request.method, request.headers, bodyBytes);
				debug.dump(reqBytes, 'http.request');

				debug.time('http.send');
				await conn.write(reqBytes);
				debug.timeEnd('http.send');

				conn.reader = conn.readable.getReader();
				debug.time('http.ttfb');
				const parsed = await readHeaders(conn.reader);
				debug.timeEnd('http.ttfb');

				checkProxyError(parsed.status, new TextDecoder().decode(parsed.initialBytes));
				debug.log(`<- ${parsed.status} ${parsed.statusText}`);

				signal?.removeEventListener('abort', onAbort);
				resolve(parsed);
			} catch (e) {
				signal?.removeEventListener('abort', onAbort);
				reject(e);
			}
		})();
	});
}
