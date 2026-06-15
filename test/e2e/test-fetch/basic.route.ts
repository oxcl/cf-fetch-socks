import type { Proxy } from '../../../src';
import { socksFetch } from '../fetch-wrapper';
import { HTTPBIN_BASE } from '../helpers';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  return socksFetch(`${HTTPBIN_BASE}/ip`, { proxy });
}
