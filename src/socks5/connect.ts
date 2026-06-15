import { AbortError, ConnectionRefusedError, ConnectionTimeoutError, Socks5ProtocolError, Socks5ServerError } from '../errors';
import type { AddressType } from './address';
import { encodeAddress } from './address';

function checkTimeout(signal?: AbortSignal, userSignal?: AbortSignal, message = 'SOCKS5 connect timed out'): void {
	if (userSignal?.aborted) throw new AbortError('The operation was aborted');
	if (signal?.aborted) throw new ConnectionTimeoutError(message);
}

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
	signal?: AbortSignal,
	userSignal?: AbortSignal,
): Promise<{ leftover: Uint8Array }> {
	let result: ReadableStreamReadResult<Uint8Array>;
	try {
		result = await reader.read();
	} catch (err) {
		checkTimeout(signal, userSignal);
		throw err;
	}
	if (result.done) {
		checkTimeout(signal, userSignal);
		throw new Socks5ProtocolError('Server closed during connect reply');
	}

	const first = result.value;
	if (first[1] !== 0x00) {
		if (first[1] === 0x05) throw new ConnectionRefusedError('SOCKS5 connection refused by remote host');
		throw new Socks5ServerError(`SOCKS5 error code: ${first[1]}`);
	}

	const atyp = first[3];
	const payloadSize = replyPayloadSize(atyp, first);
	const alreadyRead = first.length - 4;

	if (alreadyRead >= payloadSize) {
		return { leftover: first.slice(4 + payloadSize) };
	}

	return readRemainingReply(reader, payloadSize - alreadyRead, signal, userSignal);
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
	signal?: AbortSignal,
	userSignal?: AbortSignal,
): Promise<{ leftover: Uint8Array }> {
	const chunks: Uint8Array[] = [];
	let totalRead = 0;

	while (totalRead < needed) {
		let chunk: ReadableStreamReadResult<Uint8Array>;
		try {
			chunk = await reader.read();
		} catch (err) {
			checkTimeout(signal, userSignal);
			throw err;
		}
		if (chunk.done) {
			checkTimeout(signal, userSignal);
			throw new Socks5ProtocolError('Server closed while reading reply');
		}
		const { value } = chunk;
		chunks.push(value);
		totalRead += value.length;
	}

	const overRead = totalRead - needed;
	if (overRead <= 0) return { leftover: new Uint8Array(0) };

	const last = chunks[chunks.length - 1];
	return { leftover: last.slice(last.length - overRead) };
}
