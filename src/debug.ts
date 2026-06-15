import type { LogFn } from './socket';

export interface DebugOptions {
	enable: boolean;
	logFn?: (msg: string) => void;
	onLine?: (line: string) => void;
	onDebugEnd?: (entries: Array<{ label: string; duration: number }>) => void;
}

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
	end(): void;
}

export function createDebugger(
	debugOpt?: boolean | DebugOptions,
): DebugContext | undefined {
	const enable = debugOpt === true || (typeof debugOpt === 'object' && debugOpt.enable);
	const logFn = typeof debugOpt === 'object' ? debugOpt.logFn : undefined;
	const onLine = typeof debugOpt === 'object' ? debugOpt.onLine : undefined;
	const onDebugEnd = typeof debugOpt === 'object' ? debugOpt.onDebugEnd : undefined;

	if (!enable) return undefined;

	const id = crypto.randomUUID().slice(0, 8);
	const prefix = `[DEBUG:${id}]`;
	const timers = new Map<string, number>();
	const entries: DebugEntry[] = [];
	const out = (msg: string) => {
		const line = `${prefix} ${msg}`;
		logFn?.(line);
		onLine?.(line);
	};

	return {
		log(msg: string) {
			out(msg);
		},

		time(label: string) {
			timers.set(label, performance.now());
		},

		timeEnd(label: string) {
			const start = timers.get(label);
			if (start === undefined) return;
			const dur = performance.now() - start;
			entries.push({ label, duration: dur });
			out(`[${dur.toFixed(1)}ms] ${label}`);
			timers.delete(label);
		},

		dump(bytes: Uint8Array, label: string) {
			if (bytes.length === 0) return;
			const view = bytes.length > 64 ? bytes.subarray(0, 64) : bytes;
			const hex = Array.from(view).map(b => b.toString(16).padStart(2, '0')).join(' ');
			const suffix = bytes.length > 64 ? ` ... (${bytes.length} bytes)` : ` (${bytes.length} bytes)`;
			out(`${label}: ${hex}${suffix}`);
		},

		getLogFn(): LogFn {
			return (msg: string) => this.log(msg);
		},

		getEntries(): DebugEntry[] {
			return entries;
		},

		end() {
			onDebugEnd?.(entries);
		},
	};
}

let _debug: DebugContext | undefined;

export const debug: DebugContext = {
	log(msg: string) { _debug?.log(msg); },
	time(label: string) { _debug?.time(label); },
	timeEnd(label: string) { _debug?.timeEnd(label); },
	dump(bytes: Uint8Array, label: string) { _debug?.dump(bytes, label); },
	getLogFn(): LogFn { return _debug?.getLogFn() ?? (() => {}); },
	getEntries(): DebugEntry[] { return _debug?.getEntries() ?? []; },
	end() { _debug?.end(); },
};

export function setDebugContext(opt?: boolean | DebugOptions): void {
	_debug = createDebugger(opt);
}

export function clearDebugContext(): void {
	_debug = undefined;
}

export function printWaterfall(): void {
	const entries = debug.getEntries();
	if (entries.length === 0) return;
	debug.end();
	debug.log('── waterfall ──');
	const maxLabel = Math.max(...entries.map((e) => e.label.length), 5);
	for (const e of entries) {
		debug.log(` ${e.label.padEnd(maxLabel)} ${e.duration.toFixed(1)}ms`);
	}
}
