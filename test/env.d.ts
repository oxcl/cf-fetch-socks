declare module 'cloudflare:test' {
	interface ProvidedEnv {
		SOCKS5_PROXY_HOSTNAME: string;
		SOCKS5_PROXY_PORT: string;
		SOCKS5_PROXY_USERNAME: string;
		SOCKS5_PROXY_PASSWORD: string;
	}
}
