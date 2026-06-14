import type { Socket } from '@cloudflare/workers-types';
import { makeTLSClient, setCryptoImplementation } from '@reclaimprotocol/tls';
import { webcryptoCrypto } from '@reclaimprotocol/tls/webcrypto';
import type { LogFn } from './socket';
import type { ProxyTarget, ProxyConnection } from './connection';
import type { DebugContext } from './debug';
import { TlsSessionError } from './errors';
import { pumpSocket, makeTlsReadable, type TlsState } from './tls-helpers';

setCryptoImplementation(webcryptoCrypto);

const CIPHERS: NonNullable<Parameters<typeof makeTLSClient>[0]>['cipherSuites'] = [
	'TLS_AES_256_GCM_SHA384', 'TLS_AES_128_GCM_SHA256',
	'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384', 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
	'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384', 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256',
];

export async function wrapTls(
	socket: Socket,
	leftover: Uint8Array,
	target: ProxyTarget,
	log: LogFn,
	signal?: AbortSignal,
	debug?: DebugContext,
): Promise<ProxyConnection> {
	let closed = false;
	const writer = socket.writable.getWriter();
	const s: TlsState = { chunks: [], resolveAppData: null, tlsWrite: null, tlsEnded: false, tlsError: null };

	debug?.dump(leftover, 'tls.leftover');

	const handshakeDone = new Promise<void>((resolve, reject) => {
		debug?.time('tls.handshake');
		const tls = makeTLSClient({
			host: target.host, verifyServerCertificate: true, cipherSuites: CIPHERS,
			async write({ header, content }) {
				const data = new Uint8Array(header.length + content.length);
				data.set(header, 0); data.set(content, header.length);
				await writer.write(data);
			},
			onHandshake() {
				debug?.timeEnd('tls.handshake');
				log('TLS handshake completed');
				s.tlsWrite = (data: Uint8Array) => tls.write(data);
				resolve();
			},
			onApplicationData(plaintext) {
				if (s.resolveAppData) { s.resolveAppData(); s.resolveAppData = null; }
				s.chunks.push(plaintext);
			},
		onTlsEnd(error) {
			log(`TLS ended: ${error || 'ok'}`);
			s.tlsEnded = true;
			closed = true;
			if (error) { s.tlsError = new TlsSessionError(`TLS session error: ${error}`); reject(s.tlsError); }
			if (s.resolveAppData) { s.resolveAppData(); s.resolveAppData = null; }
		},
		});
		pumpSocket(socket, tls, leftover);
		tls.startHandshake();
	});

	const close = () => {
		if (closed) return;
		closed = true;
		try { writer.releaseLock(); } catch { /* ignore */ }
		try { socket.close(); } catch { /* ignore */ }
	};

	return {
		target,
		get closed() { return closed; },
		async write(data: Uint8Array) {
			if (closed) throw new Error('Connection closed');
			if (s.tlsEnded) throw new Error('TLS session ended');
			await handshakeDone;
			if (!s.tlsWrite) throw new Error('TLS not ready');
			await s.tlsWrite(data);
		},
		get readable() { return makeTlsReadable(s, handshakeDone, close); },
		close,
	};
}
