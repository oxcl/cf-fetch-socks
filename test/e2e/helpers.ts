import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

let worker: UnstableDevWorker | null = null;

export async function startWorker(): Promise<UnstableDevWorker> {
	if (worker) return worker;

	worker = await unstable_dev("src/index.ts", {
		config: "wrangler.jsonc",
		local: false,
		experimental: { disableExperimentalWarning: true },
	});

	return worker;
}

export async function stopWorker(): Promise<void> {
	if (worker) {
		await worker.stop();
		worker = null;
	}
}

export function getWorker(): UnstableDevWorker {
	if (!worker) {
		throw new Error("Worker not started. Call startWorker() first.");
	}
	return worker;
}
