import { socksFetch as originalSocksFetch } from '../../src';

export async function socksFetch(url: string | URL, options: Parameters<typeof originalSocksFetch>[1]): Promise<Response> {
	return originalSocksFetch(url, {
		...options,
		debug: true,
		logFn: console.log,
	});
}
