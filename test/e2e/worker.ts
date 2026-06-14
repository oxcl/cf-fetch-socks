import { Proxy } from '../../src/proxy';
import { socks5Tunnel } from '../../src/socks5/index';
import { handleRequest } from './router';

type Env = {
	SOCKS5_PROXY_HOSTNAME: string;
	SOCKS5_PROXY_PORT: string;
	SOCKS5_PROXY_USERNAME: string;
	SOCKS5_PROXY_PASSWORD: string;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const proxy = new Proxy(socks5Tunnel, {
			hostname: env.SOCKS5_PROXY_HOSTNAME,
			port: Number(env.SOCKS5_PROXY_PORT),
			username: env.SOCKS5_PROXY_USERNAME,
			password: env.SOCKS5_PROXY_PASSWORD,
		});

		const url = new URL(request.url);
		const result = handleRequest(url.pathname, proxy);

		if (result) {
			try {
				return await result;
			} catch (e) {
				return new Response(String(e), { status: 500 });
			}
		}

		return new Response('Not Found', { status: 404 });
	},
};
