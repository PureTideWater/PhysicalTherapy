import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import { MUTATION_PACKAGES, type MutationPackage } from '../../stryker/base.mjs';
import { repositoryRoot } from '../content-files';
import {
  type AffectedConfig,
  type Closure,
  DATA_FILES,
  DIRECTORY_READS,
  GLOBAL_INPUTS,
  TEST_TOOLING,
  UNCALLED_READS,
  affected,
  affectedSince,
  closureOf,
  closureProblems,
  covers,
  dataLiterals,
  globToRegExp,
  globalFiles,
  lockedPackages,
  packageName,
  parseLockfile,
  repositoryClosures,
  selectFiles,
  shardsFor,
  specifiers,
  trackedFiles,
  treeAt,
  unionClosures,
  unionGlobal,
} from './affected';

/**
 * What a change affects, for the mutation workflow (tools/stryker/affected.ts; docs/adr/0066, Part 4; test matrix
 * CI-17): first on synthetic repositories built in a temporary directory, each rule alone, then on this repository's
 * own graph, with the results the design read at 49514e8.
 */

/** A lockfile with one version of `name` moved to another: its importer entries, its keys and every reference. */
function bump(text: string, name: string, from: string, to: string): string {
  const lock = parse(text) as Record<string, unknown>;
  const rename = (key: string) => key.split(`${name}@${from}`).join(`${name}@${to}`);
  const version = (dep: string, value: string) => rename(dep === name && value.startsWith(from) ? `${to}${value.slice(from.length)}` : value);
  for (const importer of Object.values((lock.importers ?? {}) as Record<string, Record<string, Record<string, { version: string }> | undefined>>)) {
    for (const field of Object.values(importer)) for (const [dep, entry] of Object.entries(field ?? {})) entry.version = version(dep, entry.version);
  }
  for (const section of ['packages', 'snapshots']) {
    const entries = (lock[section] ?? {}) as Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> } | null>;
    lock[section] = Object.fromEntries(
      Object.entries(entries).map(([key, value]) => {
        for (const deps of [value?.dependencies, value?.optionalDependencies]) for (const dep of Object.keys(deps ?? {})) if (deps !== undefined) deps[dep] = version(dep, deps[dep] ?? '');
        return [rename(key), value];
      }),
    );
  }
  return stringify(lock);
}

describe('globs, imports and path literals', () => {
  it('reads ** across directories and * and ? within one', () => {
    expect(globToRegExp('packages/money/src/**/*.ts').test('packages/money/src/cents.ts')).toBe(true);
    expect(globToRegExp('packages/money/src/**/*.ts').test('packages/money/src/a/b/c.ts')).toBe(true);
    expect(globToRegExp('packages/money/src/*.ts').test('packages/money/src/a/c.ts')).toBe(false);
    expect(globToRegExp('**/*.db.test.ts').test('apps/web/x.db.test.ts')).toBe(true);
    expect(globToRegExp('**/*.db.test.ts').test('x.db.test.ts')).toBe(true);
    expect(globToRegExp('tools/golden-worksheet/engine*.test.ts').test('tools/golden-worksheet/engine.golden.test.ts')).toBe(true);
    expect(globToRegExp('fixtures/golden/**').test('fixtures/golden/claims/G001.json')).toBe(true);
    expect(globToRegExp('a?.ts').test('ab.ts')).toBe(true);
    expect(globToRegExp('a.ts').test('aXts')).toBe(false);
    expect(selectFiles(['a/x.ts', 'a/x.test.ts', 'b/y.ts'], ['a/**/*.ts', '!a/**/*.test.ts'])).toEqual(['a/x.ts']);
  });

  it('takes a bare import’s package name, never a relative path, a URL or a Node built-in', () => {
    expect(packageName('@aws-sdk/client-kms')).toBe('@aws-sdk/client-kms');
    expect(packageName('@tp/db/runtime')).toBe('@tp/db');
    expect(packageName('decimal.js')).toBe('decimal.js');
    expect(packageName('vitest/config')).toBe('vitest');
    for (const specifier of ['./a', '../b', '/abs', 'node:fs', 'fs', 'path', 'https://example.test/x']) expect(packageName(specifier), specifier).toBeUndefined();
    expect(specifiers("import a from 'x';\nimport type { B } from \"y\";\nexport * from './z';\nconst m = await import('w');\nimport {\n  c,\n} from 'v';")).toEqual(['x', 'y', './z', 'w', 'v']);
  });

  it('finds the path literals under fixtures/, content/ and docs/, and a bare root only as a join() or resolve() argument', () => {
    const source = [
      "const a = '../../../fixtures/synthetic';",
      'const b = new URL("../../fixtures/synthetic/CAS-08/narrative-draft.txt", import.meta.url);',
      'const c = `fixtures/synthetic/${id}/x.csv`;',
      "const d = path.join(root, 'content', 'releases');",
      "const e = text('content');",
      "const f = 'docs/product/';",
      "const g = 'fixturesque/x';",
    ].join('\n');
    expect(dataLiterals(source)).toEqual(['content', 'docs/product', 'fixtures/synthetic', 'fixtures/synthetic/CAS-08/narrative-draft.txt']);
  });

  it('covers a file by a glob that matches it, and a directory only by a /** glob at or above it', () => {
    const entries = [{ glob: 'fixtures/golden/**', why: '' }, { glob: 'fixtures/synthetic/rules/release-synth-*/**', why: '' }, { glob: 'docs/product/a.md', why: '' }];
    const files = new Set(['fixtures/golden/claims/G1.json', 'docs/product/a.md', 'docs/product/b.md']);
    const isFile = (file: string) => files.has(file);
    expect(covers(entries, 'fixtures/golden/claims/G1.json', isFile)).toBe(true);
    expect(covers(entries, 'fixtures/golden/claims', isFile)).toBe(true);
    expect(covers(entries, 'fixtures/synthetic/rules/release-synth-900006', isFile)).toBe(true);
    expect(covers(entries, 'fixtures/synthetic/rules', isFile)).toBe(false);
    expect(covers(entries, 'fixtures', isFile)).toBe(false);
    expect(covers(entries, 'docs/product/a.md', isFile)).toBe(true);
    expect(covers(entries, 'docs/product/b.md', isFile)).toBe(false);
    // A directory whose files are named one by one is not covered: what it reads there is decided at run time.
    expect(covers(entries, 'docs/product', isFile)).toBe(false);
  });
});

