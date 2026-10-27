import { parse } from 'yaml';
import { z } from 'zod';

/**
 * What check-toolchain reads: package.json's packageManager and overrides (pnpm.overrides, resolutions),
 * pnpm-workspace.yaml's gates, the lockfile's resolved versions and overrides, and the four lists kept beside the checker,
 * each entry with its reason and dates.
 */

/** F2 (b), the founder's ruling of 2026-10-25: three days, in minutes. The workspace may raise it, never lower it. */
export const MINIMUM_RELEASE_AGE_MINUTES = 4320;
/** F2 (b): a release-age exclude never outlives seven days from the day it is added. */
export const EXCLUDE_MAX_DAYS = 7;
/** An audit exception lives at most thirty days. */
export const AUDIT_EXCEPTION_MAX_DAYS = 30;

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

/** One exact version of one package, `name@x.y.z` or `@scope/name@x.y.z`: no range, pattern or union. */
export const EXACT_SPEC = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
/** A plain version, x.y.z with an optional prerelease. */
export const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const GHSA = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;

/** `name@version` split at the version's `@` (a scope's leading `@` is part of the name). */
export function splitSpec(spec: string): { readonly name: string; readonly version: string } {
  const at = spec.indexOf('@', 1);
  return at === -1 ? { name: spec, version: '' } : { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/** Negative, zero or positive as a is below, equal to or above b (prereleases below their release, compared as text). */
export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (x === null || y === null) {
    return a.localeCompare(b);
  }
  for (const index of [1, 2, 3]) {
    const difference = Number(x[index]) - Number(y[index]);
    if (difference !== 0) {
      return difference;
    }
  }
  if (x[4] === y[4]) {
    return 0;
  }
  if (x[4] === undefined) {
    return 1;
  }
  return y[4] === undefined ? -1 : x[4].localeCompare(y[4]);
}

/** package.json's packageManager: pnpm at one exact version, optionally with corepack's integrity suffix. */
export function pnpmVersion(packageManager: unknown): string | null {
  if (typeof packageManager !== 'string') {
    return null;
  }
  return /^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[0-9a-f]+)?$/.exec(packageManager)?.[1] ?? null;
}

/** packageManager's corepack-style integrity suffix, `+sha512.<128 hex>`, as hex; null when it carries none or another. */
export function pnpmDigest(packageManager: unknown): string | null {
  if (typeof packageManager !== 'string') {
    return null;
  }
  return /^pnpm@\d+\.\d+\.\d+\+sha512\.([0-9a-f]{128})$/.exec(packageManager)?.[1] ?? null;
}

/** A Subresource Integrity string's sha512 digest as hex (`sha512-<base64>`), or null when it holds none. */
export function sha512Hex(integrity: string | null | undefined): string | null {
  const match = /^sha512-([A-Za-z0-9+/]{86}==)$/.exec(integrity?.trim() ?? '');
  return match?.[1] === undefined ? null : Buffer.from(match[1], 'base64').toString('hex');
}

const overridesSchema = z.record(z.string(), z.string());

export const packageJsonSchema = z.looseObject({
  packageManager: z.string().optional(),
  pnpm: z.looseObject({ overrides: overridesSchema.optional() }).optional(),
  /** Yarn's field, which pnpm applies as overrides beneath `pnpm.overrides`. */
  resolutions: overridesSchema.optional(),
});
export type PackageJson = z.infer<typeof packageJsonSchema>;

