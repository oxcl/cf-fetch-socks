import { debug, printWaterfall } from '../debug';
import { concatUint8Arrays } from '../utils';
import { createGunzipStream, pipeReaderToWriter } from './stream';
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
		headers.set(lines[i].substring(0, colon).trim(), lines[i].substring(colon + 1).trim());
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

export function streamResponse(
	conn: ProxyConnection,
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	status: number,
	statusText: string,
	headers: Headers,
	isGzip: boolean,
): Response {
	const cl = headers.get('Content-Length');
	const contentLength = cl ? Number(cl) : undefined;
	if (contentLength !== undefined) headers.delete('Content-Length');
	if (isGzip) {
		headers.delete('Content-Encoding');
		return new Response(
			createGunzipStream(reader, initialBytes, contentLength, () => conn.close()),
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
): Response {
	debug.log(`Response: ${result.status}, content-length: ${result.headers.get('Content-Length') ?? 'chunked'}, encoding: ${result.headers.get('Content-Encoding') ?? 'none'}`);
	debug.timeEnd('total');
	printWaterfall();
	const ce = result.headers.get('Content-Encoding');
	return streamResponse(conn, result.reader, result.initialBytes, result.status, result.statusText, result.headers, ce === 'gzip');
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
