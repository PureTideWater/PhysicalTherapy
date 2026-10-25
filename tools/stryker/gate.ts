import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { MUTATION_PACKAGES, type MutationPackage, type Shard, readNoMutants, readShards } from '../../stryker/base.mjs';
import { repositoryRoot } from '../content-files';
import { CANARY_CASES, CANARY_FORMAT, type CanaryVerdict, type Runtime, canaryPassed } from './canary/verdict';
import { DETECTED, type KeyedMutant, type MutantKey, type MutationReport, UNDETECTED, describeMutant, keyOf, keyedMutants, repositoryPath } from './mutants';
import { packagesOf, shardsOf } from './shards';

/**
 * The mutation gate (docs/adr/0066, Part 4; PRD 18): the required `mutation` check. It merges the shards' Stryker
 * reports by package and fails when
 *
 * - a shard the changes job selected reported nothing, or a shard that ran lacks its canary verdict of 5 of 5 as
 *   expected (naming the Node, Unicode and ICU it ran on), or one of its packages' reports, or a file of a package it
 *   holds that the report leaves out (stryker/shards.json's noMutants lists the files Stryker finds no mutant in);
 * - a shard leaves a report of a package it does not hold, or the reports directory holds a file at its top;
 * - a package ran in some of its shards and not all (a package's shards run all or none);
 * - a fully-run package scores at or below 85%. The score is Stryker's, (Killed + Timeout) / (Killed + Timeout +
 *   Survived + NoCoverage), compared in integers, so 85.00% fails and 85.01% passes ("above 85%", PRD 18). RuntimeError
 *   mutants are left out of it, as Stryker leaves them; a recorded equivalent stays in it as the survivor it is, so
 *   recording one never raises a score;
 * - a Survived or NoCoverage mutant of a fully-run package is not recorded as equivalent;
 * - a RuntimeError's reason is not a test file's load failure (Stryker 10.1's "An error occurred outside of a test
 *   run: <file>.test.ts: ...");
 * - a mutant is Ignored, CompileError or Pending: no run here ignores a mutant (the equivalents file is the only
 *   record), checks types or leaves one unrun;
 * - an equivalents file is malformed, unsorted or holds a duplicate, or, for a fully-run package, an entry lacks its
 *   reviewer and date, is reviewed by its proposer or on a date after the run's, no longer matches a mutant (stale), or
 *   matches one a test detects or that breaks a load;
 * - tools/stryker/unicode.json is malformed, or, for a fully-run package, lists an entry its equivalents file does not
 *   record, or lists entries a shard scored on other Unicode or ICU data than they were checked on.
 *
 * A package none of whose shards ran is "not affected", judged by neither score rule, and its equivalents' review and
 * staleness are not judged either. With no shard run at all the gate passes: "no money path changed".
 *
 * Equivalents (tools/stryker/equivalent/<package>.json) are a JSON array sorted by file, then original, then occurrence
 * (strings in code-unit order, as Array.prototype.sort compares them), each entry exactly
 * { file, mutator, original, occurrence, replacement, reason, proposedBy, reviewedBy, reviewedOn }. A builder leaves
 * reviewedBy and reviewedOn empty; the reviewer fills them after confirming that no input tells the mutant from the
 * original. Matching is per mutant, on the file, mutator, original text, its occurrence and the replacement
 * (tools/stryker/mutants.ts).
 *
 * `pnpm -s exec tsx tools/stryker/gate.ts [<dir>] [--expected <shards>] [--summary <file>]` reads <dir>/<shard>/
 * (reports/mutation by default), each holding canary.json and <package>.json for the packages its shard holds, and
 * nothing else at <dir>'s top; --expected names the shards the changes job selected (a JSON array or a
 * comma-separated list; empty is refused, since only a changes job that wrote no output leaves it); --summary appends the
 * markdown summary (the workflow passes $GITHUB_STEP_SUMMARY). It prints per-package and per-file scores and every
 * survivor with its covering tests. `--shard <name>` prints one shard's view and judges nothing (the shard job's log).
 */

