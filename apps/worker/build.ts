import { build } from 'esbuild';

/**
 * Bundles the worker and every workspace package it imports into one ESM file for the container
 * image. pg's optional native binding is left out; the pure JavaScript client is used.
 */
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external: ['pg-native'],
  // CommonJS dependencies inside an ESM bundle still call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
