import { CST, Lexer, type Node as YamlNode, isMap, isScalar, isSeq, parseDocument } from 'yaml';

import { type MutationPackage, type Shard, readShards } from '../../stryker/base.mjs';
import { type Change, type Closure, type GlobalInputs, RUNNER_PROOF_SHARD, globToRegExp } from './affected';
import { packagesOf, shardNamed, shardsOf } from './shards';
import { workspacePatterns } from './workspace';

/**
 * The root manifest, the workspace file, the mutation workflow and every workspace package's manifest, read field by
 * field on both sides of a change, for the mutation workflow's changes job (docs/adr/0066, Part 7; test matrix CI-27
 * and CI-28). A field affects every package, the packages whose closures read it, or none:
 *
 * - **Every package**: what the install, pnpm or Node reads for every shard (`packageManager`, `engines`, `type`, `name`
 *   and `pnpm` in the root; an install script, `prepublishOnly` or `dependenciesMeta` in any workspace manifest; the
 *   workspace's `packages`, as YAML and as tools/stryker/workspace.ts reads it, `onlyBuiltDependencies`, `overrides`,
 *   `patchedDependencies`), the test tooling and what the mutation tooling imports, a root dependency named for a
 *   runtime or not specified from the registry, and every key no table lists (fail closed). So is a file not read on
 *   one side, one that does not parse, a YAML anchor, alias, merge key, tag, directive or duplicate key, and a key or
 *   a manifest's path holding a control character.
 * - **Some packages**: a dependency or catalog entry by the closures that import it (the mirror rule: the lockfile
 *   rule names the same packages whenever the lockfile moves with it), and the module fields of a closure's own
 *   manifest by the packages whose closure lists it (its owners).
 * - **None**: every other script (no mutation step runs one: the workflow's `run:` lines are held to an allowlist),
 *   a dependency or catalog entry no closure and no tooling imports, the release-age and trust settings (a frozen
 *   install never reads them), comments and layout, and an entry's position in a map compared entry by entry.
 * - **The workflow**: equal after each step reference pinned to a full SHA on both sides, with the same action and
 *   path, has its SHA removed (never an artifact action's, which carry the reports to the gate): the runner-proof
 *   shard alone, whose canary and the gate prove the new pins on the runner; otherwise every package, comments alone
 *   none.
 *
 * Each field is compared in order (an `exports` condition or an override reordered is a change); scripts, dependency
 * maps and catalogs entry by entry. A reason prints a key by this file's own name for it, or JSON-quoted, so no key
 * the change holds starts a workflow command in the job's log or summary. A manifest a closure or the mutation tooling
 * reads as a file (an import of a package.json, a data entry) is not classified: it affects what reads it, whole.
 */

/** The root manifest, the workspace file and the mutation workflow: the three files classified by name. */
export const ROOT_MANIFEST = 'package.json';
export const WORKSPACE_FILE = 'pnpm-workspace.yaml';
export const MUTATION_WORKFLOW = '.github/workflows/mutation.yml';
export const NAMED_FILES = [ROOT_MANIFEST, WORKSPACE_FILE, MUTATION_WORKFLOW] as const;

/** The scripts pnpm runs on an install, in every workspace project it installs (and prepublishOnly for an injected one). */
export const LIFECYCLE_SCRIPTS = ['pnpm:devPreinstall', 'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare', 'prepublishOnly'] as const;

/** Dependency names that would link a runtime's bin into the root's node_modules/.bin, ahead of the pinned Node. */
export const RUNTIME_NAMES = ['node', 'deno', 'bun'] as const;

/** A manifest's dependency maps, each judged entry by entry (and the lockfile's importer fields of the same names). */
export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

/** pnpm-workspace.yaml keys a frozen install never reads (pnpm 10 reads them only when it resolves). */
export const WORKSPACE_INERT_KEYS = ['minimumReleaseAge', 'minimumReleaseAgeExclude', 'trustPolicy', 'trustPolicyExclude', 'trustPolicyIgnoreAfter'] as const;

