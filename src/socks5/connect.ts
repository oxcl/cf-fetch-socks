import { Socks5ProtocolError, Socks5ServerError } from '../errors';
import type { AddressType } from './address';
import { encodeAddress } from './address';

export async function sendConnectRequest(
	writer: WritableStreamDefaultWriter<Uint8Array>,
	host: string,
	port: number,
	addressType: AddressType,
): Promise<void> {
	const dstAddr = encodeAddress(host, addressType);
	const request = new Uint8Array([5, 1, 0, ...dstAddr, port >> 8, port & 0xff]);
	await writer.write(request);
}

export async function readConnectReply(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ leftover: Uint8Array }> {
	const result = await reader.read();
	if (result.done) throw new Socks5ProtocolError('Server closed during connect reply');

	const first = result.value;
	if (first[1] !== 0x00) throw new Socks5ServerError(`SOCKS5 error code: ${first[1]}`);

	const atyp = first[3];
	const payloadSize = replyPayloadSize(atyp, first);
	const alreadyRead = first.length - 4;

	if (alreadyRead >= payloadSize) {
		return { leftover: first.slice(4 + payloadSize) };
	}

	return readRemainingReply(reader, payloadSize - alreadyRead);
}

function replyPayloadSize(atyp: number, firstChunk: Uint8Array): number {
	switch (atyp) {
		case 1: return 6;
		case 3: return 1 + firstChunk[4] + 2;
		case 4: return 18;
		default: throw new Socks5ProtocolError(`Unknown ATYP ${atyp}`);
	}
}

async function readRemainingReply(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	needed: number,
): Promise<{ leftover: Uint8Array }> {
	const chunks: Uint8Array[] = [];
	let totalRead = 0;

	while (totalRead < needed) {
		const { value, done } = await reader.read();
		if (done) throw new Socks5ProtocolError('Server closed while reading reply');
		chunks.push(value);
		totalRead += value.length;
	}

	const overRead = totalRead - needed;
	if (overRead <= 0) return { leftover: new Uint8Array(0) };

	const last = chunks[chunks.length - 1];
	return { leftover: last.slice(last.length - overRead) };
}
