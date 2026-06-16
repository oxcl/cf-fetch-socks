import * as esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['./src/index.ts'],
	outdir: './dist',
	format: 'esm',
	platform: 'browser',
	bundle: true,
	packages: 'external',
	sourcemap: 'external',
	minify: false,
});