/** "Above 85%": a package passes when detected / valid > THRESHOLD_PERCENT / 100. */
export const THRESHOLD_PERCENT = 85;
export const EQUIVALENT_DIRECTORY = 'tools/stryker/equivalent';
/** The equivalents that rest on the engine's Unicode data, and the runtime they were checked on. */
export const UNICODE_FILE = 'tools/stryker/unicode.json';
const UNICODE_KEYS = ['file', 'mutator', 'original', 'occurrence', 'replacement'] as const;
export const EQUIVALENT_KEYS = ['file', 'mutator', 'original', 'occurrence', 'replacement', 'reason', 'proposedBy', 'reviewedBy', 'reviewedOn'] as const;

export interface EquivalentEntry {
  readonly file: string;
  readonly mutator: string;
  readonly original: string;
  readonly occurrence: number;
  readonly replacement: string;
  readonly reason: string;
  readonly proposedBy: string;
  readonly reviewedBy: string;
  readonly reviewedOn: string;
}

/** What one shard left: its canary verdict and its packages' reports, each as read (undefined when missing). */
export interface ShardResult {
  readonly canary: unknown;
  readonly reports: ReadonlyMap<string, MutationReport>;
  /** Files of its directory the gate does not read (other than .html reports). */
  readonly stray: readonly string[];
}

export interface GateInput {
  readonly shards: readonly Shard[];
  /** The shards that left a directory, by name, and any directory that is not a shard's. */
  readonly ran: ReadonlyMap<string, ShardResult>;
  /** The shards the changes job selected; undefined when not known (a local run). */
  readonly expected?: readonly string[];
  /** Each package's equivalents file as parsed; undefined when the package has none. */
  readonly equivalents: Readonly<Partial<Record<MutationPackage, unknown>>>;
  /** The files a shard holds that Stryker finds no mutant in (stryker/shards.json's noMutants): the only ones its report may leave out. */
  readonly noMutants?: readonly string[];
  /** Files at the top of the reports directory, where no shard writes. */
  readonly stray?: readonly string[];
  /** tools/stryker/unicode.json as parsed; undefined when there is none. */
  readonly unicode?: unknown;
  /** The run's UTC date (YYYY-MM-DD); today's when not given. */
  readonly today?: string;
}

/** tools/stryker/unicode.json, read: the runtime its entries were checked on, and the entries. */
interface UnicodeListing {
  readonly checkedOn: { readonly node: string; readonly unicode: string; readonly icu: string };
  readonly records: readonly MutantKey[];
}

/** tools/stryker/unicode.json checked for shape; the problems name the file and the record. */
export function readUnicodeListing(value: unknown): { listing: UnicodeListing | undefined; problems: string[] } {
  if (value === undefined) return { listing: undefined, problems: [] };
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const checkedOn = record.checkedOn as Record<string, unknown> | undefined;
  if (typeof checkedOn !== 'object' || checkedOn === null || !['node', 'unicode', 'icu'].every((key) => typeof checkedOn[key] === 'string' && checkedOn[key] !== '')) {
    return { listing: undefined, problems: [`${UNICODE_FILE}: checkedOn is not { node, unicode, icu }, each a string`] };
  }
  if (!Array.isArray(record.records)) return { listing: undefined, problems: [`${UNICODE_FILE}: records is not a JSON array`] };
  const problems: string[] = [];
  (record.records as unknown[]).forEach((item, index) => {
    const keys = typeof item === 'object' && item !== null && !Array.isArray(item) ? Object.keys(item) : [];
    const shaped = keys.length === UNICODE_KEYS.length && UNICODE_KEYS.every((key, position) => keys[position] === key);
    const entry = item as Record<string, unknown>;
    const typed = shaped && ['file', 'mutator', 'original', 'replacement'].every((key) => typeof entry[key] === 'string') && Number.isInteger(entry.occurrence);
    if (!typed) problems.push(`${UNICODE_FILE} record ${String(index + 1)}: its keys must be exactly ${UNICODE_KEYS.join(', ')}`);
  });
  if (problems.length > 0) return { listing: undefined, problems };
  return { listing: { checkedOn: checkedOn as UnicodeListing['checkedOn'], records: record.records as MutantKey[] }, problems };
}

export interface FileScore {
  readonly file: string;
  readonly detected: number;
  readonly undetected: number;
  readonly errors: number;
}

