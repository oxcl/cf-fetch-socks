import { AbortError } from './errors';
import { debug } from './debug';
import type { Proxy } from './proxy';
import type { ProxyConnection } from './connection';
import { performRequest, drainBodyStream } from './http/request';
import { buildFinalResponse } from './http/response';
import { MAX_REDIRECT, REDIRECT_STATUSES } from './constants';

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

type PerformResult = {
	reader: ReadableStreamDefaultReader<Uint8Array>;
	status: number;
	statusText: string;
	headers: Headers;
	initialBytes: Uint8Array;
};

export class Executor {
	private bodyBytes: Uint8Array | undefined;
	private redirected = false;
	private readonly redirectMode: string;

	constructor(
		private proxy: Proxy,
		private request: Request,
		private signal?: AbortSignal,
	) {
		this.redirectMode = request.redirect || 'follow';
	}

	async execute(): Promise<Response> {
		for (let i = 0; i < MAX_REDIRECT; i++) {
			this.checkAborted();
			if (i > 0) debug.log(`Redirect #${i}: ${this.request.method} ${this.request.url}`);

			const url = new URL(this.request.url);
			if (this.request.body && !this.bodyBytes) {
				this.bodyBytes = await drainBodyStream(this.request.body);
			}

			const conn = await this.connect(url);

			try {
				const result = await this.perform(conn);

				if (this.request.method === 'HEAD') return this.headResponse(conn, result);
				if (!this.isRedirect(result.status)) return buildFinalResponse(conn, result, this.redirected, this.request.url);
				if (this.redirectMode === 'manual') return this.manualResponse(conn, result);
				if (this.redirectMode === 'error') this.throwRedirectError(conn, result);

				this.redirected = true;

				const location = await this.drainAndGetLocation(result);
				if (!location) return this.noLocationResponse(conn, result);

				this.buildNextRequest(result, location, url);
				this.releaseConnection(conn, result);
			} catch (e) {
				debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
				conn.close();
				if (this.signal?.aborted) throw new AbortError('The operation was aborted');
				throw e;
			}
		}

		return this.tooManyRedirectsResponse();
	}

	private checkAborted(): void {
		if (this.signal?.aborted) throw new AbortError('The operation was aborted');
	}

	private connect(url: URL): Promise<ProxyConnection> {
		return this.proxy.connect({
			host: url.hostname,
			port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
			tls: url.protocol === 'https:',
		}, this.signal);
	}

	private perform(conn: ProxyConnection): Promise<PerformResult> {
		return abortable(performRequest(conn, this.request, null, this.bodyBytes), this.signal);
	}

	private headResponse(conn: ProxyConnection, result: PerformResult): Response {
		result.reader.releaseLock();
		this.proxy.release(conn);
		result.headers.delete('Content-Length');
		result.headers.delete('Content-Encoding');
		return new Response(null, { status: result.status, statusText: result.statusText, headers: result.headers });
	}

	private manualResponse(conn: ProxyConnection, result: PerformResult): Response {
		result.reader.releaseLock();
		this.proxy.release(conn);
		return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
	}

	private throwRedirectError(conn: ProxyConnection, result: PerformResult): never {
		result.reader.releaseLock();
		conn.close();
		throw new TypeError('URI requested responds with a redirect');
	}

	private async drainAndGetLocation(result: PerformResult): Promise<string | null> {
		const cl = result.headers.get('Content-Length');
		if (cl) {
			let drained = result.initialBytes.length;
			while (drained < Number(cl)) {
				const { value, done } = await result.reader.read();
				if (done) break;
				drained += value.length;
			}
		}
		return result.headers.get('Location');
	}

	private noLocationResponse(conn: ProxyConnection, result: PerformResult): Response {
		result.reader.releaseLock();
		this.proxy.release(conn);
		debug.log('Redirect without Location header');
		debug.timeEnd('total');
		debug.end();
		return new Response(result.initialBytes, { status: result.status, statusText: result.statusText, headers: result.headers });
	}

	private buildNextRequest(result: PerformResult, location: string, url: URL): void {
		const method = this.request.method;
		const nextMethod = result.status !== 307 && result.status !== 308 ? 'GET' : method;
		const nextBody = result.status !== 307 && result.status !== 308 ? undefined : this.bodyBytes;
		if (result.status !== 307 && result.status !== 308) this.bodyBytes = undefined;

		const nextUrl = new URL(location, this.request.url);
		const nextHeaders = new Headers(this.request.headers);
		if (nextUrl.origin !== url.origin) {
			nextHeaders.delete('Authorization');
		}
		this.request = new Request(nextUrl, { method: nextMethod, headers: nextHeaders, body: nextBody });
	}

	private releaseConnection(conn: ProxyConnection, result: PerformResult): void {
		result.reader.releaseLock();
		this.proxy.release(conn);
	}

	private tooManyRedirectsResponse(): never {
		debug.log('Too many redirects');
		debug.timeEnd('total');
		debug.end();
		throw new TypeError('Too many redirects');
	}

	private isRedirect(status: number): boolean {
		return REDIRECT_STATUSES.has(status);
	}
}