/** A synthetic repository in a temporary directory: four money packages, an upstream helper, an unrelated app. */
class SyntheticRepository {
  readonly root = mkdtempSync(path.join(os.tmpdir(), 'tp-affected-'));
  readonly files: string[] = [];

  write(file: string, text: string): this {
    mkdirSync(path.dirname(path.join(this.root, file)), { recursive: true });
    writeFileSync(path.join(this.root, file), text);
    if (!this.files.includes(file)) this.files.push(file);
    return this;
  }

  remove(): void {
    rmSync(this.root, { recursive: true, force: true });
  }
}

const perPackage = (globs: (pkg: MutationPackage) => readonly string[]): Record<MutationPackage, readonly string[]> => ({ money: globs('money'), pricing: globs('pricing'), ledger: globs('ledger'), packets: globs('packets') });

const synthetic: AffectedConfig = {
  mutate: perPackage((pkg) => [`packages/${pkg}/src/**/*.ts`, `!packages/${pkg}/src/**/*.test.ts`]),
  tests: perPackage((pkg) => [`packages/${pkg}/src/**/*.test.ts`]),
  excluded: ['**/*.db.test.ts'],
  data: { money: [], pricing: [{ glob: 'fixtures/golden/**', why: 'the golden claims' }], ledger: [], packets: [] },
  directoryReads: [],
  global: ['stryker/**', 'package.json'],
  globalEntryPoints: [],
  tooling: ['vitest'],
};

const LOCK = `lockfileVersion: '9.0'
importers:
  .:
    devDependencies:
      vitest: { specifier: ^5.0.0, version: 5.0.4 }
  apps/site:
    dependencies:
      left-pad: { specifier: ^1.0.0, version: 1.3.0 }
  packages/money:
    dependencies:
      decimal.js: { specifier: ^10.0.0, version: 10.6.0 }
  packages/pricing:
    dependencies:
      '@tp/money': { specifier: 'workspace:*', version: link:../money }
      alpha: { specifier: ^2.0.0, version: 2.1.0 }
  packages/ledger:
    dependencies:
      '@tp/money': { specifier: 'workspace:*', version: link:../money }
  packages/packets:
    dependencies:
      '@tp/pricing': { specifier: 'workspace:*', version: link:../pricing }
packages:
  alpha@2.1.0: { resolution: { integrity: sha512-a } }
  beta@3.0.0: { resolution: { integrity: sha512-b } }
  decimal.js@10.6.0: { resolution: { integrity: sha512-d } }
  left-pad@1.3.0: { resolution: { integrity: sha512-l } }
  vitest@5.0.4: { resolution: { integrity: sha512-v } }
  tinypool@1.0.0: { resolution: { integrity: sha512-t } }
snapshots:
  alpha@2.1.0:
    dependencies:
      beta: 3.0.0
  beta@3.0.0: {}
  decimal.js@10.6.0: {}
  left-pad@1.3.0: {}
  vitest@5.0.4:
    dependencies:
      tinypool: 1.0.0
  tinypool@1.0.0: {}
`;

