import type { Socket } from '@cloudflare/workers-types';
import { connect } from 'cloudflare:sockets';

export type LogFn = (msg: string) => void;

export type ConnectFn = (
	opts: { hostname: string; port: number },
	options?: { secureTransport?: string },
) => Socket;

export const defaultConnect: ConnectFn = (opts, options) =>
	connect(
		{ hostname: opts.hostname, port: opts.port },
		{ secureTransport: options?.secureTransport, allowHalfOpen: false },
	) as Socket;
