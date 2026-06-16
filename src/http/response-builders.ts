import { debug } from '../debug';
import type { Proxy } from '../proxy';
import type { ProxyConnection } from '../connection';
import type { PerformResult } from '../executor/types';

export function buildManualResponse(proxy: Proxy, conn: ProxyConnection, result: PerformResult): Response {
	result.reader.releaseLock();
	proxy.release(conn);
	return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
}

export function throwRedirectError(conn: ProxyConnection, result: PerformResult): never {
	result.reader.releaseLock();
	conn.close();
	throw new TypeError('URI requested responds with a redirect');
}

export function buildNoLocationResponse(proxy: Proxy, conn: ProxyConnection, result: PerformResult): Response {
	result.reader.releaseLock();
	proxy.release(conn);
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
