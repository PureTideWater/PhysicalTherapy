import path from 'node:path';

import { scanRepository } from './scan';

/**
 * `pnpm lint:logs`: statically checks every log call in apps/, packages/, tools/ and infra/ against
 * the field allowlist in packages/observability/src/fields.ts (PRD section 16, logging discipline).
 */
const root = path.resolve(import.meta.dirname, '../..');
const { files, violations } = scanRepository(root);

for (const violation of violations) {
  process.stderr.write(`${violation.file}:${String(violation.line)}:${String(violation.column)}  ${violation.message}\n`);
}
if (violations.length > 0) {
  process.stderr.write(`lint:logs: ${String(violations.length)} violation(s) in ${String(files)} files scanned.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`lint:logs: ${String(files)} files scanned; every log call uses allowlisted fields.\n`);
}
