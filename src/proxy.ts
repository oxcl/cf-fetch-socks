import type { Socket } from '@cloudflare/workers-types';
import type { ConnectFn, LogFn } from './socket';
import { defaultConnect } from './socket';
import { openConnection, type ProxyConnection, type ProxyTarget, type ProxyCredentials, type TunnelFn } from './connection';

export interface ProxyOptions extends ProxyCredentials {
	maxIdlePerTarget?: number;
	idleTimeoutMs?: number;
}

export class Proxy {
	private pool = new Map<string, ProxyConnection[]>();
	private tunnelFn: TunnelFn;
	private opts: ProxyCredentials;
	private connectFn: ConnectFn;
	private log: LogFn;
	private maxIdle: number;

	constructor(tunnelFn: TunnelFn, opts: ProxyOptions, log: LogFn = console.log) {
		this.tunnelFn = tunnelFn;
		this.opts = {
			hostname: opts.hostname,
			port: opts.port,
			username: opts.username,
			password: opts.password,
		};
		this.connectFn = defaultConnect;
		this.log = log;
		this.maxIdle = opts.maxIdlePerTarget ?? 0;
	}

	async probe(signal?: AbortSignal): Promise<void> {
		this.log('Probing proxy reachability...');
		const { socket } = await this.tunnelFn(
			{ host: '0.0.0.0', port: 0, tls: false },
			this.opts,
			this.connectFn,
			this.log,
			signal,
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
		return openConnection(this.tunnelFn, this.opts, target, this.connectFn, this.log, signal);
	}

	release(conn: ProxyConnection, reusable: boolean): void {
		const key = this.poolKey(conn.target);

		if (!reusable || conn.closed || this.maxIdle <= 0) {
			conn.close();
			return;
		}

		const idle = this.pool.get(key) ?? [];
		if (idle.length >= this.maxIdle) {
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
