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
 * screen_invalid; this keeps one from being written at all). The factories' callers are held too: a practice check
 * only where the web proposes and the worker runs the permitted evaluation, each from its own scope on its services'
 * pool; a synthetic check only in tests and the synthetic evaluation; and the testing module, which issues practice
 * checks over in-memory practices, reached by nothing but test code.
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

  /** Tests, their support files, the generated route tests, the e2e and the synthetic evaluation (eval/: its gateway's actor is the evaluation, which carries no practice's material). */
  const TEST_CODE = /(?:\.test\.tsx?$|\/test-support\/|\/route-tests\/|^apps\/web\/e2e\/|^packages\/model-gateway\/eval\/)/;
  const TEST_FILE = /\.test\.tsx?$/;
  const TESTING = 'packages/model-gateway/src/testing.ts';
  const texts = new Map(files.map((file) => [relative(file), readFileSync(file, 'utf8')]));

  it('leaves the testing module’s checks to tests: nothing else reaches it, by any import, re-export or dynamic import, directly or through another module', () => {
    // testing.ts's memoryPracticeRecords and syntheticPracticeCheck issue a real practice check over an in-memory
    // practice, which the screen accepts for that practice and which reads none of its records: a caller that built
    // one would send a contract checked against nothing.
    const reaching = reachingModule(TESTING, texts, workspacePackages());
    expect(reaching.size).toBeGreaterThan(0);
    expect([...reaching].filter((file) => !TEST_CODE.test(file)).sort()).toEqual([]);
  });

  it('finds every form of import, and an import through another module (the guard’s own check)', () => {
    const graph = new Map([
      ['packages/model-gateway/src/testing.ts', ''],
      ['packages/model-gateway/src/test-support/world.ts', "export * from '../testing';"],
      ['apps/web/src/lib/a.ts', 'import { x } from "@tp/model-gateway/testing";'],
      ['apps/web/src/lib/b.ts', "import '@tp/model-gateway/testing';"],
      ['apps/web/src/lib/c.ts', 'export { y } from "../../../../packages/model-gateway/src/testing.js";'],
      ['apps/web/src/lib/d.ts', 'const m = await import(`@tp/model-gateway/testing`);'],
      ['apps/web/src/lib/e.ts', "const m = require('@tp/model-gateway/testing');"],
      ['apps/web/src/lib/f.ts', "import type { MemoryRecords } from '@tp/model-gateway/testing';"],
      ['apps/web/src/lib/g.ts', "import { world } from '../../../../packages/model-gateway/src/test-support/world';"],
      ['apps/web/src/lib/h.ts', "import { g } from './g';"],
      ['apps/web/src/lib/clean.ts', "import { requestFor } from '@tp/model-gateway'; // not '@tp/model-gateway/testing'"],
    ]);
    const packages = new Map([['@tp/model-gateway', { root: 'packages/model-gateway', exports: { '.': './src/index.ts', './testing': './src/testing.ts' } }]]);
    expect([...reachingModule('packages/model-gateway/src/testing.ts', graph, packages)].sort()).toEqual([
      'apps/web/src/lib/a.ts',
      'apps/web/src/lib/b.ts',
      'apps/web/src/lib/c.ts',
      'apps/web/src/lib/d.ts',
      'apps/web/src/lib/e.ts',
      'apps/web/src/lib/f.ts',
      'apps/web/src/lib/g.ts',
      'apps/web/src/lib/h.ts',
      'packages/model-gateway/src/test-support/world.ts',
    ]);
  });

  it('builds a practice check only in the web’s proposal and the worker’s permitted run, from the caller’s scope on the services’ pool, besides testing.ts and tests', () => {
    // The check takes its scope and pool by their shape (packages/db brands neither), so a stub pool that returns
    // nothing would make a check over nothing: no production caller may pass one. Any naming of the factory counts (an
    // import, a namespace's member, a re-export).
    const CALLERS: Readonly<Record<string, RegExp>> = {
      'apps/web/src/lib/models/contract-proposals.ts': /^\{ authorizedBy: scope, pool: services\.modelPool, cipher, practiceId: input\.practiceId, screenId, requestId: input\.requestId \}$/,
      'apps/worker/src/models/permitted.ts': /^\{ authorizedBy: scope, pool: services\.pool, cipher: await loadPracticeCipher\(scope, services\.keys, practiceId\), practiceId, screenId: runId, requestId \}$/,
    };
    const naming = [...texts].filter(([file, text]) => file !== relative(import.meta.filename) && /\bpracticeRecordsCheck\b/.test(text)).map(([file]) => file);
    expect(naming.filter((file) => !TEST_FILE.test(file)).sort()).toEqual([...Object.keys(CALLERS), RECORDS, 'packages/model-gateway/src/index.ts', TESTING].sort());
    for (const [file, call] of Object.entries(CALLERS)) {
      const calls = [...(texts.get(file) ?? '').matchAll(/\bpracticeRecordsCheck\((\{[^{}]*\})\)/g)].map((match) => match[1]);
      expect(calls, file).toHaveLength(1);
      expect(calls[0], file).toMatch(call);
    }
  });

  it('builds a synthetic check only in testing.ts, the synthetic evaluation and tests: the package’s entry does not export it', () => {
    // A synthetic check is accepted on an evaluation call, which an evaluation actor's gateway makes in production code.
    const naming = [...texts].filter(([file, text]) => file !== relative(import.meta.filename) && /\bsyntheticRecordsCheck\b/.test(text)).map(([file]) => file);
    expect(naming.filter((file) => !TEST_FILE.test(file) && !file.startsWith('packages/model-gateway/eval/')).sort()).toEqual([RECORDS, TESTING].sort());
  });
});