describe('on a synthetic repository', () => {
  const repo = new SyntheticRepository();
  let closures: Closure[];
  const affects = (files: string[], lockfile?: { before: string; after: string }) => affected({ files, lockfile }, closures, globalFiles(repo.root, repo.files, synthetic), synthetic.tooling).packages;

  beforeAll(() => {
    repo.write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n').write('package.json', '{"name":"root"}').write('pnpm-lock.yaml', LOCK);
    for (const pkg of [...MUTATION_PACKAGES, 'helper']) repo.write(`packages/${pkg}/package.json`, JSON.stringify({ name: `@tp/${pkg}`, exports: { '.': './src/index.ts' } }));
    repo.write('apps/site/package.json', JSON.stringify({ name: '@tp/site' })).write('apps/site/src/page.ts', "import pad from 'left-pad';\nimport { cents } from '@tp/money';\nexport const p = pad(cents);\n");
    repo.write('packages/money/src/index.ts', "import Decimal from 'decimal.js';\nexport const cents = (n: bigint) => n;\nexport const D = Decimal;\n");
    repo.write('packages/money/src/index.test.ts', "import { it } from 'vitest';\nimport { cents } from './index';\nit('a', () => cents(1n));\n");
    repo.write('packages/pricing/src/index.ts', "import { cents } from '@tp/money';\nimport alpha from 'alpha';\nexport { price } from './engine';\nexport const a = alpha(cents);\n");
    repo.write('packages/pricing/src/engine.ts', 'export const price = 1;\n');
    repo.write('packages/pricing/src/engine.test.ts', "import { it } from 'vitest';\nimport { claims } from './test-helper';\nconst golden = 'fixtures/golden/claims';\nit('b', () => claims(golden));\n");
    repo.write('packages/pricing/src/test-helper.ts', 'export const claims = (dir: string) => dir;\n');
    repo.write('packages/pricing/src/slow.db.test.ts', "import '../../helper/src/index';\n");
    repo.write('packages/helper/src/index.ts', 'export const helper = 1;\n');
    repo.write('packages/ledger/src/index.ts', "import { cents } from '@tp/money';\nexport const total = cents;\n");
    repo.write('packages/packets/src/index.ts', "import { price } from '@tp/pricing';\nexport const packet = price;\n");
    repo.write('fixtures/golden/claims/G1.json', '{}').write('fixtures/other/x.json', '{}').write('stryker/base.mjs', '').write('docs/a.md', '');
    closures = MUTATION_PACKAGES.map((pkg) => closureOf(pkg, repo.root, repo.files, synthetic));
  });
  afterAll(() => repo.remove());

  it('builds each closure from the package’s files, its tests and what they import, upstream workspace code included', () => {
    const [money, pricing, ledger, packets] = closures;
    expect(money?.files).toEqual(['packages/money/src/index.test.ts', 'packages/money/src/index.ts']);
    expect(pricing?.files).toEqual(['packages/money/src/index.ts', 'packages/pricing/src/engine.test.ts', 'packages/pricing/src/engine.ts', 'packages/pricing/src/index.ts', 'packages/pricing/src/test-helper.ts']);
    expect(ledger?.files).toEqual(['packages/ledger/src/index.ts', 'packages/money/src/index.ts']);
    expect(packets?.files).toEqual(['packages/money/src/index.ts', 'packages/packets/src/index.ts', 'packages/pricing/src/engine.ts', 'packages/pricing/src/index.ts']);
    expect(pricing?.manifests).toEqual(['packages/money/package.json', 'packages/pricing/package.json']);
    expect([...(pricing?.imports.get('packages/pricing') ?? [])].sort()).toEqual(['@tp/money', 'alpha', 'vitest']);
  });

  it('affects a package when a change touches a file in its closure, and no other', () => {
    expect(affects(['packages/money/src/index.ts'])).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['packages/pricing/src/engine.ts'])).toEqual(['pricing', 'packets']);
    // A test, and a helper only a test imports, belong to their own package's closure alone.
    expect(affects(['packages/pricing/src/engine.test.ts'])).toEqual(['pricing']);
    expect(affects(['packages/pricing/src/test-helper.ts'])).toEqual(['pricing']);
    expect(affects(['packages/ledger/src/index.ts'])).toEqual(['ledger']);
    // An excluded test (a database test) and what only it imports are no closure's.
    expect(affects(['packages/pricing/src/slow.db.test.ts', 'packages/helper/src/index.ts'])).toEqual([]);
    expect(affects(['apps/site/src/page.ts', 'docs/a.md'])).toEqual([]);
  });

  it('affects a package through the manifests of its closure, its data files and the global inputs', () => {
    expect(affects(['packages/money/package.json'])).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['packages/pricing/package.json'])).toEqual(['pricing', 'packets']);
    expect(affects(['packages/helper/package.json', 'apps/site/package.json'])).toEqual([]);
    expect(affects(['fixtures/golden/claims/G1.json'])).toEqual(['pricing']);
    expect(affects(['fixtures/other/x.json'])).toEqual([]);
    expect(affects(['stryker/base.mjs'])).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['package.json'])).toEqual(['money', 'pricing', 'ledger', 'packets']);
  });

  it('affects none when a lockfile move is outside every closure', () => {
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: bump(LOCK, 'left-pad', '1.3.0', '1.3.1') })).toEqual([]);
  });

  it('affects a package when a lockfile move reaches its closure’s third-party packages, transitive ones included', () => {
    // pricing imports alpha, and packets imports pricing's code, so a move of alpha or of beta below it reaches both.
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: bump(LOCK, 'alpha', '2.1.0', '2.2.0') })).toEqual(['pricing', 'packets']);
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: bump(LOCK, 'beta', '3.0.0', '3.0.1') })).toEqual(['pricing', 'packets']);
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: bump(LOCK, 'decimal.js', '10.6.0', '10.6.1') })).toEqual(['money', 'pricing', 'ledger', 'packets']);
    // The test tooling and what lies below it affect all four.
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: bump(LOCK, 'tinypool', '1.0.0', '1.1.0') })).toEqual(['money', 'pricing', 'ledger', 'packets']);
    // A lockfile added or removed affects all four; an unchanged one, none.
    expect(affects(['pnpm-lock.yaml'], { before: LOCK, after: LOCK })).toEqual([]);
    expect(affected({ files: ['pnpm-lock.yaml'], lockfile: { before: undefined, after: LOCK } }, closures, globalFiles(repo.root, repo.files, synthetic), synthetic.tooling).packages).toEqual(['money', 'pricing', 'ledger', 'packets']);
  });

  it('resolves each import from the importing package’s own entry, and marks a name that resolves nowhere', () => {
    const pricing = closures[1];
    if (pricing === undefined) throw new Error('no pricing closure');
    expect(lockedPackages(parseLockfile(LOCK), pricing.imports, synthetic.tooling)).toEqual(['alpha@2.1.0', 'beta@3.0.0', 'decimal.js@10.6.0', 'tinypool@1.0.0', 'vitest@5.0.4']);
    expect(lockedPackages(parseLockfile(LOCK), new Map([['packages/ledger', new Set(['undeclared'])]]), [])).toEqual(['?undeclared']);
  });

  it('fails a fixture path a test names but the list lacks', () => {
    expect(closures.flatMap((closure) => closure.uncovered)).toEqual([]);
    const without = closureOf('pricing', repo.root, repo.files, { ...synthetic, data: { ...synthetic.data, pricing: [] } });
    expect(without.uncovered).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims']);
    // A directory named one file at a time is not enough either: the test may read anything under it.
    const byFile = closureOf('pricing', repo.root, repo.files, { ...synthetic, data: { ...synthetic.data, pricing: [{ glob: 'fixtures/golden/claims/G1.json', why: '' }] } });
    expect(byFile.uncovered).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims']);
  });

  it('takes a directory read named file by file only from DIRECTORY_READS, each file named in the source and listed', () => {
    const reads = (read: AffectedConfig['directoryReads'][number], data: AffectedConfig['data']['pricing'] = []) =>
      closureOf('pricing', repo.root, repo.files, { ...synthetic, data: { ...synthetic.data, pricing: data }, directoryReads: [read] }).uncovered;
    repo.write('packages/pricing/src/engine.test.ts', "import { it } from 'vitest';\nimport { claims } from './test-helper';\nconst golden = 'fixtures/golden/claims';\nit('b', () => claims(path.join(golden, 'G1.json')));\n");
    const read = { file: 'packages/pricing/src/engine.test.ts', directory: 'fixtures/golden/claims', reads: ['fixtures/golden/claims/G1.json'], why: 'one claim' };
    expect(reads(read, [{ glob: 'fixtures/golden/claims/G1.json', why: '' }])).toEqual([]);
    expect(reads(read)).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (reads fixtures/golden/claims/G1.json)']);
    expect(reads({ ...read, reads: ['fixtures/golden/claims/G2.json'] }, [{ glob: 'fixtures/golden/**', why: '' }])).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (reads fixtures/golden/claims/G2.json, which the file does not name)']);
    // Nothing read by a function a run calls: only when that function is named in no other closure file.
    expect(reads({ ...read, reads: [], onlyIn: 'claims' })).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (claims is named in packages/pricing/src/test-helper.ts)']);
    expect(reads({ ...read, reads: [], onlyIn: 'golden' })).toEqual([]);
    // Read by several such functions: each named in the reader and in no other closure file.
    expect(reads({ ...read, reads: [], onlyIn: ['golden', 'G1.json'] })).toEqual([]);
    expect(reads({ ...read, reads: [], onlyIn: ['golden', 'claims'] })).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (claims is named in packages/pricing/src/test-helper.ts)']);
    expect(reads({ ...read, reads: [], onlyIn: ['golden', 'missing'] })).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (missing is named in no closure file but its own)']);
    expect(reads({ ...read, reads: [], onlyIn: [] })).toEqual(['packages/pricing/src/engine.test.ts: fixtures/golden/claims (no function is named in no closure file but its own)']);
  });
});

