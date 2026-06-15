import { Proxy } from './proxy';
import { executeRedirectLoop } from './executor';
import { createDebugger } from './debug';
import type { DebugOptions } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean | DebugOptions;
}

export async function socksFetch(urlOrString: string | URL | Request, options: ProxyFetchOptions): Promise<Response> {
	const debug = createDebugger(options.debug);
	const proxy = typeof options.proxy === 'string' ? Proxy.acquireProxy(options.proxy) : options.proxy;

	let url: URL;
	let requestObj: Request | undefined;
	if (urlOrString instanceof Request) {
		requestObj = urlOrString;
		url = new URL(urlOrString.url);
	} else {
		url = new URL(urlOrString);
	}
	const method = (options.method ?? requestObj?.method ?? 'GET').toUpperCase();
	const { headers: optionsHeaders, body: optionsBody } = options;
	const headers = optionsHeaders ?? requestObj?.headers;
	let body: BodyInit | null | undefined = optionsBody !== undefined ? optionsBody : (requestObj?.body ?? null);
	if (body instanceof ReadableStream) {
		const reader = body.getReader();
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
		body = buf;
	}

	debug?.log(`-> ${method} ${url.toString()}`);
	debug?.time('total');

	return executeRedirectLoop(proxy, url, method, headers, body, debug);
}
