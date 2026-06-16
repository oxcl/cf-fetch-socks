import type { PerformResult } from './types';

export function buildNextRequest(request: Request, bodyBytes: Uint8Array | undefined, result: PerformResult, location: string, url: URL): { request: Request; bodyBytes: Uint8Array | undefined } {
  const method = request.method;
  const nextMethod = result.status !== 307 && result.status !== 308 ? 'GET' : method;
  const nextBody = result.status !== 307 && result.status !== 308 ? undefined : bodyBytes;
  const nextBodyBytes = result.status !== 307 && result.status !== 308 ? undefined : bodyBytes;

  const nextUrl = new URL(location, request.url);
  const nextHeaders = new Headers(request.headers);
  if (nextUrl.origin !== url.origin) {
    nextHeaders.delete('Authorization');
  }
	return {
		request: new Request(nextUrl, { method: nextMethod, headers: nextHeaders, body: nextBody, signal: request.signal }),
		bodyBytes: nextBodyBytes,
	};
}
