import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';
describe('socksFetch accepts a Request object', () => {
	it('works when passed a Request object as first argument', async () => {
		const proxy = makeProxy();
		const req = new Request(`${HTTPBIN}/post`, {
			method: 'POST',
			body: 'from-request-object',
			headers: { 'X-Test': '1' },
		});
		const response = await socksFetch(req, { proxy });
		expect(response.status).toBe(200);
		const json = (await response.json()) as { data: string; headers: Record<string, string> };
		expect(json.data).toBe('from-request-object');
		expect(json.headers['X-Test'] ?? json.headers['x-test']).toBe('1');
	});
});
