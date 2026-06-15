import { ensureConnection, type Proxy } from './proxy';
import { performRequest } from './http/request';
import { buildFinalResponse, buildRedirectWithoutLocationResponse } from './http/response';
import type { ProxyConnection } from './connection';
import type { DebugContext } from './debug';
import { MAX_REDIRECT } from './constants';
import { isRedirect, drainResponseBody, tooManyRedirectsResponse, redirectMethod } from './redirect';

export async function executeRedirectLoop(
	proxy: Proxy, url: URL, method: string,
	headers: HeadersInit | undefined, body: BodyInit | null | undefined,
	debug: DebugContext | undefined,
): Promise<Response> {
	let activeConn: ProxyConnection | null = null;
	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	for (let i = 0; i < MAX_REDIRECT; i++) {
		if (i > 0) debug?.log(`Redirect #${i}: ${method} ${url.toString()}`);
		const mgmt = await ensureConnection(proxy, url, activeConn, activeReader, debug);
		activeConn = mgmt.conn;
		activeReader = mgmt.reader;
		let freed = false;
		const free = () => {
			if (freed) return;
			freed = true;
			debug?.log(`Releasing connection to ${activeConn!.target.host}:${activeConn!.target.port}`);
			proxy.release(activeConn!);
			activeConn = null;
			if (activeReader) { activeReader.releaseLock(); activeReader = null; }
		};

		try {
			const result = await performRequest(activeConn, url, method, headers, body, debug, activeReader);
			activeReader = result.reader;

			if (!isRedirect(result.status)) {
				activeReader = null;
				const conn = activeConn!;
				activeConn = null;
				return buildFinalResponse(debug, conn, result);
			}

			const cl = result.headers.get('Content-Length');
			if (cl) await drainResponseBody(result.reader, Number(cl), result.initialBytes);
			const location = result.headers.get('Location');
			if (!location) return buildRedirectWithoutLocationResponse(debug, free, result);

			url = new URL(location, url);
			({ method, body } = redirectMethod(method, result.status));
		} catch (e) {
			debug?.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			if (activeReader) activeReader.releaseLock();
			if (!freed && activeConn) { activeConn.close(); activeConn = null; }
			throw e;
		}
	}

	debug?.log('Too many redirects');
	debug?.timeEnd('total');
	debug?.end();
	if (activeConn) {
		if (activeReader) activeReader.releaseLock();
		debug?.log(`Releasing connection to ${activeConn.target.host}:${activeConn.target.port}`);
		proxy.release(activeConn);
	}
	return tooManyRedirectsResponse();
}
