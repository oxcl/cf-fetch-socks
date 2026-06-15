/// <reference types="node" />
import zlib from 'node:zlib';

export async function drainReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
	while (true) {
		const { done } = await reader.read();
		if (done) break;
	}
}

export async function pipeReaderToWriter(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	writer: WritableStreamDefaultWriter<Uint8Array>,
	initialBytes: Uint8Array,
	cleanup: () => void,
	contentLength?: number,
): Promise<void> {
	try {
		let remaining = contentLength !== undefined ? contentLength - initialBytes.length : -1;
		if (initialBytes.length > 0) await writer.write(initialBytes);
		while (true) {
			if (remaining === 0) break;
			const { value, done } = await reader.read();
			if (done) break;
			await writer.write(value);
			if (remaining > 0) remaining -= value.length;
		}
	} finally {
		await writer.close();
		cleanup();
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
): ReadableStream<Uint8Array> {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();

	(async () => {
		const CRLF = [0x0D, 0x0A];
		const decoder = new TextDecoder();
		let buffer = initialBytes;
		let offset = 0;

		try {
			while (true) {
				const crlfIdx = indexOfSeq(buffer, CRLF, offset);
				if (crlfIdx === -1) {
					const { value, done } = await reader.read();
					if (done) {
						await writer.close();
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
					await writer.close();
					return;
				}
				const chunkEnd = payloadStart + chunkSize;
				if (chunkEnd + 2 > buffer.length) {
					const { value, done } = await reader.read();
					if (done) {
						await writer.close();
						return;
					}
					buffer = extendBuffer(buffer, value);
					continue;
				}
				await writer.write(buffer.slice(payloadStart, chunkEnd));
				offset = chunkEnd + 2;
			}
		} catch (e) {
			try { await writer.abort(e); } catch { /* ignore */ }
		} finally {
			cleanup?.();
		}
	})();

	return readable;
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
): ReadableStream<Uint8Array> {
	const decompressor = createDecompressor(encoding);
	let remaining = contentLength !== undefined ? contentLength - initialBytes.length : -1;

	return new ReadableStream({
		async start(controller) {
			decompressor.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
			decompressor.on('end', () => { controller.close(); cleanup?.(); });
			decompressor.on('error', (err) => { controller.error(err); cleanup?.(); });

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
