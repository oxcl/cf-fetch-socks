import type { Proxy } from '../../../src';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  await proxy.connect({ host: '1.2.3.4', port: 1, tls: false });
  return new Response('OK');
}
