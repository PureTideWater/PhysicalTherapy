import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { MUTATION_PACKAGES, type MutationPackage } from '../../stryker/base.mjs';
import { repositoryRoot } from '../content-files';
import { type AffectedConfig, type Change, type Closure, type GlobalInputs, affected, closureOf, globalFiles, repositoryClosures, trackedFiles, unionClosures, unionGlobal } from './affected';

/**
 * The root manifest, the workspace file and every workspace package's manifest read field by field (docs/adr/0066,
 * Part 7; test matrix CI-27): each case is judged through affected() with the change's texts, on this repository's own
 * graph or on a synthetic world written to a temporary directory. Every manifest here is this repository's own text,
 * edited, or synthetic; none holds data.
 */

const ALL = [...MUTATION_PACKAGES];

type Texts = NonNullable<Change['texts']>;

interface Manifest {
  [key: string]: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A manifest's text with one edit made: parsed, changed, written back as the repository writes it. */
function edit(text: string, change: (manifest: Manifest) => void): string {
  const manifest = JSON.parse(text) as Manifest;
  change(manifest);
  return json(manifest);
}

/** One file's change, from its text before to its text after. */
const changed = (file: string, before: string | null | undefined, after: string | null | undefined): Texts => ({ [file]: { before, after } });

/** A synthetic repository in a temporary directory. */
class World {
  readonly root = mkdtempSync(path.join(os.tmpdir(), 'tp-manifests-'));
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

/** A synthetic world's configuration: each package's sources and tests, the named manifests global by glob as on this repository, and a test file a shard loads by path. */
const SYNTHETIC: AffectedConfig = {
  mutate: perPackage((pkg) => [`packages/${pkg}/src/**/*.ts`, `!packages/${pkg}/src/**/*.test.ts`]),
  tests: perPackage((pkg) => [`packages/${pkg}/src/**/*.test.ts`]),
  excluded: [],
  data: { money: [], pricing: [], ledger: [], packets: [] },
  directoryReads: [],
  global: ['stryker/**', 'package.json', 'pnpm-workspace.yaml', '.github/workflows/mutation.yml'],
  globalEntryPoints: [],
  globalLoaded: ['tools/load.test.ts'],
  tooling: ['vitest'],
};

const WORKSPACE = 'packages:\n  - apps/*\n  - packages/*\n  - tools\n  - tools/canary\n';

/**
 * The four money packages, a database package pricing and the ledger import different files of, an app, the tools
 * package, and a canary package only a by-path-loaded test imports (by name, with a third-party package nothing else
 * imports): pricing's own test imports `beta`, which no other closure does, and the database file pricing reaches
 * imports `alpha`.
 */
function syntheticWorld(): World {
  const world = new World().write('pnpm-workspace.yaml', `${WORKSPACE}\ncatalog:\n  beta: ^1.0.0\n`).write('package.json', json({ name: 'root', private: true }));
  for (const pkg of MUTATION_PACKAGES) world.write(`packages/${pkg}/package.json`, json({ name: `@tp/${pkg}`, exports: { '.': './src/index.ts' } }));
  world.write('packages/money/src/index.ts', 'export const cents = (n: bigint) => n;\n');
  world.write('packages/money/src/index.test.ts', "import { it } from 'vitest';\nimport { cents } from './index';\nit('a', () => cents(1n));\n");
  world.write('packages/pricing/src/index.ts', "import { cents } from '@tp/money';\nimport { a } from '@tp/db/a';\nexport const price = [cents, a];\n");
  world.write('packages/pricing/src/only.test.ts', "import { it } from 'vitest';\nimport beta from 'beta';\nimport { price } from './index';\nit('b', () => [beta, price]);\n");
  world.write('packages/ledger/src/index.ts', "import { cents } from '@tp/money';\nimport { b } from '@tp/db/b';\nexport const total = [cents, b];\n");
  world.write('packages/packets/src/index.ts', "import { price } from '@tp/pricing';\nexport const packet = price;\n");
  world.write('packages/db/package.json', json({ name: '@tp/db', exports: { './a': './src/a.ts', './b': './src/b.ts' }, dependencies: { alpha: '^1.0.0' } }));
  world.write('packages/db/src/a.ts', "import alpha from 'alpha';\nexport const a = alpha;\n").write('packages/db/src/b.ts', 'export const b = 1;\n');
  world.write('apps/site/package.json', json({ name: '@tp/site', exports: { '.': './src/page.ts' } })).write('apps/site/src/page.ts', 'export const page = 1;\n');
  world.write('tools/package.json', json({ name: '@tp/tools', type: 'module' }));
  world.write('tools/load.test.ts', "import { it } from 'vitest';\nimport { canary } from '@tp/canary';\nimport only from 'only-loaded';\nit('c', () => [canary, only]);\n");
  world.write('tools/canary/package.json', json({ name: '@tp/canary', exports: { '.': './index.ts' } })).write('tools/canary/index.ts', 'export const canary = 1;\n');
  return world;
}

const closuresOf = (world: World, config: AffectedConfig = SYNTHETIC) => MUTATION_PACKAGES.map((pkg) => closureOf(pkg, world.root, world.files, config));

describe('on this repository', () => {
  const files = trackedFiles();
  const closures = repositoryClosures(repositoryRoot, files);
  const global = globalFiles(repositoryRoot, files);
  const read = (file: string) => readFileSync(path.join(repositoryRoot, file), 'utf8');
  const judge = (texts: Texts, list: readonly string[] = Object.keys(texts)) => affected({ files: list, texts }, closures, global);
  const packages = (texts: Texts, list?: readonly string[]) => judge(texts, list).packages;
  const ownersOf = (file: string) => closures.filter((closure) => closure.manifests.includes(file)).map((closure) => closure.pkg);
  const ROOT = read('package.json');
  const YAML = read('pnpm-workspace.yaml');
  const DB = read('packages/db/package.json');
  const TOOLS = read('tools/package.json');
  const WEB = read('apps/web/package.json');
  const root = (change: (manifest: Manifest) => void) => packages(changed('package.json', ROOT, edit(ROOT, change)));
  const db = (change: (manifest: Manifest) => void) => packages(changed('packages/db/package.json', DB, edit(DB, change)));
  const tools = (change: (manifest: Manifest) => void) => packages(changed('tools/package.json', TOOLS, edit(TOOLS, change)));
  const web = (change: (manifest: Manifest) => void) => packages(changed('apps/web/package.json', WEB, edit(WEB, change)));
  const workspace = (after: string, before: string = YAML) => packages(changed('pnpm-workspace.yaml', before, after));
  /** The workspace file with `text` put in place of `line`, which it must hold. */
  const replaced = (line: string, text: string, from: string = YAML) => {
    if (!from.includes(line)) throw new Error(`pnpm-workspace.yaml holds no "${line}"`);
    return from.replace(line, text);
  };

  it('affects none for a new root script and an edited one (scripts.lint:x, scripts.test)', () => {
    expect(
      root((manifest) => {
        manifest.scripts = { ...manifest.scripts, 'lint:x': 'tsx tools/lint/run.ts --x', test: 'vitest run --project unit' };
      }),
    ).toEqual([]);
  });

  it('affects none for a bump of @next/eslint-plugin-next in the root manifest, which no closure and no tooling imports', () => {
    expect(
      root((manifest) => {
        manifest.devDependencies = { ...manifest.devDependencies, '@next/eslint-plugin-next': '^16.9.0' };
      }),
    ).toEqual([]);
  });

  it('affects all four for the root manifest’s packageManager (with and without its hash), engines, type, name, private, pnpm.overrides, postinstall and prepare', () => {
    const hash = `+sha512.${'ab'.repeat(64)}`;
    for (const [what, change] of [
      ['packageManager', (manifest: Manifest) => void (manifest.packageManager = 'pnpm@10.34.9')],
      ['packageManager with its hash', (manifest: Manifest) => void (manifest.packageManager = `pnpm@10.34.9${hash}`)],
      ['engines', (manifest: Manifest) => void (manifest.engines = { node: '>=24.1' })],
      ['type', (manifest: Manifest) => void (manifest.type = 'commonjs')],
      ['name', (manifest: Manifest) => void (manifest.name = 'therapy')],
      ['private', (manifest: Manifest) => void (manifest.private = false)],
      ['pnpm.overrides', (manifest: Manifest) => void (manifest.pnpm = { overrides: { qs: '6.16.1' } })],
      ['scripts.postinstall', (manifest: Manifest) => void (manifest.scripts = { ...manifest.scripts, postinstall: 'node x.js' })],
      ['scripts.prepare', (manifest: Manifest) => void (manifest.scripts = { ...manifest.scripts, prepare: 'node x.js' })],
    ] as const) {
      expect(root(change), what).toEqual(ALL);
    }
  });

  it('affects all four for the test tooling and what the tooling imports in the root manifest: vitest, @vitest/coverage-v8, @stryker-mutator/core, fast-check, tsx, yaml, and vitest moved from catalog: to a range', () => {
    for (const [name, specifier] of [
      ['vitest', '^5.0.6'],
      ['@vitest/coverage-v8', '^5.0.6'],
      ['@stryker-mutator/core', '^10.1.2'],
      ['fast-check', '^4.10.3'],
      ['tsx', '^4.23.16'],
      ['yaml', '^2.9.1'],
    ] as const) {
      expect(
        root((manifest) => {
          manifest.devDependencies = { ...manifest.devDependencies, [name]: specifier };
        }),
        name,
      ).toEqual(ALL);
    }
  });

  it('affects all four for decimal.js in the root manifest: money imports it, and every closure reaches money', () => {
    expect(
      root((manifest) => {
        manifest.devDependencies = { ...manifest.devDependencies, 'decimal.js': '^10.6.1' };
      }),
    ).toEqual(ALL);
  });

  it('affects all four for a root dependency named node, deno or bun, and for a specifier moved to or from runtime:, workspace:, link:, file: or git', () => {
    for (const name of ['node', 'deno', 'bun']) {
      expect(
        root((manifest) => {
          manifest.devDependencies = { ...manifest.devDependencies, [name]: '^24.22.2' };
        }),
        name,
      ).toEqual(ALL);
    }
    for (const specifier of ['runtime:^24.22.2', 'workspace:*', 'link:./tools/x', 'file:./tools/x', 'git+https://example.test/x.git#abc', 'github:example/x']) {
      const to = edit(ROOT, (manifest) => {
        manifest.devDependencies = { ...manifest.devDependencies, globals: specifier };
      });
      expect(packages(changed('package.json', ROOT, to)), `to ${specifier}`).toEqual(ALL);
      expect(packages(changed('package.json', to, ROOT)), `from ${specifier}`).toEqual(ALL);
    }
  });

  it('affects none for packages/db gaining a script no install runs (scripts.db:domain-model, #3)', () => {
    const without = edit(DB, (manifest) => {
      delete manifest.scripts?.['db:domain-model'];
    });
    const withIt = edit(without, (manifest) => {
      manifest.scripts = { ...manifest.scripts, 'db:domain-model': 'tsx src/cli/domain-model.ts' };
    });
    expect(packages(changed('packages/db/package.json', without, withIt))).toEqual([]);
  });

  it('affects none for tools/package.json gaining playwright-core or @sigstore/verify, which no closure and no tooling imports', () => {
    const without = edit(TOOLS, (manifest) => {
      delete manifest.devDependencies?.['playwright-core'];
    });
    const withIt = edit(without, (manifest) => {
      manifest.devDependencies = { ...manifest.devDependencies, 'playwright-core': 'catalog:' };
    });
    expect(packages(changed('tools/package.json', without, withIt))).toEqual([]);
    expect(
      tools((manifest) => {
        manifest.dependencies = { ...manifest.dependencies, '@sigstore/verify': '^3.1.0' };
      }),
    ).toEqual([]);
  });

  it('affects packages/db’s owners for a workspace: specifier, its exports, its type and a key no table lists', () => {
    const owners = ownersOf('packages/db/package.json');
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.length).toBeLessThan(ALL.length);
    for (const [what, change] of [
      ['a workspace: specifier', (manifest: Manifest) => void (manifest.dependencies = { ...manifest.dependencies, '@tp/money': 'workspace:*' })],
      ['exports', (manifest: Manifest) => void (manifest.exports = { '.': './src/index.ts' })],
      ['type', (manifest: Manifest) => void (manifest.type = 'commonjs')],
      ['an unlisted key', (manifest: Manifest) => void (manifest.sideEffects = false)],
    ] as const) {
      expect(db(change), what).toEqual(owners);
    }
  });

  it('affects all four for packages/db’s postinstall, and for no text, an unread side or invalid JSON there', () => {
    expect(
      db((manifest) => {
        manifest.scripts = { ...manifest.scripts, postinstall: 'node x.js' };
      }),
    ).toEqual(ALL);
    expect(packages({}, ['packages/db/package.json'])).toEqual(ALL);
    expect(packages(changed('packages/db/package.json', undefined, DB))).toEqual(ALL);
    expect(packages(changed('packages/db/package.json', DB, undefined))).toEqual(ALL);
    expect(packages(changed('packages/db/package.json', DB, `${DB.slice(0, -3)},\n`))).toEqual(ALL);
    expect(packages(changed('packages/db/package.json', '{', DB))).toEqual(ALL);
  });

  it('affects all four for prepublishOnly or dependenciesMeta in packages/db or in apps/web', () => {
    const prepublishOnly = (manifest: Manifest) => void (manifest.scripts = { ...manifest.scripts, prepublishOnly: 'node x.js' });
    const dependenciesMeta = (manifest: Manifest) => void (manifest.dependenciesMeta = { '@tp/money': { injected: true } });
    expect(db(prepublishOnly)).toEqual(ALL);
    expect(db(dependenciesMeta)).toEqual(ALL);
    expect(web(prepublishOnly)).toEqual(ALL);
    expect(web(dependenciesMeta)).toEqual(ALL);
  });

  it('affects all four for tools/package.json’s type, imports, prepare, an unlisted key or no text, and its owners for its exports or name', () => {
    for (const [what, change] of [
      ['type', (manifest: Manifest) => void (manifest.type = 'commonjs')],
      ['imports', (manifest: Manifest) => void (manifest.imports = { '#x': './x.ts' })],
      ['scripts.prepare', (manifest: Manifest) => void (manifest.scripts = { ...manifest.scripts, prepare: 'node x.js' })],
      ['an unlisted key', (manifest: Manifest) => void (manifest.sideEffects = false)],
    ] as const) {
      expect(tools(change), what).toEqual(ALL);
    }
    expect(packages({}, ['tools/package.json'])).toEqual(ALL);
    const owners = ownersOf('tools/package.json');
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.length).toBeLessThan(ALL.length);
    expect(tools((manifest) => void (manifest.exports = { ...(manifest.exports as object), './x': './x.ts' }))).toEqual(owners);
    expect(tools((manifest) => void (manifest.name = '@tp/tooling'))).toEqual(owners);
  });

