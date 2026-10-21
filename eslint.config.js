// @ts-check
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The provider SDKs only packages/model-gateway may import (PRD section 14; test matrix SEC-09): every
 * package of Anthropic's (@anthropic-ai/*: the API, Bedrock, Vertex and any other client) and every
 * Bedrock client of the AWS SDK (@aws-sdk/client-bedrock*: the runtime, the agent runtime and the
 * rest), each with its subpaths. Static imports and re-exports are caught by no-restricted-imports;
 * dynamic import() and require() by the syntax selectors below.
 */
export const MODEL_SDK_PATTERNS = ['@anthropic-ai/*', '@aws-sdk/client-bedrock*'];
const MODEL_SDK_MESSAGE = 'Only packages/model-gateway may call a model (PRD section 14). Use its purpose-typed functions.';
const MODEL_SDK_SOURCE = String.raw`/^(@aws-sdk\/client-bedrock[^/]*|@anthropic-ai\/[^/]+)(\/.*)?$/`;

/**
 * Google's font loader, everywhere (CO-01: no page requests Google's font hosts; docs/adr/0056): next/font/google
 * (and the older @next/font/google), with its subpaths, fetches the faces from Google at build time and names
 * them in the page. The brand's faces are self-hosted through next/font/local (apps/web/src/lib/fonts.ts).
 * Static imports and re-exports are caught by no-restricted-imports, dynamic import() and require() by the
 * syntax selectors below; tools/brand-fonts scans the source for the hosts themselves.
 */
export const GOOGLE_FONT_MODULES = ['next/font/google', '@next/font/google'];
const GOOGLE_FONT_MESSAGE = 'Fonts load only through apps/web/src/lib/fonts.ts (next/font/local, self-hosted); never from Google (docs/adr/0056).';
const GOOGLE_FONT_SOURCE = String.raw`/^(@next|next)\/font\/google(\/.*)?$/`;

const googleFontImports = {
  group: GOOGLE_FONT_MODULES.flatMap((module) => [module, `${module}/**`]),
  message: GOOGLE_FONT_MESSAGE,
};

/** The imports refused everywhere but where an override says otherwise: the model SDKs and Google's font loader. */
const restrictedImports = {
  patterns: [{ group: MODEL_SDK_PATTERNS.flatMap((pattern) => [pattern, `${pattern}/**`]), message: MODEL_SDK_MESSAGE }, googleFontImports],
};

const googleFontSyntax = [
  { selector: `ImportExpression[source.value=${GOOGLE_FONT_SOURCE}]`, message: GOOGLE_FONT_MESSAGE },
  { selector: `CallExpression[callee.name='require'][arguments.0.value=${GOOGLE_FONT_SOURCE}]`, message: GOOGLE_FONT_MESSAGE },
];

const modelSdkSyntax = [
  { selector: `ImportExpression[source.value=${MODEL_SDK_SOURCE}]`, message: MODEL_SDK_MESSAGE },
  {
    selector: `CallExpression[callee.name='require'][arguments.0.value=${MODEL_SDK_SOURCE}]`,
    message: MODEL_SDK_MESSAGE,
  },
];

/** The same two, imported dynamically or required. */
const restrictedSyntax = [...modelSdkSyntax, ...googleFontSyntax];

/**
 * No floats on amounts in the money packages (CLAUDE.md rule 2): amounts are bigint cents and rates
 * are Decimal, all through @tp/money. See packages/money/README.md for what to write instead. Beside
 * the engine, ledger and packets: packages/rules (rule records carry cents, rates and relative
 * values), packages/contracts (rate records; .claude/rules/money-and-contracts.md), packages/edi835
 * (it parses every remittance amount), packages/triage (materiality and pursuit-cost cents),
 * packages/synth (the amounts it generates), packages/billing (plan prices and invoice cents) and
 * packages/model-gateway (each call's cost in cents and the daily budget).
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
  'packages/model-gateway',
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
      // The base engine tools/engine-freeze/differential.test.ts extracts beside packages/pricing; never linted.
      '**/.freeze-base/**',
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
      '@typescript-eslint/no-restricted-imports': ['error', restrictedImports],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
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
    rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax, ...moneySyntax] },
  },
  {
    // The only code that calls a model: the provider SDKs are allowed here, the money and font rules still hold.
    files: ['packages/model-gateway/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [googleFontImports] }],
      'no-restricted-syntax': ['error', ...googleFontSyntax, ...moneySyntax],
    },
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
