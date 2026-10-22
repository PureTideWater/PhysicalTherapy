import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, realpathSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { ContractVersionRecord, PlanMappingRecord, RateRecordTerms } from '@tp/contracts';
import { type Cents, ROUNDING_RULES, isDecimal } from '@tp/money';
import type * as Money from '@tp/money';
import type * as Pricing from '@tp/pricing';
import { type AgreementInput, type IndexedRelease, type LineFacts, type LinePricing, type PricingInput, addDays, indexRelease, price, recompute } from '@tp/pricing';
import {
  type AdjustmentOption,
  contractAgreement,
  fixedTerms,
  lesserOfTerms,
  lineFacts,
  maAgreement,
  mappingRecord,
  perVisitTerms,
  percentTerms,
  practiceSettings,
  pricingInput,
  readRuleRelease,
  versionRecord,
} from '@tp/pricing/testing';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { type GoldenClaim, GOLDEN_CLAIMS_DIR, goldenPricingInput } from '../golden-worksheet/engine';

/**
 * The engine freeze's proof that nothing but PR 6b's ZIP+4 lookup changed (reconciliation-001; docs/adr/0064; PRC-22).
 * The base engine is extracted at ENGINE_FREEZE_BASE (CI sets it to the merge base) into packages/pricing/.freeze-base/,
 * with the base's copy of every workspace package it depends on (@tp/money, @tp/rules, @tp/contracts and theirs, each
 * its src and package.json), linked to one another in node_modules as pnpm links them, so the base engine runs on its
 * own base arithmetic, rules and contracts, never the head's: a change to @tp/money's rounding shows here as a change
 * to the engine. Third-party packages (decimal.js, zod) resolve to the versions the head's lockfile installs. Every
 * test file of the extract is deleted, and the extract is ignored by git, the test runner and the linter. Both engines
 * then price, and every LinePricing must be deeply equal once `trace.engine` is set aside; for every line, the head's
 * recompute of the head's trace must equal the base's recompute of the base's trace, and the head's recompute must
 * read the base's stored trace alike (recompute.ts is one of the five files the exception opens):
 *
 * 1. every golden claim the base holds, under the release it pins (150 claims and 326 lines at PR 6b-1's base);
 * 2. 20,000 generated claims under releases 900001 to 900005, with the settings' ZIP 00011 (one locality), 00012
 *    (needs its ZIP+4) or 00099 (no locality) and no ZIP+4, of every method, flag, rounding and adjustment the
 *    property tests generate, the agreement outcomes that stop a line, and malformed units and places.
 *
 * In CI the test never skips: without ENGINE_FREEZE_BASE, or when the base cannot be extracted, it fails. Run locally
 * without the variable, it says it skipped.
 */
const BASE = (process.env.ENGINE_FREEZE_BASE ?? '').trim();
const IN_CI = process.env.CI !== undefined && process.env.CI !== '' && process.env.CI !== 'false';
const SKIPPED = BASE === '' && !IN_CI;
const EXTRACT_ROOT = path.join(repositoryRoot, 'packages/pricing/.freeze-base');
/** The golden set at PR 6b-1's base: G01-G64 and G101-G195 (fixtures/golden/README.md). It only grows. */
const GOLDEN_FLOOR = { claims: 150, lines: 326 };
const GENERATED_CLAIMS = 20_000;

type Engine = Pick<typeof Pricing, 'price' | 'indexRelease' | 'recompute'>;

function git(args: readonly string[]): string {
  return execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** The workspace packages under packages/ at a commit, by name: their directories. */
function workspacePackagesAt(commit: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of git(['ls-tree', '-d', '--name-only', commit, 'packages/']).split('\n').filter((line) => line !== '')) {
    try {
      const manifest = JSON.parse(git(['show', `${commit}:${dir}/package.json`])) as { name?: string };
      if (typeof manifest.name === 'string') found.set(manifest.name, dir);
    } catch {
      // A directory without a package.json is not a workspace package.
    }
  }
  return found;
}

