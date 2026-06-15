import type { ConnectFn, LogFn } from './socket';
import { defaultConnect } from './socket';
import type { DebugContext } from './debug';
import { openConnection, type ProxyConnection, type ProxyTarget, type ProxyCredentials, type TunnelFn } from './connection';
import { socks5Tunnel } from './socks5/index';
import { parseProxyUri } from './utils';
export type ProxyOptions = ProxyCredentials;

export async function ensureConnection(
	proxy: Proxy,
	url: URL,
	activeConn: ProxyConnection | null,
	activeReader: ReadableStreamDefaultReader<Uint8Array> | null,
	debug: DebugContext | undefined,
): Promise<{ conn: ProxyConnection; reader: ReadableStreamDefaultReader<Uint8Array> | null }> {
	const isTls = url.protocol === 'https:';
	const port = url.port ? Number(url.port) : isTls ? 443 : 80;
	const targetKey = `${url.hostname}:${port}`;
	const activeKey = activeConn ? `${activeConn.target.host}:${activeConn.target.port}` : null;
	if (activeConn && !activeConn.closed && activeKey === targetKey) return { conn: activeConn, reader: activeReader };
	if (activeConn && !activeConn.closed) {
		activeConn.close();
		if (activeReader) activeReader.releaseLock();
	}
	const conOpts: ProxyTarget = { host: url.hostname, port, tls: isTls };
	const conn = await proxy.connect(conOpts, undefined, debug);
	return { conn, reader: null };
}
export class Proxy {
	private static cache = new Map<string, Proxy>();

	private tunnelFn: TunnelFn;
	private opts: ProxyCredentials;
	private connectFn: ConnectFn;
	private log: LogFn;
	private pooled: boolean;
	private pool = new Map<string, ProxyConnection[]>();
	private busy = new WeakSet<ProxyConnection>();

	static acquireProxy(uri: string): Proxy {
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
			false,
		);
		Proxy.cache.set(uri, proxy);
		return proxy;
	}

	constructor(tunnelFn: TunnelFn, opts: ProxyOptions, log: LogFn = console.log, pooled = true) {
		this.tunnelFn = tunnelFn;
		this.opts = { hostname: opts.hostname, port: opts.port, username: opts.username, password: opts.password };
		this.connectFn = defaultConnect;
		this.log = log;
		this.pooled = pooled;
	}

	async connect(target: ProxyTarget, signal?: AbortSignal, debug?: DebugContext): Promise<ProxyConnection> {
		return this.pooled ? this.acquireConnection(target, signal, debug) : this.acquire(target, signal, debug);
	}

	release(conn: ProxyConnection): void {
		this.pooled ? this.revokeConnection(conn) : conn.close();
	}

	private async acquire(target: ProxyTarget, signal?: AbortSignal, debug?: DebugContext): Promise<ProxyConnection> {
		this.log(`Opening new connection to ${target.host}:${target.port}`);
		debug?.log(`Opening new connection to ${target.host}:${target.port}`);
		return openConnection(this.tunnelFn, this.opts, target, this.connectFn, this.log, signal, debug);
	}

	async acquireConnection(target: ProxyTarget, signal?: AbortSignal, debug?: DebugContext): Promise<ProxyConnection> {
		const key = `${target.host}:${target.port}`;
		const conns = this.pool.get(key) ?? [];
		const idx = conns.findIndex((c) => !c.closed && !this.busy.has(c));
		if (idx !== -1) {
			const [conn] = conns.splice(idx, 1);
			if (conns.length === 0) this.pool.delete(key);
			this.busy.add(conn);
			debug?.log(`Pool HIT (${conns.length} idle remaining)`);
			return conn;
		}
		debug?.log('Pool MISS');
		const conn = await this.acquire(target, signal, debug);
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
