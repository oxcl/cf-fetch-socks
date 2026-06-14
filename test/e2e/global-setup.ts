import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = path.resolve(ROOT, 'test/e2e/wrangler.e2e.jsonc');
const DEV_VARS = path.resolve(ROOT, '.dev.vars');

const SECRET_KEYS = [
	'SOCKS5_PROXY_HOSTNAME',
	'SOCKS5_PROXY_PORT',
	'SOCKS5_PROXY_USERNAME',
	'SOCKS5_PROXY_PASSWORD',
];

let deployed = false;

export function setup(): void {
	const vars = fs.readFileSync(DEV_VARS, 'utf-8');
	const secrets: Record<string, string> = {};
	for (const line of vars.split('\n')) {
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		const value = line.slice(eq + 1).trim();
		if (SECRET_KEYS.includes(key)) {
			secrets[key] = value;
		}
	}

	// Deploy → secrets → deploy again, because secret bulk creates a blank
	// version that can override the deployed code.
	const output = execSync(
		`bun wrangler deploy --config "${CONFIG}"`,
		{
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'inherit'],
			timeout: 120_000,
		},
	);
	process.stdout.write(output);

	execSync(`bun wrangler secret bulk --name cf-fetch-socks-e2e`, {
		input: JSON.stringify(secrets),
		encoding: 'utf-8',
		stdio: ['pipe', 'inherit', 'inherit'],
		timeout: 30_000,
	});

	execSync(`bun wrangler deploy --config "${CONFIG}"`, {
		encoding: 'utf-8',
		stdio: ['pipe', 'inherit', 'inherit'],
		timeout: 120_000,
	});

	const match = output.match(/https:\/\/[^\s]+\.workers\.dev/);
	if (!match) {
		throw new Error(
			'Could not parse workers.dev URL from wrangler deploy output:\n' +
				output,
		);
	}
	process.env.E2E_WORKER_URL = match[0];
	deployed = true;
}

export function teardown(): void {
	if (!deployed) return;
	try {
		execSync(`bun wrangler delete --config "${CONFIG}"`, {
			encoding: 'utf-8',
			stdio: 'ignore',
			timeout: 30_000,
		});
	} catch {
		// worker may not exist, ignore
	}
}
