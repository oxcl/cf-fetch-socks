import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch } from './helpers';

const HTTPBIN = 'https://httpbin.org';

describe('status codes with no body', () => {
	it('204 No Content response has no body', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/status/204`, { proxy });
		expect(response.status).toBe(204);
		expect(response.body).toBeNull();
		await expect(response.text()).resolves.toBe('');
	});

	it('304 Not Modified response has no body', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/status/304`, { proxy });
		expect(response.status).toBe(304);
		expect(response.body).toBeNull();
		await expect(response.text()).resolves.toBe('');
	});
});

describe('HEAD request', () => {
	it('HEAD request returns no body regardless of target content', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/get`, { proxy, method: 'HEAD' });
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toBe('');
	});
});
