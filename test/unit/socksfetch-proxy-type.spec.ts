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

	it('creates a proxy with pooled=false (connections closed after use)', () => {
		const proxy = Proxy.obtainProxy('socks5://user:pass@proxy.example.com:1080');
		expect(proxy.isPooled).toBe(false);
	});
});

describe('Proxy.acquireProxy', () => {
	afterEach(() => {
		Proxy.clearCache();
	});

	it('returns the same cached Proxy instance for identical URIs', () => {
		const a = Proxy.acquireProxy('socks5://user:pass@proxy.example.com:1080');
		const b = Proxy.acquireProxy('socks5://user:pass@proxy.example.com:1080');
		expect(a).toBe(b);
	});

	it('creates distinct instances for different URIs', () => {
		const a = Proxy.acquireProxy('socks5://user:pass@proxy-a.example.com:1080');
		const b = Proxy.acquireProxy('socks5://user:pass@proxy-b.example.com:1080');
		expect(a).not.toBe(b);
	});

	it('creates a proxy with pooled=true (connections kept alive)', () => {
		const proxy = Proxy.acquireProxy('socks5://user:pass@proxy.example.com:1080');
		expect(proxy.isPooled).toBe(true);
	});

	it('does not share cache with obtainProxy', () => {
		const a = Proxy.obtainProxy('socks5://user:pass@proxy.example.com:1080');
		const b = Proxy.acquireProxy('socks5://user:pass@proxy.example.com:1080');
		expect(a).not.toBe(b);
		expect(a.isPooled).toBe(false);
		expect(b.isPooled).toBe(true);
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