  it('affects none for an edit of tools/package.json’s scripts.screening:capacity', () => {
    expect(
      tools((manifest) => {
        manifest.scripts = { ...manifest.scripts, 'screening:capacity': 'tsx screening-capacity/run.ts --all' };
      }),
    ).toEqual([]);
  });

  it('affects all four for a node entry or a link: specifier in tools/package.json, and its owners for a new workspace: entry', () => {
    expect(
      tools((manifest) => {
        manifest.devDependencies = { ...manifest.devDependencies, node: '^24.22.2' };
      }),
    ).toEqual(ALL);
    expect(
      tools((manifest) => {
        manifest.devDependencies = { ...manifest.devDependencies, x: 'link:../x' };
      }),
    ).toEqual(ALL);
    expect(
      tools((manifest) => {
        manifest.dependencies = { ...manifest.dependencies, '@tp/billing': 'workspace:*' };
      }),
    ).toEqual(ownersOf('tools/package.json'));
  });

  it('affects all four for apps/web gaining a postinstall, and for no text, an unread side or invalid JSON there', () => {
    expect(
      web((manifest) => {
        manifest.scripts = { ...manifest.scripts, postinstall: 'node x.js' };
      }),
    ).toEqual(ALL);
    expect(packages({}, ['apps/web/package.json'])).toEqual(ALL);
    expect(packages(changed('apps/web/package.json', undefined, WEB))).toEqual(ALL);
    expect(packages(changed('apps/web/package.json', WEB, '{"name": "@tp/web",'))).toEqual(ALL);
  });

