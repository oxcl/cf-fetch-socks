export type AddressType = 1 | 2 | 3;

export function getAddressType(host: string): AddressType {
	if (host.includes(':')) return 3;
	const parts = host.split('.');
	if (parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p))) return 1;
	return 2;
}

export function encodeAddress(host: string, type: AddressType): Uint8Array {
	switch (type) {
		case 1:
			return new Uint8Array([1, ...host.split('.').map(Number)]);
		case 2:
			return new Uint8Array([3, host.length, ...new TextEncoder().encode(host)]);
		case 3:
			return encodeIPv6(host);
	}
}

function encodeIPv6(address: string): Uint8Array {
	const parts = address.split(':');
	let expanded: string[];

	const emptyIndex = parts.indexOf('');
	if (emptyIndex !== -1 && parts.length > 1) {
		const before = parts.slice(0, emptyIndex);
		const after = parts.slice(emptyIndex + 1);
		const missing = 8 - (before.length + after.length);
		expanded = [...before, ...Array(missing).fill('0000'), ...after];
	} else {
		expanded = parts;
	}

	const bytes: number[] = [];
	for (const part of expanded) {
		const padded = part.padStart(4, '0');
		bytes.push(parseInt(padded.slice(0, 2), 16), parseInt(padded.slice(2), 16));
	}

	return new Uint8Array([4, ...bytes]);
}
