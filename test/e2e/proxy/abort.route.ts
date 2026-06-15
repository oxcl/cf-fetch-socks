import type { Proxy } from '../../../src';

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature
export async function handler(proxy: Proxy, _env?: unknown): Promise<Response> {
  const controller = new AbortController();
  controller.abort();
  await proxy.connect(
    { host: 'httpbin.org', port: 443, tls: true },
    controller.signal,
  );
  return new Response('OK');
}