export interface PackageResult {
  readonly pkg: MutationPackage;
  readonly state: 'not affected' | 'partly run' | 'fully run';
  readonly detected: number;
  readonly undetected: number;
  readonly errors: number;
  /** In hundredths of a percent, rounded down; null when not fully run or with no valid mutant. */
  readonly scoreBasisPoints: number | null;
  readonly files: readonly FileScore[];
  /** Survived or NoCoverage, with whether an equivalent records it. */
  readonly undetectedMutants: readonly (KeyedMutant & { readonly equivalent: boolean })[];
}

export interface GateResult {
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly packages: readonly PackageResult[];
  readonly lines: readonly string[];
}

const LOAD_FAILURE = /^An error occurred outside of a test run: \S.*?\.test\.tsx?: /;

/** Whether a RuntimeError's reason is a test file's load failure, the one kind of error a mutant may cause. */
export function isLoadFailure(reason: string | undefined): boolean {
  return reason !== undefined && LOAD_FAILURE.test(reason);
}

/** Whether detected of valid is above the threshold, in integers. */
export function aboveThreshold(detected: number, valid: number): boolean {
  return valid > 0 && detected * 100 > valid * THRESHOLD_PERCENT;
}

function compareEntries(a: EquivalentEntry, b: EquivalentEntry): number {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.original !== b.original) return a.original < b.original ? -1 : 1;
  return a.occurrence - b.occurrence;
}

/** An equivalents file checked for shape, order and duplicates; the problems name the file and the entry. */
export function readEquivalents(pkg: MutationPackage, value: unknown, files: ReadonlySet<string>): { entries: EquivalentEntry[]; problems: string[] } {
  const where = `${EQUIVALENT_DIRECTORY}/${pkg}.json`;
  if (value === undefined) return { entries: [], problems: [] };
  if (!Array.isArray(value)) return { entries: [], problems: [`${where}: not a JSON array`] };
  const problems: string[] = [];
  const entries: EquivalentEntry[] = [];
  value.forEach((item: unknown, index) => {
    const at = `${where} entry ${String(index + 1)}`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      problems.push(`${at}: not an object`);
      return;
    }
    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== EQUIVALENT_KEYS.length || EQUIVALENT_KEYS.some((key, position) => keys[position] !== key)) {
      problems.push(`${at}: its keys are ${keys.join(', ')}; they must be exactly ${EQUIVALENT_KEYS.join(', ')}, in that order`);
      return;
    }
    const strings = EQUIVALENT_KEYS.filter((key) => key !== 'occurrence');
    for (const key of strings) if (typeof record[key] !== 'string') problems.push(`${at}: ${key} is not a string`);
    if (!Number.isInteger(record.occurrence) || (record.occurrence as number) < 1) problems.push(`${at}: occurrence is not a whole number from 1`);
    for (const key of ['file', 'mutator', 'original', 'reason', 'proposedBy'] as const) if (record[key] === '') problems.push(`${at}: ${key} is empty`);
    if (typeof record.file === 'string' && record.file !== '' && !files.has(record.file)) problems.push(`${at}: ${record.file} is not a file the ${pkg} package's mutation run mutates`);
    entries.push(record as unknown as EquivalentEntry);
  });
  if (problems.length > 0) return { entries: [], problems };
  for (let index = 1; index < entries.length; index += 1) {
    const [before, entry] = [entries[index - 1] as EquivalentEntry, entries[index] as EquivalentEntry];
    if (compareEntries(before, entry) > 0) problems.push(`${where} entry ${String(index + 1)} (${describeMutant(entry)}) comes before entry ${String(index)}: sort by file, then original, then occurrence`);
  }
  const keys = new Set<string>();
  entries.forEach((entry, index) => {
    const key = keyOf(entry);
    if (keys.has(key)) problems.push(`${where} entry ${String(index + 1)} records ${describeMutant(entry)} a second time`);
    keys.add(key);
  });
  return { entries, problems };
}