  it('affects none for apps/web’s scripts.dev or a dependency of its own', () => {
    expect(
      web((manifest) => {
        manifest.scripts = { ...manifest.scripts, dev: 'next dev --port 3001' };
      }),
    ).toEqual([]);
    expect(
      web((manifest) => {
        manifest.dependencies = { ...manifest.dependencies, '@simplewebauthn/browser': '^14.1.0' };
      }),
    ).toEqual([]);
  });

  it('affects all four for the canary’s manifest, which a global glob holds: a script or its exports', () => {
    const file = 'tools/stryker/canary/lib/package.json';
    const text = read(file);
    expect(packages(changed(file, text, edit(text, (manifest) => void (manifest.scripts = { ...manifest.scripts, x: 'node x.js' }))))).toEqual(ALL);
    expect(packages(changed(file, text, edit(text, (manifest) => void (manifest.exports = { '.': './other.ts' }))))).toEqual(ALL);
  });

  it('affects none for a workspace manifest added or deleted with no install script', () => {
    const manifest = json({ name: '@tp/foo', version: '0.0.0', private: true, exports: { '.': './src/index.ts' }, scripts: { build: 'tsc' }, dependencies: { zod: 'catalog:' } });
    expect(packages(changed('apps/foo/package.json', null, manifest))).toEqual([]);
    expect(packages(changed('apps/foo/package.json', manifest, null))).toEqual([]);
  });

