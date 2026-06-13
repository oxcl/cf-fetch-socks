import { describe, it, expect } from 'vitest';
import { fetch } from '../src/fetch';

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
});
