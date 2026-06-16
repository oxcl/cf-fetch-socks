import type { Socket } from '@cloudflare/workers-types';

export interface TlsState {
	chunks: Uint8Array[];
	resolveAppData: (() => void) | null;
	tlsWrite: ((data: Uint8Array) => Promise<void>) | null;
	tlsEnded: boolean;
	tlsError: Error | null;
	resolveHandshake?: () => void;
	rejectHandshake?: (err: Error) => void;
}

export function pumpSocket(socket: Socket, tls: { handleReceivedBytes(b: Uint8Array): void }, leftover: Uint8Array): void {
	const reader = socket.readable.getReader();
	(async () => {
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				tls.handleReceivedBytes(value);
			}
		} catch {
			/* socket closed */
		} finally {
			try {
				reader.releaseLock();
			} catch {
				/* ignore */
			}
		}
	})();
	if (leftover.length > 0) tls.handleReceivedBytes(leftover);
}

export function makeTlsReadable(s: TlsState, hd: Promise<void>, close: () => void): ReadableStream<Uint8Array> {
	return new ReadableStream({
		async pull(controller) {
			await hd;
			if (s.tlsError) {
				controller.error(s.tlsError);
				return;
			}
			if (s.chunks.length > 0) {
				controller.enqueue(s.chunks.shift()!);
				return;
			}
			if (s.tlsEnded) {
				controller.close();
				return;
			}
			await new Promise<void>((r) => {
				s.resolveAppData = r;
			});
			if (s.tlsError) {
				controller.error(s.tlsError);
			} else if (s.chunks.length > 0) {
				controller.enqueue(s.chunks.shift()!);
			} else {
				controller.close();
			}
		},
		cancel() {
			close();
		},
	});
}
