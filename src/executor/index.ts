import { AbortError } from '../errors';
import { debug } from '../debug';
import { MAX_REDIRECT } from '../constants';
import type { Proxy } from '../proxy';
import { http } from '../http';
import { buildNextRequest, drainAndGetLocation } from './redirect';

export type { PerformResult } from './types';

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
			bodyPayload = await http.drainBodyStream(request.body);
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

			const location = await drainAndGetLocation(conn, result);
			if (!location) return http.buildNoLocationResponse(proxy, conn, result);

			const next = buildNextRequest(request, bodyPayload, result, location, url);
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
