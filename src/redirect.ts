import { REDIRECT_STATUSES } from './constants';

export function isRedirect(status: number): boolean {
	return REDIRECT_STATUSES.has(status);
}

export function resolveRedirectUrl(location: string | null, currentUrl: URL): URL | null {
	if (!location) return null;
	return new URL(location, currentUrl);
}

export function redirectMethod(method: string, status: number): { method: string; body: undefined } {
	if (status !== 307 && status !== 308) return { method: 'GET', body: undefined };
	return { method, body: undefined };
}

export async function drainResponseBody(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	contentLength: number,
	initialBytes: Uint8Array,
): Promise<void> {
	let drained = initialBytes.length;
	while (drained < contentLength) {
		const { value, done } = await reader.read();
		if (done) break;
		drained += value.length;
	}
}

export function tooManyRedirectsResponse(): Response {
	return new Response('Too many redirects', { status: 499 });
}
