import { debug } from './debug';
import { ensureConnection, type Proxy } from './proxy';
import { performRequest, drainBodyStream } from './http/request';
import { buildFinalResponse, buildRedirectWithoutLocationResponse } from './http/response';
import type { ProxyConnection } from './connection';
import { MAX_REDIRECT } from './constants';
import { isRedirect, drainResponseBody, tooManyRedirectsResponse } from './redirect';

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal || signal.aborted) return promise;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			reject(new DOMException('The operation was aborted', 'AbortError'));
		};
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
			(e) => { signal.removeEventListener('abort', onAbort); reject(e); },
		);
	});
}

export async function executeRedirectLoop(proxy: Proxy, request: Request, signal?: AbortSignal): Promise<Response> {
	let activeConn: ProxyConnection | null = null;
	let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	let bodyBytes: Uint8Array | undefined;
	let redirected = false;
	const redirectMode = request.redirect || 'follow';
	for (let i = 0; i < MAX_REDIRECT; i++) {
		if (signal?.aborted) {
			throw new DOMException('The operation was aborted', 'AbortError');
		}
		if (i > 0) debug.log(`Redirect #${i}: ${request.method} ${request.url}`);
		const url = new URL(request.url);

		if (request.body && !bodyBytes) {
			bodyBytes = await drainBodyStream(request.body);
		}

		const mgmt = await ensureConnection(proxy, url, activeConn, activeReader, signal);
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
			const result = await abortable(performRequest(activeConn, request, activeReader, bodyBytes), signal);
			activeReader = result.reader;

			if (request.method === 'HEAD') {
				activeReader.releaseLock();
				activeReader = null;
				const conn = activeConn!;
				activeConn = null;
				proxy.release(conn);
				result.headers.delete('Content-Length');
				result.headers.delete('Content-Encoding');
				return new Response(null, { status: result.status, statusText: result.statusText, headers: result.headers });
			}

			if (!isRedirect(result.status)) {
				activeReader = null;
				const conn = activeConn!;
				activeConn = null;
				return buildFinalResponse(conn, result, redirected);
			}

			if (redirectMode === 'manual') {
				activeReader.releaseLock();
				activeReader = null;
				const conn = activeConn!;
				activeConn = null;
				proxy.release(conn);
				return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
			}

			if (redirectMode === 'error') {
				activeReader.releaseLock();
				if (!freed && activeConn) {
					activeConn.close();
					activeConn = null;
				}
				throw new TypeError('URI requested responds with a redirect');
			}

			redirected = true;

			const cl = result.headers.get('Content-Length');
			if (cl) await drainResponseBody(result.reader, Number(cl), result.initialBytes);
			const location = result.headers.get('Location');
			if (!location) return buildRedirectWithoutLocationResponse(free, result);

			const method = request.method;
			const next = result.status !== 307 && result.status !== 308 ? 'GET' : method;
			const body = result.status !== 307 && result.status !== 308 ? undefined : bodyBytes;
			if (result.status !== 307 && result.status !== 308) bodyBytes = undefined;
			const nextUrl = new URL(location, request.url);
			const nextHeaders = new Headers(request.headers);
			if (nextUrl.origin !== new URL(request.url).origin) {
				nextHeaders.delete('Authorization');
			}
			request = new Request(nextUrl, { method: next, headers: nextHeaders, body });
		} catch (e) {
			debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			if (activeReader) activeReader.releaseLock();
			if (!freed && activeConn) {
				activeConn.close();
				activeConn = null;
			}
			if (signal?.aborted) {
				throw new DOMException('The operation was aborted', 'AbortError');
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
