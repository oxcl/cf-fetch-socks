import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch } from './helpers';
import { ConnectionRefusedError } from '../../src/errors';

describe('error: unreachable host', () => {
	it('connecting through proxy to unreachable host throws TypeError', async () => {
		const proxy = makeProxy();
		const req = socksFetch('https://192.0.2.1/get', { proxy });
		await expect(req).rejects.toThrow(TypeError);
	});
});

describe('error: connection refused', () => {
	it('connection refused surfaces ConnectionRefusedError', async () => {
		const proxy = makeProxy();
		const req = socksFetch('https://eu.httpbin.org:9999/get', { proxy });
		await expect(req).rejects.toThrow(ConnectionRefusedError);
	});
});

describe('error: too many redirects', () => {
	it('too-many-redirects throws TypeError after 20 hops', async () => {
		const proxy = makeProxy();
		const req = socksFetch('https://eu.httpbin.org/redirect/21', { proxy });
		await expect(req).rejects.toThrow(TypeError);
	});
});
