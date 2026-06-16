import * as esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['./src/index.ts'],
	outdir: './dist',
	format: 'esm',
	platform: 'browser',
	packages: 'external',
	sourcemap: 'external',
	minify: false,
});
