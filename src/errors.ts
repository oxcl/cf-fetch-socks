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