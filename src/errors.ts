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

export class Socks5ProtocolError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'SOCKS5_PROTOCOL_ERROR', cause);
		this.name = 'Socks5ProtocolError';
	}
}

export class Socks5AuthError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'SOCKS5_AUTH_ERROR', cause);
		this.name = 'Socks5AuthError';
	}
}

export class Socks5ServerError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'SOCKS5_SERVER_ERROR', cause);
		this.name = 'Socks5ServerError';
	}
}

export class ConnectionRefusedError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'CONNECTION_REFUSED', cause);
		this.name = 'ConnectionRefusedError';
	}
}

export class ConnectionTimeoutError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'CONNECTION_TIMEOUT', cause);
		this.name = 'ConnectionTimeoutError';
	}
}

export class TlsUpgradeError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'TLS_UPGRADE_ERROR', cause);
		this.name = 'TlsUpgradeError';
	}
}

export class AbortError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'ABORT', cause);
		this.name = 'AbortError';
	}
}

export class TlsSessionError extends TunnelError {
	constructor(message: string, cause?: unknown) {
		super(message, 'TLS_SESSION_ERROR', cause);
		this.name = 'TlsSessionError';
	}
}

export class ProxyError extends Error {
	constructor(message: string, public readonly status: number) {
		super(message);
		this.name = 'ProxyError';
	}
}

export class ProxyAuthError extends ProxyError {
	constructor(message = 'Proxy authentication required') {
		super(message, 407);
		this.name = 'ProxyAuthError';
	}
}

export class ProxyForbiddenError extends ProxyError {
	constructor(message = 'Forbidden by proxy') {
		super(message, 403);
		this.name = 'ProxyForbiddenError';
	}
}

export class BadGatewayError extends ProxyError {
	constructor(message = 'Bad gateway') {
		super(message, 502);
		this.name = 'BadGatewayError';
	}
}

export class GatewayTimeoutError extends ProxyError {
	constructor(message = 'Gateway timeout') {
		super(message, 504);
		this.name = 'GatewayTimeoutError';
	}
}

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

	const lowerBody = bodyText.toLowerCase();
	if (lowerBody.includes('proxy') && (lowerBody.includes('denied') || lowerBody.includes('blocked') || lowerBody.includes('refused'))) {
		throw new ProxyError(`Proxy error: ${bodyText.slice(0, 200)}`, status);
	}
	if (lowerBody.includes('connection refused')) {
		throw new ProxyError('Connection refused by target', status);
	}
}