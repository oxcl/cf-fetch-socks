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
