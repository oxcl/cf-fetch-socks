import { describe, it, expect, afterEach } from 'vitest';
import { Proxy } from '../../src/proxy';
import type { TunnelFn, ProxyCredentials } from '../../src/connection';

const mockOpts: ProxyCredentials = {
	hostname: 'mock-proxy.local',
	port: 1080,
};

describe('Proxy.obtainProxy (string path)', () => {
	afterEach(() => {
		Proxy.clearCache();
	});

	it('returns the same cached Proxy instance for identical URIs', () => {
		const a = Proxy.obtainProxy('socks5://user:pass@proxy.example.com:1080');
		const b = Proxy.obtainProxy('socks5://user:pass@proxy.example.com:1080');
		expect(a).toBe(b);
	});

	it('creates distinct instances for different URIs', () => {
		const a = Proxy.obtainProxy('socks5://user:pass@proxy-a.example.com:1080');
		const b = Proxy.obtainProxy('socks5://user:pass@proxy-b.example.com:1080');
		expect(a).not.toBe(b);
	});

	it('creates a proxy with pooled=false (feature: after implementation, string proxies do not pool connections)', () => {
		const proxy = Proxy.obtainProxy('socks5://user:pass@proxy.example.com:1080');
		// TODO: Once the feature is implemented, this should be false.
		// String proxies should NOT pool connections.
		// Currently obtainProxy passes undefined → defaults to true.
		expect(proxy.isPooled).toBe(false);
	});
});

describe('Proxy constructor (object path)', () => {
	it('preserves pooled=true when set in constructor', () => {
		const proxy = new Proxy(async () => ({ socket: null as any, leftover: new Uint8Array(0) }), mockOpts, true);
		expect(proxy.isPooled).toBe(true);
	});

	it('preserves pooled=false when set in constructor', () => {
		const proxy = new Proxy(async () => ({ socket: null as any, leftover: new Uint8Array(0) }), mockOpts, false);
		expect(proxy.isPooled).toBe(false);
	});

	it('defaults to pooled=true', () => {
		const proxy = new Proxy(async () => ({ socket: null as any, leftover: new Uint8Array(0) }), mockOpts);
		expect(proxy.isPooled).toBe(true);
	});
});
