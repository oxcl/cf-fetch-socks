import { describe, it, expect } from "vitest";

describe("@reclaimprotocol/tls import", () => {
	it("imports the main module without error", async () => {
		const mod = await import("@reclaimprotocol/tls");
		expect(mod).toBeDefined();
		expect(typeof mod.makeTLSClient).toBe("function");
	});

	it("imports the webcrypto sub-path export without error", async () => {
		const mod = await import("@reclaimprotocol/tls/webcrypto");
		expect(mod).toBeDefined();
		expect(typeof mod.webcryptoCrypto).toBe("object");
	});
});
