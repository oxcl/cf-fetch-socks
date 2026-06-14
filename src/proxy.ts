import type { ConnectFn, LogFn } from './socket';
import { defaultConnect } from './socket';
import { openConnection, type ProxyConnection, type ProxyTarget, type ProxyCredentials, type TunnelFn } from './connection';
import { socks5Tunnel } from './socks5/index';
import { parseProxyUri } from './utils';

export type ProxyOptions = ProxyCredentials;

export class Proxy {
	private static cache = new Map<string, Proxy>();

	private tunnelFn: TunnelFn;
	private opts: ProxyCredentials;
	private connectFn: ConnectFn;
	private log: LogFn;
	private pool = new Map<string, ProxyConnection[]>();
	private busy = new WeakSet<ProxyConnection>();

	static acquireProxy(uri: string): Proxy {
		const existing = Proxy.cache.get(uri);
		if (existing) return existing;
		const parsed = parseProxyUri(uri);
		const proxy = new Proxy(socks5Tunnel, {
			hostname: parsed.hostname, port: parsed.port, username: parsed.username, password: parsed.password,
		});
		Proxy.cache.set(uri, proxy);
		return proxy;
	}

	constructor(tunnelFn: TunnelFn, opts: ProxyOptions, log: LogFn = console.log) {
		this.tunnelFn = tunnelFn;
		this.opts = { hostname: opts.hostname, port: opts.port, username: opts.username, password: opts.password };
		this.connectFn = defaultConnect;
		this.log = log;
	}

	async probe(signal?: AbortSignal): Promise<void> {
		this.log('Probing proxy reachability...');
		const { socket } = await this.tunnelFn({ host: '0.0.0.0', port: 0, tls: false }, this.opts, this.connectFn, this.log, signal);
		socket.close();
		this.log('Proxy is reachable');
	}

	async acquire(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		this.log(`Opening new connection to ${target.host}:${target.port}`);
		return openConnection(this.tunnelFn, this.opts, target, this.connectFn, this.log, signal);
	}

	async createConnection(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		return this.acquire(target, signal);
	}

	closeConnection(conn: ProxyConnection): void { conn.close(); }

	async acquireConnection(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		const key = `${target.host}:${target.port}`;
		const conns = this.pool.get(key) ?? [];
		const idx = conns.findIndex((c) => !c.closed && !this.busy.has(c));
		if (idx !== -1) {
			const [conn] = conns.splice(idx, 1);
			if (conns.length === 0) this.pool.delete(key);
			this.busy.add(conn);
			return conn;
		}
		const conn = await this.acquire(target, signal);
		this.busy.add(conn);
		return conn;
	}

	revokeConnection(conn: ProxyConnection): void {
		this.busy.delete(conn);
		if (conn.closed) return;
		const key = `${conn.target.host}:${conn.target.port}`;
		const conns = this.pool.get(key) ?? [];
		conns.push(conn);
		this.pool.set(key, conns);
	}

	close(): void {
		for (const conns of this.pool.values()) {
			for (const conn of conns) conn.close();
		}
		this.pool.clear();
	}
}