describe('on this repository', () => {
  const files = trackedFiles();
  const closures = repositoryClosures(repositoryRoot, files);
  const global = globalFiles(repositoryRoot, files);
  const lock = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  const affects = (changed: string[], after?: string) => affected({ files: changed, lockfile: after === undefined ? undefined : { before: lock, after } }, closures, global).packages;
  const importers = (parse(lock) as { importers: Record<string, Record<string, Record<string, { version: string }> | undefined>> }).importers;
  const version = (name: string) => {
    for (const fields of Object.values(importers)) for (const field of Object.values(fields)) if (field?.[name] !== undefined) return field[name].version.replace(/\(.*$/, '');
    throw new Error(`no ${name} in the lockfile`);
  };

  it('lists every data file a closure names (DATA_FILES, DIRECTORY_READS), and every import resolves in the lockfile', () => {
    expect(closures.flatMap((closure) => closure.uncovered.map((literal) => `${closure.pkg}: ${literal}`))).toEqual([]);
    for (const closure of closures) expect(lockedPackages(parseLockfile(lock), closure.imports, TEST_TOOLING).filter((key) => key.startsWith('?')), closure.pkg).toEqual([]);
    for (const read of DIRECTORY_READS) expect(files, read.file).toContain(read.file);
    // The rules content reader finds numbered releases only for the checker and the assembler, outside every closure.
    expect(DIRECTORY_READS.filter((read) => read.file === 'packages/rules/src/content.ts' && read.directory.startsWith('content/')).map((read) => [read.directory, read.reads, read.onlyIn])).toEqual([
      ['content/releases', [], ['previousReleaseNumber', 'releaseDirOf']],
      ['content/outgoing', [], ['previousReleaseNumber', 'releaseDirOf']],
    ]);
    for (const entries of Object.values(DATA_FILES)) for (const entry of entries) expect(files.some((file) => globToRegExp(entry.glob).test(file)), entry.glob).toBe(true);
  });

  it('gives none for a docs-only change', () => {
    expect(affects(['docs/runbooks/screening-capacity.md', 'docs/adr/0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md', 'README.md', 'docs/product/PRD.md'])).toEqual([]);
  });

  it('gives all four for money, pricing and packets for packages/rules/src, packets for packages/triage/src', () => {
    expect(affects(['packages/money/src/cents.ts'])).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['packages/rules/src/index.ts'])).toEqual(['pricing', 'packets']);
    expect(affects(['packages/triage/src/index.ts'])).toEqual(['packets']);
  });

  it('gives pricing and packets, not the ledger, for packages/db/src/runtime.ts: the ledger imports only @tp/money', () => {
    expect(affects(['packages/db/src/runtime.ts'])).toEqual(['pricing', 'packets']);
    const ledger = closures.find((closure) => closure.pkg === 'ledger');
    expect(ledger?.files.filter((file) => !file.startsWith('packages/ledger/') && !file.startsWith('packages/money/'))).toEqual([]);
  });

  it('gives pricing and packets for a change to pricing’s test support, and pricing alone for one of its own tests', () => {
    // packages/pricing/src/testing.ts is @tp/pricing/testing, which the packets tests import.
    expect(affects(['packages/pricing/src/testing.ts'])).toEqual(['pricing', 'packets']);
    expect(affects(['packages/pricing/src/engine.test.ts'])).toEqual(['pricing']);
    expect(affects(['tools/golden-worksheet/engine.golden.test.ts', 'fixtures/golden/claims/G001.json'])).toEqual(['pricing']);
    // The closed list is read by the engine's test and by the calculation words' (packets, explain/words.test.ts).
    expect(affects(['docs/product/unpriced-reasons.md'])).toEqual(['pricing', 'packets']);
  });

  it('gives all four for the mutation tooling, its configuration and the workflow', () => {
    for (const file of [...GLOBAL_INPUTS.map((glob) => glob.replace('**', 'x.ts')), 'tools/screening-capacity/watched.ts']) {
      expect(affects([file]), file).toEqual(['money', 'pricing', 'ledger', 'packets']);
    }
  });

  // Each case rewrites and reads the repository's whole lockfile twice (about 3.5 s in all on an idle machine), so the
  // test is given the time a loaded CI runner or a shared machine needs, beyond Vitest's 5-second default.
  it('gives none for a next lockfile bump, pricing and packets for an @aws-sdk/* group bump, and all four for a vitest bump', () => {
    expect(affects(['pnpm-lock.yaml'], bump(lock, 'next', version('next'), '99.0.0'))).toEqual([]);
    const aws = ['@aws-sdk/client-kms', '@aws-sdk/client-textract'].reduce((text, name) => bump(text, name, version(name), '9.9.9'), lock);
    expect(affects(['pnpm-lock.yaml'], aws)).toEqual(['pricing', 'packets']);
    expect(affects(['pnpm-lock.yaml'], bump(lock, 'vitest', version('vitest'), '99.0.0'))).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['pnpm-lock.yaml'], bump(lock, 'fast-check', version('fast-check'), '99.0.0'))).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(['pnpm-lock.yaml'], bump(lock, 'decimal.js', version('decimal.js'), '99.0.0'))).toEqual(['money', 'pricing', 'ledger', 'packets']);
  }, 60_000);

  it('selects every shard of each affected package', () => {
    expect(shardsFor(['money'])).toEqual(['money-ledger']);
    expect(shardsFor(['pricing', 'packets'])).toEqual(['packets-scan', 'packets-roles', 'packets-words', 'packets-rest', 'packets-explain', 'pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(shardsFor([...MUTATION_PACKAGES])).toHaveLength(9);
    expect(shardsFor([] as MutationPackage[])).toEqual([]);
  });
});

