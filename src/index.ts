import { connect } from 'cloudflare:sockets';
import { socks5Connect, type ConnectFn } from './edtunnel';
import type { Socket } from '@cloudflare/workers-types';
import { makeTLSClient, setCryptoImplementation } from '@reclaimprotocol/tls';
import { webcryptoCrypto } from '@reclaimprotocol/tls/webcrypto';

setCryptoImplementation(webcryptoCrypto);

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const logs: string[] = [];
		const log = (msg: string) => {
			console.log(`[SOCKS5] ${msg}`);
			logs.push(msg);
		};

		const startTime = Date.now();

		try {
			const targetHost = 'api.cerebras.ai';
			const targetPort = 443;

			log(`Connecting to SOCKS5 proxy...`);

			const socketConnect: ConnectFn = (opts, options) =>
				connect({ hostname: opts.hostname, port: opts.port }, { secureTransport: options?.secureTransport, allowHalfOpen: false }) as Socket;

			const socket = await socks5Connect(
				2,
				targetHost,
				targetPort,
				log,
				{
					hostname: env.SOCKS5_PROXY_HOSTNAME,
					port: Number(env.SOCKS5_PROXY_PORT),
					username: env.SOCKS5_PROXY_USERNAME,
					password: env.SOCKS5_PROXY_PASSWORD,
				},
				socketConnect,
			);

			if (!socket) {
				return new Response(`SOCKS5 connection failed:\n${logs.join('\n')}`, { status: 500 });
			}

			log('SOCKS5 tunnel established, starting TLS...');

			const writer = socket.writable.getWriter();
			const reader = socket.readable.getReader();

			const appDataChunks: Uint8Array[] = [];
			let handshakeResolve: () => void;
			const handshakePromise = new Promise<void>((r) => (handshakeResolve = r));
			let responseResolve: () => void;
			const responsePromise = new Promise<void>((r) => (responseResolve = r));

			const tls = makeTLSClient({
				host: targetHost,
				verifyServerCertificate: false,
				cipherSuites: ['TLS_AES_256_GCM_SHA384'],
				async write({ header, content }) {
					const data = new Uint8Array(header.length + content.length);
					data.set(header, 0);
					data.set(content, header.length);
					await writer.write(data);
				},
				onHandshake() {
					log('TLS handshake completed!');
					handshakeResolve();
				},
				onApplicationData(plaintext) {
					log(`App data: ${plaintext.length} bytes`);
					appDataChunks.push(plaintext);
				},
				onTlsEnd(error) {
					log(`TLS ended: ${error || 'ok'}`);
					responseResolve();
				},
			});

			async function pumpRead() {
				try {
					while (true) {
						const { value, done } = await reader.read();
						if (done) break;
						tls.handleReceivedBytes(value);
					}
				} catch (e) {
					log(`Read pump error: ${e}`);
				}
			}

			const readPromise = pumpRead();

			log('Starting TLS handshake...');
			tls.startHandshake();

			await handshakePromise;

			log('Sending HTTP request...');
			const requestBody = JSON.stringify({
				model: 'gpt-oss-120b',
				messages: [{ role: 'user', content: "Say 'hello' in 1 word" }],
				max_tokens: 5,
				stream: false,
			});
			const httpRequest = [
				`POST /v1/chat/completions HTTP/1.1`,
				`Host: ${targetHost}`,
				`User-Agent: cf-fetch-socks/1.0`,
				`Accept: application/json`,
				`Content-Type: application/json`,
				`Authorization: Bearer ${env.CEREBRAS_API_KEY}`,
				`Content-Length: ${requestBody.length}`,
				`Connection: close`,
				``,
				``,
			].join('\r\n');

			await tls.write(new TextEncoder().encode(httpRequest));
			await tls.write(new TextEncoder().encode(requestBody));

			log('Waiting for AI response...');
			await responsePromise;

			const elapsed = Date.now() - startTime;

			socket.close();
			await readPromise;

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
			return new Response(`Exception:\n${error}\n\nLogs:\n${logs.join('\n')}`, { status: 500 });
		}
	},
} satisfies ExportedHandler<Env>;