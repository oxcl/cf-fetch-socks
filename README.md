# cf-fetch-socks

**SOCKS5 proxy fetch for Cloudflare Workers.** Make HTTP/HTTPS requests from Workers through a SOCKS5 proxy — with TLS, connection pooling, redirect following, auth support, and content decompression baked in.

## Install

```bash
bun add cf-fetch-socks
```

```bash
npm install cf-fetch-socks
```

## Quick start

```typescript
import { socksFetch, Proxy, socks5Tunnel } from 'cf-fetch-socks';

const proxy = new Proxy(socks5Tunnel, {
  hostname: 'my-proxy.example.com',
  port: 1080,
  username: 'user',
  password: 'pass',
});

const response = await socksFetch('https://api.example.com/data', { proxy });
const data = await response.json();
```

You can also pass a SOCKS5 URI string directly — a non-pooled `Proxy` is created for you automatically:

```typescript
const response = await socksFetch('https://api.example.com/data', {
  proxy: 'socks5://user:pass@my-proxy.example.com:1080',
});
```

## Features

- Full SOCKS5 protocol (RFC 1928) with username/password auth (RFC 1929)
- **TLS 1.3** over the tunnel via `@reclaimprotocol/tls` — no dependency on workerd's `node:tls`
- **Connection pooling** — reuse TCP/TLS connections to the same target host
- **TLS session resumption** — PSK caching for faster reconnects
- **Automatic redirect following** (up to 20, configurable) with correct method preservation (301/302/303 → POST→GET, 307/308 → preserve method + body)
- **Content decompression** — gzip, brotli, deflate (via `node:zlib`)
- **Chunked transfer-encoding** decoded automatically
- **AbortController / AbortSignal** support
- **Debug / timing waterfall** — instrument every phase of the request

## How it works

```
socksFetch(url, { proxy })
  → Proxy.connect(target)                  # Open or reuse a connection
    → SOCKS5 tunnel to proxy               # TCP connect → greeting → auth → connect
    → TLS 1.3 wrap (if HTTPS)              # Pure-JS TLS over the tunnel
  → executeRedirectLoop(proxy, request)    # Follow redirects (up to 20)
    → HTTP/1.1 request over the tunnel
    → Parse response headers
    → If redirect: drain, rebuild, loop
    → If final: decompress, decode, return Response
```

## API

### `socksFetch(url, options)`

```typescript
function socksFetch(
  url: string | URL | Request,
  options: ProxyFetchOptions
): Promise<Response>
```

The main entry point. Makes an HTTP/HTTPS request through a SOCKS5 proxy and returns a standard `Response`.

#### `ProxyFetchOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxy` | `string \| Proxy` | **required** | SOCKS5 URI or `Proxy` instance |
| `debug` | `boolean \| DebugOptions` | `false` | Enable debug logging / timing |
| ... | `RequestInit` | — | All standard `fetch` options: `method`, `headers`, `body`, `signal`, `redirect`, etc. |

Passing `proxy` as a string (`socks5://user:pass@host:1080`) creates a non-pooled cached `Proxy` via `Proxy.obtainProxy()`. Pass a `Proxy` instance directly for full control over pooling, timeouts, and TLS session caching.

### `Proxy`

```typescript
class Proxy {
  constructor(
    tunnelFn: TunnelFn,
    opts: ProxyOptions,
    pooled?: boolean      // default: true
  )

  // Static factories
  static obtainProxy(uri: string): Proxy   // Non-pooled, cached
  static acquireProxy(uri: string): Proxy  // Pooled, cached
  static clearCache(): void

  // Properties
  readonly uri: URL
  readonly isPooled: boolean
  readonly idleCount: number

  // Methods
  connect(target: ProxyTarget, signal?: AbortSignal): Promise<ProxyConnection>
  release(conn: ProxyConnection): void
  close(): void
}
```

The `Proxy` class manages the connection to your SOCKS5 server. When `pooled` is `true`, TCP/TLS connections to the same target host are reused across requests.

#### `ProxyOptions`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostname` | `string` | ✓ | SOCKS5 proxy hostname |
| `port` | `number` | ✓ | SOCKS5 proxy port (typically `1080`) |
| `username` | `string` | — | Proxy auth username |
| `password` | `string` | — | Proxy auth password |
| `timeout` | `number` | — | Connection timeout in ms (default: `10000`) |

### Advanced usage

#### Pooled proxy

```typescript
const proxy = Proxy.acquireProxy('socks5://user:pass@my-proxy.example.com:1080');

const r1 = await socksFetch('https://api.example.com/a', { proxy });
// Connection is returned to the pool
const r2 = await socksFetch('https://api.example.com/b', { proxy });
// Reuses the same TCP/TLS connection
```

#### Manual connection management

