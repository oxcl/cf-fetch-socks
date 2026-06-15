import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch } from './helpers';

const HTTPBIN = 'https://httpbin.org';

describe('response decoding: gzip', () => {
	it('gzip response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/gzip`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { gzipped: boolean };
		expect(body.gzipped).toBe(true);
	});
});

describe('response decoding: brotli', () => {
	it('brotli response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/brotli`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { brotli: boolean };
		expect(body.brotli).toBe(true);
	});
});

describe('response decoding: deflate', () => {
	it('deflate response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/deflate`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { deflated: boolean };
		expect(body.deflated).toBe(true);
	});
});

describe('response decoding: chunked', () => {
	it('chunked transfer-encoding response is reassembled cleanly', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/stream/20`, { proxy });
		expect(response.status).toBe(200);
		const text = await response.text();
		const lines = text.trim().split('\n');
		expect(lines).toHaveLength(20);
		for (const line of lines) {
			expect(() => JSON.parse(line)).not.toThrow();
			expect(line).not.toMatch(/^[0-9a-f]+$/);
		}
	});
});

describe('response decoding: large body', { timeout: 60_000 }, () => {
	it('large response body streams without buffering everything in memory', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/stream-bytes/${5_000_000}`, { proxy });
		expect(response.status).toBe(200);
		const reader = response.body!.getReader();
		let total = 0;
		let readCount = 0;
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			total += value.length;
			readCount++;
			expect(total).toBeLessThanOrEqual(5_000_000);
		}
		expect(total).toBe(5_000_000);
		expect(readCount).toBeGreaterThan(1);
	});
});
