import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { socksFetch } from '../../src/fetch';
import { getProxy, closeProxy, HTTPBIN_BASE } from './helpers';
import type { Proxy } from '../../src/proxy';

describe('redirects', () => {
	let proxy: Proxy;

	beforeAll(() => {
		proxy = getProxy();
	});

	afterAll(() => {
		closeProxy();
	});

	it('follows single 302 redirect', async () => {
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect/1`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.url).toContain('/get');
	});

	it('follows multiple redirects', async () => {
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect/3`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.url).toContain('/get');
	});

	it('follows absolute redirect', async () => {
		const target = encodeURIComponent(`${HTTPBIN_BASE}/get`);
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect-to?url=${target}`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.url).toContain('/get');
	});

	it('follows 301 redirect', async () => {
		const target = encodeURIComponent(`${HTTPBIN_BASE}/get`);
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect-to?url=${target}&status_code=301`, {
			proxy,
		});
		expect(res.status).toBe(200);
	});

	it('follows 307 redirect', async () => {
		const target = encodeURIComponent(`${HTTPBIN_BASE}/get`);
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect-to?url=${target}&status_code=307`, {
			proxy,
		});
		expect(res.status).toBe(200);
	});

	it('follows 308 redirect', async () => {
		const target = encodeURIComponent(`${HTTPBIN_BASE}/get`);
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect-to?url=${target}&status_code=308`, {
			proxy,
		});
		expect(res.status).toBe(200);
	});

	it('returns 499 when max redirects exceeded', async () => {
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect/10`, {
			proxy,
			maxRedirects: 3,
		});
		expect(res.status).toBe(499);
	});

	it('preserves method through redirects', async () => {
		const target = encodeURIComponent(`${HTTPBIN_BASE}/get`);
		const res = await socksFetch(`${HTTPBIN_BASE}/redirect-to?url=${target}`, {
			proxy,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ test: true }),
		});
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.url).toContain('/get');
	});
});