  it('affects all four for a workspace manifest added or deleted with a postinstall', () => {
    const manifest = json({ name: '@tp/foo', version: '0.0.0', private: true, scripts: { postinstall: 'node x.js' } });
    expect(packages(changed('apps/foo/package.json', null, manifest))).toEqual(ALL);
    expect(packages(changed('apps/foo/package.json', manifest, null))).toEqual(ALL);
  });

  it('affects all four for a script key holding a newline and a workflow command, and prints it JSON-quoted', () => {
    const key = 'x\n::warning::y';
    const result = judge(changed('apps/web/package.json', WEB, edit(WEB, (manifest) => void (manifest.scripts = { ...manifest.scripts, [key]: 'node x.js' }))));
    expect(result.packages).toEqual(ALL);
    const reasons = Object.values(result.reasons).flat();
    expect(reasons.some((reason) => reason.includes(JSON.stringify(key)))).toBe(true);
    expect(reasons.filter((reason) => reason.includes('\n'))).toEqual([]);
  });

  it('affects none for a catalog line for react or playwright-core, which no closure imports', () => {
    expect(workspace(replaced('  react: ^19.3.1\n', '  react: ^19.3.2\n'))).toEqual([]);
    expect(workspace(replaced('  playwright-core: 1.64.1\n', '  playwright-core: 1.65.0\n'))).toEqual([]);
  });

