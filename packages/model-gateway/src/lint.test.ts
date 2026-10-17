import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * The milestone 10 check (PRD 14; milestone prompt: "the lint rule that forbids provider imports
 * elsewhere"; done when "the lint fails a test file that imports the provider directly"): a fixture
 * test file that imports the provider SDKs directly fails the repository's own ESLint config wherever
 * it lives outside packages/model-gateway, and passes inside it. Type-aware rules are switched off
 * because the fixture is in no tsconfig; the rule under test is syntactic.
 */

const root = path.resolve(import.meta.dirname, '../../..');
const fixture = readFileSync(path.resolve(import.meta.dirname, '../test-fixtures/direct-provider-import.test.ts.fixture'), 'utf8');
const eslint = new ESLint({ cwd: root, overrideConfig: [{ files: ['**/*.{ts,tsx}'], ...tseslint.configs.disableTypeChecked }] });

async function lintAs(filePath: string): Promise<ESLint.LintResult> {
  const [result] = await eslint.lintText(fixture, { filePath: path.join(root, filePath) });
  if (result === undefined) {
    throw new Error('ESLint returned no result');
  }
  return result;
}

const MESSAGE = 'Only packages/model-gateway may call a model (PRD section 14). Use its purpose-typed functions.';

describe('a test file that imports the provider directly', () => {
  it.each([
    'apps/worker/src/packets/narrative.test.ts',
    'apps/web/src/lib/packets/narrative.test.ts',
    'apps/web/e2e/narrative.spec.ts',
    'packages/packets/src/narrative.test.ts',
    'packages/contracts/src/abstraction.test.ts',
    'packages/pricing/src/engine.test.ts',
    'tools/test/narrative.test.ts',
    'infra/test/model.test.ts',
  ])('fails the lint as %s', async (file) => {
    const result = await lintAs(file);
    const model = result.messages.filter((message) => message.message.includes(MESSAGE));
    // Every static import of an Anthropic package or a Bedrock client (with a subpath too), each dynamic
    // import and the require, each an error (pnpm lint runs with --max-warnings=0).
    expect(model.map((message) => message.line)).toEqual([5, 6, 7, 8, 9, 10, 20, 21, 22]);
    expect(model.every((message) => message.severity === 2)).toBe(true);
    expect(result.errorCount).toBeGreaterThanOrEqual(9);
  });

  it('passes inside packages/model-gateway, the only code that calls a model', async () => {
    const result = await lintAs('packages/model-gateway/src/narrative.test.ts');
    expect(result.messages.filter((message) => message.message.includes(MESSAGE))).toEqual([]);
  });
});
