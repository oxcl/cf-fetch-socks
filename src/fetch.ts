import { Proxy } from './proxy';
import { executeRedirectLoop } from './executor';
import type { ProxyConnection } from './connection';
import { createDebugger } from './debug';
import type { DebugOptions } from './debug';

export interface ProxyFetchOptions extends RequestInit {
	proxy: string | Proxy;
	debug?: boolean | DebugOptions;
}

export async function socksFetch(urlOrString: string | URL, options: ProxyFetchOptions): Promise<Response> {
	const debug = createDebugger(options.debug);

	const proxyStr = typeof options.proxy === 'string' ? options.proxy : null;
	const proxy = proxyStr ? Proxy.acquireProxy(proxyStr) : (options.proxy as Proxy);

	const release = (conn: ProxyConnection) => {
		debug?.log(`Releasing connection to ${conn.target.host}:${conn.target.port}`);
		proxyStr ? proxy.closeConnection(conn) : proxy.revokeConnection(conn);
	};

	const url = new URL(urlOrString);
	const method = (options.method ?? 'GET').toUpperCase();
	const { headers, body } = options;

	debug?.log(`-> ${method} ${url.toString()}`);
	debug?.time('total');

	return executeRedirectLoop(proxy, proxyStr, url, method, headers, body, debug, release);
}
