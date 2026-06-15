import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { Proxy, socks5Tunnel } from '../../src';
import { socksFetch } from './helpers';

function makeProxy() {
	return new Proxy(socks5Tunnel, {
		hostname: env.SOCKS5_PROXY_HOSTNAME,
		port: Number(env.SOCKS5_PROXY_PORT),
		username: env.SOCKS5_PROXY_USERNAME,
		password: env.SOCKS5_PROXY_PASSWORD,
	});
}

function proxyUri() {
	const user = encodeURIComponent(env.SOCKS5_PROXY_USERNAME);
	const pass = encodeURIComponent(env.SOCKS5_PROXY_PASSWORD);
	return `socks5://${user}:${pass}@${env.SOCKS5_PROXY_HOSTNAME}:${env.SOCKS5_PROXY_PORT}`;
}

describe('test-fetch', () => {
	it('makes a SOCKS5-proxied request and returns the proxy exit IP', async () => {
		const response = await socksFetch('https://eu.httpbin.org/ip', { proxy: makeProxy() });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { origin: string };
		expect(body).toHaveProperty('origin');
	});
});

describe('POST with body', () => {
	it('sends a POST request with a JSON body through the proxy', async () => {
		const proxy = makeProxy();
		const response = await socksFetch('https://eu.httpbin.org/post', {
			proxy,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hello: 'world' }),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { json: { hello: string } };
		expect(body.json.hello).toBe('world');
	});
});

describe('custom headers', () => {
	it('sends custom headers through the proxy', async () => {
		const proxy = makeProxy();
		const response = await socksFetch('https://eu.httpbin.org/headers', {
			proxy,
			headers: { 'X-Custom': 'test-value', 'X-Another': '123' },
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as { headers: Record<string, string> };
		expect(body.headers['X-Custom']).toBe('test-value');
		expect(body.headers['X-Another']).toBe('123');
	});
});

describe('proxy as URI string', () => {
	it('makes a proxied request using a socks5:// URI string', async () => {
		const response = await socksFetch('https://eu.httpbin.org/ip', { proxy: proxyUri() });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty('origin');
	});
});

describe('redirect following', { timeout: 5_000 }, () => {
	it('follows HTTP redirects through the proxy', async () => {
		const proxy = makeProxy();
		const response = await socksFetch('https://eu.httpbin.org/redirect/2', { proxy });
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toHaveProperty('origin');
	});
});

describe('max redirects', { timeout: 10_000 }, () => {
	it('returns 499 after exceeding 20 redirects', async () => {
		const proxy = makeProxy();
		const response = await socksFetch('https://eu.httpbin.org/redirect/21', { proxy });
		expect(response.status).toBe(499);
		const text = await response.text();
		expect(text).toBe('Too many redirects');
	});
});

describe('concurrent requests', { timeout: 30_000 }, () => {
	it('handles multiple concurrent proxied requests', async () => {
		const proxy = makeProxy();
		const results = await Promise.all(Array.from({ length: 3 }, () => socksFetch('https://eu.httpbin.org/ip', { proxy })));
		for (const response of results) {
			expect(response.status).toBe(200);
			const body = await response.json();
			expect(body).toHaveProperty('origin');
		}
	});
});

describe('gzip response', { timeout: 30_000 }, () => {
	it('returns decompressed gzip content', async () => {
		const proxy = makeProxy();
		const response = await socksFetch('https://eu.httpbin.org/gzip', { proxy });
		expect(response.status).toBe(200);
		const body = (await response.json()) as { gzipped: boolean };
		expect(body.gzipped).toBe(true);
	});
});
