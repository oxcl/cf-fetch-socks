import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';
describe('response headers: duplicates', () => {
	it('duplicate response headers (Set-Cookie) are preserved', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/response-headers?Set-Cookie=a%3D1&Set-Cookie=b%3D2`, { proxy });
		expect(response.status).toBe(200);
		const cookies = (response.headers as Headers & { getSetCookie: () => string[] }).getSetCookie();
		expect(cookies).toEqual(['a=1', 'b=2']);
	});
});

describe('Host header: default port', () => {
	it('Host header omits default port (80 for HTTP)', async () => {
		const proxy = makeProxy();
		const url = `${HTTPBIN}:80/headers`;
		const response = await socksFetch(url, { proxy });
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['Host']).toBe('172.17.0.2');
	});
});
