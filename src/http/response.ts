import { debug, printWaterfall } from '../debug';
import { concatUint8Arrays } from '../utils';
import { createDecompressionStream, pipeReaderToWriter } from './stream';
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
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	status: number,
	statusText: string,
	headers: Headers,
	contentEncoding: string | null,
): Response {
	if (NULL_BODY_STATUSES.has(status)) {
		pipeReaderToWriter(reader, new WritableStream<Uint8Array>(), initialBytes, () => conn.close());
		headers.delete('Content-Length');
		return new Response(null, { status, statusText, headers });
	}
	const cl = headers.get('Content-Length');
	const contentLength = cl ? Number(cl) : undefined;
	if (contentLength !== undefined) headers.delete('Content-Length');
	if (contentEncoding) {
		headers.delete('Content-Encoding');
		return new Response(
			createDecompressionStream(reader, initialBytes, contentLength, contentEncoding, () => conn.close()),
			{ status, statusText, headers },
		);
	}
	const { readable, writable } = new TransformStream();
	pipeReaderToWriter(reader, writable.getWriter(), initialBytes, () => conn.close(), contentLength);
	return new Response(readable, { status, statusText, headers });
}

export function buildFinalResponse(
	conn: ProxyConnection,
	result: { reader: ReadableStreamDefaultReader<Uint8Array>; status: number; statusText: string; headers: Headers; initialBytes: Uint8Array },
	redirected = false,
): Response {
	debug.log(`Response: ${result.status}, content-length: ${result.headers.get('Content-Length') ?? 'chunked'}, encoding: ${result.headers.get('Content-Encoding') ?? 'none'}`);
	debug.timeEnd('total');
	printWaterfall();
	const ce = result.headers.get('Content-Encoding');
	return withRedirected(streamResponse(conn, result.reader, result.initialBytes, result.status, result.statusText, result.headers, ce), redirected);
}

function withRedirected(response: Response, redirected: boolean): Response {
	if (redirected) {
		return Object.defineProperty(response, 'redirected', { value: true, configurable: true, writable: false });
	}
	return response;
}

export function buildRedirectWithoutLocationResponse(
	free: () => void,
	result: { status: number; statusText: string; headers: Headers; initialBytes: Uint8Array },
): Response {
	debug.log('Redirect without Location header');
	debug.timeEnd('total');
	debug.end();
	free();
	return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
}
