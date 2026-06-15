export async function buildRequestObject(
	urlOrString: string | URL | Request,
	init?: RequestInit,
): Promise<Request> {
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
		body = await drainStream(body);
	}
	return new Request(url, { method, headers, body, redirect });
}

async function drainStream(stream: ReadableStream): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let len = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		len += value.length;
	}
	const buf = new Uint8Array(len);
	let off = 0;
	for (const c of chunks) {
		buf.set(c, off);
		off += c.length;
	}
	return buf;
}
