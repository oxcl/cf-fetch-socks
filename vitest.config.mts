import path from "path";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// tslib resolve alias — load-bearing workaround
//
// The @peculiar/* packages (transitive deps of @reclaimprotocol/tls) emit
// ESM imports like `import { __decorate } from "tslib"`.  tslib's package.json
// conditional-exports map routes non-Node consumers to the ESM entry via the
// "import" condition's "default" branch — but workerd's module resolver does
// not traverse conditional exports the same way Node.js does, causing a
// resolution failure at module load time.
//
// By aliasing "tslib" directly to its ES module file we bypass the conditional-
// export layer entirely.  This alias is load-bearing: removing it without
// confirming workerd has fixed its conditional-exports support will cause all
// tests that transitively touch @reclaimprotocol/tls to fail with an
// unhelpful import error.
//
// Relevant packages that consume tslib:
//   @peculiar/asn1-{cms,csr,ecc,pfx,pkcs8,pkcs9,rsa,schema,x509,x509-attr}
//   @peculiar/utils
//   @peculiar/x509
//   asn1js
//   pvtsutils
//
export default defineWorkersConfig({
	resolve: {
		alias: {
			tslib: path.resolve(__dirname, "node_modules/tslib/tslib.es6.mjs"),
		},
	},
	test: {
		include: ["test/unit/**/*.spec.ts", "test/integration/**/*.spec.ts", "test/integration/**/*.test.ts"],
		exclude: ["test/e2e/**"],
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
