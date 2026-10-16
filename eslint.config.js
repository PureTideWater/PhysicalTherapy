// @ts-check
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The provider SDKs only packages/model-gateway may import (PRD section 14; test matrix SEC-09).
 * Static imports and re-exports are caught by no-restricted-imports; dynamic import() and require()
 * by the syntax selectors below.
 */
export const MODEL_SDKS = ['@aws-sdk/client-bedrock-runtime', '@anthropic-ai/sdk', '@anthropic-ai/bedrock-sdk'];
const MODEL_SDK_MESSAGE = 'Only packages/model-gateway may call a model (PRD section 14). Use its purpose-typed functions.';
const MODEL_SDK_SOURCE = String.raw`/^(@aws-sdk\/client-bedrock-runtime|@anthropic-ai\/(sdk|bedrock-sdk))(\/.*)?$/`;

const modelSdkImports = {
  paths: MODEL_SDKS.map((name) => ({ name, message: MODEL_SDK_MESSAGE })),
  patterns: MODEL_SDKS.map((name) => ({ group: [`${name}/*`], message: MODEL_SDK_MESSAGE })),
};

const modelSdkSyntax = [
  { selector: `ImportExpression[source.value=${MODEL_SDK_SOURCE}]`, message: MODEL_SDK_MESSAGE },
  {
    selector: `CallExpression[callee.name='require'][arguments.0.value=${MODEL_SDK_SOURCE}]`,
    message: MODEL_SDK_MESSAGE,
  },
];

/**
 * No floats on amounts in the money packages (CLAUDE.md rule 2): amounts are bigint cents and rates
 * are Decimal, all through @tp/money. See packages/money/README.md for what to write instead. Beside
 * the engine, ledger and packets: packages/rules (rule records carry cents, rates and relative
 * values), packages/contracts (rate records; .claude/rules/money-and-contracts.md), packages/edi835
 * (it parses every remittance amount), packages/triage (materiality and pursuit-cost cents),
 * packages/synth (the amounts it generates) and packages/billing (plan prices and invoice cents).
 */
export const MONEY_PACKAGES = [
  'packages/money',
  'packages/pricing',
  'packages/ledger',
  'packages/packets',
  'packages/rules',
  'packages/contracts',
  'packages/edi835',
  'packages/triage',
  'packages/synth',
  'packages/billing',
];
const MONEY_MESSAGE = 'Money is bigint cents and rates are Decimal (packages/money/README.md).';
const moneySyntax = [
  { selector: "CallExpression[callee.name='parseFloat']", message: `parseFloat is forbidden here. ${MONEY_MESSAGE}` },
  {
    selector: "MemberExpression[object.name='Number'][property.name='parseFloat']",
    message: `Number.parseFloat is forbidden here. ${MONEY_MESSAGE}`,
  },
  { selector: "CallExpression[callee.name='Number']", message: `Number() is forbidden here. ${MONEY_MESSAGE}` },
  { selector: "NewExpression[callee.name='Number']", message: `new Number() is forbidden here. ${MONEY_MESSAGE}` },
  {
    // A numeric literal with a fraction or an exponent (1.5, .85, 2., 1e3); strings and bigints never match.
    selector: String.raw`Literal[raw=/^(?!0[xXbBoO])[\d_]*(\.|[eE])/]`,
    message: `Floating-point literals are forbidden here; write rate('1.10') or decimal('0.85'). ${MONEY_MESSAGE}`,
  },
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/cdk.out/**',
      // Root-level output only: screens named Coverage and Reports will live under apps/web.
      'coverage/**',
      'reports/**',
      '.stryker-tmp/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/next-env.d.ts',
      'content/**',
      'fixtures/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', modelSdkImports],
      'no-restricted-syntax': ['error', ...modelSdkSyntax],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: [`{${MONEY_PACKAGES.join(',')}}/**/*.{ts,tsx,js,mjs}`],
    rules: { 'no-restricted-syntax': ['error', ...modelSdkSyntax, ...moneySyntax] },
  },
  {
    files: ['packages/model-gateway/**'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [nextPlugin.configs.recommended, nextPlugin.configs['core-web-vitals']],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  {
    // Vitest's matchers return `any` by design (expect.stringContaining and friends).
    files: ['**/*.test.{ts,tsx}', '**/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
);
