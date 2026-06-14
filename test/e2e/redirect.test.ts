import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startWorker, stopWorker } from "./helpers";
import type { UnstableDevWorker } from "wrangler";

describe("deployed /redirect", () => {
	let worker: UnstableDevWorker;

	beforeAll(async () => {
		worker = await startWorker();
	}, 60_000);

	afterAll(async () => {
		await stopWorker();
	});

	it("follows redirects and returns final response", async () => {
		const res = await worker.fetch("http://test/redirect");
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toBeDefined();
	});

	it("returns JSON content type", async () => {
		const res = await worker.fetch("http://test/redirect");
		expect(res.headers.get("content-type")).toContain("application/json");
	});
});
