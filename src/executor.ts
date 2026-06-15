import { debug } from './debug';
import { ensureConnection, type Proxy } from './proxy';
import { performRequest } from './http/request';
import { buildFinalResponse, buildRedirectWithoutLocationResponse } from './http/response';
import type { ProxyConnection } from './connection';
import { MAX_REDIRECT } from './constants';
import { isRedirect, drainResponseBody, tooManyRedirectsResponse } from './redirect';

export async function executeRedirectLoop(proxy: Proxy, request: Request): Promise<Response> {
	let activeConn: ProxyConnection | null = null;
	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	for (let i = 0; i < MAX_REDIRECT; i++) {
		if (i > 0) debug.log(`Redirect #${i}: ${request.method} ${request.url}`);
		const url = new URL(request.url);
		const mgmt = await ensureConnection(proxy, url, activeConn, activeReader);
		activeConn = mgmt.conn;
		activeReader = mgmt.reader;
		let freed = false;
		const free = () => {
			if (freed) return;
			freed = true;
			debug.log(`Releasing connection to ${activeConn!.target.host}:${activeConn!.target.port}`);
			proxy.release(activeConn!);
			activeConn = null;
			if (activeReader) {
				activeReader.releaseLock();
				activeReader = null;
			}
		};

		try {
			const result = await performRequest(activeConn, request, activeReader);
			activeReader = result.reader;

			if (!isRedirect(result.status)) {
				activeReader = null;
				const conn = activeConn!;
				activeConn = null;
				return buildFinalResponse(conn, result);
			}

			const cl = result.headers.get('Content-Length');
			if (cl) await drainResponseBody(result.reader, Number(cl), result.initialBytes);
			const location = result.headers.get('Location');
			if (!location) return buildRedirectWithoutLocationResponse(free, result);

			const method = request.method;
			const next = result.status !== 307 && result.status !== 308 ? 'GET' : method;
			const body = result.status !== 307 && result.status !== 308 ? undefined : request.body;
			request = new Request(new URL(location, request.url), { method: next, headers: request.headers, body });
		} catch (e) {
			debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			if (activeReader) activeReader.releaseLock();
			if (!freed && activeConn) {
				activeConn.close();
				activeConn = null;
			}
			throw e;
		}
	}

	debug.log('Too many redirects');
	debug.timeEnd('total');
	debug.end();
	if (activeConn) {
		if (activeReader) activeReader.releaseLock();
		debug.log(`Releasing connection to ${activeConn.target.host}:${activeConn.target.port}`);
		proxy.release(activeConn);
	}
	return tooManyRedirectsResponse();
}
