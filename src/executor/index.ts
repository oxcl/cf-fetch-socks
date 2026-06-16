import { AbortError } from '../errors';
import { debug } from '../debug';
import { MAX_REDIRECT } from '../constants';
import { drainBodyStream as drainBodyStreamIntoUint8Array } from '../http/request';
import { buildFinalResponse } from '../http/response';
import type { Proxy } from '../proxy';
import { performRequest } from '../http/request';
import { buildNextRequest, drainAndGetLocation } from './redirect';
import { isRedirect } from './utils';
import {
	buildHeadResponse,
	buildManualResponse,
	throwRedirectError,
	buildNoLocationResponse,
	buildTooManyRedirectsResponse,
} from './response';

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
			bodyPayload = await drainBodyStreamIntoUint8Array(request.body);
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
			const result = await performRequest(conn, request, null, bodyPayload, signal);

			if (request.method === 'HEAD') return buildHeadResponse(proxy, conn, result);
			if (!isRedirect(result.status)) return buildFinalResponse(conn, result, redirected, request.url, signal);
			if (redirectMode === 'manual') return buildManualResponse(proxy, conn, result);
			if (redirectMode === 'error') throwRedirectError(conn, result);

			redirected = true;

			const location = await drainAndGetLocation(result);
			if (!location) return buildNoLocationResponse(proxy, conn, result);

			const next = buildNextRequest(request, bodyPayload, result, location, url);
			request = next.request;
			bodyPayload = next.bodyBytes;
			result.reader.releaseLock();
			proxy.release(conn);
		} catch (e) {
			debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
			conn.close();
			if (signal?.aborted) throw new AbortError('The operation was aborted');
			throw e;
		}
	}

	return buildTooManyRedirectsResponse();
}
