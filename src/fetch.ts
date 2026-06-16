import { Proxy } from './proxy';
import { executeRedirectLoop } from './executor';
import { buildRequestObject } from './request';
import { AbortError } from './errors';
import { debug } from './debug';
import type { DebugOptions } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean | DebugOptions;
}

export async function socksFetch(urlOrString: string | URL | Request, options: ProxyFetchOptions): Promise<Response> {
	debug.setContext(options.debug);

	if (options.signal?.aborted) {
		throw new AbortError('The operation was aborted');
	}

	const proxy = typeof options.proxy === 'string' ? Proxy.obtainProxy(options.proxy) : options.proxy;
	const request = await buildRequestObject(urlOrString, options);

	debug.log(`-> ${request.method} ${request.url} via proxy ${proxy.uri.hostname}`);
	debug.time('total');
	return await executeRedirectLoop(proxy, request, options.signal ?? undefined);
}
