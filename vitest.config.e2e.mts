import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/e2e/**/*.e2e.ts'],
		globalSetup: ['test/e2e/global-setup.ts'],
		testTimeout: 5_000,
		hookTimeout: 5_000,
	},
});