/** A pinned step reference, `owner/repo[/path]@<40 hex>`: tools/check-action-pins/workflows.ts PIN, copied so this rule stands on its own. */
export const PINNED_USES = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})$/;

/** The actions that carry the shards' reports to the gate: a one-shard run cannot prove a merge of several, so a move of either is never pin-only. */
export const TRANSPORT_ACTIONS = ['actions/upload-artifact', 'actions/download-artifact'] as const;

/** What a classified file's change affects: every package (each field with why), the packages its fields name, and the fields read and found inert. */
export interface ManifestVerdict {
  readonly file: string;
  readonly global: readonly string[];
  readonly packages: Readonly<Partial<Record<MutationPackage, readonly string[]>>>;
  readonly inert: readonly string[];
}

/** The longest specifier read as a registry range; anything longer is judged as not one. */
const MAX_SPECIFIER = 256;
const XR = String.raw`(?:[xX*]|0|[1-9]\d*)`;
const PARTIAL = String.raw`v?${XR}(?:\.${XR}(?:\.${XR}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)?)?`;
const SIMPLE = String.raw`(?:(?:[<>]=?|=|~>?|\^)\s*)?${PARTIAL}`;
const RANGE = String.raw`(?:${PARTIAL}\s+-\s+${PARTIAL}|${SIMPLE}(?:\s+${SIMPLE})*)`;
/** A semver version or range, node-semver's grammar (`||`, hyphen ranges, x-ranges, `~`, `^`, comparators); empty is any version. */
const REGISTRY_RANGE = new RegExp(String.raw`^\s*(?:${RANGE})?(?:\s*\|\|\s*(?:${RANGE})?)*\s*$`);
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

/**
 * Whether a dependency specifier installs from the registry: a version or range, `catalog:` or `catalog:<name>`, or an
 * `npm:<name>[@<range>]` alias. Not `workspace:`, `link:`, `file:`, `runtime:`, a git, GitHub or tarball URL, a path or
 * a dist-tag, each of which installs or links what no registry version records.
 */
export function isRegistrySpecifier(specifier: string): boolean {
  if (specifier.length > MAX_SPECIFIER) return false;
  if (/^catalog:[A-Za-z0-9._-]*$/.test(specifier)) return true;
  if (specifier.startsWith('npm:')) {
    const alias = specifier.slice(4);
    const at = alias.lastIndexOf('@');
    const [name, range] = at > 0 ? [alias.slice(0, at), alias.slice(at + 1)] : [alias, ''];
    return PACKAGE_NAME.test(name) && REGISTRY_RANGE.test(range);
  }
  return REGISTRY_RANGE.test(specifier);
}

