/// <reference types="node" />
import zlib from 'node:zlib';

export async function drainReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
	while (true) {
		const { done } = await reader.read();
		if (done) break;
	}
}

function indexOfSeq(buffer: Uint8Array, seq: number[], start: number): number {
	for (let i = start; i <= buffer.length - seq.length; i++) {
		let match = true;
		for (let j = 0; j < seq.length; j++) {
			if (buffer[i + j] !== seq[j]) { match = false; break; }
		}
		if (match) return i;
	}
	return -1;
}

function extendBuffer(existing: Uint8Array, chunk: Uint8Array): Uint8Array {
	const result = new Uint8Array(existing.length + chunk.length);
	result.set(existing);
	result.set(chunk, existing.length);
	return result;
}

export function createChunkedDecodingStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	cleanup?: () => void,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	const CRLF = [0x0D, 0x0A];
	const decoder = new TextDecoder();
	let buffer = initialBytes;
	let offset = 0;

	return new ReadableStream({
		async pull(controller) {
			while (true) {
				if (signal?.aborted) {
					controller.close();
					cleanup?.();
					return;
				}
				const crlfIdx = indexOfSeq(buffer, CRLF, offset);
				if (crlfIdx === -1) {
					const { value, done } = await reader.read();
					if (done) {
						controller.close();
						cleanup?.();
						return;
					}
					buffer = extendBuffer(buffer, value);
					continue;
				}
				const hexStr = decoder.decode(buffer.slice(offset, crlfIdx));
				const chunkSize = parseInt(hexStr.split(';')[0].trim(), 16);
				if (isNaN(chunkSize)) { offset = crlfIdx + 1; continue; }

				const payloadStart = crlfIdx + 2;
				if (chunkSize === 0) {
					controller.close();
					cleanup?.();
					return;
				}
				const chunkEnd = payloadStart + chunkSize;
				if (chunkEnd + 2 > buffer.length) {
					const { value, done } = await reader.read();
					if (done) {
						controller.close();
						cleanup?.();
						return;
					}
					buffer = extendBuffer(buffer, value);
					continue;
				}
				controller.enqueue(buffer.slice(payloadStart, chunkEnd));
				offset = chunkEnd + 2;
				return;
			}
		},
		cancel() {
			cleanup?.();
			reader.cancel().catch(() => {});
		},
	}, { highWaterMark: 0 });
}

function createDecompressor(encoding: string): zlib.BrotliCompress | zlib.Gunzip | zlib.Inflate | zlib.InflateRaw {
	switch (encoding) {
		case 'gzip': return zlib.createGunzip();
		case 'deflate': return zlib.createInflate();
		case 'br': return zlib.createBrotliDecompress();
		default: return zlib.createGunzip();
	}
}

export function createDecompressionStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	contentLength: number | undefined,
	encoding: string,
	cleanup?: () => void,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	const decompressor = createDecompressor(encoding);
	let remaining = contentLength !== undefined ? contentLength - initialBytes.length : -1;

	return new ReadableStream({
		async start(controller) {
			decompressor.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
			decompressor.on('end', () => { controller.close(); cleanup?.(); });
			decompressor.on('error', (err) => { controller.error(err); cleanup?.(); });

			if (signal) {
				signal.addEventListener('abort', () => {
					decompressor.destroy();
					reader.cancel().catch(() => {});
				}, { once: true });
			}

			if (initialBytes.length > 0) decompressor.write(initialBytes);

			while (remaining > 0) {
				const { value, done } = await reader.read();
				if (done) break;
				decompressor.write(value);
				remaining -= value.length;
			}
			decompressor.end();
		},
		cancel() {
			decompressor.destroy();
			cleanup?.();
		},
	});
}

export function createPlainStream(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	initialBytes: Uint8Array,
	contentLength: number | undefined,
	cleanup: () => void,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	let remaining = contentLength !== undefined ? contentLength - initialBytes.length : -1;
	let initialSent = false;

	return new ReadableStream({
		async pull(controller) {
			if (signal?.aborted) {
				controller.close();
				cleanup();
				return;
			}
			if (!initialSent) {
				initialSent = true;
				if (initialBytes.length > 0) {
					controller.enqueue(initialBytes);
					return;
				}
			}
			if (remaining === 0) {
				controller.close();
				cleanup();
				return;
			}
			const { value, done } = await reader.read();
			if (signal?.aborted) {
				controller.close();
				cleanup();
				return;
			}
			if (done) {
				controller.close();
				cleanup();
				return;
			}
			controller.enqueue(value);
			if (remaining > 0) remaining -= value.length;
		},
		cancel() {
			cleanup();
			reader.cancel().catch(() => {});
		},
	});
}
