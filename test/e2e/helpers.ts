export const HTTPBIN_BASE = 'https://httpbin.org';

export function getBaseUrl(): string {
  const url = process.env.E2E_WORKER_URL;
  if (!url) throw new Error('E2E_WORKER_URL not set — did global-setup run?');
  return url;
}

export async function parseBody(res: Response): Promise<any> {
  const text = await res.text();
  const lines = text.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]).data;
}