/** Whether a key holds a control character or a line or paragraph separator, which a log could read as a new line. */
export function hasControlCharacter(key: string): boolean {
  for (const char of key) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

/** A key or path the change holds, JSON-quoted, and each character JSON leaves bare that hasControlCharacter names (DEL, C1, the two separators) escaped too. */
export function quoted(key: string): string {
  return JSON.stringify(key).replace(/[\u007f-\u009f\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** The keys this file's tables name: printed as they are, every other key JSON-quoted. */
const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'packageManager',
  'engines',
  'devEngines',
  'type',
  'name',
  'private',
  'pnpm',
  'scripts',
  'exports',
  'imports',
  'main',
  'dependenciesMeta',
  ...DEPENDENCY_FIELDS,
  'packages',
  'catalog',
  'catalogs',
  'onlyBuiltDependencies',
  'neverBuiltDependencies',
  'ignoredBuiltDependencies',
  'overrides',
  'patchedDependencies',
  'packageExtensions',
  'ignoredOptionalDependencies',
  ...WORKSPACE_INERT_KEYS,
]);

const field = (key: string): string => (KNOWN_KEYS.has(key) ? key : quoted(key));

type JsonMap = ReadonlyMap<string, unknown>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An object's own entries as a map (so a key such as `__proto__` is an entry like any other), or undefined for anything else. */
const entriesOf = (value: unknown): JsonMap | undefined => (isObject(value) ? new Map(Object.entries(value)) : undefined);

/** Two parsed values equal as written: keys in their order. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The keys whose values differ between two maps (a missing map is empty), or undefined when either side is not a map. */
function changedKeys(before: unknown, after: unknown): string[] | undefined {
  const b = before === undefined ? new Map<string, unknown>() : entriesOf(before);
  const a = after === undefined ? new Map<string, unknown>() : entriesOf(after);
  if (b === undefined || a === undefined) return undefined;
  return [...new Set([...b.keys(), ...a.keys()])].filter((key) => !same(b.get(key), a.get(key)));
}

/** A JSON manifest's text as its top-level map, or undefined when it is not a JSON object. */
function readManifest(text: string): JsonMap | undefined {
  try {
    return entriesOf(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** A YAML file as its value and every scalar's source text by path, or why it cannot be compared (fail closed). */
interface YamlRead {
  readonly value: unknown;
  /** Each scalar, keys included, in document order: its path's first key, and its path (a key's own scalar marked `#key`) and source text. */
  readonly scalars: readonly { readonly top: string; readonly path: string; readonly source: string }[];
}

function readYaml(text: string): YamlRead | string {
  const doc = parseDocument(text, { prettyErrors: false });
  const error = doc.errors[0];
  if (error !== undefined) return `a YAML error (${error.code})`;
  const warning = doc.warnings[0];
  if (warning !== undefined) return `a YAML warning (${warning.code})`;
  for (const token of new Lexer().lex(text)) {
    const type = CST.tokenType(token);
    if (type === 'anchor' || type === 'alias' || type === 'tag' || type === 'directive-line' || type === 'byte-order-mark') return `a YAML ${type}`;
  }
  const scalars: { top: string; path: string; source: string }[] = [];
  let merge = false;
  const walk = (node: YamlNode | null | undefined, at: readonly string[], isKey: boolean): void => {
    if (node === null || node === undefined) return;
    if (isScalar(node)) {
      const range = node.range ?? [0, 0, 0];
      scalars.push({ top: at[0] ?? '', path: `${at.map(quoted).join('.')}${isKey ? '#key' : ''}`, source: text.slice(range[0], range[1]) });
    } else if (isMap(node)) {
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? String(pair.key.value) : '?';
        if (key === '<<') merge = true;
        walk(pair.key as YamlNode | null, [...at, key], true);
        walk(pair.value as YamlNode | null, [...at, key], false);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item as YamlNode | null, [...at, String(index)], false));
    }
  };
  walk(doc.contents, [], false);
  if (merge) return 'a YAML merge key';
  try {
    return { value: doc.toJS() as unknown, scalars };
  } catch {
    return 'a YAML value that does not convert';
  }
}

/** The verdict being built for one file. */
class Judgement {
  private readonly everyPackage: string[] = [];
  private readonly some: Partial<Record<MutationPackage, string[]>> = {};
  private readonly none: string[] = [];

  constructor(readonly file: string) {}

  /** The file as a reason prints it: JSON-quoted when its path holds a control character, as a key is. */
  private get shown(): string {
    return hasControlCharacter(this.file) ? quoted(this.file) : this.file;
  }

  private line(what: string, why: string): string {
    return what === '' ? `${this.shown} (${why})` : `${this.shown} ${what} (${why})`;
  }

  global(what: string, why: string): void {
    this.everyPackage.push(this.line(what, `${why}, every package`));
  }

  packages(packages: readonly MutationPackage[], what: string, why: string): void {
    if (packages.length === 0) {
      this.inert(what, `${why}: no closure lists it`);
      return;
    }
    for (const pkg of packages) (this.some[pkg] ??= []).push(this.line(what, why));
  }

  /** The runner-proof shard's packages, for a pin-only change of the workflow. */
  proved(packages: readonly MutationPackage[], text: string): void {
    for (const pkg of packages) (this.some[pkg] ??= []).push(`${this.shown} ${text}`);
  }

  inert(what: string, why: string): void {
    this.none.push(this.line(what, why));
  }

  verdict(): ManifestVerdict {
    return { file: this.file, global: this.everyPackage, packages: this.some, inert: this.none };
  }
}

interface Context {
  readonly closures: readonly Closure[];
  readonly global: GlobalInputs;
  readonly tooling: readonly RegExp[];
  /** Every name a file of the mutation tooling, or one a shard loads by path, imports by name. */
  readonly globalNames: ReadonlySet<string>;
}

/** How a manifest's dependencies are read: the root's, a manifest of the mutation tooling's own package, a closure's, or one outside every closure. */
type Kind = 'root' | 'holding' | 'closure' | 'other';

/**
 * The mirror rule for a dependency or catalog entry: the test tooling or a name the mutation tooling imports affects
 * every package; a name the closures import (any of their files for the root and the catalog, else the files of the
 * manifest's own directory) affects those packages; any other name, none.
 */
function mirror(judgement: Judgement, what: string, name: string, directory: string | undefined, context: Context): void {
  if (context.tooling.some((pattern) => pattern.test(name))) return judgement.global(what, 'the test tooling');
  if (context.globalNames.has(name)) return judgement.global(what, 'the mutation tooling imports it');
  const importers = context.closures.filter((closure) => (directory === undefined ? [...closure.imports.values()].some((names) => names.has(name)) : closure.imports.get(directory)?.has(name) === true)).map((closure) => closure.pkg);
  if (importers.length > 0) judgement.packages(importers, what, `imported by ${importers.join(', ')}`);
  else judgement.inert(what, 'imported by no closure and no tooling');
}

/** Scripts entry by entry: an install script affects every package, any other none. */
function scripts(judgement: Judgement, before: unknown, after: unknown): void {
  const keys = changedKeys(before, after);
  if (keys === undefined) return judgement.global('scripts', 'not a map');
  for (const name of keys) {
    const what = `scripts.${quoted(name)}`;
    if (hasControlCharacter(name)) judgement.global(what, 'a key holding a control character');
    else if ((LIFECYCLE_SCRIPTS as readonly string[]).includes(name)) judgement.global(what, 'an install script');
    else judgement.inert(what, 'no mutation step runs it');
  }
}

/** A dependency map entry by entry, as its manifest's kind reads it. */
function dependencies(judgement: Judgement, key: string, before: unknown, after: unknown, kind: Kind, directory: string, owners: readonly MutationPackage[], context: Context): void {
  const keys = changedKeys(before, after);
  if (keys === undefined) return judgement.global(key, 'not a map');
  const b = entriesOf(before) ?? new Map<string, unknown>();
  const a = entriesOf(after) ?? new Map<string, unknown>();
  for (const name of keys) {
    const what = `${key}.${quoted(name)}`;
    if (hasControlCharacter(name)) {
      judgement.global(what, 'a key holding a control character');
      continue;
    }
    if (kind === 'other') {
      judgement.inert(what, 'a dependency of a manifest no closure lists');
      continue;
    }
    const specifiers = [b.get(name), a.get(name)].filter((specifier) => specifier !== undefined);
    if (!specifiers.every((specifier): specifier is string => typeof specifier === 'string')) {
      judgement.global(what, 'not a specifier');
      continue;
    }
    const workspace = specifiers.some((specifier) => specifier.startsWith('workspace:'));
    if (kind === 'closure' && workspace) {
      judgement.packages(owners, what, 'a workspace: specifier of its closure’s manifest');
      continue;
    }
    if (kind === 'root' || kind === 'holding') {
      if ((RUNTIME_NAMES as readonly string[]).includes(name)) {
        judgement.global(what, 'named for a runtime');
        continue;
      }
      if (kind === 'holding' && workspace) {
        if (context.globalNames.has(name)) judgement.global(what, 'the mutation tooling imports it');
        else judgement.packages(owners, what, 'a workspace: specifier of its closure’s manifest');
        continue;
      }
      if (!specifiers.every(isRegistrySpecifier)) {
        judgement.global(what, 'not a registry version or range');
        continue;
      }
    }
    mirror(judgement, what, name, kind === 'root' ? undefined : directory, context);
  }
}

/** The root manifest: its scripts and dependencies by entry, and every other key global. */
function classifyRoot(judgement: Judgement, before: string, after: string, context: Context): void {
  const b = readManifest(before);
  const a = readManifest(after);
  if (b === undefined || a === undefined) return judgement.global('', 'not a JSON object on one side');
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    if (same(b.get(key), a.get(key))) continue;
    if (hasControlCharacter(key)) judgement.global(quoted(key), 'a key holding a control character');
    else if (key === 'scripts') scripts(judgement, b.get(key), a.get(key));
    else if ((DEPENDENCY_FIELDS as readonly string[]).includes(key)) dependencies(judgement, key, b.get(key), a.get(key), 'root', '.', [], context);
    else judgement.global(field(key), KNOWN_KEYS.has(key) ? 'read by the install or every step' : 'a key no table lists');
  }
}

/**
 * A workspace package's manifest, an absent side read as `{}`: its install scripts and dependenciesMeta affect every
 * package; its name and exports every package when a file the mutation tooling loads imports that name, else its
 * owners (none outside every closure: a name that captures a closure's import makes it a closure's manifest); its
 * dependencies by the mirror rule; any other key every package in the mutation tooling's own package, its owners in a
 * closure's, none in any other.
 */
function classifyPackage(judgement: Judgement, before: string | null, after: string | null, context: Context): void {
  const b = before === null ? new Map<string, unknown>() : readManifest(before);
  const a = after === null ? new Map<string, unknown>() : readManifest(after);
  if (b === undefined || a === undefined) return judgement.global('', 'not a JSON object on one side');
  const directory = judgement.file.slice(0, -'/package.json'.length);
  const owners = context.closures.filter((closure) => closure.manifests.includes(judgement.file)).map((closure) => closure.pkg);
  const kind: Kind = context.global.holding.has(directory) ? 'holding' : owners.length > 0 ? 'closure' : 'other';
  const loadedName = [b.get('name'), a.get('name')].some((name) => typeof name === 'string' && context.globalNames.has(name));
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    if (same(b.get(key), a.get(key))) continue;
    if (hasControlCharacter(key)) judgement.global(quoted(key), 'a key holding a control character');
    else if (key === 'scripts') scripts(judgement, b.get(key), a.get(key));
    else if ((DEPENDENCY_FIELDS as readonly string[]).includes(key)) dependencies(judgement, key, b.get(key), a.get(key), kind, directory, owners, context);
    else if (key === 'dependenciesMeta') judgement.global(key, 'an install setting (injected packages run their install scripts)');
    else if (key === 'name' || key === 'exports') {
      if (loadedName) judgement.global(key, 'the mutation tooling imports this package by name');
      else if (kind === 'other') judgement.inert(key, 'no closure resolves through it');
      else judgement.packages(owners, key, 'resolves its closure’s imports');
    } else if (kind === 'holding') judgement.global(field(key), 'a field of the mutation tooling’s own package');
    else if (kind === 'closure') judgement.packages(owners, field(key), 'a field of its closure’s manifest');
    else judgement.inert(field(key), 'a field of a manifest no closure lists');
  }
}

/** Every scalar's source text under one top-level key. */
const sourcesUnder = (read: YamlRead, top: string): string[] => read.scalars.filter((scalar) => scalar.top === top).map((scalar) => `${scalar.path}=${scalar.source}`);

/** pnpm-workspace.yaml: `packages` by both readings, catalogs by entry, the release-age and trust keys inert, every other key global and compared by its scalars' source text too. */
function classifyWorkspace(judgement: Judgement, before: string, after: string, context: Context): void {
  const b = readYaml(before);
  const a = readYaml(after);
  if (typeof b === 'string') return judgement.global('', `${b} before`);
  if (typeof a === 'string') return judgement.global('', `${a} after`);
  const bv = entriesOf(b.value ?? {});
  const av = entriesOf(a.value ?? {});
  if (bv === undefined || av === undefined) return judgement.global('', 'not a map on one side');
  const readings = (text: string): string | undefined => {
    try {
      return JSON.stringify(workspacePatterns(text));
    } catch {
      return undefined;
    }
  };
  const [patternsBefore, patternsAfter] = [readings(before), readings(after)];
  for (const key of new Set(['packages', ...bv.keys(), ...av.keys()])) {
    const sourcesSame = same(sourcesUnder(b, key), sourcesUnder(a, key));
    if (key === 'packages') {
      if (patternsBefore === undefined || patternsAfter === undefined) judgement.global('packages', 'the mutation tooling cannot read it on one side');
      else if (patternsBefore !== patternsAfter) judgement.global('packages', 'as the mutation tooling reads it');
      else if (!same(bv.get(key), av.get(key)) || !sourcesSame) judgement.global('packages', 'the workspace list');
      continue;
    }
    if (hasControlCharacter(key)) {
      if (!same(bv.get(key), av.get(key)) || !sourcesSame) judgement.global(quoted(key), 'a key holding a control character');
      continue;
    }
    if (key === 'catalog') catalog(judgement, 'catalog', bv.get(key), av.get(key), context);
    else if (key === 'catalogs') {
      const names = changedKeys(bv.get(key), av.get(key));
      if (names === undefined) judgement.global('catalogs', 'not a map');
      else for (const name of names) catalog(judgement, `catalogs.${quoted(name)}`, entriesOf(bv.get(key))?.get(name), entriesOf(av.get(key))?.get(name), context);
    } else if ((WORKSPACE_INERT_KEYS as readonly string[]).includes(key)) {
      if (!same(bv.get(key), av.get(key))) judgement.inert(key, 'a frozen install never reads it');
    } else if (!same(bv.get(key), av.get(key)) || !sourcesSame) judgement.global(field(key), KNOWN_KEYS.has(key) ? 'read by the install' : 'a key no table lists');
  }
}

/** A catalog entry by entry, by the mirror rule, as the root's dependencies are. */
function catalog(judgement: Judgement, what: string, before: unknown, after: unknown, context: Context): void {
  const keys = changedKeys(before, after);
  if (keys === undefined) return judgement.global(what, 'not a map');
  const b = entriesOf(before) ?? new Map<string, unknown>();
  const a = entriesOf(after) ?? new Map<string, unknown>();
  for (const name of keys) {
    const entry = `${what}.${quoted(name)}`;
    const specifiers = [b.get(name), a.get(name)].filter((specifier) => specifier !== undefined);
    if (hasControlCharacter(name)) judgement.global(entry, 'a key holding a control character');
    else if ((RUNTIME_NAMES as readonly string[]).includes(name)) judgement.global(entry, 'named for a runtime');
    else if (!specifiers.every((specifier) => typeof specifier === 'string' && isRegistrySpecifier(specifier))) judgement.global(entry, 'not a registry version or range');
    else mirror(judgement, entry, name, undefined, context);
  }
}

/** The steps' pinned references of a parsed workflow, by job and step: each one's action and path, and its SHA. */
function pinnedSteps(workflow: unknown): Map<string, { readonly action: string; readonly sha: string }> {
  const found = new Map<string, { action: string; sha: string }>();
  const jobs = entriesOf(entriesOf(workflow)?.get('jobs'));
  for (const [id, job] of jobs ?? []) {
    const steps = entriesOf(job)?.get('steps');
    if (!Array.isArray(steps)) continue;
    steps.forEach((step: unknown, index) => {
      const uses = entriesOf(step)?.get('uses');
      const pin = typeof uses === 'string' ? PINNED_USES.exec(uses) : null;
      if (pin !== null) found.set(`${quoted(id)}.${String(index)}`, { action: `${pin[1] ?? ''}${pin[2] ?? ''}`, sha: pin[3] ?? '' });
    });
  }
  return found;
}

/** A parsed workflow with the given steps' references' SHAs removed. */
function withoutShas(workflow: unknown, steps: ReadonlySet<string>): unknown {
  const copy = JSON.parse(JSON.stringify(workflow ?? null)) as unknown;
  for (const [id, job] of Object.entries(isObject(copy) && isObject(copy.jobs) ? copy.jobs : {})) {
    const list = isObject(job) ? job.steps : undefined;
    if (!Array.isArray(list)) continue;
    list.forEach((step: unknown, index) => {
      if (steps.has(`${quoted(id)}.${String(index)}`) && isObject(step) && typeof step.uses === 'string') step.uses = step.uses.replace(/@[0-9a-f]{40}$/, '@');
    });
  }
  return copy;
}

/**
 * The mutation workflow: comments and layout alone affect none; a change that is equal once every step reference
 * pinned to a full SHA on both sides, of the same action and path and not an artifact action, has its SHA removed is
 * proved on the runner-proof shard; anything else affects every package.
 */
function classifyWorkflow(judgement: Judgement, before: string, after: string, shards: readonly Shard[]): void {
  const b = readYaml(before);
  const a = readYaml(after);
  if (typeof b === 'string') return judgement.global('', `${b} before`);
  if (typeof a === 'string') return judgement.global('', `${a} after`);
  /** Every scalar's path and source text, a moved reference's SHA removed. */
  const sources = (read: YamlRead, moved: ReadonlyMap<string, string>) =>
    read.scalars.map((scalar) => {
      const sha = moved.get(scalar.path);
      return `${scalar.path}=${sha === undefined ? scalar.source : scalar.source.replace(sha, '')}`;
    });
  if (same(b.value, a.value) && same(sources(b, new Map()), sources(a, new Map()))) return judgement.inert('', 'comments or layout only');
  const pinsBefore = pinnedSteps(b.value);
  const pinsAfter = pinnedSteps(a.value);
  const substituted = new Set<string>();
  const movedBefore = new Map<string, string>();
  const movedAfter = new Map<string, string>();
  for (const [step, pin] of pinsAfter) {
    const was = pinsBefore.get(step);
    if (was === undefined || was.action !== pin.action) continue;
    if ((TRANSPORT_ACTIONS as readonly string[]).some((action) => pin.action.toLowerCase() === action || pin.action.toLowerCase().startsWith(`${action}/`))) continue;
    substituted.add(step);
    // The scalar's path as readYaml writes it: jobs, the job, steps, the index, uses.
    const [id = '', index = ''] = [step.slice(0, step.lastIndexOf('.')), step.slice(step.lastIndexOf('.') + 1)];
    const path = [quoted('jobs'), id, quoted('steps'), quoted(index), quoted('uses')].join('.');
    movedBefore.set(path, was.sha);
    movedAfter.set(path, pin.sha);
  }
  const moved = [...substituted].filter((step) => pinsBefore.get(step)?.sha !== pinsAfter.get(step)?.sha);
  const pinOnly = moved.length > 0 && same(withoutShas(b.value, substituted), withoutShas(a.value, substituted)) && same(sources(b, movedBefore), sources(a, movedAfter));
  if (!pinOnly) return judgement.global(differences(b.value, a.value), 'a workflow change other than step pins');
  const shard = shardNamed(RUNNER_PROOF_SHARD, shards);
  const proof = packagesOf(shard);
  const whole = proof.length > 0 && proof.every((pkg) => shardsOf(pkg, shards).every((other) => other.name === shard.name));
  if (!whole) return judgement.global('', `step references only, but ${RUNNER_PROOF_SHARD} does not hold its packages whole`);
  judgement.proved(proof, `step references only: runner proved on ${RUNNER_PROOF_SHARD}`);
}

/** The first paths at which two parsed documents differ, for the reason line. */
function differences(before: unknown, after: unknown): string {
  const found: string[] = [];
  const walk = (b: unknown, a: unknown, at: readonly string[]): void => {
    if (found.length >= 3 || same(b, a)) return;
    if (isObject(b) && isObject(a)) for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) walk(b[key], a[key], [...at, quoted(key)]);
    else if (Array.isArray(b) && Array.isArray(a) && b.length === a.length) b.forEach((item: unknown, index) => walk(item, a[index], [...at, String(index)]));
    else found.push(at.length === 0 ? '(the document)' : at.join('.'));
  };
  walk(before, after, []);
  return found.length === 0 ? '(its source text)' : found.join(', ');
}

