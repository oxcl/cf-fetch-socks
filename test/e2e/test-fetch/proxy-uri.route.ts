import type { Proxy } from '../../../src';
import { socksFetch } from '../fetch-wrapper';

interface Env {
  SOCKS5_PROXY_HOSTNAME: string;
  SOCKS5_PROXY_PORT: string;
  SOCKS5_PROXY_USERNAME: string;
  SOCKS5_PROXY_PASSWORD: string;
}

export async function handler(proxy: Proxy, env: Env): Promise<Response> {
  const user = encodeURIComponent(env.SOCKS5_PROXY_USERNAME);
  const pass = encodeURIComponent(env.SOCKS5_PROXY_PASSWORD);
  const uri = `socks5://${user}:${pass}@${env.SOCKS5_PROXY_HOSTNAME}:${env.SOCKS5_PROXY_PORT}`;
  return socksFetch('https://httpbin.org/ip', { proxy: uri });
}
