import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { Proxy, socks5Tunnel } from '../../src';
import { socksFetch } from './helpers';

describe('test-fetch', () => {
	it('makes a SOCKS5-proxied request and returns the proxy exit IP', async () => {
		const proxy = new Proxy(socks5Tunnel, {
			hostname: env.SOCKS5_PROXY_HOSTNAME,
			port: Number(env.SOCKS5_PROXY_PORT),
			username: env.SOCKS5_PROXY_USERNAME,
			password: env.SOCKS5_PROXY_PASSWORD,
		});

		const response = await socksFetch('https://httpbin.org/ip', { proxy });
		expect(response.status).toBe(200);

		const body = await response.json();
		expect(body).toHaveProperty('origin');
	});
});
