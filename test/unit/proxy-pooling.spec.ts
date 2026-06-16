import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Proxy } from '../../src/proxy';
import type { TunnelFn, ProxyCredentials, ProxyConnection } from '../../src/connection';
import type { Socket } from '@cloudflare/workers-types';

function createMockTunnel(): { tunnelFn: TunnelFn; calls: { count: number }; lastSocket: { close: () => void } } {
	const calls = { count: 0 };
	const lastSocket = { close() {} };
	const tunnelFn: TunnelFn = async () => {
		calls.count++;
		const writable = new WritableStream();
		const readable = new ReadableStream({
			start(c) {
				c.close();
			},
		});
		const socket = {
			readable,
			writable,
			close() {
				lastSocket.close();
			},
		} as unknown as Socket;
		return { socket, leftover: new Uint8Array(0) };
	};
	return { tunnelFn, calls, lastSocket };
}

const mockOpts: ProxyCredentials = {
	hostname: 'mock-proxy.local',
	port: 1080,
};

const target = { host: 'example.com', port: 80, tls: false };

describe('Proxy pooling', () => {
	afterEach(() => {
		Proxy.clearCache();
	});

	describe('pooled = true (default)', () => {
		it('creates a new connection on pool MISS', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			expect(proxy.idleCount).toBe(0);
			const conn = await proxy.connect(target);

			expect(conn).toBeDefined();
			expect(calls.count).toBe(1);
			expect(proxy.idleCount).toBe(0);
			conn.close();
		});

		it('releases connection back to pool', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			const conn = await proxy.connect(target);
			expect(calls.count).toBe(1);
			expect(proxy.idleCount).toBe(0);

			proxy.release(conn);
			expect(conn.closed).toBe(false);
			expect(proxy.idleCount).toBe(1);

			proxy.close();
		});

		it('reuses idle connection on pool HIT', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			const conn1 = await proxy.connect(target);
			proxy.release(conn1);
			expect(calls.count).toBe(1);
			expect(proxy.idleCount).toBe(1);

			const conn2 = await proxy.connect(target);
			expect(calls.count).toBe(1);
			expect(conn2).toBe(conn1);
			expect(proxy.idleCount).toBe(0);

			proxy.release(conn2);
			proxy.close();
		});

		it('excludes busy connections from pool HIT', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			const conn1 = await proxy.connect(target);
			expect(calls.count).toBe(1);

			const conn2 = await proxy.connect(target);
			expect(calls.count).toBe(2);
			expect(conn2).not.toBe(conn1);

			proxy.release(conn1);
			proxy.release(conn2);
			proxy.close();
		});

		it('skips closed connections when releasing to pool', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			const conn = await proxy.connect(target);
			conn.close();
			proxy.release(conn);

			expect(proxy.idleCount).toBe(0);

			const conn2 = await proxy.connect(target);
			expect(calls.count).toBe(2);
			conn2.close();
		});

		it('close() drains and clears the pool', async () => {
			const { tunnelFn } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, true);

			const conn1 = await proxy.connect({ host: 'a.com', port: 80, tls: false });
			const conn2 = await proxy.connect({ host: 'b.com', port: 443, tls: false });
			proxy.release(conn1);
			proxy.release(conn2);

			expect(proxy.idleCount).toBe(2);

			proxy.close();
			expect(proxy.idleCount).toBe(0);
			expect(conn1.closed).toBe(true);
			expect(conn2.closed).toBe(true);
		});
	});

	describe('pooled = false', () => {
		it('shows isPooled as false', () => {
			const { tunnelFn } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, false);
			expect(proxy.isPooled).toBe(false);
		});

		it('creates new connections without pooling', async () => {
			const { tunnelFn, calls } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, false);

			const conn = await proxy.connect(target);
			expect(calls.count).toBe(1);
			expect(proxy.idleCount).toBe(0);
			conn.close();
		});

		it('release() closes the connection immediately', async () => {
			const { tunnelFn } = createMockTunnel();
			const proxy = new Proxy(tunnelFn, mockOpts, false);

			const conn = await proxy.connect(target);
			expect(conn.closed).toBe(false);

			proxy.release(conn);
			expect(conn.closed).toBe(true);
			expect(proxy.idleCount).toBe(0);
		});
	});
});
