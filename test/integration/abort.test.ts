import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';

describe('abort: timeout', { timeout: 10_000 }, () => {
	it.skip('AbortSignal.timeout() aborts a slow request', async () => {
		const proxy = makeProxy();
		const req = socksFetch(`${HTTPBIN}/delay/10`, {
			proxy,
			signal: AbortSignal.timeout(1000),
		});
		await expect(req).rejects.toThrow(DOMException);
		await expect(req).rejects.toHaveProperty('name', 'AbortError');
	});
});

describe('abort: pre-aborted', { timeout: 3_000 }, () => {
	it.skip('pre-aborted signal rejects immediately', async () => {
		const proxy = makeProxy();
		const controller = new AbortController();
		controller.abort();
		const start = Date.now();
		await expect(socksFetch(`${HTTPBIN}/get`, { proxy, signal: controller.signal })).rejects.toThrow(DOMException);
		expect(Date.now() - start).toBeLessThan(1000);
	});
});

describe('abort: mid-stream', { timeout: 15_000 }, () => {
	it.skip('aborting mid-stream stops further reads', async () => {
		const proxy = makeProxy();
		const controller = new AbortController();
		const response = await socksFetch(`${HTTPBIN}/stream/100`, {
			proxy,
			signal: controller.signal,
		});
		const reader = response.body!.getReader();
		const first = await reader.read();
		expect(first.done).toBe(false);
		controller.abort();
		const second = await reader.read();
		expect(second.done).toBe(true);
	});
});
