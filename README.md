# cf-fetch-socks

SOCKS5 proxy fetch for Cloudflare Workers.

## Tests

```bash
npm run test:unit # Unit Tests

```

### Integration Tests

Integration tests run inside the Cloudflare Workers runtime (via `@cloudflare/vitest-pool-workers`) and exercise real SOCKS5 proxy connections against [httpbin.org](https://httpbin.org).

**Setup:** Create a `.dev.vars` file at the project root with your SOCKS5 proxy credentials:

```bash
cat > .dev.vars << 'EOF'
SOCKS5_PROXY_HOSTNAME=your-hostname
SOCKS5_PROXY_PORT=1080
SOCKS5_PROXY_USERNAME=your-username
SOCKS5_PROXY_PASSWORD=your-password
EOF
```

**Run:**

```bash
npm run test:integration
```

### E2E Tests

E2E tests deploy a real preview worker to `workers.dev` (using `wrangler unstable_dev` in remote mode) and hit its HTTP endpoints to verify end-to-end behavior through the proxy.

**Setup:** Secrets must be set in your Cloudflare account before the worker can be deployed:

```bash
npx wrangler secret put SOCKS5_PROXY_HOSTNAME
npx wrangler secret put SOCKS5_PROXY_PORT
npx wrangler secret put SOCKS5_PROXY_USERNAME
npx wrangler secret put SOCKS5_PROXY_PASSWORD
```

**Run:**

```bash
npm run test:e2e
```
