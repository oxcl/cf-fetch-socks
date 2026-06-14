import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startWorker, stopWorker } from "./helpers";
import type { UnstableDevWorker } from "wrangler";

describe("deployed /stream", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await startWorker();
	}, 60_000);

	afterAll(async () => {
		await stopWorker();
	});

	it("returns a streaming response", async () => {
		const res = await worker.fetch("http://test/stream");
		expect(res.status).toBe(200);
		expect(res.body).toBeDefined();
	});

	it("returns event stream content type", async () => {
		const res = await worker.fetch("http://test/stream");
		expect(res.headers.get("content-type")).toContain("text/event-stream");
	});

	it("can read streaming data", async () => {
		const res = await worker.fetch("http://test/stream");
		expect(res.status).toBe(200);

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let hasData = false;

		try {
			const { value, done } = await reader.read();
			if (!done && value) {
				const text = decoder.decode(value);
				expect(text.length).toBeGreaterThan(0);
				hasData = true;
			}
		} finally {
			reader.releaseLock();
		}

		expect(hasData).toBe(true);
	});
});
