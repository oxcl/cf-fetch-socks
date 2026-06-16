import { AbortError } from './errors';
import { debug } from './debug';
import { MAX_REDIRECT } from './constants';
import type { Proxy } from './proxy';
import { http } from './http';
import { drainToBuffer, drainReader } from './utils';
import { createPlainStream, createChunkedDecodingStream } from './http/stream';

export type { PerformResult } from './http/types';

function checkAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new AbortError('The operation was aborted');
}

export async function executeRedirectLoop(proxy: Proxy, request: Request, signal?: AbortSignal): Promise<Response> {
	const redirectMode = request.redirect || 'follow';
	let bodyPayload: Uint8Array | undefined;
	let redirected = false;

	for (let i = 0; i < MAX_REDIRECT; i++) {
		checkAborted(signal);
		if (i > 0) debug.log(`Redirect #${i}: ${request.method} ${request.url}`);

		const url = new URL(request.url);
		if (request.body && !bodyPayload) {
			bodyPayload = await drainToBuffer(request.body);
		}

		const conn = await proxy.connect(
			{
				host: url.hostname,
				port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
				tls: url.protocol === 'https:',
			},
			signal,
		);

		try {
			const result = await http.performRequest(conn, request, bodyPayload, signal);

			if (!http.isRedirect(result.status)) return http.buildFinalResponse(proxy, conn, result, redirected, request, signal);
			if (redirectMode === 'manual') return http.buildManualResponse(proxy, conn, result);
			if (redirectMode === 'error') http.throwRedirectError(conn, result);

			redirected = true;

			const cl = result.headers.get('Content-Length');
			const drainStream = cl
				? createPlainStream(conn, result.initialBytes, Number(cl))
				: createChunkedDecodingStream(conn, result.initialBytes);
			await drainReader(drainStream.getReader());
			if (!result.headers.get('Location')) return http.buildNoLocationResponse(proxy, conn, result);

			const next = http.buildNextRequest(request, bodyPayload, result);
			request = next.request;
			bodyPayload = next.bodyBytes;
			conn.reader!.releaseLock();
			proxy.release(conn);
		} catch (e) {
			debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			conn.close();
			if (signal?.aborted) throw new AbortError('The operation was aborted');
			throw e;
		}
	}

	return http.buildTooManyRedirectsResponse();
}
