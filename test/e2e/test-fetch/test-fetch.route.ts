import { Proxy } from '../../../src';
import { socksFetch } from '../fetch-wrapper';

const HTTPBIN_BASE = 'https://httpbin.org';

export const path = '/test-fetch';

export async function handler(proxy: Proxy): Promise<Response> {
	return socksFetch(`${HTTPBIN_BASE}/ip`, { proxy });
}
