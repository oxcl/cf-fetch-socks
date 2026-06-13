import {
	TunnelError,
	Socks5AuthError,
	Socks5ProtocolError,
	Socks5ServerError,
	ConnectionRefusedError,
	ConnectionTimeoutError,
	AbortError,
	TlsSessionError,
} from './errors';
import { Socks5Proxy } from './socks5-proxy';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logs: string[] = [];
		const log = (msg: string) => {
			console.log(`[SOCKS5] ${msg}`);
			logs.push(msg);
		};

		const startTime = Date.now();

		const proxy = new Socks5Proxy(
			{
				hostname: env.SOCKS5_PROXY_HOSTNAME,
				port: Number(env.SOCKS5_PROXY_PORT),
				username: env.SOCKS5_PROXY_USERNAME,
				password: env.SOCKS5_PROXY_PASSWORD,
				maxIdlePerTarget: 0,
			},
			log,
		);

		let conn;
		try {
			const targetHost = 'api.cerebras.ai';
			const targetPort = 443;

			log('Acquiring connection through SOCKS5 proxy...');

			conn = await proxy.acquire(
				{ host: targetHost, port: targetPort, tls: true },
				request.signal,
			);

			if (request.signal.aborted) {
				conn.close();
				return new Response(`Request aborted\n${logs.join('\n')}`, { status: 499 });
			}

			log('Connection acquired, sending HTTP request...');

			const requestBody = JSON.stringify({
				model: 'gpt-oss-120b',
				messages: [{ role: 'user', content: "Say 'hello' in 1 word" }],
				max_tokens: 5,
				stream: false,
			});
			const requestBodyEncoded = new TextEncoder().encode(requestBody);
			const httpRequest = [
				`POST /v1/chat/completions HTTP/1.1`,
				`Host: ${targetHost}`,
				`User-Agent: cf-fetch-socks/1.0`,
				`Accept: application/json`,
				`Content-Type: application/json`,
				`Authorization: Bearer ${env.CEREBRAS_API_KEY}`,
				`Content-Length: ${requestBodyEncoded.byteLength}`,
				`Connection: close`,
				``,
				``,
			].join('\r\n');

			await conn.write(new TextEncoder().encode(httpRequest));
			await conn.write(requestBodyEncoded);

			log('Waiting for response...');

			const reader = conn.readable.getReader();
			const appDataChunks: Uint8Array[] = [];

			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					appDataChunks.push(value);
				}
			} catch (e) {
				log(`Read error: ${e}`);
			}

			const elapsed = Date.now() - startTime;

			let allAppDataLen = 0;
			for (const chunk of appDataChunks) {
				allAppDataLen += chunk.length;
			}
			const allAppData = new Uint8Array(allAppDataLen);
			let offset = 0;
			for (const chunk of appDataChunks) {
				allAppData.set(chunk, offset);
				offset += chunk.length;
			}

			log(`Total time: ${elapsed}ms, appData: ${allAppData.length} bytes`);

			const response = new TextDecoder().decode(allAppData);
			return new Response(`Logs:\n${logs.join('\n')}\n\nTime: ${elapsed}ms\n\nApp data:\n${response}`, {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			if (conn) {
				conn.close();
			}

			if (error instanceof AbortError) {
				return new Response(`Aborted:\n${error.stack}\n\nLogs:\n${logs.join('\n')}`, { status: 499 });
			}

			if (error instanceof Socks5AuthError) {
				return new Response(`Proxy Auth Required:\n${error.stack}\n\nLogs:\n${logs.join('\n')}`, {
					status: 407,
					headers: { 'Content-Type': 'text/plain' },
				});
			}

			if (
				error instanceof TunnelError ||
				error instanceof Socks5ProtocolError ||
				error instanceof Socks5ServerError ||
				error instanceof ConnectionRefusedError ||
				error instanceof ConnectionTimeoutError ||
				error instanceof TlsSessionError
			) {
				const status = error instanceof ConnectionTimeoutError ? 504 : 502;
				return new Response(`${error.name}: ${error.message}\n${error.stack}\n\nLogs:\n${logs.join('\n')}`, {
					status,
					headers: { 'Content-Type': 'text/plain' },
				});
			}

			return new Response(`Exception:\n${error instanceof Error ? error.stack : error}\n\nLogs:\n${logs.join('\n')}`, {
				status: 500,
				headers: { 'Content-Type': 'text/plain' },
			});
		} finally {
			proxy.close();
		}
	},
} satisfies ExportedHandler<Env>;
