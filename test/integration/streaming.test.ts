import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetch } from '../../src/fetch';
import { getProxy, closeProxy, HTTPBIN_BASE } from './helpers';
import type { Proxy } from '../../src/proxy';

describe('streaming', () => {
	let proxy: Proxy;

	beforeAll(() => {
		proxy = getProxy();
	});

	afterAll(() => {
		closeProxy();
	});

	it('streams multiple JSON responses', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/stream/3`, { proxy });
		expect(res.status).toBe(200);

		const text = await res.text();
		const lines = text.trim().split('\n');
		expect(lines).toHaveLength(3);

		for (const line of lines) {
			const obj = JSON.parse(line);
			expect(obj).toHaveProperty('id');
		}
	});

	it('streams random bytes', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/stream-bytes/1024`, { proxy });
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/octet-stream');

		const buffer = await res.arrayBuffer();
		expect(buffer.byteLength).toBe(1024);
	});

	it('returns fixed number of bytes', async () => {
		const res = await fetch(`${HTTPBIN_BASE}/bytes/256`, { proxy });
		expect(res.status).toBe(200);

		const buffer = await res.arrayBuffer();
		expect(buffer.byteLength).toBe(256);
	});
});
