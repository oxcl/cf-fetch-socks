import path from "path";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

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
