import { socksFetch as originalSocksFetch } from '../../src';

export async function socksFetch(url: string | URL, options: Parameters<typeof originalSocksFetch>[1]): Promise<Response> {
	let entries: Array<{ label: string; duration: number }> = [];

	const { readable, writable } = new TransformStream<Uint8Array>();
	const writer = writable.getWriter();
	const enc = new TextEncoder();

	const response = await originalSocksFetch(url, {
		...options,
		debug: { enable: true, onLine: (line) => {
			writer.write(enc.encode(JSON.stringify({ type: 'debug', line }) + '\n'));
		}, onDebugEnd: (e) => { entries = e; } },
	});

	writer.write(enc.encode(JSON.stringify({ type: 'entries', entries }) + '\n'));

	const body = await response.text();
	writer.write(enc.encode(JSON.stringify({ type: 'body', data: body }) + '\n'));
	writer.close();

	return new Response(readable, {
		status: response.status,
		headers: { 'content-type': 'application/x-ndjson' },
	});
}
