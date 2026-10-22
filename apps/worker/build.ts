import { readFileSync } from 'node:fs';

import { type Plugin, build } from 'esbuild';

import { brandFileSources } from './src/report/brand-files';

/**
 * Bundles the worker and every workspace package it imports into one ESM file for the container
 * image, and beside it the page reader's thread (@tp/contracts, page-thread.ts), which the worker
 * starts from dist/page-thread.js for every contract document it reads (docs/adr/0033), the screening
 * consumer's pricing thread (src/screening/thread.ts), which the consumer (WORKER_JOBS=screening) starts
 * from dist/screening-thread.js, one per run it prices at once (src/screening/threads.ts; docs/adr/0062), and the
 * migrator (`pnpm db:migrate`'s CLI), which the one-off migration task runs from the same image as
 * dist/migrate.js before a release receives traffic; it reads the migrations from ../migrations,
 * where the image puts them, and then dist/logins.js, which creates the logins from their secrets
 * (src/deploy/logins.ts; docs/adr/0049), and dist/evaluate-permitted.js, the evaluation on a
 * practice's permitted examples inside the PHI boundary, run as a one-off task of the worker's own task
 * definition (src/models/permitted-cli.ts; docs/adr/0054). pg's optional native binding is left out; the
 * pure JavaScript client is used. The brand files the PDF reports inline (tokens.css, the report stylesheet,
 * the bundled fonts and the outlined SVGs; src/report/brand-files.ts) are embedded in the bundle, so the
 * image needs no asset directory and the renderer never reads one.
 */
const embedBrandFiles: Plugin = {
  name: 'embed-brand-files',
  setup(builder) {
    builder.onLoad({ filter: /[\\/]src[\\/]report[\\/]brand-files\.ts$/ }, () => {
      const files = Object.fromEntries([...brandFileSources()].map(([name, source]) => [name, readFileSync(source).toString('base64')]));
      return {
        loader: 'js',
        contents: [
          `const FILES = ${JSON.stringify(files)};`,
          `export const REPORT_FONT_FILES = ${JSON.stringify(Object.keys(files).filter((name) => name.endsWith('.woff2')))};`,
          'export function brandFileSources() { throw new Error("the bundle embeds the brand files"); }',
          'export function brandFile(name) { const data = FILES[name]; if (data === undefined) { throw new Error("not a brand file the reports use"); } return Buffer.from(data, "base64"); }',
        ].join('\n'),
      };
    });
  },
};

await build({
  entryPoints: {
    main: 'src/main.ts',
    'page-thread': '../../packages/contracts/src/evidence/page-thread.ts',
    'screening-thread': 'src/screening/thread.ts',
    migrate: '../../packages/db/src/cli/migrate.ts',
    logins: 'src/deploy/logins-cli.ts',
    'evaluate-permitted': 'src/models/permitted-cli.ts',
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
  plugins: [embedBrandFiles],
  logLevel: 'info',
});