/** The workspace packages a package depends on (its dependencies on `workspace:` versions), as the commit declares them. */
function workspaceDependencies(commit: string, dir: string): string[] {
  const manifest = JSON.parse(git(['show', `${commit}:${dir}/package.json`])) as { dependencies?: Record<string, string> };
  return Object.entries(manifest.dependencies ?? {})
    .filter(([, version]) => version.startsWith('workspace:'))
    .map(([name]) => name);
}

/** Links `at` to `target`, its parent directory made. */
function link(target: string, at: string): void {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at);
}

/**
 * The base engine and the base's copy of every workspace package it reaches through its dependencies, extracted under
 * one directory with their tests removed so none is collected. Each package's node_modules links a workspace
 * dependency to its extracted copy, and a third-party one to where the head installs it.
 */
function extractBase(base: string): string {
  const commit = git(['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const dir = path.join(EXTRACT_ROOT, `${commit.slice(0, 12)}-${String(process.pid)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const packages = workspacePackagesAt(commit);
  const extracted = new Map<string, string>();
  const pending = ['@tp/pricing'];
  while (pending.length > 0) {
    const name = pending.shift() ?? '';
    if (extracted.has(name)) continue;
    const packageDir = packages.get(name);
    if (packageDir === undefined) throw new Error(`the base engine depends on ${name}, which is no package under packages/ at ${commit}`);
    extracted.set(name, packageDir);
    pending.push(...workspaceDependencies(commit, packageDir));
  }
  const archive = execFileSync('git', ['archive', '--format=tar', commit, '--', ...[...extracted.values()].flatMap((packageDir) => [`${packageDir}/src`, `${packageDir}/package.json`])], {
    cwd: repositoryRoot,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-f', '-', '-C', dir], { input: archive });
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.test\.tsx?$/.test(entry.name)) unlinkSync(full);
    }
  };
  walk(dir);
  for (const packageDir of extracted.values()) {
    const installed = path.join(repositoryRoot, packageDir, 'node_modules');
    if (!existsSync(installed)) throw new Error(`${packageDir} is not installed in the head (no node_modules), so the base's copy cannot resolve its third-party packages`);
    const entries = readdirSync(installed, { withFileTypes: true }).flatMap((entry) =>
      entry.name.startsWith('@') ? readdirSync(path.join(installed, entry.name)).map((inner) => `${entry.name}/${inner}`) : entry.name === '.bin' ? [] : [entry.name],
    );
    for (const name of entries) {
      const target = extracted.get(name);
      link(target === undefined ? realpathSync(path.join(installed, name)) : path.join(dir, target), path.join(dir, packageDir, 'node_modules', name));
    }
    for (const name of workspaceDependencies(commit, packageDir)) {
      if (!entries.includes(name)) link(path.join(dir, extracted.get(name) ?? ''), path.join(dir, packageDir, 'node_modules', name));
    }
  }
  return dir;
}

/**
 * A copy of a head-built input for the base engine: each decimal rebuilt by the base's @tp/money (its own class, which
 * the base engine's arithmetic requires), plain objects and arrays copied, anything else refused rather than handed
 * across. The release is not copied: the base indexes its own.
 */
function forBase(value: unknown, money: Pick<typeof Money, 'decimal'>): unknown {
  if (isDecimal(value)) return money.decimal(value.toString());
  if (Array.isArray(value)) return value.map((item: unknown) => forBase(item, money));
  if (value !== null && typeof value === 'object') {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`a ${String(value.constructor.name)} in a pricing input cannot be handed to the base engine`);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, forBase(item, money)]));
  }
  return value;
}

/**
 * A value as plain data: each decimal as its text (toJSON) and each bigint as its digits and "n". The base engine's
 * decimals are its own @tp/money's class, so two equal amounts compare by their text, never by the class that holds it.
 */
