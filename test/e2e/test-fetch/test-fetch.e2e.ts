import { describe, it, expect } from 'vitest';
import { getBaseUrl } from '../helpers';

describe('deployed /test-fetch', () => {
	const url = `${getBaseUrl()}/test-fetch`;

	it('returns proxy exit IP via httpbin', async () => {
		const res = await fetch(url);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('application/x-ndjson');

		const text = await res.text();
		const lines = text.trim().split('\n');

		expect(lines.length).toBeGreaterThanOrEqual(3);

	const last = JSON.parse(lines[lines.length - 1]);
	expect(last.type).toBe('body');
	expect(last.data).toBeDefined();

		const entriesLine = lines[lines.length - 2];
		const entriesObj = JSON.parse(entriesLine);
		expect(entriesObj.type).toBe('entries');
		expect(entriesObj.entries.length).toBeGreaterThan(0);

		const debugLines = lines.slice(0, -2);
		expect(debugLines.length).toBeGreaterThan(0);
		for (const line of debugLines) {
			const obj = JSON.parse(line);
			expect(obj.type).toBe('debug');
			expect(typeof obj.line).toBe('string');
		}
	});
});
