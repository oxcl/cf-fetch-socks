import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetch } from '../../src/fetch';
import { getProxy, closeProxy, HTTPBIN_BASE } from './helpers';
import type { Proxy } from '../../src/proxy';

describe('status codes', () => {
	let proxy: Proxy;

	beforeAll(() => {
		proxy = getProxy();
	});

	afterAll(() => {
		closeProxy();
	});

	it('returns 200 OK', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/200`, { proxy });
		expect(res.status).toBe(200);
	});

	it('returns 400 Bad Request', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/400`, { proxy });
		expect(res.status).toBe(400);
	});

	it('returns 403 Forbidden', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/403`, { proxy });
		expect(res.status).toBe(403);
	});

	it('returns 404 Not Found', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/404`, { proxy });
		expect(res.status).toBe(404);
	});

	it('returns 500 Internal Server Error', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/500`, { proxy });
		expect(res.status).toBe(500);
	});

	it('returns 502 Bad Gateway', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/502`, { proxy });
		expect(res.status).toBe(502);
	});

	it('returns 503 Service Unavailable', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/503`, { proxy });
		expect(res.status).toBe(503);
	});

	it('handles multiple status codes', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/status/200,201,202`, { proxy });
		expect([200, 201, 202]).toContain(res.status);
	});
});