/** Whether an entry's review is recorded: an independent reviewer, and a real calendar date no later than the run's. */
function reviewProblem(entry: EquivalentEntry, today: string): string | undefined {
  if (entry.reviewedBy.trim() === '' || entry.reviewedOn.trim() === '') return 'is not reviewed: reviewedBy and reviewedOn are empty';
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry.reviewedOn);
  const parsed = date === null ? undefined : new Date(`${entry.reviewedOn}T00:00:00Z`);
  if (parsed === undefined || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entry.reviewedOn) return `has reviewedOn "${entry.reviewedOn}", not a YYYY-MM-DD date`;
  if (entry.reviewedBy.trim().toLowerCase() === entry.proposedBy.trim().toLowerCase()) return `is reviewed by its proposer, ${entry.proposedBy.trim()}: only an independent reviewer signs an equivalent`;
  if (entry.reviewedOn > today) return `has reviewedOn "${entry.reviewedOn}", after the run's date, ${today}`;
  return undefined;
}

/** A canary verdict's runtime, when it names one as process.versions gives it. */
function runtimeOf(verdict: unknown): Runtime | undefined {
  const runtime = (verdict as { runtime?: unknown } | undefined)?.runtime as Record<string, unknown> | undefined;
  if (typeof runtime !== 'object' || runtime === null || !['node', 'unicode', 'icu'].every((key) => typeof runtime[key] === 'string')) return undefined;
  return runtime as unknown as Runtime;
}

/** The canary verdict a shard left, checked: its format, its shard, and 5 of 5 cases as expected. */
function canaryProblem(name: string, value: unknown): string | undefined {
  if (value === undefined) return `shard ${name} ran with no canary verdict (canary.json), so its runner is unproved`;
  const verdict = value as Partial<CanaryVerdict>;
  if (verdict.format !== CANARY_FORMAT) return `shard ${name}'s canary verdict is not ${CANARY_FORMAT}`;
  if (verdict.shard !== name) return `shard ${name}'s canary verdict is shard ${String(verdict.shard)}'s`;
  if (!canaryPassed(verdict as CanaryVerdict)) return `shard ${name}'s canary is ${String(verdict.asExpected)} of ${String(CANARY_CASES)} cases as expected, not ${String(CANARY_CASES)} of ${String(CANARY_CASES)}`;
  if (runtimeOf(verdict) === undefined) return `shard ${name}'s canary verdict names no runtime (node, unicode and icu, from process.versions)`;
  return undefined;
}

const percent = (basisPoints: number) => `${String(Math.floor(basisPoints / 100))}.${String(basisPoints % 100).padStart(2, '0')}%`;
const scoreOf = (detected: number, valid: number) => (valid === 0 ? null : Math.floor((detected * 10_000) / valid));