  it('affects pricing and packets for a catalog zod line: both import zod', () => {
    expect(workspace(replaced('  zod: ^4.6.7\n', '  zod: ^4.6.8\n'))).toEqual(['pricing', 'packets']);
  });

  it('affects none for entries added to minimumReleaseAgeExclude or trustPolicyExclude, which a frozen install never reads', () => {
    expect(workspace(replaced('minimumReleaseAgeExclude: []\n', 'minimumReleaseAgeExclude:\n  - zod@4.6.8\n'))).toEqual([]);
    expect(workspace(replaced('trustPolicyExclude:\n  - semver@6.3.1\n', 'trustPolicyExclude:\n  - semver@6.3.1\n  - semver@5.7.2\n'))).toEqual([]);
  });

  it('affects all four for catalog vitest, packages, onlyBuiltDependencies, overrides, patchedDependencies and nodeLinker', () => {
    for (const [what, after] of [
      ['catalog vitest', replaced('  vitest: ^5.0.5\n', '  vitest: ^5.0.6\n')],
      ['packages', replaced('  - infra\n', '  - infra\n  - docs\n')],
      ['onlyBuiltDependencies', replaced('  - esbuild\n', '  - esbuild\n  - sharp\n')],
      ['overrides', replaced('  typed-rest-client>qs: 6.16.1\n', '  typed-rest-client>qs: 6.16.2\n')],
      ['patchedDependencies', `${YAML}patchedDependencies:\n  zod: patches/zod.patch\n`],
      ['nodeLinker', `${YAML}nodeLinker: hoisted\n`],
    ] as const) {
      expect(workspace(after), what).toEqual(ALL);
    }
  });

  it('affects all four for a YAML anchor, alias or merge key on either side', () => {
    for (const [what, after] of [
      ['an anchor', replaced('  zod: ^4.6.7\n', '  zod: &zod ^4.6.7\n')],
      ['an alias', `${replaced('  zod: ^4.6.7\n', '  zod: &zod ^4.6.7\n')}x: *zod\n`],
      ['a merge key', replaced('catalog:\n', 'catalog:\n  <<: { left-pad: ^1.3.0 }\n')],
    ] as const) {
      expect(workspace(after), `${what}, after`).toEqual(ALL);
      expect(workspace(YAML, after), `${what}, before`).toEqual(ALL);
    }
  });