function plain(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) => {
      if (item instanceof Map || item instanceof Set) throw new Error('a Map or Set in a result would compare as {}');
      return typeof item === 'bigint' ? `${item.toString()}n` : item;
    }),
  ) as unknown;
}

/** A result as the freeze compares it: everything but the engine version its trace names. */
function comparable(results: readonly LinePricing[]): unknown {
  return plain(results.map((result) => ({ ...result, trace: { ...result.trace, engine: '(set aside)' } })));
}

/** What pricing gave: the comparable results, or the error it threw, by its name and message. */
function outcome(run: () => readonly LinePricing[]): unknown {
  try {
    return { results: comparable(run()) };
  } catch (error) {
    return { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

/** What recompute gave for a trace as stored (read back from JSON), or the error it threw. */
function recomputed(engine: Pick<Engine, 'recompute'>, trace: unknown): unknown {
  try {
    return { recomputed: plain(engine.recompute(JSON.parse(JSON.stringify(trace)))) };
  } catch (error) {
    return { threw: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

const HEAD_ENGINE: Pick<Engine, 'recompute'> = { recompute };

/**
 * Each line's recomputation alike: the head's of its own trace, the base's of its own, and the head's of the base's
 * stored trace (a trace phase-two/1 wrote, which the head must still read). Returns how many lines it compared.
 */
function expectRecomputedAlike(base: Engine, head: readonly LinePricing[], baseResults: readonly LinePricing[], where: string): number {
  head.forEach((line, index) => {
    const before = baseResults[index];
    const expected = recomputed(base, before?.trace);
    expect(recomputed(HEAD_ENGINE, line.trace), `${where} line ${String(index + 1)}: the head's recompute of its trace`).toEqual(expected);
    expect(recomputed(HEAD_ENGINE, before?.trace), `${where} line ${String(index + 1)}: the head's recompute of the base's trace`).toEqual(expected);
  });
  return head.length;
}

// ---------------------------------------------------------------------------------------------
// Generated claims, after packages/pricing/src/properties.test.ts, widened to the lines the engine stops.

const RELEASES = [900001, 900002, 900003, 900004, 900005] as const;
const RELEASE_DIRS = Object.fromEntries(RELEASES.map((number) => [number, `fixtures/synthetic/rules/release-synth-${String(number)}`])) as Record<(typeof RELEASES)[number], string>;
const ZIPS = ['00011', '00012', '00099'] as const;
/** The synthetic codes, and one no release values (NO_PFS_VALUE). */
const CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97026', '97035', 'G0283', '97750', '97999'] as const;
const METHODS = ['PERCENT_OF_MEDICARE', 'FIXED_SCHEDULE', 'LESSER_OF_FIXED', 'LESSER_OF_PERCENT', 'PER_VISIT'] as const;
const STOPPED_AGREEMENTS = ['NO_MAPPING', 'NO_AGREEMENT', 'DATE_OUTSIDE_VERSIONS', 'NO_RATE_FOR_CODE', 'AMBIGUOUS_RATE', 'RESOLUTION_FAILED'] as const;
const OTHER_CLAIM_STATUSES = ['2', '3', '4', '19', '20', '21', '22', '23', '25'] as const;

const percentText = (tenThousandths: number) => `${String(Math.floor(tenThousandths / 10000))}.${String(tenThousandths % 10000).padStart(4, '0')}`;
/** A date from 2025-01-01 to 2027-01-31, so lines fall before, inside and after the releases' 2026 windows. */
const anyDate = fc.integer({ min: 0, max: 760 }).map((days) => addDays('2025-01-01', days));
/** Mostly 2026, where the synthetic releases price, and now and then any date. */
const serviceDate = fc.oneof(
  { weight: 3, arbitrary: fc.constant('2026-03-10') },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 361 }).map((days) => addDays('2026-01-01', days)) },
  { weight: 1, arbitrary: anyDate },
);
/** Mostly true or mostly false: the value that prices, and now and then the other. */
const mostly = (value: boolean) => fc.oneof({ weight: 9, arbitrary: fc.constant(value) }, { weight: 1, arbitrary: fc.constant(!value) });

const generatedLine = fc.record({
  procedureCode: fc.constantFrom(...CODES),
  units: fc.oneof({ weight: 30, arbitrary: fc.integer({ min: 1, max: 4 }).map(String) }, { weight: 1, arbitrary: fc.constantFrom('0', '1.5', '999', '1000') }),
  modifiers: fc.subarray(['GP', 'CQ', 'CO', '59', 'XS'] as const),
  placeOfService: fc.oneof({ weight: 12, arbitrary: fc.constantFrom('11', '22') }, { weight: 1, arbitrary: fc.constantFrom('99', null) }),
  share: fc.bigInt({ min: 0n, max: 15000n }),
  charge: fc.bigInt({ min: 0n, max: 30000n }),
  observed: fc.bigInt({ min: 0n, max: 30000n }),
  day: fc.integer({ min: 0, max: 2 }),
});

const generatedAdjustment: fc.Arbitrary<AdjustmentOption | undefined> = fc.option(
  fc.oneof(
    fc.record({ kind: fc.constant('PERCENT' as const), percent: fc.integer({ min: 1, max: 2_000_000 }).map(percentText) }),
    fc.record({ kind: fc.constant('CAP' as const), capCents: fc.bigInt({ min: 0n, max: 20000n }) }),
  ),
  { nil: undefined },
);

const generatedTerms = fc.record({
  method: fc.constantFrom(...METHODS),
  amount: fc.bigInt({ min: 0n, max: 20000n }),
  percentage: fc.integer({ min: 1, max: 3_000_000 }).map(percentText),
  yearBasis: fc.oneof({ weight: 6, arbitrary: fc.constant('CURRENT' as const) }, { weight: 3, arbitrary: fc.constantFrom('LOCKED:2025' as const, 'LOCKED:2026' as const) }, { weight: 1, arbitrary: fc.constant('LOCKED:2024' as const) }),
  conversionFactor: fc.constantFrom('non_qualifying_apm' as const, 'qualifying_apm' as const),
  flags: fc.record({
    apply_mppr: fc.boolean(),
    apply_assistant_reduction: fc.boolean(),
    apply_sequestration: fc.boolean(),
    apply_ncci: fc.boolean(),
    timed_units_rule: fc.oneof({ weight: 9, arbitrary: fc.constantFrom('MEDICARE_POOLED' as const, 'PER_CODE' as const) }, { weight: 1, arbitrary: fc.constant('UNKNOWN' as const) }),
  }),
  /** The multiple procedure reduction on a method without a fee schedule stops the line (Q39): now and then. */
  mpprAnyMethod: mostly(false),
  rounding: fc.constantFrom(null, ...ROUNDING_RULES),
  adjustment: generatedAdjustment,
  disputeWindowDays: fc.option(fc.integer({ min: 1, max: 400 }), { nil: null }),
});

type GeneratedTerms = typeof generatedTerms extends fc.Arbitrary<infer T> ? T : never;

/** Contract terms, Medicare Advantage non-contracted, or an agreement that stops the line. */
const generatedAgreement = fc.oneof(
  { weight: 6, arbitrary: generatedTerms.map((terms) => ({ kind: 'contract' as const, terms })) },
  { weight: 3, arbitrary: fc.constant({ kind: 'ma' as const }) },
  { weight: 1, arbitrary: fc.constantFrom(...STOPPED_AGREEMENTS).map((outcome) => ({ kind: 'stopped' as const, outcome })) },
);

const generatedClaim = fc.record({
  release: fc.constantFrom(...RELEASES),
  zip: fc.oneof({ weight: 3, arbitrary: fc.constant(ZIPS[0]) }, { weight: 1, arbitrary: fc.constantFrom(ZIPS[1], ZIPS[2]) }),
  defaultRounding: fc.constantFrom(null, ...ROUNDING_RULES),
  agreement: generatedAgreement,
  lines: fc.array(generatedLine, { minLength: 1, maxLength: 6 }),
  serviceDate,
  claimStatusCode: fc.oneof({ weight: 8, arbitrary: fc.constant('1') }, { weight: 2, arbitrary: fc.constantFrom(...OTHER_CLAIM_STATUSES) }),
  reversed: mostly(false),
  corrected: mostly(false),
  remittanceDate: fc.option(anyDate, { nil: null }),
  asOf: fc.oneof(fc.constant('2026-10-15'), anyDate),
});

type GeneratedClaim = typeof generatedClaim extends fc.Arbitrary<infer T> ? T : never;

function termsOf(terms: GeneratedTerms): RateRecordTerms {
  const percent = { percentage: terms.percentage, yearBasis: terms.yearBasis, conversionFactor: terms.conversionFactor };
  const flags = { ...terms.flags, apply_mppr: terms.flags.apply_mppr && (terms.method === 'PERCENT_OF_MEDICARE' || terms.mpprAnyMethod) };
  const options = { flags, rounding: terms.rounding, codes: [...CODES], adjustment: terms.adjustment };
  switch (terms.method) {
    case 'PERCENT_OF_MEDICARE':
      return percentTerms({ ...percent, ...options });
    case 'FIXED_SCHEDULE':
      return fixedTerms(terms.amount, options);
    case 'LESSER_OF_FIXED':
      return lesserOfTerms({ fixedCents: terms.amount }, options);
    case 'LESSER_OF_PERCENT':
      return lesserOfTerms(percent, options);
    case 'PER_VISIT':
      return perVisitTerms(terms.amount, options);
  }
}

function agreementOf(agreement: GeneratedClaim['agreement']): AgreementInput {
  if (agreement.kind === 'ma') return maAgreement();
  if (agreement.kind === 'contract') {
    const { disputeWindowDays } = agreement.terms;
    return contractAgreement({ terms: termsOf(agreement.terms), windows: { timely_filing_days: null, dispute_window_days: disputeWindowDays, appeal_levels: [] } });
  }
  const mapping: PlanMappingRecord = mappingRecord({ kind: 'contract', contractVersionId: 'cv-synth-1' });
  const version: ContractVersionRecord = versionRecord();
  switch (agreement.outcome) {
    case 'NO_MAPPING':
      return { outcome: 'NO_MAPPING' };
    case 'NO_AGREEMENT':
      return { outcome: 'NO_AGREEMENT', mapping: mappingRecord({ kind: 'no_agreement' }) };
    case 'DATE_OUTSIDE_VERSIONS':
      return { outcome: 'DATE_OUTSIDE_VERSIONS', mapping };
    case 'NO_RATE_FOR_CODE':
      return { outcome: 'NO_RATE_FOR_CODE', mapping, version };
    case 'AMBIGUOUS_RATE':
      return { outcome: 'AMBIGUOUS_RATE', mapping, version, rateRecordIds: ['rr-synth-1', 'rr-synth-2'] };
    case 'RESOLUTION_FAILED':
      return { outcome: 'RESOLUTION_FAILED' };
  }
}

function linesOf(claim: GeneratedClaim): LineFacts[] {
  const agreement = agreementOf(claim.agreement);
  return claim.lines.map((line, index) =>
    lineFacts({
      lineNo: index + 1,
      procedureCode: line.procedureCode,
      units: line.units,
      modifiers: [...line.modifiers],
      placeOfService: line.placeOfService,
      serviceDate: addDays(claim.serviceDate, line.day),
      chargeCents: line.charge as Cents,
      observedAllowedCents: line.observed as Cents,
      patientShareAdjustments: line.share === 0n ? [] : [{ groupCode: 'PR', reasonCode: '2', amountCents: line.share as Cents }],
      agreement,
    }),
  );
}

function inputOf(claim: GeneratedClaim, release: IndexedRelease): PricingInput {
  return pricingInput(release, linesOf(claim), {
    settings: practiceSettings({ zip: claim.zip, defaultRounding: claim.defaultRounding }),
    asOf: claim.asOf,
    claim: { claimStatusCode: claim.claimStatusCode, reversed: claim.reversed, corrected: claim.corrected, remittanceDate: claim.remittanceDate },
  });
}

// ---------------------------------------------------------------------------------------------

describe('the engine freeze runs in CI', () => {
  it('is never skipped there: CI sets ENGINE_FREEZE_BASE to the merge base (.github/workflows/ci.yml)', () => {
    if (IN_CI) {
      expect(BASE, 'ENGINE_FREEZE_BASE is not set in CI: the differential test cannot run, so it fails').not.toBe('');
    }
  });
});

if (SKIPPED) {
  process.stderr.write('tools/engine-freeze/differential.test.ts: skipped, ENGINE_FREEZE_BASE is not set; set it to the merge base to compare the engines (CI does).\n');
}

describe.skipIf(SKIPPED)('the base engine and this one price alike everywhere but the ZIP+4 lookup (skipped without ENGINE_FREEZE_BASE outside CI)', () => {
  let extracted = '';
  let base: Engine;
  let baseMoney: Pick<typeof Money, 'decimal'>;
  /** The head's input as the base engine takes it, under the base's own index of the release. */
  const baseInputOf = (input: PricingInput, release: IndexedRelease): PricingInput => ({ ...(forBase({ ...input, release: null }, baseMoney) as PricingInput), release });
  const baseReleases = new Map<string, IndexedRelease>();
  const headReleases = new Map<string, IndexedRelease>();

  /** A release directory indexed by the base engine's own index, so its errors are the base engine's classes. */
  const baseRelease = (dir: string, manifestSha256?: string): IndexedRelease => {
    let found = baseReleases.get(dir);
    if (found === undefined) {
      const release = readRuleRelease(dir);
      found = base.indexRelease(release);
      baseReleases.set(dir, found);
    }
    if (manifestSha256 !== undefined) expect(found.manifestSha256, dir).toBe(manifestSha256);
    return found;
  };

  /** Why the base engine could not be loaded, if it could not: every test then fails with it, none is skipped. */
  let setupError: Error | null = null;
  const ready = () => {
    if (setupError !== null) throw setupError;
  };

  beforeAll(async () => {
    try {
      if (BASE === '') throw new Error('ENGINE_FREEZE_BASE is not set: CI sets it to the merge base (.github/workflows/ci.yml)');
      extracted = extractBase(BASE);
      base = (await import(/* @vite-ignore */ pathToFileURL(path.join(extracted, 'packages/pricing/src/index.ts')).href)) as Engine;
      baseMoney = (await import(/* @vite-ignore */ pathToFileURL(path.join(extracted, 'packages/money/src/index.ts')).href)) as typeof Money;
      for (const number of RELEASES) headReleases.set(RELEASE_DIRS[number], indexRelease(readRuleRelease(RELEASE_DIRS[number])));
    } catch (error) {
      setupError = error instanceof Error ? error : new Error(String(error));
    }
  }, 120_000);

  afterAll(() => {
    if (extracted !== '') rmSync(extracted, { recursive: true, force: true });
    try {
      rmdirSync(EXTRACT_ROOT);
    } catch {
      // Another run's extract is still there.
    }
  });

  it('extracts the base engine and the base’s own money, rules and contracts packages, without their tests, beside the package', () => {
    ready();
    expect(path.dirname(path.dirname(extracted))).toBe(path.join(repositoryRoot, 'packages/pricing'));
    const files = readdirSync(extracted, { recursive: true })
      .map(String)
      .filter((file) => !file.split(path.sep).includes('node_modules'));
    expect(files).toContain(path.join('packages/pricing/src/engine.ts'));
    for (const dependency of ['money', 'rules', 'contracts']) {
      expect(files).toContain(path.join(`packages/${dependency}/package.json`));
      // The base engine resolves each to the base's copy, never to the head's package.
      expect(realpathSync(path.join(extracted, `packages/pricing/node_modules/@tp/${dependency}`))).toBe(realpathSync(path.join(extracted, `packages/${dependency}`)));
    }
    expect(realpathSync(path.join(extracted, 'packages/rules/node_modules/@tp/money'))).toBe(realpathSync(path.join(extracted, 'packages/money')));
    expect(files.filter((file) => /\.test\.tsx?$/.test(file))).toEqual([]);
    expect(base.price).not.toBe(price);
    expect(base.recompute).not.toBe(recompute);
    // The base's own decimals: the head's are another class, which the base's arithmetic refuses.
    expect(isDecimal(baseMoney.decimal('1.5'))).toBe(false);
  });

  it(`prices every golden claim the base holds as the base engine does (at least ${String(GOLDEN_FLOOR.claims)} claims and ${String(GOLDEN_FLOOR.lines)} lines)`, async ({ annotate }) => {
    ready();
    const names = git(['ls-tree', '--name-only', BASE, '--', `${GOLDEN_CLAIMS_DIR}/`])
      .split('\n')
      .filter((file) => file.endsWith('.json'));
    let lines = 0;
    for (const file of names) {
      const claim = JSON.parse(git(['show', `${BASE}:${file}`])) as GoldenClaim;
      const input = goldenPricingInput(claim);
      const baseInput = baseInputOf(input, baseRelease(claim.inputs.release.dir, claim.inputs.release.manifest_sha256));
      const headResults = price(input);
      const baseResults = base.price(baseInput);
      expect(outcome(() => headResults), file).toEqual(outcome(() => baseResults));
      expectRecomputedAlike(base, headResults, baseResults, file);
      lines += claim.inputs.claim.lines.length;
    }
    expect(names.length).toBeGreaterThanOrEqual(GOLDEN_FLOOR.claims);
    expect(lines).toBeGreaterThanOrEqual(GOLDEN_FLOOR.lines);
    // The counts compared, in the reporter's output and CI's log.
    await annotate(`base equals head, priced and recomputed, on ${String(names.length)} golden claims and ${String(lines)} lines`);
  });

  it(`prices ${String(GENERATED_CLAIMS)} generated claims with five-digit ZIPs as the base engine does`, async ({ annotate }) => {
    ready();
    for (const number of RELEASES) baseRelease(RELEASE_DIRS[number]);
    let stopped = 0;
    let priced = 0;
    fc.assert(
      fc.property(generatedClaim, (claim) => {
        const dir = RELEASE_DIRS[claim.release];
        const head = headReleases.get(dir);
        if (head === undefined) throw new Error(`release ${dir} was not read`);
        const results = price(inputOf(claim, head));
        const baseResults = base.price(baseInputOf(inputOf(claim, head), baseRelease(dir)));
        expect(outcome(() => results)).toEqual(outcome(() => baseResults));
        expectRecomputedAlike(base, results, baseResults, 'a generated claim');
        for (const result of results) {
          if (result.outcome === 'priced') priced += 1;
          else stopped += 1;
        }
      }),
      { numRuns: GENERATED_CLAIMS },
    );
    // The generation reaches both kinds of line in quantity (about 19,000 priced and 50,000 stopped), so the comparison
    // covers prices as well as stops.
    expect(priced, `${String(priced)} priced and ${String(stopped)} stopped lines`).toBeGreaterThan(GENERATED_CLAIMS / 2);
    expect(stopped, `${String(priced)} priced and ${String(stopped)} stopped lines`).toBeGreaterThan(GENERATED_CLAIMS / 2);
    await annotate(`base equals head, priced and recomputed, on ${String(GENERATED_CLAIMS)} generated claims: ${String(priced)} priced and ${String(stopped)} stopped lines`);
  }, 900_000);
});
