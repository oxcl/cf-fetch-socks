import type { Socket } from '@cloudflare/workers-types';
import { makeTLSClient, setCryptoImplementation } from '@reclaimprotocol/tls';
import { webcryptoCrypto } from '@reclaimprotocol/tls/webcrypto';
import { socks5Connect, type ConnectFn, type LogFn } from './tunnel';
import { TlsSessionError } from './errors';

setCryptoImplementation(webcryptoCrypto);

export interface Socks5Credentials {
	hostname: string;
	port: number;
	username?: string;
	password?: string;
}

export interface ProxyTarget {
	host: string;
	port: number;
	tls: boolean;
}

export interface ProxyConnection {
	readonly target: ProxyTarget;
	readonly closed: boolean;
	write(data: Uint8Array): Promise<void>;
	readable: ReadableStream<Uint8Array>;
	close(): void;
}

export async function openProxyConnection(
	creds: Socks5Credentials,
	target: ProxyTarget,
	connectFn: ConnectFn,
	log: LogFn,
	signal?: AbortSignal,
): Promise<ProxyConnection> {
	const { socket, leftover } = await socks5Connect(
		target.tls ? 2 : target.host.includes(':') ? 3 : 1,
		target.host,
		target.port,
		log,
		creds,
		connectFn,
		'off',
		signal,
	);

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
		get closed() {
			return closed;
		},
		async write(data: Uint8Array) {
			if (closed) throw new Error('Connection closed');
			await writer.write(data);
		},
		readable: socket.readable as ReadableStream<Uint8Array>,
		close() {
			if (closed) return;
			closed = true;
			try {
				writer.releaseLock();
			} catch {}
			try {
				socket.close();
			} catch {}
		},
	};
}

async function wrapTls(
	socket: Socket,
	leftover: Uint8Array,
	target: ProxyTarget,
	log: LogFn,
	signal?: AbortSignal,
): Promise<ProxyConnection> {
	let closed = false;
	const writer = socket.writable.getWriter();

	const chunks: Uint8Array[] = [];
	let resolveAppData: (() => void) | null = null;
	let tlsWrite: ((data: Uint8Array) => Promise<void>) | null = null;
	let tlsEnded = false;
	let tlsError: Error | null = null;

	const handshakeDone = new Promise<void>((resolve, reject) => {
		const tls = makeTLSClient({
			host: target.host,
			verifyServerCertificate: true,
			cipherSuites: [
			'TLS_AES_256_GCM_SHA384',
			'TLS_AES_128_GCM_SHA256',
			'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
			'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
			'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
			'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
		],
			async write({ header, content }) {
				const data = new Uint8Array(header.length + content.length);
				data.set(header, 0);
				data.set(content, header.length);
				await writer.write(data);
			},
			onHandshake() {
				log('TLS handshake completed');
				tlsWrite = (data: Uint8Array) => tls.write(data);
				resolve();
			},
			onApplicationData(plaintext) {
				if (resolveAppData) {
					resolveAppData();
					resolveAppData = null;
				}
				chunks.push(plaintext);
			},
			onTlsEnd(error) {
				log(`TLS ended: ${error || 'ok'}`);
				tlsEnded = true;
				if (error) {
					tlsError = new TlsSessionError(`TLS session ended with error: ${error}`);
					reject(tlsError);
				}
				// Wake up any pending pull() so it can close the stream
				if (resolveAppData) {
					resolveAppData();
					resolveAppData = null;
				}
			},
		});

		const reader = socket.readable.getReader();

		const pump = async () => {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					tls.handleReceivedBytes(value);
				}
			} catch {
				// socket closed
			} finally {
				try {
					reader.releaseLock();
				} catch {}
			}
		};

		pump();

		if (leftover.length > 0) {
			tls.handleReceivedBytes(leftover);
		}

		tls.startHandshake();
	});

	if (signal?.aborted) {
		try {
			writer.releaseLock();
		} catch {}
		try {
			socket.close();
		} catch {}
		throw new Error('Request aborted');
	}

	const close = () => {
		if (closed) return;
		closed = true;
		try {
			writer.releaseLock();
		} catch {}
		try {
			socket.close();
		} catch {}
	};

	return {
		target,
		get closed() {
			return closed;
		},
		async write(data: Uint8Array) {
			if (closed) throw new Error('Connection closed');
			await handshakeDone;
			if (!tlsWrite) throw new Error('TLS not ready');
			await tlsWrite(data);
		},
		get readable(): ReadableStream<Uint8Array> {
			return new ReadableStream({
				async pull(controller) {
					await handshakeDone;

					if (tlsError) {
						controller.error(tlsError);
						return;
					}

					if (chunks.length > 0) {
						const chunk = chunks.shift()!;
						controller.enqueue(chunk);
						return;
					}

					if (tlsEnded) {
						controller.close();
						return;
					}

					await new Promise<void>((resolve) => {
						resolveAppData = resolve;
					});

					if (tlsError) {
						controller.error(tlsError);
					} else if (chunks.length > 0) {
						const chunk = chunks.shift()!;
						controller.enqueue(chunk);
					} else {
						controller.close();
					}
				},
				cancel() {
					close();
				},
			});
		},
		close,
	};
}
