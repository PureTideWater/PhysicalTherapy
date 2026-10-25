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
  affected,
  closureOf,
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
    expect(affects(['docs/product/unpriced-reasons.md'])).toEqual(['pricing']);
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
    expect(shardsFor(['pricing', 'packets'])).toEqual(['packets-scan', 'packets-rest', 'pricing-engine', 'pricing-recompute', 'pricing-rest']);
    expect(shardsFor([...MUTATION_PACKAGES])).toHaveLength(6);
    expect(shardsFor([] as MutationPackage[])).toEqual([]);
  });
});
