import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

/**
 * Google's font loader is refused everywhere (CO-01; docs/adr/0056): a fixture that reaches next/font/google
 * (and @next/font/google) every way a module can fails the repository's own ESLint config in every workspace,
 * the model gateway's included, whose override lifts the model SDK rule only. next/font/local, the brand's
 * loader, passes. Type-aware rules are switched off because the fixture is in no tsconfig; the rules under
 * test are syntactic.
 */

const root = path.resolve(import.meta.dirname, '../..');
const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures', 'next-font-google.tsx.fixture'), 'utf8');
const eslint = new ESLint({ cwd: root, overrideConfig: [{ files: ['**/*.{ts,tsx}'], ...tseslint.configs.disableTypeChecked }] });
const MESSAGE = 'Fonts load only through apps/web/src/lib/fonts.ts (next/font/local, self-hosted); never from Google (docs/adr/0056).';

async function fontHits(code: string, filePath: string): Promise<ESLint.LintResult['messages']> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return (result?.messages ?? []).filter((message) => message.message.includes(MESSAGE));
}

describe('next/font/google', () => {
  it.each([
    'apps/web/src/lib/fonts.ts',
    'apps/web/src/app/layout.tsx',
    'apps/web/e2e/fonts.spec.ts',
    'apps/worker/src/report/brand.ts',
    'packages/brand/src/fonts.tsx',
    'packages/ui/src/fonts.tsx',
    'packages/pricing/src/x.ts',
    'packages/model-gateway/src/x.ts',
    'tools/x.ts',
    'infra/lib/x.ts',
  ])('fails every import, re-export, dynamic import and require of it as %s', async (file) => {
    const hits = await fontHits(fixture, file);
    expect(hits.map((message) => message.line)).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(hits.every((message) => message.severity === 2)).toBe(true);
  });

  it('fails a plain JavaScript configuration file that imports it', async () => {
    expect(await fontHits("import { Inter } from 'next/font/google';\nconst f = require('next/font/google');", 'next.config.mjs')).toHaveLength(2);
  });

  it('allows next/font/local, the self-hosted loader the brand uses', async () => {
    expect(await fontHits("import localFont from 'next/font/local';\nconst f = await import('next/font/local');", 'apps/web/src/lib/fonts.ts')).toEqual([]);
  });

  it('keeps the model SDK rule beside it: the gateway may still import its provider, and nowhere else may', async () => {
    const [gateway] = await eslint.lintText("import Anthropic from '@anthropic-ai/sdk';", { filePath: path.join(root, 'packages/model-gateway/src/x.ts') });
    expect(gateway?.messages.filter((message) => message.message.includes('Only packages/model-gateway may call a model'))).toEqual([]);
    const [elsewhere] = await eslint.lintText("import Anthropic from '@anthropic-ai/sdk';", { filePath: path.join(root, 'apps/web/src/lib/x.ts') });
    expect(elsewhere?.messages.filter((message) => message.message.includes('Only packages/model-gateway may call a model'))).toHaveLength(1);
  });
});
