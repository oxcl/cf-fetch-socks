export function parseProxyUri(proxy: string) {
	const url = new URL(proxy);
	return {
		hostname: url.hostname,
		port: Number(url.port),
		username: url.username || undefined,
		password: url.password || undefined,
	};
}
