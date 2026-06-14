export function parseProxyUri(proxy: string) {
	const url = new URL(proxy);
	return {
		hostname: url.hostname,
		port: Number(url.port),
		username: url.username || undefined,
		password: url.password || undefined,
	};
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
	let total = 0;
	for (const c of chunks) total += c.length;
	const result = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		result.set(c, offset);
		offset += c.length;
	}
	return result;
}