/** Whether a changed path is a workspace package's manifest, by the workspace's globs on either side. */
export function isWorkspaceManifest(file: string, global: GlobalInputs): boolean {
  return file.endsWith('/package.json') && global.workspaceManifests.some((glob) => globToRegExp(glob).test(file));
}

/**
 * The manifest globs a workspace file lists, by both readings of `packages` (the YAML, which pnpm installs from, and
 * tools/stryker/workspace.ts's, which the aliases and closures use), so a project either reading holds is read: each
 * pattern's `package.json`; exclusions are left out, which only widens what is read.
 */
export function workspaceManifestGlobs(text: string): string[] {
  const patterns = new Set<string>();
  try {
    for (const pattern of workspacePatterns(text)) patterns.add(pattern);
  } catch {
    // No list by the tooling's reading: the YAML's alone.
  }
  const read = readYaml(text);
  const listed = typeof read === 'string' ? undefined : entriesOf(read.value)?.get('packages');
  if (Array.isArray(listed)) for (const pattern of listed) if (typeof pattern === 'string') patterns.add(pattern);
  return [...patterns]
    .filter((pattern) => !pattern.startsWith('!'))
    .map((pattern) => pattern.replace(/^\.\//, '').replace(/\/+$/, ''))
    .filter((pattern) => pattern !== '' && pattern !== '.')
    .map((pattern) => `${pattern}/package.json`)
    .sort();
}

/**
 * Each classified file's verdict: the three named files, and every workspace package's manifest that no global glob
 * already holds (a manifest under tools/stryker/** stays global), unless a closure or the mutation tooling reads the
 * file whole (imports it, or lists it as data), which affected() then judges as it judges any other file. No text, an
 * unread side or a file that does not parse affects every package; an absent side is `{}` for a workspace manifest and
 * affects every package for a named file. A manifest whose path holds a control character affects every package and
 * is printed JSON-quoted, as a key is. `shards` are stryker/shards.json's unless a test gives its own.
 */
export function classifyManifests(change: Change, closures: readonly Closure[], global: GlobalInputs, tooling: readonly string[], shards: readonly Shard[] = readShards()): ManifestVerdict[] {
  const context: Context = { closures, global, tooling: tooling.map(globToRegExp), globalNames: new Set([...global.imports.values()].flatMap((names) => [...names])) };
  const verdicts: ManifestVerdict[] = [];
  for (const file of change.files) {
    const named = (NAMED_FILES as readonly string[]).includes(file);
    const readWhole = global.files.has(file) || closures.some((closure) => closure.files.includes(file) || closure.data.some((entry) => globToRegExp(entry.glob).test(file)));
    if (readWhole || (!named && (global.globs.some((glob) => globToRegExp(glob).test(file)) || !isWorkspaceManifest(file, global)))) continue;
    const judgement = new Judgement(file);
    const { before, after } = change.texts?.[file] ?? {};
    if (hasControlCharacter(file)) judgement.global('', 'a path holding a control character');
    else if (before === undefined || after === undefined) judgement.global('', 'not read on one side');
    else if (named && (before === null || after === null)) judgement.global('', 'added or deleted');
    else if (named && before !== null && after !== null) {
      if (file === ROOT_MANIFEST) classifyRoot(judgement, before, after, context);
      else if (file === WORKSPACE_FILE) classifyWorkspace(judgement, before, after, context);
      else classifyWorkflow(judgement, before, after, shards);
    } else classifyPackage(judgement, before, after, context);
    verdicts.push(judgement.verdict());
  }
  return verdicts;
}
