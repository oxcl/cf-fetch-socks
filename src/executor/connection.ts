import type { Proxy } from '../proxy';
import type { ProxyConnection } from '../connection';
import type { PerformResult } from './types';
import { abortable } from './utils';
import { performRequest } from '../http/request';

export function connect(proxy: Proxy, url: URL, signal?: AbortSignal): Promise<ProxyConnection> {
  return proxy.connect({
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
    tls: url.protocol === 'https:',
  }, signal);
}

export function perform(
  conn: ProxyConnection,
  request: Request,
  bodyBytes: Uint8Array | undefined,
  signal?: AbortSignal,
): Promise<PerformResult> {
  return abortable(performRequest(conn, request, null, bodyBytes), signal);
}

export function releaseConnection(proxy: Proxy, conn: ProxyConnection, result: PerformResult): void {
  result.reader.releaseLock();
  proxy.release(conn);
}
