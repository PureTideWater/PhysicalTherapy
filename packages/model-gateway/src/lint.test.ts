import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/**
 * The contract PHI check (combined audit item 120; docs/adr/0070, Part 3) is accepted only when patient-records.ts
 * issued it: its WeakSet is added to in one place, called by the two factories alone, and no other source in the
 * repository builds an object with a namesPatient method (a hand-made check would be refused at runtime as
 * screen_invalid; this keeps one from being written at all).
 */
describe('the contract screen’s records check is issued only by its two factories', () => {
  const SOURCE = /\.(?:ts|tsx|mts|cts)$/;
  const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', 'fixtures', '.turbo']);

  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return SKIP.has(entry.name) ? [] : sources(full);
      }
      return SOURCE.test(entry.name) ? [full] : [];
    });
  }

  const files = ['apps', 'packages', 'tools', 'infra'].flatMap((top) => (existsSync(path.join(root, top)) ? sources(path.join(root, top)) : []));
  const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
  const RECORDS = 'packages/model-gateway/src/patient-records.ts';

  it('adds to the issued set in one function, which only practiceRecordsCheck and syntheticRecordsCheck call', () => {
    // This file names the call it looks for, and is left out.
    const adds = files.filter((file) => file !== import.meta.filename && readFileSync(file, 'utf8').includes('issued.add(')).map(relative);
    expect(adds).toEqual([RECORDS]);
    const text = readFileSync(path.join(root, RECORDS), 'utf8');
    expect(text.match(/issued\.add\(/g)).toHaveLength(1);
    expect(text).toMatch(/function issue\(check: PatientRecordsCheck\): PatientRecordsCheck \{\n {2}const frozen = Object\.freeze\(check\);\n {2}issued\.add\(frozen\);/);
    // Each `return issue({` is one factory's; the module has exactly two.
    const callers = [...text.matchAll(/export function (\w+)\([^)]*\): PatientRecordsCheck \{[\s\S]*?\n\}/g)].filter((match) => match[0].includes('return issue({')).map((match) => match[1]);
    expect(callers).toEqual(['practiceRecordsCheck', 'syntheticRecordsCheck']);
    expect(text.match(/\bissue\(/g)).toHaveLength(3);
  });

  it('defines a namesPatient method nowhere else', () => {
    const definitions = files.filter((file) => /(?<![.\w])namesPatient\s*(?:\??:|\()|async\s+namesPatient\s*\(/.test(readFileSync(file, 'utf8'))).map(relative);
    // patient-records.ts (the interface and the two factories) and the tests that show a forged check is refused.
    expect(definitions.filter((file) => !/\.test\.tsx?$/.test(file))).toEqual([RECORDS]);
  });

  it('leaves the testing module’s checks to tests: no other source imports it', () => {
    // testing.ts's memoryPracticeRecords and syntheticPracticeCheck issue a real practice check over an in-memory
    // practice, which the screen accepts for that practice and which reads none of its records: a caller that built
    // one would send a contract checked against nothing. Tests, their support files and the e2e may import it, and
    // the synthetic evaluation (eval/: its gateway's actor is the evaluation, which carries no practice's material).
    const TESTING = path.join(root, 'packages/model-gateway/src/testing.ts');
    const SPECIFIER = /\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g;
    const importsTesting = (file: string) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].some(([, from, dynamic]) => {
        const specifier = from ?? dynamic ?? '';
        return specifier === '@tp/model-gateway/testing' || (specifier.startsWith('.') && path.resolve(path.dirname(file), specifier).replace(/\.ts$/, '') === TESTING.replace(/\.ts$/, ''));
      });
    const TEST_CODE = /(?:\.test\.tsx?$|\/test-support\/|\/route-tests\/|^apps\/web\/e2e\/|^packages\/model-gateway\/eval\/)/;
    const importers = files.filter((file) => file !== TESTING && importsTesting(file)).map(relative);
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((file) => !TEST_CODE.test(file))).toEqual([]);
  });
});