export const workspaceSchema = z.looseObject({
  minimumReleaseAge: z.number().int().optional(),
  minimumReleaseAgeExclude: z.array(z.string()).optional(),
  trustPolicy: z.string().optional(),
  trustPolicyExclude: z.array(z.string()).optional(),
  overrides: overridesSchema.optional(),
  auditConfig: z.looseObject({ ignoreGhsas: z.array(z.string()).optional() }).optional(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

const snapshotSchema = z
  .looseObject({
    dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(),
  })
  .nullable();

export const lockfileSchema = z.looseObject({
  lockfileVersion: z.union([z.string(), z.number()]),
  /** The overrides pnpm applied, selector to specifier, whatever their source; a frozen install refuses a lockfile whose map differs from the manifests'. */
  overrides: overridesSchema.nullable().optional(),
  packages: z.record(z.string(), z.unknown()).nullable().optional(),
  snapshots: z.record(z.string(), snapshotSchema).nullable().optional(),
});
export type Lockfile = z.infer<typeof lockfileSchema>;

const instant = z.iso.datetime({ offset: false });
const reason = z.string().min(20);

/** tools/check-toolchain/audit-exceptions.json: equal to pnpm-workspace.yaml's auditConfig.ignoreGhsas. */
export const auditExceptionsSchema = z.strictObject({
  $comment: z.string().optional(),
  entries: z.array(z.strictObject({ ghsa: z.string().regex(GHSA), reason, added: instant, expires: instant })),
});

/** tools/check-toolchain/release-age-exceptions.json: equal to pnpm-workspace.yaml's minimumReleaseAgeExclude. */
export const releaseAgeExceptionsSchema = z.strictObject({
  $comment: z.string().optional(),
  entries: z.array(z.strictObject({ package: z.string(), advisory: z.string().regex(GHSA), reason, added: instant, expires: instant })),
});
export type ReleaseAgeException = z.infer<typeof releaseAgeExceptionsSchema>['entries'][number];

/** tools/check-toolchain/trust-exceptions.json: equal to pnpm-workspace.yaml's trustPolicyExclude. */
export const trustExceptionsSchema = z.strictObject({
  $comment: z.string().optional(),
  entries: z.array(z.strictObject({ package: z.string(), reason, added: z.iso.date() })),
});

/** tools/check-toolchain/overrides.json: equal to the workspace's and package.json's overrides (pnpm.overrides and resolutions), and to the lockfile's own map. */
export const overrideEntriesSchema = z.strictObject({
  $comment: z.string().optional(),
  entries: z.array(z.strictObject({ selector: z.string().min(1), version: z.string().min(1), reason, removeWhen: z.string().min(10), added: z.iso.date() })),
});

/** Parsed text, or the reason it could not be read, naming the file. */
export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

export function parseJsonFile<T>(file: string, text: string | undefined, schema: z.ZodType<T>, empty: T): Parsed<T> {
  if (text === undefined) {
    return { ok: true, value: empty };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, problem: `${file} is not JSON (${error instanceof Error ? error.message : String(error)})` };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problem: `${file}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}` };
}

export function parseYamlFile<T>(file: string, text: string | undefined, schema: z.ZodType<T>, empty: T): Parsed<T> {
  if (text === undefined) {
    return { ok: true, value: empty };
  }
  let raw: unknown;
  try {
    raw = parse(text) ?? {};
  } catch (error) {
    return { ok: false, problem: `${file} is not YAML (${error instanceof Error ? error.message : String(error)})` };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problem: `${file}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}` };
}

/** The lockfile's resolved packages, `name@version` (v9 `packages:` keys carry no peer suffix). */
export function lockedPackages(lockfile: Lockfile): ReadonlySet<string> {
  return new Set(Object.keys(lockfile.packages ?? {}));
}

/** A snapshot key's name and version, its peer suffix `(…)` dropped. */
export function snapshotSpec(key: string): { readonly name: string; readonly version: string } {
  const spec = splitSpec(key);
  const paren = spec.version.indexOf('(');
  return { name: spec.name, version: paren === -1 ? spec.version : spec.version.slice(0, paren) };
}

/** An override selector, `[parent[@range]>]target[@range]`, split into its parts. */
export function parseSelector(selector: string): { readonly parent: { readonly name: string; readonly range: string } | null; readonly target: { readonly name: string; readonly range: string } } {
  // The parent ends at the `>` before a package name, so a range's `>=` or `>1` stays in its range.
  const split = /^(.+?)>(?=[@a-z_])(.+)$/.exec(selector);
  const part = (text: string) => {
    const spec = splitSpec(text);
    return { name: spec.name, range: spec.version };
  };
  return split?.[1] === undefined || split[2] === undefined ? { parent: null, target: part(selector) } : { parent: part(split[1]), target: part(split[2]) };
}

/** Whether a locked version falls under an override's parent range: a bare major (`2`), an exact version, or any (`*`, empty). */
export function rangeHolds(range: string, version: string): boolean {
  if (range === '' || range === '*') {
    return true;
  }
  if (/^\d+$/.test(range)) {
    return SEMVER.exec(version)?.[1] === range;
  }
  if (/^\d+\.\d+$/.test(range)) {
    const match = SEMVER.exec(version);
    return match !== null && `${match[1] ?? ''}.${match[2] ?? ''}` === range;
  }
  if (SEMVER.test(range)) {
    return range === version;
  }
  // Any other range form is matched by name alone; the overrides list names the selector it was written for.
  return true;
}
