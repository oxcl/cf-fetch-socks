import { Socks5ProtocolError, Socks5AuthError } from '../errors';

const GREETING = new Uint8Array([5, 2, 0, 2]);
const AUTH_VERSION = 1;

export async function sendGreeting(writer: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
	await writer.write(GREETING);
}

export async function receiveGreeting(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<number> {
	const result = await reader.read();
	if (result.done) throw new Socks5ProtocolError('Server closed during greeting');
	const res = result.value;
	if (res[0] !== 0x05) throw new Socks5ProtocolError(`Expected SOCKS5, got version ${res[0]}`);
	if (res[1] === 0xff) throw new Socks5ProtocolError('No acceptable auth methods');
	return res[1];
}

export async function authenticate(
	writer: WritableStreamDefaultWriter<Uint8Array>,
	reader: ReadableStreamDefaultReader<Uint8Array>,
	username: string,
	password: string,
): Promise<void> {
	const enc = new TextEncoder();
	const req = new Uint8Array([AUTH_VERSION, username.length, ...enc.encode(username), password.length, ...enc.encode(password)]);
	await writer.write(req);

	const result = await reader.read();
	if (result.done) throw new Socks5ProtocolError('Server closed during auth');
	if (result.value[0] !== AUTH_VERSION || result.value[1] !== 0x00) {
		throw new Socks5AuthError('Authentication failed');
	}
}
