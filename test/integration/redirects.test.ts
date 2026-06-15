import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';

describe('redirect: response.url and response.redirected', () => {
	it('url and redirected after a single redirect', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=%2Fget&status_code=302`, { proxy });
		expect(response.status).toBe(200);
		expect(response.redirected).toBe(true);
		expect(response.url).toBe(`${HTTPBIN}/get`);
	});

	it('url and redirected after multi-hop redirect chain', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect/3`, { proxy });
		expect(response.status).toBe(200);
		expect(response.redirected).toBe(true);
		expect(response.url).toBe(`${HTTPBIN}/get`);
	});
});

describe('redirect: 303 converts POST to GET', () => {
	it.skip('303 redirect converts POST to GET with no body', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=%2Fget&status_code=303`, {
			proxy,
			method: 'POST',
			body: 'should-be-dropped',
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { data?: string };
		expect(json.data).toBe('');
	});
});

describe('redirect: 307 preserves method and body', () => {
	it.skip('307 redirect preserves POST method and body', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=%2Fpost&status_code=307`, {
			proxy,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hello: 'world' }),
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { json: { hello: string } };
		expect(json.json).toEqual({ hello: 'world' });
	});
});

describe('redirect: manual', () => {
	it.skip('redirect: "manual" returns the redirect response without following', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=%2Fget&status_code=302`, { proxy, redirect: 'manual' });
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).not.toBeNull();
	});
});

describe('redirect: error', () => {
	it.skip('redirect: "error" throws on a redirect', async () => {
		const proxy = makeProxy();
		const req = socksFetch(`${HTTPBIN}/redirect-to?url=%2Fget&status_code=302`, { proxy, redirect: 'error' });
		await expect(req).rejects.toThrow(TypeError);
	});
});

describe('redirect: Authorization header stripping', () => {
	it.skip('Authorization header is stripped on cross-origin redirect', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=${encodeURIComponent(`${HTTPBIN}/headers`)}&status_code=302`, {
			proxy,
			headers: { Authorization: 'Bearer secret' },
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['authorization']).toBeUndefined();
		expect(json.headers['Authorization']).toBeUndefined();
	});

	it.skip('Authorization header is preserved on same-origin redirect', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/redirect-to?url=%2Fheaders&status_code=302`, {
			proxy,
			headers: { Authorization: 'Bearer secret' },
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		const auth = json.headers['authorization'] ?? json.headers['Authorization'];
		expect(auth).toBe('Bearer secret');
	});
});
