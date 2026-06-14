import { env } from 'cloudflare:test';
import { Proxy } from '../../src/proxy';
import { socks5Tunnel } from '../../src/socks5';

let proxyInstance: Proxy | null = null;

function getEnvVar(key: keyof Env): string {
	const value = env[key];
	if (!value) {
		throw new Error(
			`Missing required environment variable: ${key}\n` +
			'Set this in wrangler.jsonc vars or .dev.vars before running e2e tests.'
		);
	}
	return value;
}

export function getProxy(): Proxy {
	if (proxyInstance) return proxyInstance;

	proxyInstance = new Proxy(socks5Tunnel, {
		hostname: getEnvVar('SOCKS5_PROXY_HOSTNAME'),
		port: Number(getEnvVar('SOCKS5_PROXY_PORT')),
		username: getEnvVar('SOCKS5_PROXY_USERNAME'),
		password: getEnvVar('SOCKS5_PROXY_PASSWORD'),
	});

	return proxyInstance;
}

export function closeProxy(): void {
	if (proxyInstance) {
		proxyInstance.close();
		proxyInstance = null;
	}
}

export const HTTPBIN_BASE = 'https://httpbin.org';
