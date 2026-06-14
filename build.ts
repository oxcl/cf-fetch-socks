await Bun.build({
	entrypoints: ['./src/index.ts'],
	outdir: './dist',
	format: 'esm',
	target: 'browser',
	packages: 'external',
	sourcemap: 'external',
	minify: false,
});