/** A synthetic world's files on one side of a change: the four money packages, an upstream helper and a site. */
function syntheticWorld(repo: SyntheticRepository): SyntheticRepository {
  repo.write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n').write('package.json', '{"name":"root"}').write('pnpm-lock.yaml', LOCK);
  for (const pkg of [...MUTATION_PACKAGES, 'helper']) repo.write(`packages/${pkg}/package.json`, JSON.stringify({ name: `@tp/${pkg}`, exports: { '.': './src/index.ts' } }));
  repo.write('apps/site/package.json', JSON.stringify({ name: '@tp/site' })).write('apps/site/src/page.ts', "import { cents } from '@tp/money';\nexport const p = cents;\n");
  repo.write('packages/money/src/index.ts', "import Decimal from 'decimal.js';\nexport const cents = (n: bigint) => n;\nexport const D = Decimal;\n");
  repo.write('packages/money/src/index.test.ts', "import { it } from 'vitest';\nimport { cents } from './index';\nit('a', () => cents(1n));\n");
  repo.write('packages/pricing/src/index.ts', "import { cents } from '@tp/money';\nexport const a = cents;\n");
  repo.write('packages/ledger/src/index.ts', "import { cents } from '@tp/money';\nexport const total = cents;\n");
  repo.write('packages/packets/src/index.ts', "import { a } from '@tp/pricing';\nexport const packet = a;\n");
  repo.write('packages/helper/src/index.ts', 'export const helper = 1;\n');
  return repo;
}

describe('a change that deletes or moves a file: its sets, and its closures on both sides', () => {
  // The merge base holds a money test, a helper only it imports, a ledger test and money's tsconfig; the head deletes
  // the test and the helper, renames the ledger test into the exclusions and deletes the tsconfig.
  const base = syntheticWorld(new SyntheticRepository())
    .write('packages/money/src/extra.test.ts', "import { it } from 'vitest';\nimport { build } from '../../helper/src/builder';\nimport { cents } from './index';\nit('b', () => cents(build()));\n")
    .write('packages/helper/src/builder.ts', 'export const build = () => 2n;\n')
    .write('packages/ledger/src/index.test.ts', "import { it } from 'vitest';\nimport { total } from './index';\nit('c', () => total(1n));\n")
    .write('packages/money/tsconfig.json', '{}');
  const head = syntheticWorld(new SyntheticRepository()).write('packages/ledger/src/index.db.test.ts', "import { it } from 'vitest';\nimport { total } from './index';\nit('c', () => total(1n));\n");
  const closuresOf = (repo: SyntheticRepository) => MUTATION_PACKAGES.map((pkg) => closureOf(pkg, repo.root, repo.files, synthetic));
  const headOnly = (files: string[]) => affected({ files }, closuresOf(head), globalFiles(head.root, head.files, synthetic), synthetic.tooling);
  const bothSides = (files: string[]) => affected({ files }, unionClosures(closuresOf(head), closuresOf(base)), unionGlobal(globalFiles(head.root, head.files, synthetic), globalFiles(base.root, base.files, synthetic)), synthetic.tooling);
  afterAll(() => {
    base.remove();
    head.remove();
  });

  it('affects the package of a deleted test, by its test set and by its closure at the merge base, with the helper only it imported', () => {
    const deleted = ['packages/helper/src/builder.ts', 'packages/money/src/extra.test.ts'];
    expect(headOnly(deleted).packages).toEqual(['money']);
    const both = bothSides(deleted);
    expect(both.packages).toEqual(['money']);
    expect(both.reasons.money).toEqual(['packages/helper/src/builder.ts (in its closure at the merge base)', 'packages/money/src/extra.test.ts (in its closure at the merge base)']);
    // The helper alone, deleted with nothing else, is no file of the head's sets: only the merge base's closure holds it.
    expect(headOnly(['packages/helper/src/builder.ts']).packages).toEqual([]);
    expect(bothSides(['packages/helper/src/builder.ts']).packages).toEqual(['money']);
  });

  it('affects the package of a test renamed into the exclusions (a database test), by its old name', () => {
    const renamed = ['packages/ledger/src/index.db.test.ts', 'packages/ledger/src/index.test.ts'];
    expect(headOnly(renamed).packages).toEqual(['ledger']);
    expect(headOnly(renamed).reasons.ledger).toEqual(['packages/ledger/src/index.test.ts (its mutate or test set)']);
    expect(bothSides(renamed).packages).toEqual(['ledger']);
    // The new name alone is excluded, so it is no package's.
    expect(bothSides(['packages/ledger/src/index.db.test.ts']).packages).toEqual([]);
  });

  it('affects every package whose closure a deleted manifest lay in, which only the merge base still holds', () => {
    expect(headOnly(['packages/money/tsconfig.json']).packages).toEqual([]);
    expect(bothSides(['packages/money/tsconfig.json']).packages).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(bothSides(['packages/money/tsconfig.json']).reasons.money).toEqual(['packages/money/tsconfig.json (a manifest of its closure at the merge base)']);
  });

  it('gives none for a deleted file no closure held on either side', () => {
    expect(bothSides(['apps/site/src/old.ts', 'docs/gone.md']).packages).toEqual([]);
  });

  it('diffs a real repository from its merge base, the merge base’s tree read from git, and stops on what a closure cannot account for', () => {
    const repo = syntheticWorld(new SyntheticRepository());
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd: repo.root, encoding: 'utf8' }).trim();
    try {
      repo.write('packages/money/src/extra.test.ts', "import { it } from 'vitest';\nimport { build } from '../../helper/src/builder';\nit('b', () => build());\n").write('packages/helper/src/builder.ts', 'export const build = () => 2n;\n');
      git('init', '-q', '-b', 'main');
      git('add', '-A');
      git('commit', '-q', '-m', 'base');
      const baseCommit = git('rev-parse', 'HEAD');
      // The merge base's tree as git holds it, apart from the working tree.
      expect(treeAt(baseCommit, (root, files) => [files.includes('packages/helper/src/builder.ts'), readFileSync(path.join(root, 'packages/helper/src/builder.ts'), 'utf8')], repo.root)).toEqual([true, 'export const build = () => 2n;\n']);
      git('rm', '-q', 'packages/money/src/extra.test.ts', 'packages/helper/src/builder.ts');
      git('commit', '-q', '-m', 'delete a money test and its helper');
      const run = affectedSince(baseCommit, repo.root, synthetic);
      expect(run.mergeBase).toBe(baseCommit);
      expect(run.result.packages).toEqual(['money']);
      expect(run.result.reasons.money).toEqual(['packages/helper/src/builder.ts (in its closure at the merge base)', 'packages/money/src/extra.test.ts (in its closure at the merge base)']);
      // A closure that names data the list lacks stops the run before anything is decided.
      repo.write('packages/money/src/data.test.ts', "import { it } from 'vitest';\nconst file = 'fixtures/money/rates.json';\nit('d', () => file);\n").write('fixtures/money/rates.json', '{}');
      git('add', '-A');
      git('commit', '-q', '-m', 'a test that names data');
      expect(() => affectedSince(baseCommit, repo.root, synthetic)).toThrow('money: packages/money/src/data.test.ts: fixtures/money/rates.json');
    } finally {
      repo.remove();
    }
  });
});

