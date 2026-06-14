import { Proxy } from '../../src/proxy';
import { socks5Tunnel } from '../../src/socks5/index';
import * as testFetch from './test-fetch/test-fetch.route';

type Env = {
	SOCKS5_PROXY_HOSTNAME: string;
	SOCKS5_PROXY_PORT: string;
	SOCKS5_PROXY_USERNAME: string;
	SOCKS5_PROXY_PASSWORD: string;
};

const routes: { path: string; handler: (proxy: Proxy) => Promise<Response> }[] = [
	testFetch,
];

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const proxy = new Proxy(socks5Tunnel, {
			hostname: env.SOCKS5_PROXY_HOSTNAME,
			port: Number(env.SOCKS5_PROXY_PORT),
			username: env.SOCKS5_PROXY_USERNAME,
			password: env.SOCKS5_PROXY_PASSWORD,
		});

		const url = new URL(request.url);

		for (const route of routes) {
			if (url.pathname === route.path) {
				try {
					return await route.handler(proxy);
				} catch (e) {
					return new Response(String(e), { status: 500 });
				}
			}
		}

		return new Response('Not Found', { status: 404 });
	},
};
