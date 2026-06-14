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
): Promise<void> {
	try {
		if (initialBytes.length > 0) await writer.write(initialBytes);
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			await writer.write(value);
		}
	} finally {
		await writer.close();
		cleanup();
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
			gunzip.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
			gunzip.on('end', () => { controller.close(); cleanup?.(); });
			gunzip.on('error', (err) => { controller.error(err); cleanup?.(); });

			if (initialBytes.length > 0) gunzip.write(initialBytes);

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
