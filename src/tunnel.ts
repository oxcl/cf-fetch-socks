import type { Socket } from '@cloudflare/workers-types';
import {
	TunnelError,
	Socks5ProtocolError,
	Socks5AuthError,
	Socks5ServerError,
	ConnectionRefusedError,
	ConnectionTimeoutError,
	TlsUpgradeError,
	AbortError,
} from './errors';

export interface ParsedSocks5Addr {
	username?: string;
	password?: string;
	hostname: string;
	port: number;
}

export type ConnectFn = (
	opts: { hostname: string; port: number },
	options?: { secureTransport?: string },
) => Socket;
export type LogFn = (msg: string) => void;

export async function socks5Connect(
	addressType: 1 | 2 | 3,
	addressRemote: string,
	portRemote: number,
	log: LogFn,
	parsedSocks5Addr: ParsedSocks5Addr,
	connect: ConnectFn,
	secureTransport: 'off' | 'on' | 'starttls' = 'off',
	signal?: AbortSignal,
): Promise<Socket> {
	const { username, password, hostname, port } = parsedSocks5Addr;

	let socket: Socket;

	try {
		socket = connect({ hostname, port }, { secureTransport });
	} catch (err) {
		if (err instanceof Error && (err.message.includes('connection refused') || err.message.includes('ECONNREFUSED'))) {
			throw new ConnectionRefusedError(`Connection to proxy ${hostname}:${port} refused`, err);
		}
		if (err instanceof Error && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'))) {
			throw new ConnectionTimeoutError(`Connection to proxy ${hostname}:${port} timed out`, err);
		}
		throw new ConnectionRefusedError(`Failed to connect to proxy ${hostname}:${port}`, err);
	}

	if (signal?.aborted) {
		try { socket.close(); } catch {}
		throw new AbortError('Request was aborted before connection established', signal.reason);
	}

	const cleanup = () => {
		try { socket.close(); } catch {}
	};

	if (signal) {
		signal.addEventListener('abort', cleanup, { once: true });
	}

	const socksGreeting = new Uint8Array([5, 2, 0, 2]);

	const writer = socket.writable.getWriter();
	await writer.write(socksGreeting);
	log('sent socks greeting');

	const reader = socket.readable.getReader();
	const encoder = new TextEncoder();

	let res: Uint8Array;
	try {
		const readResult = await reader.read();
		if (readResult.done) {
			throw new Socks5ProtocolError('SOCKS5 server closed connection during greeting');
		}
		res = readResult.value;
	} catch (err) {
		signal?.removeEventListener('abort', cleanup);
		cleanup();
		if (err instanceof TunnelError) throw err;
		throw new ConnectionRefusedError(`Proxy ${hostname}:${port} closed connection unexpectedly`, err);
	}

	if (res[0] !== 0x05) {
		signal?.removeEventListener('abort', cleanup);
		cleanup();
		throw new Socks5ProtocolError(`SOCKS server version error: ${res[0]} expected: 5`);
	}
	if (res[1] === 0xff) {
		signal?.removeEventListener('abort', cleanup);
		cleanup();
		throw new Socks5ProtocolError('No acceptable SOCKS authentication methods');
	}

	if (res[1] === 0x02) {
		log('socks server needs auth');
		if (!username || !password) {
			signal?.removeEventListener('abort', cleanup);
			cleanup();
			throw new Socks5AuthError('SOCKS5 server requires authentication but no credentials provided');
		}
		const authRequest = new Uint8Array([1, username.length, ...encoder.encode(username), password.length, ...encoder.encode(password)]);
		await writer.write(authRequest);
		const authResult = await reader.read();
		if (authResult.done) {
			signal?.removeEventListener('abort', cleanup);
			cleanup();
			throw new Socks5ProtocolError('SOCKS5 server closed connection during authentication');
		}
		res = authResult.value;
		if (res[0] !== 0x01 || res[1] !== 0x00) {
			signal?.removeEventListener('abort', cleanup);
			cleanup();
			throw new Socks5AuthError('SOCKS5 authentication failed');
		}
	}

	let DSTADDR: Uint8Array;
	switch (addressType) {
		case 1:
			DSTADDR = new Uint8Array([1, ...addressRemote.split('.').map(Number)]);
			break;
		case 2:
			DSTADDR = new Uint8Array([3, addressRemote.length, ...encoder.encode(addressRemote)]);
			break;
		case 3:
			DSTADDR = new Uint8Array([4, ...addressRemote.split(':').flatMap((x) => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)])]);
			break;
		default:
			signal?.removeEventListener('abort', cleanup);
			cleanup();
			throw new TunnelError(`Invalid addressType: ${addressType}`, 'INVALID_ADDRESS_TYPE');
	}
	const socksRequest = new Uint8Array([5, 1, 0, ...DSTADDR, portRemote >> 8, portRemote & 0xff]);
	await writer.write(socksRequest);
	log('sent socks request');

	const replyResult = await reader.read();
	if (replyResult.done) {
		signal?.removeEventListener('abort', cleanup);
		cleanup();
		throw new Socks5ProtocolError('SOCKS5 server closed connection during request');
	}
	res = replyResult.value;

	if (res[1] !== 0x00) {
		signal?.removeEventListener('abort', cleanup);
		cleanup();
		throw new Socks5ServerError(`SOCKS5 server returned error code: ${res[1]}`);
	}

	log('socks connection opened');

	signal?.removeEventListener('abort', cleanup);
	writer.releaseLock();
	reader.releaseLock();

	if (secureTransport === 'starttls') {
		log('upgrading to TLS...');
		try {
			const secureSocket = socket.startTls();
			return secureSocket;
		} catch (err) {
			throw new TlsUpgradeError('TLS upgrade failed', err);
		}
	}

	return socket;
}