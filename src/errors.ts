export class TunnelError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		cause?: unknown,
	) {
		super(message, { cause });
		this.name = 'TunnelError';
	}
}

function tunnelError(name: string, code: string) {
	return class extends TunnelError {
		constructor(message: string, cause?: unknown) {
			super(message, code, cause);
			this.name = name;
		}
	};
}

export const Socks5ProtocolError = tunnelError('Socks5ProtocolError', 'SOCKS5_PROTOCOL_ERROR');
export const Socks5AuthError = tunnelError('Socks5AuthError', 'SOCKS5_AUTH_ERROR');
export const Socks5ServerError = tunnelError('Socks5ServerError', 'SOCKS5_SERVER_ERROR');
export const ConnectionRefusedError = tunnelError('ConnectionRefusedError', 'CONNECTION_REFUSED');
export const ConnectionTimeoutError = tunnelError('ConnectionTimeoutError', 'CONNECTION_TIMEOUT');
export const TlsUpgradeError = tunnelError('TlsUpgradeError', 'TLS_UPGRADE_ERROR');
export const AbortError = tunnelError('AbortError', 'ABORT');
export const TlsSessionError = tunnelError('TlsSessionError', 'TLS_SESSION_ERROR');

export class ProxyError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = 'ProxyError';
	}
}

function proxyError(name: string, status: number, defaultMsg: string) {
	return class extends ProxyError {
		constructor(message = defaultMsg) {
			super(message, status);
			this.name = name;
		}
	};
}

export const ProxyAuthError = proxyError('ProxyAuthError', 407, 'Proxy authentication required');
export const ProxyForbiddenError = proxyError('ProxyForbiddenError', 403, 'Forbidden by proxy');
export const BadGatewayError = proxyError('BadGatewayError', 502, 'Bad gateway');
export const GatewayTimeoutError = proxyError('GatewayTimeoutError', 504, 'Gateway timeout');

export function checkProxyError(status: number, bodyText: string): void {
	switch (status) {
		case 407:
			throw new ProxyAuthError();
		case 403:
			throw new ProxyForbiddenError();
		case 502:
			throw new BadGatewayError();
		case 504:
			throw new GatewayTimeoutError();
	}

	const lower = bodyText.toLowerCase();
	if (lower.includes('proxy') && (lower.includes('denied') || lower.includes('blocked') || lower.includes('refused'))) {
		throw new ProxyError(`Proxy error: ${bodyText.slice(0, 200)}`, status);
	}
	if (lower.includes('connection refused')) {
		throw new ProxyError('Connection refused by target', status);
	}
}
