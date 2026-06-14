import { describe, it, expect } from 'vitest';
import { socksFetch } from '../../src/fetch';
import { Proxy } from '../../src/proxy';
import { socks5Tunnel } from '../../src/socks5';

describe('socksFetch', () => {
	it('exports a socksFetch function', () => {
		expect(typeof socksFetch).toBe('function');
	});

	it('throws when proxy is missing', async () => {
		await expect(
			socksFetch('https://httpbin.io/ip'),
		).rejects.toThrow();
	});

	it('throws when proxy URI is invalid', async () => {
		await expect(
			socksFetch('https://httpbin.io/ip', { proxy: 'not-a-uri' }),
		).rejects.toThrow();
	});

	it('accepts a Proxy instance', async () => {
		const proxy = new Proxy(socks5Tunnel, {
			hostname: '127.0.0.1',
			port: 1,
		});

		await expect(
			socksFetch('https://httpbin.io/ip', { proxy }),
		).rejects.toThrow();

		proxy.close();
	});
});
