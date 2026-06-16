import { debug } from '../debug';
import type { ProxyConnection } from '../connection';
import type { PerformResult } from './types';

export function buildManualResponse(result: PerformResult): Response {
	return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
}

export function throwRedirectError(conn: ProxyConnection, result: PerformResult): never {
	conn.reader!.releaseLock();
	conn.close();
	throw new TypeError('URI requested responds with a redirect');
}

export function buildNoLocationResponse(result: PerformResult): Response {
	debug.log('Redirect without Location header');
	debug.timeEnd('total');
	debug.end();
	return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
}

export function buildTooManyRedirectsResponse(): never {
	debug.log('Too many redirects');
	debug.timeEnd('total');
	debug.end();
	throw new TypeError('Too many redirects');
}

export function buildNextRequest(
	request: Request,
	bodyBytes: Uint8Array | undefined,
	result: PerformResult,
): { request: Request; bodyBytes: Uint8Array | undefined } {
	const preserve = result.status === 307 || result.status === 308;
	const method = preserve ? request.method : 'GET';
	const nextBody = preserve ? bodyBytes : undefined;
	const nextUrl = new URL(result.headers.get('Location')!, request.url);
	const nextHeaders = new Headers(request.headers);
	if (nextUrl.origin !== new URL(request.url).origin) {
		nextHeaders.delete('Authorization');
	}
	return {
		request: new Request(nextUrl, { method, headers: nextHeaders, body: nextBody, signal: request.signal }),
		bodyBytes: nextBody,
	};
}
