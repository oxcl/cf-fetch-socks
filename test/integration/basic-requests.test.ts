import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetch } from '../../src/fetch';
import { getProxy, closeProxy, HTTPBIN_BASE } from './helpers';
import type { Proxy } from '../../src/proxy';

describe('basic requests', () => {
	let proxy: Proxy;

	beforeAll(() => {
		proxy = getProxy();
	});

	afterAll(() => {
		closeProxy();
	});

	it('GET /get echoes query parameters', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/get?foo=bar&baz=123`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.args).toEqual({ foo: 'bar', baz: '123' });
	});

	it('GET /ip returns proxy exit IP', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/ip`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.origin).toBeDefined();
		expect(typeof body.origin).toBe('string');
	});

	it('POST /post echoes request body', async () => {
		const payload = { message: 'hello', data: [1, 2, 3] };

		const res = await fetch(`${HTTPBIN_BASE}/post`, {
			proxy,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(JSON.parse(body.data)).toEqual(payload);
	});

	it('PUT /put echoes request body', async () => {
		const payload = { updated: true };

		const res = await fetch(`${HTTPBIN_BASE}/put`, {
			proxy,
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(JSON.parse(body.data)).toEqual(payload);
	});

	it('DELETE /delete succeeds', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/delete`, {
			proxy,
			method: 'DELETE',
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.url).toContain('/delete');
	});

	it('PATCH /patch echoes request body', async () => {
		const payload = { patch: true };

		const res = await fetch(`${HTTPBIN_BASE}/patch`, {
			proxy,
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(JSON.parse(body.data)).toEqual(payload);
	});

	it('forwards custom headers', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/headers`, {
			proxy,
			headers: {
				'X-Custom-Header': 'test-value',
				'X-Another': 'another-value',
			},
		});

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.headers['x-custom-header']).toBe('test-value');
		expect(body.headers['x-another']).toBe('another-value');
	});

	it('accepts proxy as URI string', async () => {
		const proxyUri = `socks5://${env.SOCKS5_PROXY_USERNAME}:${env.SOCKS5_PROXY_PASSWORD}@${env.SOCKS5_PROXY_HOSTNAME}:${env.SOCKS5_PROXY_PORT}`;

		const res = await fetch(`${HTTPBIN_BASE}/ip`, { proxy: proxyUri });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.origin).toBeDefined();
	});
});
