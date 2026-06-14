import type { Proxy } from '../../src/proxy';
import { handler as basicHandler } from './test-fetch/basic.route';
import { handler as postHandler } from './test-fetch/post.route';
import { handler as customHeadersHandler } from './test-fetch/custom-headers.route';
import { handler as proxyUriHandler } from './test-fetch/proxy-uri.route';
import { handler as redirectHandler } from './test-fetch/redirect.route';
import { handler as maxRedirectHandler } from './test-fetch/max-redirect.route';
import { handler as gzipHandler } from './test-fetch/gzip.route';
import { handler as concurrentHandler } from './test-fetch/concurrent.route';
import { handler as abortHandler } from './proxy/abort.route';
import { handler as unreachableHandler } from './proxy/unreachable.route';
import { handler as authValidHandler } from './proxy/auth-valid.route';
import { handler as authFailHandler } from './proxy/auth-fail.route';

interface Env {
  SOCKS5_PROXY_HOSTNAME: string;
  SOCKS5_PROXY_PORT: string;
  SOCKS5_PROXY_USERNAME: string;
  SOCKS5_PROXY_PASSWORD: string;
}

export function handleRequest(pathname: string, proxy: Proxy, env: Env): Promise<Response> | null {
  switch (pathname) {
    case '/health':
      return Promise.resolve(new Response('OK', { status: 200 }));
    case '/test-fetch/basic':
      return basicHandler(proxy, env);
    case '/test-fetch/post':
      return postHandler(proxy, env);
    case '/test-fetch/custom-headers':
      return customHeadersHandler(proxy, env);
    case '/test-fetch/proxy-uri':
      return proxyUriHandler(proxy, env);
    case '/test-fetch/redirect':
      return redirectHandler(proxy, env);
    case '/test-fetch/max-redirect':
      return maxRedirectHandler(proxy, env);
    case '/test-fetch/gzip':
      return gzipHandler(proxy, env);
    case '/test-fetch/concurrent':
      return concurrentHandler(proxy, env);
    case '/proxy/abort':
      return abortHandler(proxy, env);
    case '/proxy/unreachable':
      return unreachableHandler(proxy, env);
    case '/proxy/auth-valid':
      return authValidHandler(proxy, env);
    case '/proxy/auth-fail':
      return authFailHandler(proxy, env);
    default:
      return null;
  }
}