/** A workspace package's root and its exports, by name (from each package.json under apps/ and packages/, and tools/ and infra/). */
interface WorkspacePackage {
  readonly root: string;
  readonly exports: Readonly<Record<string, string>>;
}

function workspacePackages(): Map<string, WorkspacePackage> {
  const roots = ['apps', 'packages'].flatMap((top) => (existsSync(path.join(root, top)) ? readdirSync(path.join(root, top)).map((name) => `${top}/${name}`) : [])).concat(['tools', 'infra']);
  const packages = new Map<string, WorkspacePackage>();
  for (const dir of roots) {
    const manifest = path.join(root, dir, 'package.json');
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; exports?: string | Record<string, unknown> };
      const exported = typeof parsed.exports === 'string' ? { '.': parsed.exports } : Object.fromEntries(Object.entries(parsed.exports ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      if (parsed.name !== undefined) {
        packages.set(parsed.name, { root: dir, exports: exported });
      }
    }
  }
  return packages;
}

/**
 * Every module specifier a source names: a static import or re-export (`from '…'`), a side-effect import, a dynamic
 * import and a require, in any quotes (a template literal without a substitution too). A specifier computed at run time
 * cannot be read here; no source outside tools/test does that.
 */
function specifiers(text: string): string[] {
  const SPECIFIER = /\b(?:from|import)\s*\(?\s*(['"`])([^'"`$\n]+)\1|\brequire\s*\(\s*(['"`])([^'"`$\n]+)\3/g;
  return [...text.matchAll(SPECIFIER)].map((match) => match[2] ?? match[4] ?? '');
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

/** The repository-relative source a specifier names from `file`, or undefined for a package outside the workspace. */
function resolveSpecifier(file: string, specifier: string, known: ReadonlyMap<string, string>, packages: ReadonlyMap<string, WorkspacePackage>): string | undefined {
  let target: string | undefined;
  if (specifier.startsWith('.')) {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  } else {
    for (const [name, workspace] of packages) {
      if (specifier === name || specifier.startsWith(`${name}/`)) {
        const exported = workspace.exports[specifier === name ? '.' : `./${specifier.slice(name.length + 1)}`];
        target = exported === undefined ? undefined : path.posix.normalize(path.posix.join(workspace.root, exported));
      }
    }
  }
  if (target === undefined) {
    return undefined;
  }
  const stem = target.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
  return [target, ...SOURCE_EXTENSIONS.map((extension) => `${stem}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => `${target}/index${extension}`)].find((candidate) => known.has(candidate));
}

/** Every source (repository-relative) that imports `module`, directly or through other sources. */
function reachingModule(module: string, texts: ReadonlyMap<string, string>, packages: ReadonlyMap<string, WorkspacePackage>): Set<string> {
  const importers = new Map<string, string[]>();
  for (const [file, text] of texts) {
    for (const specifier of specifiers(text)) {
      const target = resolveSpecifier(file, specifier, texts, packages);
      if (target !== undefined && target !== file) {
        importers.set(target, [...(importers.get(target) ?? []), file]);
      }
    }
  }
  const reached = new Set<string>();
  const queue = [module];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const importer of importers.get(next) ?? []) {
      if (!reached.has(importer) && importer !== module) {
        reached.add(importer);
        queue.push(importer);
      }
    }
  }
  return reached;
}
