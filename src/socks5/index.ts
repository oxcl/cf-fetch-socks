import type { Socket } from '@cloudflare/workers-types';
import type { ConnectFn, LogFn } from '../socket';
import type { ProxyTarget, ProxyCredentials, TunnelFn } from '../connection';
import type { DebugContext } from '../debug';
import {
	ConnectionRefusedError,
	ConnectionTimeoutError,
	AbortError,
	Socks5AuthError,
} from '../errors';
import { getAddressType } from './address';
import { sendGreeting, receiveGreeting, authenticate } from './greeting';
import { sendConnectRequest, readConnectReply } from './connect';

function connectProxySocket(
	hostname: string,
	port: number,
	connectFn: ConnectFn,
	signal?: AbortSignal,
): Socket {
	try {
		const socket = connectFn({ hostname, port });
		if (signal?.aborted) {
			try { socket.close(); } catch { /* ignore */ }
			throw new AbortError('Request aborted before connection established');
		}
		return socket;
	} catch (err) {
		if (err instanceof AbortError) throw err;
		if (err instanceof Error && err.message.includes('refused')) {
			throw new ConnectionRefusedError(`Proxy ${hostname}:${port} refused`, err);
		}
		if (err instanceof Error && err.message.includes('timeout')) {
			throw new ConnectionTimeoutError(`Proxy ${hostname}:${port} timed out`, err);
		}
		throw new ConnectionRefusedError(`Failed to connect to proxy ${hostname}:${port}`, err);
	}
}

export const socks5Tunnel: TunnelFn = async (target, creds, connectFn, log, signal, debug) => {
	const { username, password, hostname, port } = creds;

	debug?.time('tcp.connect');
	const socket = connectProxySocket(hostname, port, connectFn, signal);
	debug?.timeEnd('tcp.connect');

	const writer = socket.writable.getWriter() as unknown as WritableStreamDefaultWriter<Uint8Array>;
	const reader = socket.readable.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
	let socketOwned = false;

	try {
		debug?.time('socks5.greet');
		await sendGreeting(writer);
		const authMethod = await receiveGreeting(reader);
		debug?.timeEnd('socks5.greet');
		log('sent socks greeting');

		if (authMethod === 0x02) {
			log('socks server needs auth');
			if (!username || !password) throw new Socks5AuthError('No credentials provided');
			debug?.time('socks5.auth');
			await authenticate(writer, reader, username, password);
			debug?.timeEnd('socks5.auth');
		}

		const addressType = getAddressType(target.host);
		debug?.time('socks5.connect');
		await sendConnectRequest(writer, target.host, target.port, addressType);
		const { leftover } = await readConnectReply(reader);
		debug?.timeEnd('socks5.connect');
		log('socks connection opened');

		socketOwned = true;
		return { socket, leftover };
	} finally {
		if (!socketOwned) {
			try { socket.close(); } catch { /* ignore */ }
		}
		try { writer.releaseLock(); } catch { /* ignore */ }
		try { reader.releaseLock(); } catch { /* ignore */ }
	}
};
