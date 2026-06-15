import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { Proxy, socks5Tunnel } from '../../src';
import { AbortError, Socks5AuthError, Socks5ProtocolError, TunnelError } from '../../src/errors';

function makeProxy() {
	return new Proxy(socks5Tunnel, {
		hostname: env.SOCKS5_PROXY_HOSTNAME,
		port: Number(env.SOCKS5_PROXY_PORT),
		username: env.SOCKS5_PROXY_USERNAME,
		password: env.SOCKS5_PROXY_PASSWORD,
	});
}

describe('abort', () => {
	it.skip('throws AbortError when signal is already aborted', async () => {
		const proxy = makeProxy();
		const controller = new AbortController();
		controller.abort();

		await expect(proxy.acquire({ host: 'eu.httpbin.org', port: 443, tls: true }, controller.signal)).rejects.toThrow(AbortError);
	});
});

describe('unreachable target', () => {
	it.skip('throws a TunnelError when connecting to an unreachable target', async () => {
		const proxy = makeProxy();
		await expect(proxy.acquire({ host: '1.2.3.4', port: 1, tls: false })).rejects.toThrow(TunnelError);
	});
});

describe('SOCKS5 username/password auth', () => {
	it.skip('should connect through an authenticated SOCKS5 proxy with valid credentials', async () => {
		const proxy = makeProxy();
		const conn = await proxy.acquire({ host: 'eu.httpbin.org', port: 443, tls: true });
		expect(conn).toBeDefined();
		expect(conn.closed).toBe(false);
		conn.close();
	});

	it.skip('should throw on SOCKS5 auth failure (wrong credentials)', async () => {
		const badProxy = new Proxy(socks5Tunnel, {
			hostname: env.SOCKS5_PROXY_HOSTNAME,
			port: Number(env.SOCKS5_PROXY_PORT),
			username: 'wronguser',
			password: 'wrongpass',
		});
		await expect(badProxy.acquire({ host: 'eu.httpbin.org', port: 80, tls: false })).rejects.toThrow(Socks5AuthError);
	});

	it.skip('should throw when proxy offers no acceptable auth method', async () => {
		const { receiveGreeting } = await import('../../src/socks5/greeting');
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array([5, 0xff]));
				controller.close();
			},
		});
		const reader = stream.getReader() as ReadableStreamDefaultReader<Uint8Array>;
		await expect(receiveGreeting(reader)).rejects.toThrow(Socks5ProtocolError);
	});
});
