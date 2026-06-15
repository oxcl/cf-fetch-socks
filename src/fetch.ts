import { Proxy } from './proxy';
import { executeRedirectLoop } from './executor';
import { buildRequestObject } from './request';
import { createDebugger } from './debug';
import type { DebugOptions } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean | DebugOptions;
}

export async function socksFetch(urlOrString: string | URL | Request, options: ProxyFetchOptions): Promise<Response> {
	const debug = createDebugger(options.debug);

	const proxy = typeof options.proxy === 'string' ? Proxy.acquireProxy(options.proxy) : options.proxy;
	const request = await buildRequestObject(urlOrString, options);

	debug?.log(`-> ${request.method} ${request.url} via proxy ${proxy.uri.hostname}`);
	debug?.time('total');

	return executeRedirectLoop(proxy, request, debug);
}
