import { drainToBuffer } from './utils';

export async function buildRequestObject(urlOrString: string | URL | Request, init?: RequestInit): Promise<Request> {
	let requestObj: Request | undefined;
	let url: URL;
	if (urlOrString instanceof Request) {
		requestObj = urlOrString;
		url = new URL(urlOrString.url);
	} else {
		url = new URL(urlOrString);
	}
	const method = (init?.method ?? requestObj?.method ?? 'GET').toUpperCase();
	const headers = init?.headers ?? requestObj?.headers;
	const redirect = init?.redirect ?? requestObj?.redirect;
	let body: BodyInit | null | undefined = init?.body !== undefined ? init?.body : (requestObj?.body ?? null);
	if (body instanceof ReadableStream) {
		body = await drainToBuffer(body);
	}
	return new Request(url, { method, headers, body, redirect, signal: init?.signal });
}
