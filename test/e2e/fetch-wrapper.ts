import { socksFetch as originalSocksFetch } from '../../src';

export function socksFetch(url: string | URL, options: Parameters<typeof originalSocksFetch>[1]): Promise<Response> {
	return originalSocksFetch(url, { ...options, debug: true });
}
