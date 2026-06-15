import { AbortError } from './errors';
import { debug } from './debug';
import type { Proxy } from './proxy';
import { performRequest, drainBodyStream } from './http/request';
import { buildFinalResponse } from './http/response';
import { MAX_REDIRECT } from './constants';
import { isRedirect, drainResponseBody } from './redirect';

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
	let bodyBytes: Uint8Array | undefined;
	let redirected = false;
	const redirectMode = request.redirect || 'follow';

	for (let i = 0; i < MAX_REDIRECT; i++) {
		if (signal?.aborted) throw new AbortError('The operation was aborted');
		if (i > 0) debug.log(`Redirect #${i}: ${request.method} ${request.url}`);

		const url = new URL(request.url);

		if (request.body && !bodyBytes) {
			bodyBytes = await drainBodyStream(request.body);
		}

		const conn = await proxy.connect({
			host: url.hostname,
			port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
			tls: url.protocol === 'https:',
		}, signal);

		try {
			const result = await abortable(performRequest(conn, request, null, bodyBytes), signal);

			if (request.method === 'HEAD') {
				result.reader.releaseLock();
				proxy.release(conn);
				result.headers.delete('Content-Length');
				result.headers.delete('Content-Encoding');
				return new Response(null, { status: result.status, statusText: result.statusText, headers: result.headers });
			}

			if (!isRedirect(result.status)) {
				return buildFinalResponse(conn, result, redirected, request.url);
			}

			if (redirectMode === 'manual') {
				result.reader.releaseLock();
				proxy.release(conn);
				return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
			}

			if (redirectMode === 'error') {
				result.reader.releaseLock();
				conn.close();
				throw new TypeError('URI requested responds with a redirect');
			}

			redirected = true;

			const cl = result.headers.get('Content-Length');
			if (cl) await drainResponseBody(result.reader, Number(cl), result.initialBytes);

			const location = result.headers.get('Location');
			if (!location) {
				result.reader.releaseLock();
				proxy.release(conn);
				debug.log('Redirect without Location header');
				debug.timeEnd('total');
				debug.end();
				return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
			}

			const method = request.method;
			const nextMethod = result.status !== 307 && result.status !== 308 ? 'GET' : method;
			const nextBody = result.status !== 307 && result.status !== 308 ? undefined : bodyBytes;
			if (result.status !== 307 && result.status !== 308) bodyBytes = undefined;
			const nextUrl = new URL(location, request.url);
			const nextHeaders = new Headers(request.headers);
			if (nextUrl.origin !== url.origin) {
				nextHeaders.delete('Authorization');
			}
			request = new Request(nextUrl, { method: nextMethod, headers: nextHeaders, body: nextBody });

			result.reader.releaseLock();
			proxy.release(conn);
		} catch (e) {
			debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			conn.close();
			if (signal?.aborted) throw new AbortError('The operation was aborted');
			throw e;
		}
	}

	debug.log('Too many redirects');
	debug.timeEnd('total');
	debug.end();
	throw new TypeError('Too many redirects');
}
