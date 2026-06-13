import type { Socket } from '@cloudflare/workers-types';
import type { ConnectFn, LogFn } from './socket';
import { defaultConnect } from './socket';
import { openConnection, type ProxyConnection, type ProxyTarget, type ProxyCredentials, type TunnelFn } from './connection';

export type ProxyOptions = ProxyCredentials;

export class Proxy {
	private tunnelFn: TunnelFn;
	private opts: ProxyCredentials;
	private connectFn: ConnectFn;
	private log: LogFn;

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

	async acquire(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection> {
		this.log(`Opening new connection to ${target.host}:${target.port}`);
		return openConnection(this.tunnelFn, this.opts, target, this.connectFn, this.log, signal);
	}

	close(): void {
		// no-op: connections are closed by the caller
	}
}
