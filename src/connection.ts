import type { Socket } from '@cloudflare/workers-types';
import type { TLSPresharedKey } from '@reclaimprotocol/tls';
import { debug } from './debug';
import type { ConnectFn } from './socket';
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
	timeout?: number;
}

export type TunnelFn = (
	target: ProxyTarget,
	creds: ProxyCredentials,
	connectFn: ConnectFn,
	signal?: AbortSignal,
) => Promise<{ socket: Socket; leftover: Uint8Array }>;

export interface ProxyConnection {
	readonly target: ProxyTarget;
	readonly closed: boolean;
	write(data: Uint8Array): Promise<void>;
	readable: ReadableStream<Uint8Array>;
	reader: ReadableStreamDefaultReader<Uint8Array> | null;
	close(): void;
}

export async function openConnection(
	tunnelFn: TunnelFn,
	creds: ProxyCredentials,
	target: ProxyTarget,
	connectFn: ConnectFn,
	signal?: AbortSignal,
	psk?: TLSPresharedKey,
	onTicket?: (psk: TLSPresharedKey) => void,
): Promise<ProxyConnection> {
	debug.time('tunnel');
	const { socket, leftover } = await tunnelFn(target, creds, connectFn, signal);
	debug.timeEnd('tunnel');

	if (!target.tls) {
		return wrapRaw(socket, target);
	}

	return wrapTls(socket, leftover, target, signal, psk, onTicket);
}

function wrapRaw(socket: Socket, target: ProxyTarget): ProxyConnection {
	let closed = false;
	const writer = socket.writable.getWriter();

	return {
		target,
		get closed() {
			return closed;
		},
		async write(data: Uint8Array) {
			if (closed) throw new Error('Connection closed');
			await writer.write(data);
		},
		readable: socket.readable as unknown as ReadableStream<Uint8Array>,
		reader: null,
		close() {
			if (closed) return;
			closed = true;
			try {
				socket.close();
			} catch {
				/* ignore */
			}
			try {
				writer.releaseLock();
			} catch {
				/* ignore */
			}
		},
	};
}
