import { connect } from 'cloudflare:sockets';
import type { Socket } from '@cloudflare/workers-types';
import { openProxyConnection, type ProxyConnection, type ProxyTarget, type Socks5Credentials } from './proxy-connection';
import type { ConnectFn, LogFn } from './tunnel';

export interface Socks5ProxyOptions extends Socks5Credentials {
	maxIdlePerTarget?: number;
	idleTimeoutMs?: number;
}

const defaultConnect: ConnectFn = (opts, options) =>
	connect(
		{ hostname: opts.hostname, port: opts.port },
		{ secureTransport: options?.secureTransport, allowHalfOpen: false },
	) as Socket;

export class Socks5Proxy {
	private pool = new Map<string, ProxyConnection[]>();
	private opts: Socks5ProxyOptions;
	private log: LogFn;

	constructor(opts: Socks5ProxyOptions, log: LogFn = console.log) {
		this.opts = { ...opts };
		this.log = log;
	}

	async connect(signal?: AbortSignal): Promise<void> {
		this.log('Probing proxy reachability...');
		const { socket } = await import('./tunnel').then((m) =>
			m.socks5Connect(
				2,
				'0.0.0.0',
				0,
				this.log,
				this.opts,
				defaultConnect,
				'off',
				signal,
			),
		);
		socket.close();
		this.log('Proxy is reachable');
	}

	private poolKey(target: ProxyTarget): string {
		return `${target.host}:${target.port}:${target.tls ? 1 : 0}`;
	}

	async acquire(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		const key = this.poolKey(target);
		const idle = this.pool.get(key);
		if (idle && idle.length > 0) {
			const conn = idle.pop()!;
			if (!conn.closed) {
				this.log(`Reusing pooled connection to ${target.host}:${target.port}`);
				return conn;
			}
		}

		this.log(`Opening new connection to ${target.host}:${target.port}`);
		return openProxyConnection(this.opts, target, defaultConnect, this.log, signal);
	}

	release(conn: ProxyConnection, reusable: boolean): void {
		const max = this.opts.maxIdlePerTarget ?? 0;
		const key = this.poolKey(conn.target);

		if (!reusable || conn.closed || max <= 0) {
			conn.close();
			return;
		}

		const idle = this.pool.get(key) ?? [];
		if (idle.length >= max) {
			conn.close();
			return;
		}

		idle.push(conn);
		this.pool.set(key, idle);
	}

	async close(): Promise<void> {
		for (const conns of this.pool.values()) {
			for (const c of conns) {
				c.close();
			}
		}
		this.pool.clear();
	}
}
