import zlib from 'node:zlib';

export function buildRequest(target: URL, method: string, headers?: HeadersInit, body?: BodyInit | null): Uint8Array {
	const path = target.pathname + target.search;
	const lines = [`${method} ${path} HTTP/1.1`, `Host: ${target.host}`, `User-Agent: undici`, `Accept: */*`, `Connection: keep-alive`];

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

export function parseResponseHeaders(data: Uint8Array): { status: number; statusText: string; headers: Headers; bodyStart: number } {
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

export async function readHeaders(
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

	const { status, statusText, headers, bodyStart } = parseResponseHeaders(allData);
	const initialBytes = allData.slice(bodyStart);
	return { status, statusText, headers, initialBytes };
}

export async function drainReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
	while (true) {
		const { done } = await reader.read();
		if (done) break;
	}
}

export function createGunzipStream(
	source: ReadableStream<Uint8Array>,
	initialBytes: Uint8Array,
	cleanup?: () => void,
): ReadableStream<Uint8Array> {
	const gunzip = zlib.createGunzip();
	const reader = source.getReader();

	return new ReadableStream({
		async start(controller) {
			gunzip.on('data', (chunk: Buffer) => {
				controller.enqueue(new Uint8Array(chunk));
			});
			gunzip.on('end', () => {
				controller.close();
				cleanup?.();
			});
			gunzip.on('error', (err) => {
				controller.error(err);
				cleanup?.();
			});

			if (initialBytes.length > 0) {
				gunzip.write(initialBytes);
			}

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				gunzip.write(value);
			}
			gunzip.end();
		},
		cancel() {
			gunzip.destroy();
			cleanup?.();
		},
	});
}
