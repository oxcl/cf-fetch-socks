import type { ExecutorState, PerformResult } from './types';

export async function drainAndGetLocation(result: PerformResult): Promise<string | null> {
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

export function buildNextRequest(state: ExecutorState, result: PerformResult, location: string, url: URL): void {
  const method = state.request.method;
  const nextMethod = result.status !== 307 && result.status !== 308 ? 'GET' : method;
  const nextBody = result.status !== 307 && result.status !== 308 ? undefined : state.bodyBytes;
  if (result.status !== 307 && result.status !== 308) state.bodyBytes = undefined;

  const nextUrl = new URL(location, state.request.url);
  const nextHeaders = new Headers(state.request.headers);
  if (nextUrl.origin !== url.origin) {
    nextHeaders.delete('Authorization');
  }
  state.request = new Request(nextUrl, { method: nextMethod, headers: nextHeaders, body: nextBody });
}
