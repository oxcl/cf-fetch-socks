import type { Socket } from '@cloudflare/workers-types';
import type { ConnectFn, LogFn } from './socket';
import { wrapTls } from './tls';

export interface ProxyTarget {
	host: string;
	port: number;
	tls: boolean;
}

export interface ProxyCredentials {
	hostname: string;
	port: number;
	username?: string;
	password?: string;
}

export type TunnelFn = (
	target: ProxyTarget,
	creds: ProxyCredentials,
	connectFn: ConnectFn,
	log: LogFn,
	signal?: AbortSignal,
) => Promise<{ socket: Socket; leftover: Uint8Array }>;

export interface ProxyConnection {
	readonly target: ProxyTarget;
	readonly closed: boolean;
	write(data: Uint8Array): Promise<void>;
	readable: ReadableStream<Uint8Array>;
	close(): void;
}

export async function openConnection(
	tunnelFn: TunnelFn,
	creds: ProxyCredentials,
	target: ProxyTarget,
	connectFn: ConnectFn,
	log: LogFn,
	signal?: AbortSignal,
): Promise<ProxyConnection> {
	const { socket, leftover } = await tunnelFn(target, creds, connectFn, log, signal);

	if (!target.tls) {
		return wrapRaw(socket, target);
	}

	return wrapTls(socket, leftover, target, log, signal);
}

function wrapRaw(socket: Socket, target: ProxyTarget): ProxyConnection {
	let closed = false;
	const writer = socket.writable.getWriter();

	return {
		target,
		get closed() { return closed; },
		async write(data: Uint8Array) {
			if (closed) throw new Error('Connection closed');
			await writer.write(data);
		},
		readable: socket.readable as unknown as ReadableStream<Uint8Array>,
		close() {
			if (closed) return;
			closed = true;
			try { writer.releaseLock(); } catch { /* ignore */ }
			try { socket.close(); } catch { /* ignore */ }
		},
	};
}
