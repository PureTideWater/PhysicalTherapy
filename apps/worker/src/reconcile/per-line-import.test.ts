import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * The per-line reconcile pass (test-support/per-line.ts) is CAS-49's reference and nothing else (SUITE-CAP-3 D13;
 * docs/adr/0087): a production file importing it would bring back the per-line candidate queries and their decrypts
 * with no failing check. The repository's own ESLint config refuses the import in any file that is neither a test nor
 * test support, however the path is written (from the same directory, from another, or through the package), and
 * allows it in tests and test support; other test-support imports (packages/packets' role examples) stay allowed.
 * Type-aware rules are switched off because the fixture text is in no tsconfig; the rule under test is syntactic.
 */

const root = path.resolve(import.meta.dirname, '../../../..');
const eslint = new ESLint({ cwd: root, overrideConfig: [{ files: ['**/*.{ts,tsx}'], ...tseslint.configs.disableTypeChecked }] });

const MESSAGE = 'The per-line reconcile pass is CAS-49’s reference only (docs/adr/0087): import it from tests and test support, never from production code.';

/** Lints `text` as if it were the file at `filePath`, and returns the per-line refusals' lines. */
async function refusals(filePath: string, text: string): Promise<number[]> {
  const [result] = await eslint.lintText(text, { filePath: path.join(root, filePath) });
  if (result === undefined) {
    throw new Error('ESLint returned no result');
  }
  const found = result.messages.filter((message) => message.message.includes(MESSAGE));
  expect(found.every((message) => message.severity === 2)).toBe(true);
  return found.map((message) => message.line);
}

const importing = (specifier: string) => `import { referencePass } from '${specifier}';\n\nexport const pass = referencePass;\n`;
const exporting = (specifier: string) => `export { referencePass } from '${specifier}';\n`;

describe('the per-line reconcile pass is imported by tests alone (CAS-49, D13)', () => {
  it.each([
    ['apps/worker/src/reconcile/pass.ts', './test-support/per-line'],
    ['apps/worker/src/reconcile/pass.ts', './test-support/per-line.ts'],
    ['apps/worker/src/jobs/handlers.ts', '../reconcile/test-support/per-line'],
    ['apps/worker/src/reconcile/job.ts', '../reconcile/test-support/per-line.js'],
    ['apps/web/src/lib/reconciliation/queries.ts', '@tp/worker/src/reconcile/test-support/per-line'],
  ])('refuses %s importing %s', async (file, specifier) => {
    expect(await refusals(file, importing(specifier))).toEqual([1]);
    expect(await refusals(file, exporting(specifier))).toEqual([1]);
  });

  it.each([
    ['apps/worker/src/reconcile/pass-equality.db.test.ts', './test-support/per-line'],
    ['apps/worker/src/reconcile/settle-order.test.ts', './test-support/per-line'],
    ['apps/worker/src/reconcile/test-support/mutants.ts', './per-line'],
    ['apps/worker/src/report/test-support/whole-read.ts', '../../reconcile/test-support/per-line'],
  ])('allows %s importing %s', async (file, specifier) => {
    expect(await refusals(file, importing(specifier))).toEqual([]);
  });

  it('leaves every other test-support import as it was', async () => {
    expect(await refusals('packages/packets/src/role-examples.ts', importing('./test-support'))).toEqual([]);
    expect(await refusals('apps/worker/src/reconcile/pass.ts', importing('./test-support/ledger-world'))).toEqual([]);
    expect(await refusals('apps/worker/src/reconcile/pass.ts', importing('./test-support/per-line-notes'))).toEqual([]);
  });
});