/** Judges the shards' results. */
export function judge(input: GateInput): GateResult {
  const failures: string[] = [];
  const lines: string[] = [];
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const noMutants = new Set(input.noMutants ?? []);
  const unicode = readUnicodeListing(input.unicode);
  failures.push(...unicode.problems);
  for (const file of input.stray ?? []) failures.push(`the reports directory holds ${file} at its top, where no shard writes: the gate judges only <shard>/ directories`);
  const names = new Set(input.shards.map((shard) => shard.name));
  for (const name of input.ran.keys()) if (!names.has(name)) failures.push(`${name} is not a shard of stryker/shards.json`);
  if (input.expected !== undefined) {
    for (const name of input.expected) {
      if (!names.has(name)) failures.push(`the changes job selected ${name}, which is not a shard of stryker/shards.json`);
      else if (!input.ran.has(name)) failures.push(`the changes job selected shard ${name}, which reported nothing`);
    }
    for (const name of input.ran.keys()) if (names.has(name) && !input.expected.includes(name)) failures.push(`shard ${name} reported, but the changes job did not select it`);
  }
  for (const shard of input.shards) {
    const result = input.ran.get(shard.name);
    if (result === undefined) continue;
    const canary = canaryProblem(shard.name, result.canary);
    if (canary !== undefined) failures.push(canary);
    for (const pkg of packagesOf(shard)) if (!result.reports.has(pkg)) failures.push(`shard ${shard.name} ran without its ${pkg} report (${pkg}.json)`);
    for (const stray of result.stray) failures.push(`shard ${shard.name} left ${stray}, which no shard writes`);
    for (const pkg of result.reports.keys()) if (!(packagesOf(shard) as string[]).includes(pkg)) failures.push(`shard ${shard.name} left ${pkg}.json, a report of ${pkg}, which the shard does not hold`);
  }

  const packages: PackageResult[] = [];
  for (const pkg of MUTATION_PACKAGES) {
    const own = shardsOf(pkg, input.shards);
    const ran = own.filter((shard) => input.ran.has(shard.name));
    const files = new Set(own.flatMap((shard) => shard.mutate[pkg] ?? []));
    const equivalents = readEquivalents(pkg, input.equivalents[pkg], files);
    failures.push(...equivalents.problems);
    if (ran.length === 0) {
      packages.push({ pkg, state: 'not affected', detected: 0, undetected: 0, errors: 0, scoreBasisPoints: null, files: [], undetectedMutants: [] });
      continue;
    }
    if (ran.length < own.length) {
      const missing = own.filter((shard) => !input.ran.has(shard.name)).map((shard) => shard.name);
      failures.push(`${pkg} ran in ${ran.map((shard) => shard.name).join(', ')} but not in ${missing.join(', ')}: a package's shards run all or none`);
      packages.push({ pkg, state: 'partly run', detected: 0, undetected: 0, errors: 0, scoreBasisPoints: null, files: [], undetectedMutants: [] });
      continue;
    }
    const mutants: KeyedMutant[] = [];
    const reportedFiles = new Map<string, string>();
    for (const shard of ran) {
      const report = input.ran.get(shard.name)?.reports.get(pkg);
      if (report === undefined) continue;
      const allowed = new Set(shard.mutate[pkg] ?? []);
      const present = new Set(Object.keys(report.files).map(repositoryPath));
      // A report that names a file the shard does not hold is not this shard's report, which that failure says alone.
      if ([...present].every((file) => allowed.has(file))) {
        for (const file of allowed) {
          if (!present.has(file) && !noMutants.has(file)) failures.push(`shard ${shard.name}'s ${pkg} report has no ${file}, which the shard mutates: a shard runs all its files (stryker/shards.json's noMutants lists those Stryker finds no mutant in)`);
        }
      }
      for (const mutant of keyedMutants(report)) {
        if (!allowed.has(mutant.file)) {
          failures.push(`shard ${shard.name}'s ${pkg} report mutates ${mutant.file}, which the shard does not hold`);
          break;
        }
        const first = reportedFiles.get(mutant.file);
        if (first !== undefined && first !== shard.name) {
          failures.push(`${mutant.file} is reported by shards ${first} and ${shard.name}`);
          break;
        }
        reportedFiles.set(mutant.file, shard.name);
        mutants.push(mutant);
      }
    }
    const recorded = new Map(equivalents.entries.map((entry) => [keyOf(entry), entry]));
    const matched = new Set<string>();
    const fileScores = new Map<string, { detected: number; undetected: number; errors: number }>();
    const undetectedMutants: (KeyedMutant & { equivalent: boolean })[] = [];
    let detected = 0;
    let undetected = 0;
    let errors = 0;
    for (const mutant of mutants) {
      const score = fileScores.get(mutant.file) ?? { detected: 0, undetected: 0, errors: 0 };
      fileScores.set(mutant.file, score);
      const key = keyOf(mutant);
      const entry = recorded.get(key);
      if (entry !== undefined) matched.add(key);
      if (DETECTED.has(mutant.status)) {
        detected += 1;
        score.detected += 1;
        if (entry !== undefined) failures.push(`${EQUIVALENT_DIRECTORY}/${pkg}.json records ${describeMutant(mutant)} as equivalent, but it is ${mutant.status}: a test tells it apart, so it is not equivalent`);
      } else if (UNDETECTED.has(mutant.status)) {
        undetected += 1;
        score.undetected += 1;
        undetectedMutants.push({ ...mutant, equivalent: entry !== undefined });
        if (entry === undefined) failures.push(`${pkg}: unexplained ${mutant.status} ${describeMutant(mutant)}; kill it with a test, or record it in ${EQUIVALENT_DIRECTORY}/${pkg}.json only if no input can tell it apart`);
      } else if (mutant.status === 'RuntimeError') {
        errors += 1;
        score.errors += 1;
        if (!isLoadFailure(mutant.statusReason)) failures.push(`${pkg}: RuntimeError that is not a test file's load failure: ${describeMutant(mutant)}: ${(mutant.statusReason ?? 'no reason').split('\n')[0] ?? ''}`);
        if (entry !== undefined) failures.push(`${EQUIVALENT_DIRECTORY}/${pkg}.json records ${describeMutant(mutant)} as equivalent, but it breaks a test file's load`);
      } else {
        failures.push(`${pkg}: ${mutant.status} ${describeMutant(mutant)}: ${mutant.status === 'Ignored' ? `a mutant is never ignored in the source; record it in ${EQUIVALENT_DIRECTORY}/${pkg}.json instead` : 'no mutation run here leaves a mutant so'}`);
      }
    }
    for (const entry of equivalents.entries) {
      const key = keyOf(entry);
      if (!matched.has(key)) failures.push(`${EQUIVALENT_DIRECTORY}/${pkg}.json records ${describeMutant(entry)}, which no longer exists (stale): remove it`);
      const review = reviewProblem(entry, today);
      if (review !== undefined) failures.push(`${EQUIVALENT_DIRECTORY}/${pkg}.json ${describeMutant(entry)} ${review}`);
    }
    // The entries that rest on the engine's Unicode data, held to the data each shard that scored them ran on.
    const bound = (unicode.listing?.records ?? []).filter((record) => files.has(record.file));
    for (const record of bound) if (!recorded.has(keyOf(record))) failures.push(`${UNICODE_FILE} lists ${describeMutant(record)}, which ${EQUIVALENT_DIRECTORY}/${pkg}.json does not record`);
    const checkedOn = unicode.listing?.checkedOn;
    for (const shard of ran) {
      const runtime = runtimeOf(input.ran.get(shard.name)?.canary);
      const held = bound.filter((record) => recorded.has(keyOf(record)) && (shard.mutate[pkg] ?? []).includes(record.file));
      if (checkedOn === undefined || runtime === undefined || held.length === 0 || (runtime.unicode === checkedOn.unicode && runtime.icu === checkedOn.icu)) continue;
      const [count, rest, them] = held.length === 1 ? ['1 recorded equivalent', 'rests', 'it'] : [`${String(held.length)} recorded equivalents`, 'rest', 'them'];
      failures.push(
        `${pkg}: ${count} ${rest} on the engine's Unicode data as Node ${checkedOn.node} has it (Unicode ${checkedOn.unicode}, ICU ${checkedOn.icu}), and shard ${shard.name} ran on Node ${runtime.node} (Unicode ${runtime.unicode}, ICU ${runtime.icu}): check ${them} again over every code point on that Node, then record that Node in ${UNICODE_FILE}: ${held.map((record) => describeMutant(record)).join('; ')}`,
      );
    }
    const valid = detected + undetected;
    const basisPoints = scoreOf(detected, valid);
    if (!aboveThreshold(detected, valid)) {
      failures.push(valid === 0 ? `${pkg}: no valid mutant to score` : `${pkg} scores ${percent(basisPoints ?? 0)} (${String(detected)} of ${String(valid)}), not above ${String(THRESHOLD_PERCENT)}%`);
    }
    packages.push({
      pkg,
      state: 'fully run',
      detected,
      undetected,
      errors,
      scoreBasisPoints: basisPoints,
      files: [...fileScores].map(([file, score]) => ({ file, ...score })).sort((a, b) => (a.file < b.file ? -1 : 1)),
      undetectedMutants,
    });
  }

  for (const result of packages) {
    if (result.state !== 'fully run') {
      lines.push(`${result.pkg}: ${result.state}`);
      continue;
    }
    const recorded = result.undetectedMutants.filter((mutant) => mutant.equivalent).length;
    lines.push(
      `${result.pkg}: ${result.scoreBasisPoints === null ? 'no score' : percent(result.scoreBasisPoints)} (${String(result.detected)} detected of ${String(result.detected + result.undetected)}; ${String(result.undetected)} undetected, ${String(recorded)} of them recorded equivalents; ${String(result.errors)} load failures left out)`,
    );
    for (const file of result.files) {
      const score = scoreOf(file.detected, file.detected + file.undetected);
      lines.push(`  ${file.file}: ${score === null ? 'no valid mutant' : percent(score)} (${String(file.detected)}/${String(file.detected + file.undetected)}, ${String(file.errors)} load failures)`);
    }
    for (const mutant of result.undetectedMutants) {
      lines.push(`  ${mutant.equivalent ? 'equivalent' : 'UNEXPLAINED'} ${mutant.status} ${describeMutant(mutant)}`);
      for (const test of mutant.coveredBy.slice(0, 3)) lines.push(`      covered by: ${test}`);
      if (mutant.coveredBy.length > 3) lines.push(`      and ${String(mutant.coveredBy.length - 3)} more tests`);
    }
  }
  if (packages.every((result) => result.state === 'not affected') && failures.length === 0) lines.push('No money path changed: no mutation run, nothing to judge.');
  lines.push(...failures.map((failure) => `FAIL ${failure}`));
  lines.push(failures.length === 0 ? 'mutation gate: passed' : `mutation gate: failed (${String(failures.length)} problems)`);
  return { passed: failures.length === 0, failures, packages, lines };
}

