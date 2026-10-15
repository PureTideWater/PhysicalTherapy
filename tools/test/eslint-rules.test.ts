import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

/**
 * Lints source text as if it lived at `filePath`, with the repository's eslint.config.js. Type-aware
 * rules are switched off because the text exists in no tsconfig; the rules under test are syntactic.
 */
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [{ files: ['**/*.{ts,tsx}'], ...tseslint.configs.disableTypeChecked }],
});

async function ruleHits(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === 'no-restricted-syntax' || message.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((message) => message.message);
}

describe('model SDKs outside packages/model-gateway (PRD section 14, SEC-09)', () => {
  it.each([
    "import Anthropic from '@anthropic-ai/sdk';",
    "import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';",
    "import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';",
    "import type { Message } from '@anthropic-ai/sdk/resources';",
    "export * from '@anthropic-ai/sdk';",
    "export { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';",
    "const sdk = await import('@anthropic-ai/sdk');",
    "const sdk = require('@aws-sdk/client-bedrock-runtime');",
  ])('fails %s', async (code) => {
    for (const file of ['apps/web/src/lib/x.ts', 'apps/worker/src/x.ts', 'packages/pricing/src/x.ts', 'tools/x.ts']) {
      expect(await ruleHits(code, file), file).toEqual([expect.stringContaining('Only packages/model-gateway may call a model')]);
    }
  });

  it('fails a test file that imports the provider directly', async () => {
    expect(await ruleHits("import Anthropic from '@anthropic-ai/sdk';", 'packages/packets/src/narrative.test.ts')).toHaveLength(1);
  });

  it('allows the gateway itself', async () => {
    const code = "import Anthropic from '@anthropic-ai/sdk';\nconst sdk = await import('@aws-sdk/client-bedrock-runtime');";
    expect(await ruleHits(code, 'packages/model-gateway/src/bedrock.ts')).toEqual([]);
  });

  it('leaves other AWS SDK clients alone', async () => {
    expect(await ruleHits("import { S3Client } from '@aws-sdk/client-s3';", 'apps/worker/src/x.ts')).toEqual([]);
  });
});

describe('floats on amounts in the money packages', () => {
  const moneyFiles = ['packages/money/src/x.ts', 'packages/pricing/src/x.ts', 'packages/ledger/src/x.ts', 'packages/packets/src/x.ts', 'packages/rules/src/x.ts'];

  it.each([
    ['parseFloat', "const a = parseFloat('1.5');", /parseFloat is forbidden/],
    ['Number.parseFloat', "const a = Number.parseFloat('1.5');", /Number.parseFloat is forbidden/],
    ['Number()', "const a = Number('150');", /Number\(\) is forbidden/],
    ['new Number()', 'const a = new Number(1);', /new Number\(\) is forbidden/],
    ['a fractional literal', 'const a = 1.1;', /Floating-point literals/],
    ['a leading-point literal', 'const a = .85;', /Floating-point literals/],
    ['an exponent literal', 'const a = 1e3;', /Floating-point literals/],
    ['a trailing-point literal', 'const a = 2.;', /Floating-point literals/],
  ])('fails %s', async (_name, code, expected) => {
    for (const file of moneyFiles) {
      expect(await ruleHits(code, file), file).toEqual([expect.stringMatching(expected)]);
    }
  });

  it('fails inside the money packages tests too', async () => {
    expect(await ruleHits('const a = 0.5;', 'packages/pricing/src/engine.test.ts')).toHaveLength(1);
  });

  it.each([
    'const a = 2;',
    'const a = 100n;',
    "const a = '1.10';",
    'const a = 0x1E;',
    'const a = 1_000;',
    'const a = BigInt(text);',
    "const a = rate('0.85');",
  ])('allows %s', async (code) => {
    for (const file of moneyFiles) {
      expect(await ruleHits(code, file), file).toEqual([]);
    }
  });

  it('does not apply outside the money packages', async () => {
    expect(await ruleHits("const a = 1.5 + Number('2');", 'apps/worker/src/x.ts')).toEqual([]);
  });
});
