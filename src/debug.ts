import type { LogFn } from './socket';

export interface DebugEntry {
	label: string;
	duration: number;
}

export interface DebugContext {
	log(msg: string): void;
	time(label: string): void;
	timeEnd(label: string): void;
	dump(bytes: Uint8Array, label: string): void;
	getLogFn(): LogFn;
	getEntries(): DebugEntry[];
}

export function createDebugger(enabled?: boolean): DebugContext | undefined {
	if (!enabled) return undefined;

	const id = crypto.randomUUID().slice(0, 8);
	const prefix = `[DEBUG:${id}]`;
	const timers = new Map<string, number>();
	const entries: DebugEntry[] = [];

	return {
		log(msg: string) {
			console.log(`${prefix} ${msg}`);
		},

		time(label: string) {
			timers.set(label, performance.now());
		},

		timeEnd(label: string) {
			const start = timers.get(label);
			if (start === undefined) return;
			const dur = performance.now() - start;
			entries.push({ label, duration: dur });
			console.log(`${prefix} [${dur.toFixed(1)}ms] ${label}`);
			timers.delete(label);
		},

		dump(bytes: Uint8Array, label: string) {
			if (bytes.length === 0) return;
			const view = bytes.length > 64 ? bytes.subarray(0, 64) : bytes;
			const hex = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join(' ');
			const suffix = bytes.length > 64 ? ` ... (${bytes.length} bytes)` : ` (${bytes.length} bytes)`;
			console.log(`${prefix} ${label}: ${hex}${suffix}`);
		},

		getLogFn(): LogFn {
			return (msg: string) => this.log(msg);
		},

		getEntries(): DebugEntry[] {
			return entries;
		},
	};
}
