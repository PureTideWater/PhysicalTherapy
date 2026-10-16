import { build } from 'esbuild';

/**
 * Bundles the worker and every workspace package it imports into one ESM file for the container
 * image, and beside it the page reader's thread (@tp/contracts, page-thread.ts), which the worker
 * starts from dist/page-thread.js for every contract document it reads (docs/adr/0033), and the
 * migrator (`pnpm db:migrate`'s CLI), which the one-off migration task runs from the same image as
 * dist/migrate.js before a release receives traffic; it reads the migrations from ../migrations,
 * where the image puts them (docs/adr/0049). pg's optional native binding is left out; the pure
 * JavaScript client is used.
 */
await build({
  entryPoints: {
    main: 'src/main.ts',
    'page-thread': '../../packages/contracts/src/evidence/page-thread.ts',
    migrate: '../../packages/db/src/cli/migrate.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  // playwright-core prints the audit report's PDF with Chromium; it locates its browser at run time, so
  // it stays a module beside the bundle (the image installs it with its browser).
  external: ['pg-native', 'playwright-core'],
  // CommonJS dependencies inside an ESM bundle still call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
