import { describe, it, expect } from 'vitest';
import { getBaseUrl } from '../helpers';

describe('deployed /test-fetch', () => {
	const url = `${getBaseUrl()}/test-fetch`;

	it('returns proxy exit IP via httpbin', async () => {
		const res = await fetch(url);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { origin: string };
		expect(body.origin).toBeDefined();
		expect(typeof body.origin).toBe('string');
		expect(res.headers.get('content-type')).toContain('application/json');
	});
});