describe('data a closure reads: the path forms the scan finds, and every file-system reader accounted for', () => {
  it('finds a data path after an interpolation, a bare root after ./ or ../, and a bare root in a nested path call', () => {
    expect(dataLiterals('readFileSync(`${REPO}/fixtures/synthetic/CAS-01/expected.json`)')).toEqual(['fixtures/synthetic/CAS-01/expected.json']);
    expect(dataLiterals('const at = `${base}fixtures/golden/claims`;')).toEqual(['fixtures/golden/claims']);
    expect(dataLiterals("new URL('../../../fixtures', import.meta.url)")).toEqual(['fixtures']);
    expect(dataLiterals("const docs = './docs';")).toEqual(['docs']);
    // A bare root stands for the whole directory: what is joined to it is read at run time.
    expect(dataLiterals("path.join(repositoryRoot(), 'fixtures', 'golden')")).toEqual(['fixtures']);
    expect(dataLiterals("path.join(root(path.dirname(here)), 'content', 'releases', name)")).toEqual(['content']);
    expect(dataLiterals("path.resolve(import.meta.dirname, '../../../fixtures/synthetic')")).toEqual(['fixtures/synthetic']);
    expect(dataLiterals("const url = new URL('fixtures', base);")).toEqual(['fixtures']);
    // A bare word outside a path call is not a path (a column named content), and a root inside a longer path is not
    // the repository's.
    expect(dataLiterals("select('content', 'title'); const x = 'packages/rules/content/a.json';")).toEqual([]);
  });

  /** A pricing closure over a small world, with the test given and the list given. */
  function pricingClosure(test: string, data: AffectedConfig['data']['pricing'], options: Partial<AffectedConfig> = {}) {
    const repo = syntheticWorld(new SyntheticRepository()).write('packages/pricing/src/read.test.ts', test).write('fixtures/golden/claims/G1.json', '{}').write('fixtures/golden/claims/G2.json', '{}');
    try {
      return closureOf('pricing', repo.root, repo.files, { ...synthetic, data: { ...synthetic.data, pricing: data }, ...options });
    } finally {
      repo.remove();
    }
  }

  it('fails a closure file that reads the file system unless a data entry names it among its readers: a root held in a variable, an array joined', () => {
    for (const test of [
      "import { readdirSync } from 'node:fs';\nimport path from 'node:path';\nconst DIR = 'fixtures';\nexport const all = (root: string) => readdirSync(path.join(root, DIR));\n",
      "import { readFile } from 'node:fs/promises';\nexport const one = () => readFile(['fixtures', 'golden', 'claims', 'G1.json'].join('/'));\n",
    ]) {
      const closure = pricingClosure(test, [{ glob: 'fixtures/golden/**', why: '' }]);
      expect(closure.uncovered, test).toEqual([]);
      expect(closure.unaccounted, test).toEqual(['packages/pricing/src/read.test.ts: reads the file system (node:fs), but no DATA_FILES entry of pricing names it among its readers, and neither DIRECTORY_READS nor UNCALLED_READS lists it']);
      expect(pricingClosure(test, [{ glob: 'fixtures/golden/**', why: '', readers: ['packages/pricing/src/read.test.ts'] }]).unaccounted, test).toEqual([]);
    }
  });

  it('takes a reader that reads nothing a mutation run calls only with the functions that read, each named in no other closure file', () => {
    const test = "import { readFileSync } from 'node:fs';\nimport { cents } from '@tp/money';\nexport function sniff(file: string) { return readFileSync(file); }\nexport const c = cents;\n";
    const read = { file: 'packages/pricing/src/read.test.ts', onlyIn: ['sniff'], why: 'nothing calls it' };
    expect(pricingClosure(test, [], { uncalledReads: [read] }).unaccounted).toEqual([]);
    expect(pricingClosure(test, [], { uncalledReads: [{ ...read, onlyIn: ['sniff', 'cents'] }] }).unaccounted).toEqual([
      'packages/pricing/src/read.test.ts: UNCALLED_READS says it reads only in cents, which other closure files name too (packages/money/src/index.ts, packages/pricing/src/index.ts)',
    ]);
    expect(pricingClosure(test, [], { uncalledReads: [{ ...read, onlyIn: ['missing'] }] }).unaccounted).toEqual(['packages/pricing/src/read.test.ts: UNCALLED_READS says it reads only in missing, which it does not name']);
  });

  it('holds a directory read to every file the reader names there, and takes a name with an interpolation as a pattern', () => {
    const test = "import { readFileSync } from 'node:fs';\nimport path from 'node:path';\nconst DIR = path.resolve(import.meta.dirname, '../../../fixtures/golden/claims');\nexport const read = (id: string) => [readFileSync(path.join(DIR, 'G1.json')), readFileSync(path.join(DIR, 'G2.json')), readFileSync(path.join(DIR, `${id}.json`))];\n";
    const data = [{ glob: 'fixtures/golden/claims/G1.json', why: '' }, { glob: 'fixtures/golden/claims/G2.json', why: '' }, { glob: 'fixtures/golden/claims/*.json', why: '' }];
    const entry = { file: 'packages/pricing/src/read.test.ts', directory: 'fixtures/golden/claims', reads: ['fixtures/golden/claims/G1.json', 'fixtures/golden/claims/G2.json', 'fixtures/golden/claims/*.json'], why: 'three names' };
    expect(pricingClosure(test, data, { directoryReads: [entry] })).toMatchObject({ uncovered: [], unaccounted: [] });
    // A name a listed pattern matches is listed; a name or a pattern nothing listed matches is not.
    expect(pricingClosure(test, data, { directoryReads: [{ ...entry, reads: ['fixtures/golden/claims/G1.json', 'fixtures/golden/claims/*.json'] }] }).unaccounted).toEqual([]);
    expect(pricingClosure(test, data, { directoryReads: [{ ...entry, reads: ['fixtures/golden/claims/G1.json', 'fixtures/golden/claims/G2.json'] }] }).unaccounted).toEqual([
      'packages/pricing/src/read.test.ts: names fixtures/golden/claims/*.json under fixtures/golden/claims, which its DIRECTORY_READS entry does not list among its reads',
    ]);
    expect(pricingClosure(test, data, { directoryReads: [{ ...entry, reads: ['fixtures/golden/claims/G1.json', 'fixtures/golden/claims/*.json'].slice(0, 1) }] }).unaccounted).toEqual([
      'packages/pricing/src/read.test.ts: names fixtures/golden/claims/G2.json under fixtures/golden/claims, which its DIRECTORY_READS entry does not list among its reads',
      'packages/pricing/src/read.test.ts: names fixtures/golden/claims/*.json under fixtures/golden/claims, which its DIRECTORY_READS entry does not list among its reads',
    ]);
    expect(pricingClosure(test, data.slice(0, 2), { directoryReads: [entry] }).uncovered).toEqual(['packages/pricing/src/read.test.ts: fixtures/golden/claims (reads fixtures/golden/claims/*.json)']);
  });
});

