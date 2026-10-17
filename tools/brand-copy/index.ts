import path from 'node:path';

import { copyFiles, copyViolations } from './scan';

/**
 * `pnpm lint:copy`: the product-copy lint (Change Order 001, CO-11) over the web app's source and the report
 * templates. `pnpm test` runs the same check (scan.test.ts); this prints each finding with its place.
 */
const root = path.resolve(import.meta.dirname, '../..');
const findings = copyViolations(root);

for (const finding of findings) {
  process.stderr.write(`${finding.file}:${String(finding.line)}:${String(finding.column)}  ${finding.rule}  ${finding.message}\n    ${finding.text}\n`);
}
if (findings.length > 0) {
  process.stderr.write(`lint:copy: ${String(findings.length)} finding(s) in ${String(copyFiles(root).length)} files read.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`lint:copy: ${String(copyFiles(root).length)} files read; the product copy keeps the brand's words.\n`);
}
