import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/e2e/**/*.e2e.ts'],
		globalSetup: ['test/e2e/global-setup.ts'],
		testTimeout: 30_000,
		hookTimeout: 30_000,
		watch: false,
	},
});
