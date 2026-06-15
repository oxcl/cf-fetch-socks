import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';
import { ConnectionRefusedError, TunnelError } from '../../src/errors';

describe('error: unreachable host', { timeout: 15_000 }, () => {
	it('connecting through proxy to unreachable host throws TunnelError', async () => {
		const proxy = makeProxy();
		const req = socksFetch('https://192.0.2.1/get', { proxy });
		await expect(req).rejects.toThrow(TunnelError);
	});
});

describe('error: connection refused', { timeout: 1_000 }, () => {
	it('connection refused surfaces ConnectionRefusedError', async () => {
		const proxy = makeProxy();
		const req = socksFetch(`${HTTPBIN}:9999/get`, { proxy });
		await expect(req).rejects.toThrow(ConnectionRefusedError);
	});
});

describe('error: too many redirects', { timeout: 1_000 }, () => {
	it('too-many-redirects throws TypeError after 20 hops', async () => {
		const proxy = makeProxy();
		const req = socksFetch(`${HTTPBIN}/redirect/21`, { proxy });
		await expect(req).rejects.toThrow(TypeError);
	});
});
