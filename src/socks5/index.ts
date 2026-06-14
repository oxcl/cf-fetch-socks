import type { Socket } from '@cloudflare/workers-types';
import type { ConnectFn, LogFn } from '../socket';
import type { ProxyTarget, ProxyCredentials, TunnelFn } from '../connection';
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

export const socks5Tunnel: TunnelFn = async (target, creds, connectFn, log, signal) => {
	const { username, password, hostname, port } = creds;
	const socket = connectProxySocket(hostname, port, connectFn, signal);

	const writer = socket.writable.getWriter() as unknown as WritableStreamDefaultWriter<Uint8Array>;
	const reader = socket.readable.getReader() as unknown as ReadableStreamDefaultReader<Uint8Array>;
	let socketOwned = false;

	try {
		await sendGreeting(writer);
		log('sent socks greeting');

		const authMethod = await receiveGreeting(reader);
		if (authMethod === 0x02) {
			log('socks server needs auth');
			if (!username || !password) throw new Socks5AuthError('No credentials provided');
			await authenticate(writer, reader, username, password);
		}

		const addressType = getAddressType(target.host);
		await sendConnectRequest(writer, target.host, target.port, addressType);
		log('sent socks request');

		const { leftover } = await readConnectReply(reader);
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
