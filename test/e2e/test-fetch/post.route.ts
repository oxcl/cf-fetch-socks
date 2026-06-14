import type { Proxy } from '../../../src';
import { socksFetch } from '../fetch-wrapper';

const HTTPBIN_BASE = 'https://httpbin.org';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  return socksFetch(`${HTTPBIN_BASE}/post`, {
    proxy,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' }),
  });
}
