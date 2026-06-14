import { concatUint8Arrays } from '../utils';

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
