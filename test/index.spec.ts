import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
	SELF,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe("SOCKS5 proxy worker", () => {
	it("exports a fetch handler", () => {
		expect(typeof worker.fetch).toBe("function");
	});

	it("returns a Response on request", async () => {
		const request = new IncomingRequest("http://example.com");
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response).toBeInstanceOf(Response);
	});
});