```typescript
import { socks5Tunnel, Proxy } from 'cf-fetch-socks';

const proxy = new Proxy(socks5Tunnel, {
  hostname: 'my-proxy.example.com',
  port: 1080,
  username: 'user',
  password: 'pass',
  timeout: 5000,
});

const conn = await proxy.connect({ host: 'api.example.com', port: 443, tls: true });
try {
  conn.write(/* raw HTTP request bytes */);
  // ... read from conn.readable
} finally {
  proxy.release(conn);
}
```

#### Debug / timing

```typescript
const response = await socksFetch('https://api.example.com/data', {
  proxy: 'socks5://user:pass@my-proxy.example.com:1080',
  debug: true,                                // simple: logs to console
});

// Or with custom callbacks:
const response = await socksFetch('https://api.example.com/data', {
  proxy: 'socks5://user:pass@my-proxy.example.com:1080',
  debug: {
    enable: true,
    logFn: (msg) => console.log(msg),
    onLine: (line) => myLogger.debug(line),
    onDebugEnd: (entries) => {
      for (const { label, duration } of entries) {
        console.log(`${label}: ${duration.toFixed(1)}ms`);
      }
    },
  },
});
```

#### Error handling

```typescript
import {
  Socks5AuthError, ConnectionRefusedError, ConnectionTimeoutError,
  TlsUpgradeError, AbortError, ProxyAuthError, BadGatewayError,
} from 'cf-fetch-socks';

try {
  const response = await socksFetch('https://api.example.com/data', { proxy });
} catch (err) {
  if (err instanceof Socks5AuthError) {
    // Wrong proxy credentials
  } else if (err instanceof ConnectionRefusedError) {
    // Proxy or target refused the connection
  } else if (err instanceof TlsUpgradeError) {
    // TLS handshake failed over the tunnel
  } else if (err instanceof ProxyAuthError) {
    // Proxy returned 407
  } else if (err instanceof BadGatewayError) {
    // Proxy returned 502
  }
}
```

### Types

| Export | Kind | Description |
|--------|------|-------------|
| `socksFetch` | function | Make a proxied HTTP request |
| `Proxy` | class | SOCKS5 proxy client (pooled or non-pooled) |
| `socks5Tunnel` | function | Low-level SOCKS5 tunnel builder |
| `debug` | object | Debug context manager |

#### Type exports

| Type | Description |
|------|-------------|
| `ProxyFetchOptions` | Options for `socksFetch()` |
| `ProxyOptions` | Proxy credentials config |
| `ProxyCredentials` | Proxy host / port / auth / timeout |
| `ProxyTarget` | Target host / port / TLS flag |
| `ProxyConnection` | An open proxied connection |
| `TunnelFn` | Tunnel function signature |
| `ConnectFn` | Socket connection function signature |
| `DebugOptions` | Debug / timing configuration |
| `LogFn` | Log function type `(msg: string) => void` |

### Error classes

| Error | Code | When |
|-------|------|------|
| `Socks5ProtocolError` | `SOCKS5_PROTOCOL_ERROR` | SOCKS5 protocol violation |
| `Socks5AuthError` | `SOCKS5_AUTH_ERROR` | Authentication with proxy failed |
| `Socks5ServerError` | `SOCKS5_SERVER_ERROR` | SOCKS5 server returned an error |
| `ConnectionRefusedError` | `CONNECTION_REFUSED` | Proxy or target refused connection |
| `ConnectionTimeoutError` | `CONNECTION_TIMEOUT` | Connection timed out |
| `TlsUpgradeError` | `TLS_UPGRADE_ERROR` | TLS upgrade over tunnel failed |
| `TlsSessionError` | `TLS_SESSION_ERROR` | TLS session error |
| `AbortError` | `ABORT` | Request was aborted via signal |
| `ProxyAuthError` | 407 | Proxy returned 407 |
| `ProxyForbiddenError` | 403 | Proxy returned 403 |
| `BadGatewayError` | 502 | Proxy returned 502 |
| `GatewayTimeoutError` | 504 | Proxy returned 504 |

All tunnel errors extend `TunnelError` (has `.code`). Proxy HTTP errors extend `ProxyError` (has `.status`).

## Development

```bash
git clone <repo>
bun install
bun run build           # Build dist/
bun run test:unit       # Unit tests
bun run test:integration  # Integration tests (needs proxy creds in .dev.vars)
bun run test:e2e        # E2E tests (deploys preview worker)
```

### Integration test setup

```bash
cat > .dev.vars << 'EOF'
SOCKS5_PROXY_HOSTNAME=your-proxy-host
SOCKS5_PROXY_PORT=1080
SOCKS5_PROXY_USERNAME=your-user
SOCKS5_PROXY_PASSWORD=your-pass
EOF
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SOCKS5_PROXY_HOSTNAME` | Proxy hostname for integration tests |
| `SOCKS5_PROXY_PORT` | Proxy port for integration tests |
| `SOCKS5_PROXY_USERNAME` | Proxy auth username |
| `SOCKS5_PROXY_PASSWORD` | Proxy auth password |

## License

MIT