/**
 * One shard's view, for its own job's log: each of its packages' files with their scores, and every survivor, marked
 * when an equivalent records it. It judges nothing: a package is judged once all its shards have run, by the gate.
 */
export function shardView(shard: Shard, result: ShardResult, equivalents: Readonly<Partial<Record<MutationPackage, unknown>>>): string[] {
  const lines: string[] = [];
  for (const pkg of packagesOf(shard)) {
    const report = result.reports.get(pkg);
    if (report === undefined) {
      lines.push(`${shard.name}: no ${pkg} report`);
      continue;
    }
    const files = new Set(shard.mutate[pkg] ?? []);
    const recorded = new Set((Array.isArray(equivalents[pkg]) ? (equivalents[pkg] as EquivalentEntry[]) : []).filter((entry) => files.has(entry.file)).map((entry) => keyOf(entry)));
    const mutants = keyedMutants(report);
    for (const file of [...new Set(mutants.map((mutant) => mutant.file))].sort()) {
      const own = mutants.filter((mutant) => mutant.file === file);
      const detected = own.filter((mutant) => DETECTED.has(mutant.status)).length;
      const undetected = own.filter((mutant) => UNDETECTED.has(mutant.status)).length;
      const score = scoreOf(detected, detected + undetected);
      lines.push(`${shard.name} ${pkg} ${file}: ${score === null ? 'no valid mutant' : percent(score)} (${String(detected)}/${String(detected + undetected)}, ${String(own.filter((mutant) => mutant.status === 'RuntimeError').length)} load failures)`);
      for (const mutant of own.filter((candidate) => UNDETECTED.has(candidate.status))) {
        lines.push(`  ${recorded.has(keyOf(mutant)) ? 'equivalent' : 'UNEXPLAINED'} ${mutant.status} ${describeMutant(mutant)}`);
        for (const test of mutant.coveredBy.slice(0, 3)) lines.push(`      covered by: ${test}`);
      }
    }
  }
  lines.push(`(${shard.name}'s view: the mutation job judges every package once all its shards have run)`);
  return lines;
}

