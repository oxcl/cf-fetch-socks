import { debug } from './debug';
import type { ConnectFn } from './socket';
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
	private pooled: boolean;
	private pool = new Map<string, ProxyConnection[]>();
	private busy = new WeakSet<ProxyConnection>();
	private _uri: URL;

	static obtainProxy(uri: string): Proxy {
		const existing = Proxy.cache.get(uri);
		if (existing) return existing;
		const parsed = parseProxyUri(uri);
		const proxy = new Proxy(
			socks5Tunnel,
			{
				hostname: parsed.hostname,
				port: parsed.port,
				username: parsed.username,
				password: parsed.password,
			},
			undefined,
		);
		proxy._uri = parsed.url;
		Proxy.cache.set(uri, proxy);
		return proxy;
	}

	constructor(tunnelFn: TunnelFn, opts: ProxyOptions, pooled = true) {
		this.tunnelFn = tunnelFn;
		this.opts = { hostname: opts.hostname, port: opts.port, username: opts.username, password: opts.password, timeout: opts.timeout };
		this.connectFn = defaultConnect;
		this.pooled = pooled;
		const hostPart = opts.hostname.includes(':') ? `[${opts.hostname}]` : opts.hostname;
		this._uri = new URL(`socks5://${hostPart}:${opts.port}`);
		if (opts.username) this._uri.username = opts.username;
		if (opts.password) this._uri.password = opts.password;
	}

	get uri(): URL {
		return this._uri;
	}

	async connect(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		return this.pooled ? this.acquireConnection(target, signal) : this.acquire(target, signal);
	}

	release(conn: ProxyConnection): void {
		this.pooled ? this.revokeConnection(conn) : conn.close();
	}

	private async acquire(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		debug.log(`Opening new connection to ${target.host}:${target.port}`);
		return openConnection(this.tunnelFn, this.opts, target, this.connectFn, signal);
	}

	async acquireConnection(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		const key = `${target.host}:${target.port}`;
		const conns = this.pool.get(key) ?? [];
		const idx = conns.findIndex((c) => !c.closed && !this.busy.has(c));
		if (idx !== -1) {
			const [conn] = conns.splice(idx, 1);
			if (conns.length === 0) this.pool.delete(key);
			this.busy.add(conn);
			debug.log(`Pool HIT (${conns.length} idle remaining)`);
			return conn;
		}
		debug.log('Pool MISS');
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
