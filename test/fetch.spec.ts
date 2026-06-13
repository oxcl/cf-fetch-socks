import { describe, it, expect } from 'vitest';
import { fetch } from '../src/fetch';
import { Proxy } from '../src/proxy';
import { socks5Tunnel } from '../src/socks5';

describe('fetch', () => {
	it('exports a fetch function', () => {
		expect(typeof fetch).toBe('function');
	});

	it('throws when proxy is missing', async () => {
		await expect(
			fetch('https://httpbin.io/ip'),
		).rejects.toThrow();
	});

	it('throws when proxy URI is invalid', async () => {
		await expect(
			fetch('https://httpbin.io/ip', { proxy: 'not-a-uri' }),
		).rejects.toThrow();
	});

	it('accepts a Proxy instance', async () => {
		const proxy = new Proxy(socks5Tunnel, {
			hostname: '127.0.0.1',
			port: 1,
		});

		await expect(
			fetch('https://httpbin.io/ip', { proxy }),
		).rejects.toThrow();

		proxy.close();
	});
});