describe('workspace imports: every package pnpm-workspace.yaml lists, resolved as the mutation aliases resolve them', () => {
  const repo = new SyntheticRepository();
  let money: Closure;
  beforeAll(() => {
    syntheticWorld(repo).write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n  - tools\n  - tools/lib\n');
    repo.write('tools/package.json', JSON.stringify({ name: '@tp/tools', exports: { './workspace': './release/workspace.ts', './conditions': { types: './conditions.d.ts', node: './conditions.ts' }, './array': ['./array.ts', './array.js'] } }));
    repo.write('tools/release/workspace.ts', 'export const w = 1;\n').write('tools/conditions.ts', 'export const c = 1;\n').write('tools/array.ts', 'export const a = 1;\n');
    repo.write('tools/lib/package.json', JSON.stringify({ name: '@tp/lib', exports: { '.': { import: './index.ts', default: './index.cjs' }, './assets/*': './assets/*', './assets/private/*': null } }));
    repo.write('tools/lib/index.ts', 'export const l = 1;\n').write('tools/lib/assets/mark.svg', '<svg/>').write('tools/lib/assets/private/key.txt', 'x');
    repo.write(
      'packages/money/src/workspace.test.ts',
      "import { it } from 'vitest';\nimport { w } from '@tp/tools/workspace';\nimport { c } from '@tp/tools/conditions';\nimport { a } from '@tp/tools/array';\nimport { l } from '@tp/lib';\nimport mark from '@tp/lib/assets/mark.svg';\nit('w', () => [w, c, a, l, mark]);\n",
    );
    money = closureOf('money', repo.root, repo.files, synthetic);
  });
  afterAll(() => repo.remove());

  it('follows tools, nested workspace packages, conditions, arrays and subpath patterns into the closure', () => {
    for (const file of ['tools/release/workspace.ts', 'tools/conditions.ts', 'tools/array.ts', 'tools/lib/index.ts', 'tools/lib/assets/mark.svg']) expect(money.files, file).toContain(file);
    expect(money.unresolved).toEqual([]);
    expect(affected({ files: ['tools/release/workspace.ts'] }, [money], globalFiles(repo.root, repo.files, synthetic), synthetic.tooling).packages).toEqual(['money']);
  });

  it('names a workspace-scoped import that resolves to no file: an unexported or excluded subpath, a package without exports, a scope’s unknown name, a missing relative file', () => {
    repo.write(
      'packages/money/src/broken.test.ts',
      "import { it } from 'vitest';\nimport { x } from '@tp/tools/nothing';\nimport key from '@tp/lib/assets/private/key.txt';\nimport { p } from '@tp/site';\nimport { y } from '@tp/unknown';\nimport { z } from './missing';\nimport Decimal from 'decimal.js';\nit('x', () => [x, key, p, y, z, Decimal]);\n",
    );
    expect(closureOf('money', repo.root, repo.files, synthetic).unresolved).toEqual([
      'packages/money/src/broken.test.ts: ./missing',
      'packages/money/src/broken.test.ts: @tp/lib/assets/private/key.txt',
      'packages/money/src/broken.test.ts: @tp/site',
      'packages/money/src/broken.test.ts: @tp/tools/nothing',
      'packages/money/src/broken.test.ts: @tp/unknown',
    ]);
  });
});

