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

function parseIPv6Address(address: string): Uint8Array {
	const parts = address.split(':');
	if (parts.length < 2 || parts.length > 8) {
		throw new TunnelError(`Invalid IPv6 address: ${address}`, 'INVALID_IPV6');
	}

	let emptyCount = 0;
	for (const p of parts) {
		if (p === '') emptyCount++;
	}

	let expanded: string[];
	if (emptyCount >= 1) {
		const emptyIndex = parts.indexOf('');
		const before = parts.slice(0, emptyIndex);
		const after = parts.slice(emptyIndex + 1);
		const missing = 8 - (before.length + after.length);
		expanded = [...before, ...Array(missing).fill('0000'), ...after];
	} else {
		expanded = parts;
	}

	const bytes: number[] = [];
	for (const part of expanded) {
		const padded = part.padStart(4, '0');
		bytes.push(parseInt(padded.slice(0, 2), 16), parseInt(padded.slice(2), 16));
	}

	return new Uint8Array([4, ...bytes]);
}

async function readSocksReplyFrame(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	atyp: number,
	initialChunk: Uint8Array,
): Promise<{ leftover: Uint8Array }> {
	let remainingLen: number;
	switch (atyp) {
		case 1:
			remainingLen = 4 + 2;
			break;
		case 3: {
			const domainLen = initialChunk[4];
			remainingLen = 1 + domainLen + 2;
			break;
		}
		case 4:
			remainingLen = 16 + 2;
			break;
		default:
			throw new Socks5ProtocolError(`SOCKS5 reply: unknown ATYP ${atyp}`);
	}

	const alreadyRead = initialChunk.length - 4;
	let totalRead = alreadyRead;
	const chunks: Uint8Array[] = [];
	while (totalRead < remainingLen) {
		const { value, done } = await reader.read();
		if (done) {
			throw new Socks5ProtocolError('SOCKS5 server closed connection while reading reply frame');
		}
		chunks.push(value);
		totalRead += value.length;
	}

	const overRead = totalRead - remainingLen;
	if (overRead === 0) {
		return { leftover: new Uint8Array(0) };
	}

	const lastChunk = chunks[chunks.length - 1];
	const leftoverStart = lastChunk.length - overRead;
	return { leftover: lastChunk.slice(leftoverStart) };
}

export async function socks5Connect(
	addressType: 1 | 2 | 3,
	addressRemote: string,
	portRemote: number,
	log: LogFn,
	parsedSocks5Addr: ParsedSocks5Addr,
	connect: ConnectFn,
	secureTransport: 'off' | 'on' | 'starttls' = 'off',
	signal?: AbortSignal,
): Promise<{ socket: Socket; leftover: Uint8Array }> {
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

	let socketOwned = false;

	const cleanup = () => {
		if (!socketOwned) {
			try { socket.close(); } catch {}
		}
	};

	if (signal) {
		signal.addEventListener('abort', cleanup, { once: true });
	}

	let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

	try {
		const socksGreeting = new Uint8Array([5, 2, 0, 2]);

		writer = socket.writable.getWriter();
		await writer.write(socksGreeting);
		log('sent socks greeting');

		reader = socket.readable.getReader();
		const encoder = new TextEncoder();

		let res: Uint8Array;
		try {
			const readResult = await reader.read();
			if (readResult.done) {
				throw new Socks5ProtocolError('SOCKS5 server closed connection during greeting');
			}
			res = readResult.value;
		} catch (err) {
			if (err instanceof TunnelError) throw err;
			throw new ConnectionRefusedError(`Proxy ${hostname}:${port} closed connection unexpectedly`, err);
		}

		if (res[0] !== 0x05) {
			throw new Socks5ProtocolError(`SOCKS server version error: ${res[0]} expected: 5`);
		}
		if (res[1] === 0xff) {
			throw new Socks5ProtocolError('No acceptable SOCKS authentication methods');
		}

		if (res[1] === 0x02) {
			log('socks server needs auth');
			if (!username || !password) {
				throw new Socks5AuthError('SOCKS5 server requires authentication but no credentials provided');
			}
			const authRequest = new Uint8Array([
				1,
				username.length,
				...encoder.encode(username),
				password.length,
				...encoder.encode(password),
			]);
			await writer.write(authRequest);
			const authResult = await reader.read();
			if (authResult.done) {
				throw new Socks5ProtocolError('SOCKS5 server closed connection during authentication');
			}
			res = authResult.value;
			if (res[0] !== 0x01 || res[1] !== 0x00) {
				throw new Socks5AuthError('SOCKS5 authentication failed');
			}
		}

		let DSTADDR: Uint8Array;
		switch (addressType) {
			case 1: {
				DSTADDR = new Uint8Array([1, ...addressRemote.split('.').map(Number)]);
				break;
			}
			case 2: {
				DSTADDR = new Uint8Array([3, addressRemote.length, ...encoder.encode(addressRemote)]);
				break;
			}
			case 3: {
				DSTADDR = parseIPv6Address(addressRemote);
				break;
			}
			default: {
				throw new TunnelError(`Invalid addressType: ${addressType}`, 'INVALID_ADDRESS_TYPE');
			}
		}
		const socksRequest = new Uint8Array([5, 1, 0, ...DSTADDR, portRemote >> 8, portRemote & 0xff]);
		await writer.write(socksRequest);
		log('sent socks request');

		const replyResult = await reader.read();
		if (replyResult.done) {
			throw new Socks5ProtocolError('SOCKS5 server closed connection during request');
		}
		res = replyResult.value;

		if (res[1] !== 0x00) {
			throw new Socks5ServerError(`SOCKS5 server returned error code: ${res[1]}`);
		}

		const atyp = res[3];
		const { leftover } = await readSocksReplyFrame(reader, atyp, res);

		log('socks connection opened');

		socketOwned = true;

		if (secureTransport === 'starttls') {
			log('upgrading to TLS...');
			try {
				const secureSocket = socket.startTls();
				return { socket: secureSocket, leftover: new Uint8Array(0) };
			} catch (err) {
				throw new TlsUpgradeError('TLS upgrade failed', err);
			}
		}

		return { socket, leftover };
	} finally {
		if (signal) {
			signal.removeEventListener('abort', cleanup);
		}
		if (writer) {
			try { writer.releaseLock(); } catch {}
		}
		if (reader) {
			try { reader.releaseLock(); } catch {}
		}
	}
}