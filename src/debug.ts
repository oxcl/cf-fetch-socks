export type LogFn = (msg: string) => void;

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

function createDebugger(debugOpt?: boolean | DebugOptions): DebugContext | undefined {
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
			const hex = Array.from(view)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join(' ');
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

class Debug {
	private _ctx: DebugContext | undefined;

	setContext(opt?: boolean | DebugOptions): void {
		this._ctx = createDebugger(opt);
	}

	log(msg: string) {
		this._ctx?.log(msg);
	}
	time(label: string) {
		this._ctx?.time(label);
	}
	timeEnd(label: string) {
		this._ctx?.timeEnd(label);
	}
	dump(bytes: Uint8Array, label: string) {
		this._ctx?.dump(bytes, label);
	}
	getLogFn(): LogFn {
		return this._ctx?.getLogFn() ?? (() => {});
	}
	getEntries(): DebugEntry[] {
		return this._ctx?.getEntries() ?? [];
	}
	end() {
		this._ctx?.end();
	}

	printWaterfall(): void {
		const entries = this.getEntries();
		if (entries.length === 0) return;
		this.end();
		this.log('── waterfall ──');
		const maxLabel = Math.max(...entries.map((e) => e.label.length), 5);
		for (const e of entries) {
			this.log(` ${e.label.padEnd(maxLabel)} ${e.duration.toFixed(1)}ms`);
		}
	}
}

export const debug = new Debug();
