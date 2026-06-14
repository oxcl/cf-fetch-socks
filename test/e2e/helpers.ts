export function getBaseUrl(): string {
	const url = process.env.E2E_WORKER_URL;
	if (!url) throw new Error('E2E_WORKER_URL not set — did global-setup run?');
	return url;
}
