import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startWorker, stopWorker } from "./helpers";
import type { UnstableDevWorker } from "wrangler";

describe("deployed /test-fetch", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await startWorker();
	}, 60_000);

	afterAll(async () => {
		await stopWorker();
	});

	it("returns a successful response", async () => {
		const res = await worker.fetch("http://test/test-fetch");
		expect(res.status).toBe(200);
	});

	it("returns proxy exit IP via httpbin", async () => {
		const res = await worker.fetch("http://test/test-fetch");
		expect(res.status).toBe(200);

		const body = await res.json<{ origin: string }>();
		expect(body.origin).toBeDefined();
		expect(typeof body.origin).toBe("string");
	});

	it("returns JSON content type", async () => {
		const res = await worker.fetch("http://test/test-fetch");
		expect(res.headers.get("content-type")).toContain("application/json");
	});
});