describe('what stops the changes job, and the tooling’s own packages, on this repository', () => {
  const files = trackedFiles();
  const closures = repositoryClosures(repositoryRoot, files);
  const global = globalFiles(repositoryRoot, files);
  const lock = readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8');
  const version = (name: string) => {
    const importers = (parse(lock) as { importers: Record<string, Record<string, Record<string, { version: string }> | undefined>> }).importers;
    for (const fields of Object.values(importers)) for (const field of Object.values(fields)) if (field?.[name] !== undefined) return field[name].version.replace(/\(.*$/, '');
    throw new Error(`no ${name} in the lockfile`);
  };

  it('accounts for every closure: no unlisted data, no unlisted file-system reader, no import that resolves to no file', () => {
    expect(closureProblems(closures, global, parseLockfile(lock))).toEqual([]);
    for (const closure of closures) {
      expect(closure.unresolved, closure.pkg).toEqual([]);
      expect(closure.unaccounted, closure.pkg).toEqual([]);
    }
    // Every listed reader reads the file system and lies in its package's closure, and every uncalled reader too.
    for (const [pkg, entries] of Object.entries(DATA_FILES)) {
      const closure = closures.find((candidate) => candidate.pkg === pkg);
      for (const reader of entries.flatMap((entry) => entry.readers ?? [])) {
        expect(closure?.files, `${pkg}: ${reader}`).toContain(reader);
        expect(specifiers(readFileSync(path.join(repositoryRoot, reader), 'utf8')), reader).toContain('node:fs');
      }
    }
    for (const read of UNCALLED_READS) expect(closures.some((closure) => closure.files.includes(read.file)), read.file).toBe(true);
  });

  it('runs the ledger for the exports templates.test.ts reads, and for no other synthetic fixture', () => {
    const affects = (changed: string[]) => affected({ files: changed }, closures, global).packages;
    expect(affects(['fixtures/synthetic/CI-15/expected.json'])).toEqual([]);
    expect(affects(['fixtures/synthetic/LED-04/original.835', 'fixtures/synthetic/emr/spry_era_v0/era-export.csv'])).toEqual([]);
    expect(affects(['fixtures/synthetic/LED-04/posting-export.csv'])).toEqual(['ledger']);
    expect(affects(['fixtures/synthetic/LED-09/lines-posting-export.csv'])).toEqual(['ledger']);
    expect(affects(['fixtures/synthetic/emr/spry_posting_v0/posting-export.csv'])).toEqual(['ledger']);
    expect(affects(['fixtures/synthetic/emr/prompt_era_v0/manifest.json'])).toEqual(['ledger']);
  });

  it('gives each package a deleted or renamed test of its own, on the head’s sets and on both sides’ closures', () => {
    const without = (removed: readonly string[], added: readonly string[] = []) => [...files.filter((file) => !removed.includes(file)), ...added];
    for (const [changed, removed, added, expected] of [
      [['packages/money/src/cents.test.ts'], ['packages/money/src/cents.test.ts'], [], ['money']],
      [['packages/pricing/src/engine.test.ts'], ['packages/pricing/src/engine.test.ts'], [], ['pricing']],
      [['tools/golden-worksheet/engine.golden.test.ts'], ['tools/golden-worksheet/engine.golden.test.ts'], [], ['pricing']],
      [['packages/packets/src/scan.test.ts'], ['packages/packets/src/scan.test.ts'], [], ['packets']],
      [['packages/ledger/src/allocation.db.test.ts', 'packages/ledger/src/allocation.test.ts'], ['packages/ledger/src/allocation.test.ts'], ['packages/ledger/src/allocation.db.test.ts'], ['ledger']],
      [['fixtures/golden/claims/G001.json'], ['fixtures/golden/claims/G001.json'], [], ['pricing']],
    ] as const) {
      const head = repositoryClosures(repositoryRoot, without(removed, added));
      expect(affected({ files: changed }, head, globalFiles(repositoryRoot, without(removed, added))).packages, changed.join(', ')).toEqual(expected);
      expect(affected({ files: changed }, unionClosures(head, closures), unionGlobal(globalFiles(repositoryRoot, without(removed, added)), global)).packages, changed.join(', ')).toEqual(expected);
    }
  }, 120_000);

  it('gives all four for a bump of tsx, which runs the tooling, or of yaml, which the changes job reads the lockfile with', () => {
    const affects = (after: string) => affected({ files: ['pnpm-lock.yaml'], lockfile: { before: lock, after } }, closures, global).packages;
    expect(affects(bump(lock, 'tsx', version('tsx'), '99.0.0'))).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(affects(bump(lock, 'yaml', version('yaml'), '99.0.0'))).toEqual(['money', 'pricing', 'ledger', 'packets']);
    expect(TEST_TOOLING).toContain('tsx');
    expect([...(global.imports.get('tools') ?? [])]).toContain('yaml');
  }, 60_000);
});