/** The job summary: a table of the packages, then every failure. */
export function summaryMarkdown(result: GateResult): string {
  const rows = result.packages.map((item) => {
    const recorded = item.undetectedMutants.filter((mutant) => mutant.equivalent).length;
    const score = item.scoreBasisPoints === null ? item.state : percent(item.scoreBasisPoints);
    return `| ${item.pkg} | ${score} | ${String(item.detected)} | ${String(item.undetected)} | ${String(recorded)} | ${String(item.errors)} |`;
  });
  const failures = result.failures.length === 0 ? ['Passed.'] : ['**Failed:**', '', ...result.failures.map((failure) => `- ${failure.replace(/\|/g, '\\|')}`)];
  return [
    '## Mutation gate',
    '',
    '| Package | Score | Detected | Undetected | Recorded equivalents | Load failures |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    ...failures,
    '',
  ].join('\n');
}

/** Reads <dir>/<shard>/ for every subdirectory of dir, and names the files at dir's top, where no shard writes. */
export function readReportDirectory(dir: string): { ran: Map<string, ShardResult>; stray: string[] } {
  const ran = new Map<string, ShardResult>();
  const top: string[] = [];
  if (!existsSync(dir)) return { ran, stray: top };
  for (const name of readdirSync(dir).sort()) {
    const shardDir = path.join(dir, name);
    if (!statSync(shardDir).isDirectory()) {
      top.push(name);
      continue;
    }
    const reports = new Map<string, MutationReport>();
    const stray: string[] = [];
    let canary: unknown;
    for (const file of readdirSync(shardDir).sort()) {
      const full = path.join(shardDir, file);
      if (file === 'canary.json') canary = JSON.parse(readFileSync(full, 'utf8')) as unknown;
      else if (file.endsWith('.json') && (MUTATION_PACKAGES as readonly string[]).includes(file.slice(0, -5))) reports.set(file.slice(0, -5), JSON.parse(readFileSync(full, 'utf8')) as MutationReport);
      else if (!file.endsWith('.html')) stray.push(file);
    }
    ran.set(name, { canary, reports, stray });
  }
  return { ran, stray: top };
}