  it('affects all four for a blank line or a column-0 comment inside packages, which the mutation tooling’s own reading sees', () => {
    expect(workspace(replaced('  - infra\n', '  - infra\n\n'))).toEqual(ALL);
    expect(workspace(replaced('  - infra\n', '  - infra\n# a comment\n'))).toEqual(ALL);
  });

  it('affects all four for an explicit tag, a duplicate key, or a global key’s scalar rewritten to the same value', () => {
    expect(workspace(replaced('  zod: ^4.6.7\n', '  zod: !!str ^4.6.7\n'))).toEqual(ALL);
    expect(workspace(`${YAML}minimumReleaseAge: 4320\n`)).toEqual(ALL);
    expect(workspace(replaced('  - esbuild\n', '  - "esbuild"\n'))).toEqual(ALL);
  });

  it('affects none for reordered scripts or catalog entries alone', () => {
    const reversed = (map: Record<string, string> | undefined) => Object.fromEntries(Object.entries(map ?? {}).reverse());
    expect(root((manifest) => void (manifest.scripts = reversed(manifest.scripts)))).toEqual([]);
    expect(workspace(replaced('  react: ^19.3.1\n  react-dom: ^19.3.1\n', '  react-dom: ^19.3.1\n  react: ^19.3.1\n'))).toEqual([]);
  });

  it('affects the owners for two reordered exports conditions, and all four for two reordered overrides', () => {
    const conditions = (manifest: Manifest, order: readonly string[]) => {
      manifest.exports = { '.': Object.fromEntries(order.map((condition) => [condition, './src/index.ts'])) };
    };
    const before = edit(DB, (manifest) => conditions(manifest, ['import', 'default']));
    const after = edit(DB, (manifest) => conditions(manifest, ['default', 'import']));
    expect(packages(changed('packages/db/package.json', before, after))).toEqual(ownersOf('packages/db/package.json'));
    const two = replaced('  typed-rest-client>qs: 6.16.1\n', '  typed-rest-client>qs: 6.16.1\n  left-pad: 1.3.0\n');
    expect(workspace(replaced('  typed-rest-client>qs: 6.16.1\n  left-pad: 1.3.0\n', '  left-pad: 1.3.0\n  typed-rest-client>qs: 6.16.1\n', two), two)).toEqual(ALL);
  });

  it('affects all four for invalid JSON or YAML on either side, an unread side, or no text in the root manifest, the workspace file or the workflow', () => {
    const WORKFLOW = read('.github/workflows/mutation.yml');
    for (const [file, text, invalid] of [
      ['package.json', ROOT, '{"name": '],
      ['pnpm-workspace.yaml', YAML, 'packages: [\n'],
      ['.github/workflows/mutation.yml', WORKFLOW, 'jobs: {\n'],
    ] as const) {
      expect(packages(changed(file, text, invalid)), `${file}: invalid after`).toEqual(ALL);
      expect(packages(changed(file, invalid, text)), `${file}: invalid before`).toEqual(ALL);
      expect(packages(changed(file, undefined, text)), `${file}: unread before`).toEqual(ALL);
      expect(packages(changed(file, text, undefined)), `${file}: unread after`).toEqual(ALL);
      expect(packages({}, [file]), `${file}: no text`).toEqual(ALL);
    }
  });

  it('affects none for comments alone (a YAML comment outside packages) or JSON whitespace', () => {
    expect(workspace(replaced('  zod: ^4.6.7\n', '  # the schema library\n  zod: ^4.6.7 # pinned by catalog\n'))).toEqual([]);
    expect(packages(changed('package.json', ROOT, `${JSON.stringify(JSON.parse(ROOT), null, 4)}\n\n`))).toEqual([]);
    expect(packages(changed('packages/db/package.json', DB, JSON.stringify(JSON.parse(DB))))).toEqual([]);
  });
});

