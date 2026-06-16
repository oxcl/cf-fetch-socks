import { debug } from '../debug';
import { concatUint8Arrays, drainReader } from '../utils';
import { createChunkedDecodingStream, createDecompressionStream, createPlainStream } from './stream';
import type { Proxy } from '../proxy';
import type { ProxyConnection } from '../connection';

export function parseResponseHeaders(
	data: Uint8Array,
): { status: number; statusText: string; headers: Headers; bodyStart: number } {
	const text = new TextDecoder().decode(data);
	const headerEnd = text.indexOf('\r\n\r\n');
	const lines = text.substring(0, headerEnd).split('\r\n');
	const [, statusCode, ...statusTextParts] = lines[0].split(' ');

	const headers = new Headers();
	for (let i = 1; i < lines.length; i++) {
		const colon = lines[i].indexOf(':');
		if (colon === -1) continue;
		headers.append(lines[i].substring(0, colon).trim(), lines[i].substring(colon + 1).trim());
	}

	return {
		status: Number(statusCode),
		statusText: statusTextParts.join(' '),
		headers,
		bodyStart: headerEnd + 4,
	};
}

export async function readHeaders(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ status: number; statusText: string; headers: Headers; initialBytes: Uint8Array }> {
	const chunks: Uint8Array[] = [];

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		chunks.push(value);

		let accumulated = '';
		for (const c of chunks) {
			accumulated += new TextDecoder().decode(c, { stream: true });
		}
		if (accumulated.includes('\r\n\r\n')) break;
	}

	const allData = concatUint8Arrays(chunks);
	const { status, statusText, headers, bodyStart } = parseResponseHeaders(allData);
	return { status, statusText, headers, initialBytes: allData.slice(bodyStart) };
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

export function streamResponse(
	conn: ProxyConnection,
	initialBytes: Uint8Array,
	status: number,
	statusText: string,
	headers: Headers,
	contentEncoding: string | null,
	signal?: AbortSignal,
): Response {
	if (NULL_BODY_STATUSES.has(status)) {
		const stream = createPlainStream(conn, initialBytes, undefined);
		drainReader(stream.getReader());
		headers.delete('Content-Length');
		return new Response(null, { status, statusText, headers });
	}

	const cl = headers.get('Content-Length');
	const contentLength = cl ? Number(cl) : undefined;
	if (contentLength !== undefined) headers.delete('Content-Length');

	const transferEncoding = headers.get('Transfer-Encoding');
	const isChunked = transferEncoding?.toLowerCase().includes('chunked') ?? false;
	if (isChunked) headers.delete('Transfer-Encoding');

	if (isChunked && contentEncoding) {
		headers.delete('Content-Encoding');
		const chunked = createChunkedDecodingStream(conn, initialBytes, signal);
		return new Response(
			createDecompressionStream(chunked.getReader(), new Uint8Array(0), undefined, contentEncoding, () => conn.close(), signal),
			{ status, statusText, headers },
		);
	}

	if (contentEncoding) {
		headers.delete('Content-Encoding');
		return new Response(
			createDecompressionStream(conn.reader!, initialBytes, contentLength, contentEncoding, () => conn.close(), signal),
			{ status, statusText, headers },
		);
	}

	if (isChunked) {
		return new Response(
			createChunkedDecodingStream(conn, initialBytes, signal),
			{ status, statusText, headers },
		);
	}

	return new Response(
		createPlainStream(conn, initialBytes, contentLength, signal),
		{ status, statusText, headers },
	);
}

type Result = { status: number; statusText: string; headers: Headers; initialBytes: Uint8Array };

export function buildFinalResponse(
	proxy: Proxy,
	conn: ProxyConnection,
	result: Result,
	redirected = false,
	request: Request,
	signal?: AbortSignal,
): Response {
	if (request.method === 'HEAD') {
		conn.reader!.releaseLock();
		proxy.release(conn);
		return new Response(null, { status: result.status, statusText: result.statusText, headers: result.headers });
	}

	debug.log(`Response: ${result.status}, content-length: ${result.headers.get('Content-Length') ?? 'chunked'}, encoding: ${result.headers.get('Content-Encoding') ?? 'none'}`);
	debug.timeEnd('total');
	debug.printWaterfall();
	const ce = result.headers.get('Content-Encoding');
	const response = streamResponse(conn, result.initialBytes, result.status, result.statusText, result.headers, ce, signal);
	return decorateResponse(response, redirected, request.url);
}

function decorateResponse(response: Response, redirected: boolean, url?: string): Response {
	if (redirected) {
		Object.defineProperty(response, 'redirected', { value: true, configurable: true, writable: false });
	}
	if (url) {
		Object.defineProperty(response, 'url', { value: url, configurable: true, writable: false });
	}
	return response;
}