/** Reads <dir>/<shard>/ for every subdirectory of dir (readReportDirectory's shards). */
export function readShardResults(dir: string): Map<string, ShardResult> {
  return readReportDirectory(dir).ran;
}

/** tools/stryker/unicode.json, parsed, or undefined when the repository has none. */
export function readUnicodeFile(root: string = repositoryRoot): unknown {
  const file = path.join(root, UNICODE_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : undefined;
}

/** Each package's equivalents file, parsed, from the repository's tools/stryker/equivalent. */
export function readEquivalentFiles(root: string = repositoryRoot): Partial<Record<MutationPackage, unknown>> {
  const found: Partial<Record<MutationPackage, unknown>> = {};
  for (const pkg of MUTATION_PACKAGES) {
    const file = path.join(root, EQUIVALENT_DIRECTORY, `${pkg}.json`);
    if (existsSync(file)) found[pkg] = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  }
  return found;
}

/** The --expected value: a JSON array of shard names, or a comma-separated list. */
export function parseExpectedShards(value: string): string[] {
  const text = value.trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      throw new Error('--expected: not a JSON array of shard names');
    }
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) throw new Error('--expected: not a JSON array of shard names');
    return parsed;
  }
  return text
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/**
 * The --expected option as the gate takes it: undefined when not given (a local run judges what ran), and refused when
 * empty, which only a changes job that wrote no output leaves.
 */
export function expectedShardsOption(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === '') throw new Error('--expected is empty: the changes job gave no shards, so what was selected is unknown');
  return parseExpectedShards(value);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    if (at === -1) return undefined;
    const value = args[at + 1];
    args.splice(at, 2);
    return value ?? '';
  };
  const expected = option('--expected');
  const summary = option('--summary');
  const onlyShard = option('--shard');
  const dir = path.resolve(repositoryRoot, args[0] ?? 'reports/mutation');
  const shards = readShards();
  const { ran, stray } = readReportDirectory(dir);
  if (onlyShard !== undefined) {
    const shard = shards.find((candidate) => candidate.name === onlyShard);
    const result = ran.get(onlyShard);
    if (shard === undefined || result === undefined) throw new Error(`--shard ${onlyShard}: no such shard, or no reports for it under ${dir}`);
    process.stdout.write(`${shardView(shard, result, readEquivalentFiles()).join('\n')}\n`);
  } else {
    const result = judge({
      shards,
      ran,
      stray,
      expected: expectedShardsOption(expected),
      equivalents: readEquivalentFiles(),
      noMutants: readNoMutants(),
      unicode: readUnicodeFile(),
      today: new Date().toISOString().slice(0, 10),
    });
    process.stdout.write(`${result.lines.join('\n')}\n`);
    if (summary !== undefined && summary !== '') appendFileSync(summary, summaryMarkdown(result));
    for (const failure of result.failures) process.stdout.write(`::error::${failure.replace(/\r?\n/g, ' ')}\n`);
    if (!result.passed) process.exitCode = 1;
  }
}
