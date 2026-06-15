import { Proxy } from './proxy';
import { executeRedirectLoop } from './executor';
import { buildRequestObject } from './request';
import { debug, setDebugContext, clearDebugContext } from './debug';
import type { DebugOptions } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean | DebugOptions;
}

export async function socksFetch(urlOrString: string | URL | Request, options: ProxyFetchOptions): Promise<Response> {
	setDebugContext(options.debug);

	if (options.signal?.aborted) {
		throw new DOMException('The operation was aborted', 'AbortError');
	}

	const proxy = typeof options.proxy === 'string' ? Proxy.acquireProxy(options.proxy) : options.proxy;
	const request = await buildRequestObject(urlOrString, options);

	debug.log(`-> ${request.method} ${request.url} via proxy ${proxy.uri.hostname}`);
	debug.time('total');

	try {
		return await executeRedirectLoop(proxy, request, options.signal);
	} finally {
		clearDebugContext();
	}
}
