import type { Socket } from '@cloudflare/workers-types';

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
): Promise<Socket | undefined> {
	const { username, password, hostname, port } = parsedSocks5Addr;

	const socket = connect({ hostname, port }, { secureTransport });

	const socksGreeting = new Uint8Array([5, 2, 0, 2]);

	const writer = socket.writable.getWriter();
	await writer.write(socksGreeting);
	log('sent socks greeting');

	const reader = socket.readable.getReader();
	const encoder = new TextEncoder();
	let res = (await reader.read()).value;

	if (res[0] !== 0x05) {
		log(`socks server version error: ${res[0]} expected: 5`);
		return;
	}
	if (res[1] === 0xff) {
		log('no acceptable methods');
		return;
	}

	if (res[1] === 0x02) {
		log('socks server needs auth');
		if (!username || !password) {
			log('please provide username/password');
			return;
		}
		const authRequest = new Uint8Array([1, username.length, ...encoder.encode(username), password.length, ...encoder.encode(password)]);
		await writer.write(authRequest);
		res = (await reader.read()).value;
		if (res[0] !== 0x01 || res[1] !== 0x00) {
			log('fail to auth socks server');
			return;
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
			log(`invalid addressType is ${addressType}`);
			return;
	}
	const socksRequest = new Uint8Array([5, 1, 0, ...DSTADDR, portRemote >> 8, portRemote & 0xff]);
	await writer.write(socksRequest);
	log('sent socks request');

	res = (await reader.read()).value;
	if (res[1] === 0x00) {
		log('socks connection opened');
	} else {
		log('fail to open socks connection');
		return;
	}
	writer.releaseLock();
	reader.releaseLock();

	if (secureTransport === 'starttls') {
		log('upgrading to TLS...');
		const secureSocket = socket.startTls();
		writer.releaseLock();
		reader.releaseLock();
		return secureSocket;
	}

	return socket;
}
