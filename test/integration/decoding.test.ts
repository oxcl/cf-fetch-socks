import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';

describe('response decoding: gzip', { timeout: 10_000 }, () => {
	it.skip('gzip response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/gzip`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { gzipped: boolean };
		expect(body.gzipped).toBe(true);
	});
});

describe('response decoding: brotli', { timeout: 10_000 }, () => {
	it.skip('brotli response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/brotli`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { brotli: boolean };
		expect(body.brotli).toBe(true);
	});
});

describe('response decoding: deflate', { timeout: 10_000 }, () => {
	it.skip('deflate response is auto-decoded', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/deflate`, { proxy });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-encoding')).toBeNull();
		const body = (await response.json()) as { deflated: boolean };
		expect(body.deflated).toBe(true);
	});
});

describe('response decoding: chunked', { timeout: 15_000 }, () => {
	it.skip('chunked transfer-encoding response is reassembled cleanly', async () => {
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

describe('response decoding: large body', { timeout: 120_000 }, () => {
	it.skip('large response body streams without buffering everything in memory', async () => {
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
