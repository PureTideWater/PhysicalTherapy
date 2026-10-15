import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { auditFiles, readAuditInputs } from './audit';

/**
 * `tsx packages/synth/src/audit-cli.ts [--check]`: for every synthetic audit under
 * fixtures/synthetic/audit (a directory with an inputs.json), writes its remit.835 and the
 * expected.json the 835 oracle reads, or with --check only reports a file that differs from a fresh
 * generation (exit 1). Generation is deterministic; `pnpm synth --all` never touches these directories.
 */

export const AUDIT_ROOT = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/audit');

export function auditDirectories(root = AUDIT_ROOT): string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(root, entry.name, 'inputs.json')))
    .map((entry) => path.join(root, entry.name))
    .sort();
}

/** The files an audit directory should hold, by name, as generated now. */
export function generatedAudit(dir: string): ReadonlyMap<string, Uint8Array> {
  const { remit, expected } = auditFiles(readAuditInputs(path.join(dir, 'inputs.json')));
  return new Map([
    ['remit.835', remit],
    ['expected.json', new Uint8Array(Buffer.from(expected, 'utf8'))],
  ]);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const checkOnly = process.argv.includes('--check');
  let differs = 0;
  for (const dir of auditDirectories()) {
    for (const [name, bytes] of generatedAudit(dir)) {
      const target = path.join(dir, name);
      const same = existsSync(target) && Buffer.from(bytes).equals(readFileSync(target));
      if (same) {
        continue;
      }
      if (checkOnly) {
        differs += 1;
        process.stdout.write(`differs: ${path.relative(AUDIT_ROOT, target)}\n`);
      } else {
        writeFileSync(target, bytes);
        process.stdout.write(`wrote ${path.relative(AUDIT_ROOT, target)}\n`);
      }
    }
  }
  process.exitCode = differs === 0 ? 0 : 1;
}
