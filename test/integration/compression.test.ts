import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { socksFetch } from '../../src/fetch';
import { getProxy, closeProxy, HTTPBIN_BASE } from './helpers';
import type { Proxy } from '../../src/proxy';

describe('compression', () => {
	let proxy: Proxy;

	beforeAll(() => {
		proxy = getProxy();
	});

	afterAll(() => {
		closeProxy();
	});

	it('decompresses gzip response', async () => {
		const res = await socksFetch(`${HTTPBIN_BASE}/gzip`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.gzipped).toBe(true);
		expect(body.origin).toBeDefined();
	});

	it('handles uncompressed response', async () => {
		const res = await socksFetch(`${HTTPBIN_BASE}/get`, { proxy });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveProperty('args');
		expect(body).toHaveProperty('headers');
	});
});
