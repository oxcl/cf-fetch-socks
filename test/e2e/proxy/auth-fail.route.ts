import { Proxy } from '../../../src/proxy';
import { socks5Tunnel } from '../../../src/socks5/index';

interface Env {
  SOCKS5_PROXY_HOSTNAME: string;
  SOCKS5_PROXY_PORT: string;
}

// biome-ignore lint/correctness/noUnusedVariables: consistent handler signature (uses env)
export async function handler(proxy: Proxy, env: Env): Promise<Response> {
  const badProxy = new Proxy(socks5Tunnel, {
    hostname: env.SOCKS5_PROXY_HOSTNAME,
    port: Number(env.SOCKS5_PROXY_PORT),
    username: 'wronguser',
    password: 'wrongpass',
  });
  await badProxy.acquire({ host: 'httpbin.org', port: 80, tls: false });
  return new Response('OK');
}
