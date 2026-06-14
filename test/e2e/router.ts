import { Proxy } from '../../src/proxy';
import { handler as testFetchHandler } from './test-fetch/test-fetch.route';

export function handleRequest(pathname: string, proxy: Proxy): Promise<Response> | null {
	switch (pathname) {
		case '/health':
			return Promise.resolve(new Response('OK', { status: 200 }));
		case '/test-fetch':
			return testFetchHandler(proxy);
		default:
			return null;
	}
}