describe('on a synthetic world: the mirror rule’s closures and the files a shard loads by path', () => {
  const world = syntheticWorld();
  const closures = closuresOf(world);
  const global = globalFiles(world.root, world.files, SYNTHETIC);
  const packages = (texts: Texts) => affected({ files: Object.keys(texts), texts }, closures, global).packages;
  const text = (file: string) => readFileSync(path.join(world.root, file), 'utf8');
  afterAll(() => world.remove());

  it('affects pricing alone for a root dependency only pricing’s closure imports', () => {
    const before = text('package.json');
    expect(packages(changed('package.json', before, edit(before, (manifest) => void (manifest.devDependencies = { beta: '^1.0.0' }))))).toEqual(['pricing']);
  });

  it('affects the packages whose closure holds the files that import a dependency of packages/db, fewer than its owners', () => {
    const before = text('packages/db/package.json');
    const owners = closures.filter((closure) => closure.manifests.includes('packages/db/package.json')).map((closure) => closure.pkg);
    expect(owners).toEqual(['pricing', 'ledger', 'packets']);
    expect(packages(changed('packages/db/package.json', before, edit(before, (manifest) => void (manifest.dependencies = { alpha: '^1.1.0' }))))).toEqual(['pricing', 'packets']);
  });

  it('affects all four for the name or exports of a manifest whose name a by-path-loaded test imports, and for another manifest taking that name', () => {
    const canary = text('tools/canary/package.json');
    expect(packages(changed('tools/canary/package.json', canary, edit(canary, (manifest) => void (manifest.name = '@tp/canary-lib'))))).toEqual(ALL);
    expect(packages(changed('tools/canary/package.json', canary, edit(canary, (manifest) => void (manifest.exports = { '.': './other.ts' }))))).toEqual(ALL);
    const site = text('apps/site/package.json');
    expect(packages(changed('apps/site/package.json', site, edit(site, (manifest) => void (manifest.name = '@tp/canary'))))).toEqual(ALL);
  });

  it('affects all four for a root or catalog entry of a package only a by-path-loaded test imports', () => {
    const before = text('package.json');
    expect(packages(changed('package.json', before, edit(before, (manifest) => void (manifest.devDependencies = { 'only-loaded': '^1.0.0' }))))).toEqual(ALL);
    const yaml = text('pnpm-workspace.yaml');
    expect(packages(changed('pnpm-workspace.yaml', yaml, `${yaml}  only-loaded: ^1.0.0\n`))).toEqual(ALL);
  });
});

describe('on a synthetic world: a manifest edit that captures an import a closure makes', () => {
  /** money's test imports @tp/helper; apps/site, listed first, may take that name. */
  const base = (siteName: string): World => {
    const world = new World().write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n').write('package.json', json({ name: 'root' }));
    for (const pkg of [...MUTATION_PACKAGES, 'helper']) world.write(`packages/${pkg}/package.json`, json({ name: `@tp/${pkg}`, exports: { '.': './src/index.ts' } }));
    world.write('packages/money/src/index.ts', 'export const cents = 1;\n').write('packages/helper/src/index.ts', 'export const helper = 1;\n');
    world.write('packages/money/src/index.test.ts', "import { it } from 'vitest';\nimport { helper } from '@tp/helper';\nimport { cents } from './index';\nit('a', () => [helper, cents]);\n");
    for (const pkg of ['pricing', 'ledger', 'packets']) world.write(`packages/${pkg}/src/index.ts`, 'export const x = 1;\n');
    return world.write('apps/site/package.json', json({ name: siteName, exports: { '.': './src/page.ts' } })).write('apps/site/src/page.ts', 'export const helper = 2;\n');
  };
  const worlds = { before: base('@tp/site'), captures: base('@tp/helper'), capturesNone: base('@tp/nobody') };
  afterAll(() => Object.values(worlds).forEach((world) => world.remove()));
  const judge = (head: World): readonly MutationPackage[] => {
    const closures: Closure[] = unionClosures(closuresOf(head), closuresOf(worlds.before));
    const global: GlobalInputs = unionGlobal(globalFiles(head.root, head.files, SYNTHETIC), globalFiles(worlds.before.root, worlds.before.files, SYNTHETIC));
    const before = readFileSync(path.join(worlds.before.root, 'apps/site/package.json'), 'utf8');
    const after = readFileSync(path.join(head.root, 'apps/site/package.json'), 'utf8');
    return affected({ files: ['apps/site/package.json'], texts: changed('apps/site/package.json', before, after) }, closures, global).packages;
  };

  it('affects the closure’s packages for a name that captures the import, and none for one that captures nothing', () => {
    expect(judge(worlds.captures)).toEqual(['money']);
    expect(judge(worlds.capturesNone)).toEqual([]);
  });
});
