import { describe, it, expect } from 'vitest';
import { makeProxy, socksFetch, HTTPBIN } from './helpers';

describe('request body: string', { timeout: 10_000 }, () => {
	it.skip('sends plain string body with correct Content-Type and length', async () => {
		const proxy = makeProxy();
		const body = 'hello world';
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string>; data: string };
		expect(json.headers['Content-Type']).toBe('text/plain;charset=UTF-8');
		expect(json.data).toBe(body);
		expect(Number(json.headers['Content-Length'])).toBe(Buffer.byteLength(body, 'utf-8'));
	});
});

describe('request body: URLSearchParams', { timeout: 10_000 }, () => {
	it.skip('URLSearchParams body sends form-urlencoded', async () => {
		const proxy = makeProxy();
		const params = new URLSearchParams({ a: '1', b: 'two words' });
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body: params,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string>; form: Record<string, string> };
		expect(json.headers['Content-Type']).toMatch(/^application\/x-www-form-urlencoded/);
		expect(json.form).toEqual({ a: '1', b: 'two words' });
	});
});

describe('request body: FormData', { timeout: 15_000 }, () => {
	it.skip('FormData body sends multipart/form-data with boundary', async () => {
		const proxy = makeProxy();
		const formData = new FormData();
		formData.append('field1', 'text-value');
		const blob = new Blob(['file content'], { type: 'text/plain' });
		formData.append('file1', blob, 'test.txt');
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body: formData,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			headers: Record<string, string>;
			form: Record<string, string>;
			files: Record<string, string>;
		};
		expect(json.headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
		expect(json.form?.field1).toBe('text-value');
		expect(json.files?.file1).toBe('file content');
	});
});

describe('request body: Blob', { timeout: 10_000 }, () => {
	it.skip('Blob body sends correct Content-Type and bytes', async () => {
		const proxy = makeProxy();
		const blob = new Blob(['binary-ish data'], { type: 'application/octet-stream' });
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body: blob,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string>; data: string };
		expect(json.headers['Content-Type']).toBe('application/octet-stream');
		expect(json.data).toContain('binary-ish data');
	});
});

describe('request body: ReadableStream', { timeout: 15_000 }, () => {
	it.skip('ReadableStream body is streamed correctly', async () => {
		const proxy = makeProxy();
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('chunk1'));
				controller.enqueue(encoder.encode('chunk2'));
				controller.close();
			},
		});
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body: stream,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { data: string };
		expect(json.data).toBe('chunk1chunk2');
	});
});

describe('request body: null/undefined', { timeout: 10_000 }, () => {
	it.skip('GET with no body sends no Content-Type', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/get`, { proxy });
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['Content-Type']).toBeUndefined();
	});

	it.skip('POST with explicit null body sends no Content-Type', async () => {
		const proxy = makeProxy();
		const response = await socksFetch(`${HTTPBIN}/post`, {
			proxy,
			method: 'POST',
			body: null,
		});
		expect(response.status).toBe(200);
		const json = (await response.json()) as { headers: Record<string, string> };
		expect(json.headers['Content-Type']).toBeUndefined();
	});
});
