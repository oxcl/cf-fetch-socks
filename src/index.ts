import { fetch as proxyFetch } from './fetch';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const proxyUri = `socks5://${env.SOCKS5_PROXY_USERNAME}:${env.SOCKS5_PROXY_PASSWORD}@${env.SOCKS5_PROXY_HOSTNAME}:${env.SOCKS5_PROXY_PORT}`;

		try {
			if (url.pathname === '/test-fetch') {
				const res = await proxyFetch('https://httpbin.io/ip', { proxy: proxyUri });
				const body = await res.text();
				return new Response(body, {
					status: res.status,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			const isStream = url.pathname === '/stream';
			const res = await proxyFetch('https://api.cerebras.ai/v1/chat/completions', {
				proxy: proxyUri,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
				},
				body: JSON.stringify({
					model: 'gpt-oss-120b',
					messages: [{ role: 'user', content: "Say 'hello' in 1 word" }],
					max_tokens: 5,
					stream: isStream,
				}),
			});

			if (isStream) {
				return new Response(res.body, {
					status: res.status,
					headers: { 'Content-Type': 'text/event-stream' },
				});
			}

			const body = await res.text();
			return new Response(body, {
				status: res.status,
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			return new Response(`Error: ${error instanceof Error ? error.message : error}`, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;
