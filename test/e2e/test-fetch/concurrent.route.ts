import type { Proxy } from '../../../src';
import { socksFetch } from '../../../src';
import { HTTPBIN_BASE } from '../helpers';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      socksFetch(`${HTTPBIN_BASE}/ip`, { proxy }),
    ),
  );
  const origins = await Promise.all(
    results.map(async (r) => {
      const body = await r.json() as { origin: string };
      return body.origin;
    }),
  );
  return Response.json(origins);
}
