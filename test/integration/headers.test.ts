import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';
describe('response headers: duplicates', () => {
	it('duplicate response headers (Set-Cookie) are preserved', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/response-headers?Set-Cookie=a%3D1&Set-Cookie=b%3D2`, { proxy });
		expect(response.status).toBe(200);
		const cookies = response.headers.getSetCookie();
		expect(cookies).toEqual(['a=1', 'b=2']);
	});
});

describe('Host header: default port', () => {
	it('Host header omits default port (443 for HTTPS)', async () => {
		const proxy = makeProxy();
		const url = `${HTTPBIN}:443/headers`;
		const response = await socksFetch(url, { proxy });
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['Host']).toBe('eu.httpbin.org');
	});
});

describe('Host header: default port HTTP', () => {
	it('Host header omits default port (80 for HTTP)', async () => {
		const proxy = makeProxy();
		const url = 'http://eu.httpbin.org:80/headers';
		const response = await socksFetch(url, { proxy });
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['Host']).toBe('eu.httpbin.org');
	});
});
