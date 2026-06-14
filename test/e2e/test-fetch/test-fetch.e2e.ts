import { describe, it, expect } from 'vitest';
import { getBaseUrl, parseBody } from '../helpers';

const BASE = getBaseUrl();

describe('basic GET /ip', () => {
  it('returns proxy exit IP via httpbin', async () => {
    const res = await fetch(`${BASE}/test-fetch/basic`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body).toHaveProperty('origin');
  });
});

describe('POST with body', () => {
  it('sends a POST request with a JSON body through the proxy', async () => {
    const res = await fetch(`${BASE}/test-fetch/post`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body.json.hello).toBe('world');
  });
});

describe('custom headers', () => {
  it('sends custom headers through the proxy', async () => {
    const res = await fetch(`${BASE}/test-fetch/custom-headers`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body.headers['X-Custom']).toBe('test-value');
    expect(body.headers['X-Another']).toBe('123');
  });
});

describe('proxy as URI string', () => {
  it('makes a proxied request using a socks5:// URI string', async () => {
    const res = await fetch(`${BASE}/test-fetch/proxy-uri`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body).toHaveProperty('origin');
  });
});

describe('redirect following', { timeout: 30_000 }, () => {
  it('follows HTTP redirects through the proxy', async () => {
    const res = await fetch(`${BASE}/test-fetch/redirect`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body).toHaveProperty('origin');
  });
});

describe('max redirects', { timeout: 60_000 }, () => {
  it('returns 499 after exceeding 20 redirects', async () => {
    const res = await fetch(`${BASE}/test-fetch/max-redirect`);
    expect(res.status).toBe(499);
    const text = await res.text();
    const lines = text.trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.data).toBe('Too many redirects');
  });
});

describe('gzip response', { timeout: 30_000 }, () => {
  it('returns decompressed gzip content', async () => {
    const res = await fetch(`${BASE}/test-fetch/gzip`);
    expect(res.status).toBe(200);
    const body = JSON.parse(await parseBody(res));
    expect(body.gzipped).toBe(true);
  });
});

describe('concurrent requests', { timeout: 30_000 }, () => {
  it('handles multiple concurrent proxied requests', async () => {
    const res = await fetch(`${BASE}/test-fetch/concurrent`);
    expect(res.status).toBe(200);
    const origins = await res.json() as string[];
    expect(origins).toHaveLength(3);
    for (const origin of origins) {
      expect(typeof origin).toBe('string');
    }
  });
});

describe('abort', () => {
  it('throws AbortError when signal is already aborted', async () => {
    const res = await fetch(`${BASE}/proxy/abort`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('AbortError');
  });
});

describe('unreachable target', { timeout: 30_000 }, () => {
  it('throws a TunnelError when connecting to an unreachable target', async () => {
    const res = await fetch(`${BASE}/proxy/unreachable`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('ConnectionTimeoutError');
  });
});

describe('SOCKS5 username/password auth', () => {
  it('should connect through an authenticated SOCKS5 proxy with valid credentials', async () => {
    const res = await fetch(`${BASE}/proxy/auth-valid`);
    expect(res.status).toBe(200);
  });

  it('should throw on SOCKS5 auth failure (wrong credentials)', async () => {
    const res = await fetch(`${BASE}/proxy/auth-fail`);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain('Socks5AuthError');
  });
});
