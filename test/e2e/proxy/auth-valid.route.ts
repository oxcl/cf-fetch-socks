import type { Proxy } from '../../../src';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  const conn = await proxy.acquire({ host: 'httpbin.org', port: 443, tls: true });
  conn.close();
  return new Response('OK');
}
