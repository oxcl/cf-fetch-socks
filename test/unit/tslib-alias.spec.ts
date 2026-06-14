import { describe, it, expect } from "vitest";
import {
	__decorate,
	__exportStar,
	__importStar,
	__classPrivateFieldGet,
	__classPrivateFieldSet,
} from "tslib";

describe("tslib resolve alias", () => {
	it("resolves __decorate (used by all @peculiar/* packages)", () => {
		expect(typeof __decorate).toBe("function");
	});

	it("resolves __exportStar (used by @peculiar/asn1-schema, @peculiar/utils)", () => {
		expect(typeof __exportStar).toBe("function");
	});

	it("resolves __importStar (used by @peculiar/asn1-schema, @peculiar/utils)", () => {
		expect(typeof __importStar).toBe("function");
	});

	it("resolves __classPrivateFieldGet (used by @peculiar/x509)", () => {
		expect(typeof __classPrivateFieldGet).toBe("function");
	});

	it("resolves __classPrivateFieldSet (used by @peculiar/x509)", () => {
		expect(typeof __classPrivateFieldSet).toBe("function");
	});
});
