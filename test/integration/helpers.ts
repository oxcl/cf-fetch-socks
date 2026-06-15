import { env } from 'cloudflare:test';
import { Proxy, socks5Tunnel, socksFetch as originalSocksFetch } from '../../src';

export function makeProxy() {
	return new Proxy(socks5Tunnel, {
		hostname: env.SOCKS5_PROXY_HOSTNAME,
		port: Number(env.SOCKS5_PROXY_PORT),
		username: env.SOCKS5_PROXY_USERNAME,
		password: env.SOCKS5_PROXY_PASSWORD,
	});
}

export async function socksFetch(url: string | URL | Request, options: Parameters<typeof originalSocksFetch>[1]): Promise<Response> {
	return originalSocksFetch(url, {
		...options,
		debug: { enable: false, logFn: console.log },
	});
}
