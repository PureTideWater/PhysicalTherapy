import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { repositoryRoot } from '../../content-files';
import { type KeyedMutant, MUTANT_STATUSES, type MutantStatus, type MutationReport, describeMutant, keyOf, keyedMutants } from '../mutants';
import { describeRuntime, processRuntime } from '../runtime';

/**
 * The mutation canary's verdict (tools/stryker/canary/stryker.config.mjs; docs/adr/0066, Part 4): each of its five
 * cases holds its file's mutants, every one of them, to the statuses expected.json allows it, so a shard reports its
 * score only when the runner it scores with has shown, in that job, the five things a score relies on. A case is as
 * expected when every mutant of its file has an expectation, every expectation a mutant, and every status is allowed.
 *
 * `pnpm -s exec tsx tools/stryker/canary/verdict.ts [--shard <shard>] [--report <file>]` reads the canary's report
 * (reports/canary/report.json), prints each case's verdict and writes them for the mutation gate, with the Node,
 * Unicode and ICU versions the shard runs on, the pnpm that runs it and the commit it checked out (docs/adr/0066,
 * Part 7: the gate holds every shard to the pins and to one commit), to reports/mutation/<shard>/canary.json
 * (reports/canary/verdict.json without a shard). It exits 1 unless all five cases are as expected.
 */

/** The verdict file's format, which the gate requires. */
export const CANARY_FORMAT = 'tp-mutation-canary/1';
/** How many cases the canary has; the gate requires all of them as expected. */
export const CANARY_CASES = 5;
export const CANARY_REPORT = 'reports/canary/report.json';
export const EXPECTED_FILE = 'tools/stryker/canary/expected.json';

export interface ExpectedMutant {
  readonly mutator: string;
  readonly original: string;
  readonly occurrence: number;
  readonly replacement: string;
  /** The statuses this mutant may have. */
  readonly expect: readonly MutantStatus[];
}

export interface ExpectedCase {
  readonly case: number;
  /** What the case proves, in a few words. */
  readonly proves: string;
  /** The file it mutates, relative to the repository's root. */
  readonly file: string;
  readonly mutants: readonly ExpectedMutant[];
}

export interface Expected {
  readonly cases: readonly ExpectedCase[];
}

export interface CaseVerdict {
  readonly case: number;
  readonly proves: string;
  readonly file: string;
  readonly mutants: number;
  readonly asExpected: boolean;
  readonly problems: readonly string[];
}

/** The Node a shard ran on, the Unicode and ICU data its engine holds (process.versions), and the pnpm that ran it. */
export interface Runtime {
  readonly node: string;
  readonly unicode: string;
  readonly icu: string;
  readonly pnpm: string;
}

/**
 * This process's runtime: the shard's, since its canary step and its Stryker run use the same Node and are started by
 * the same pnpm (its user agent names it; tools/stryker/runtime.ts).
 */
export function currentRuntime(): Runtime {
  return processRuntime();
}

const COMMIT = /^[0-9a-f]{40}$/;
const REF = /^refs\/[A-Za-z0-9._/-]+$/;

/**
 * The commit checked out at `root`, read from its .git as files, never by running git: HEAD itself when detached (a
 * pull request's checkout of its merge commit), or the branch HEAD names (a push's `checkout -B <branch>`) through its
 * loose ref, in the git directory and then the common one (a linked worktree's .git is a file naming its git
 * directory, whose commondir holds the branches), or packed-refs. '' for anything else, which the gate fails on
 * Actions.
 */
export function headCommit(root: string = repositoryRoot): string {
  const firstLine = (file: string) => (existsSync(file) && statSync(file).isFile() ? (readFileSync(file, 'utf8').split('\n')[0] ?? '').trim() : '');
  try {
    const dotGit = path.join(root, '.git');
    if (!existsSync(dotGit)) return '';
    let gitDir = dotGit;
    if (statSync(dotGit).isFile()) {
      const pointer = /^gitdir: (.+)$/.exec(firstLine(dotGit))?.[1];
      if (pointer === undefined) return '';
      gitDir = path.resolve(root, pointer);
    }
    const common = firstLine(path.join(gitDir, 'commondir'));
    const commonDir = common === '' ? gitDir : path.resolve(gitDir, common);
    const head = firstLine(path.join(gitDir, 'HEAD'));
    if (COMMIT.test(head)) return head;
    const ref = /^ref: (\S+)$/.exec(head)?.[1];
    if (ref === undefined || !REF.test(ref) || ref.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return '';
    for (const directory of [gitDir, commonDir]) {
      const loose = firstLine(path.join(directory, ref));
      if (COMMIT.test(loose)) return loose;
    }
    const packed = existsSync(path.join(commonDir, 'packed-refs')) ? readFileSync(path.join(commonDir, 'packed-refs'), 'utf8').split('\n') : [];
    for (const line of packed) {
      const [commit, name] = line.trim().split(' ');
      if (name === ref && commit !== undefined && COMMIT.test(commit)) return commit;
    }
    return '';
  } catch {
    return '';
  }
}

export interface CanaryVerdict {
  readonly format: typeof CANARY_FORMAT;
  readonly shard: string | null;
  /** The Node the shard ran on: the gate holds the equivalents that rest on Unicode data to it (tools/stryker/unicode.json). */
  readonly runtime: Runtime;
  /** The commit the shard ran on. */
  readonly commit: string;
  readonly total: number;
  readonly asExpected: number;
  readonly cases: readonly CaseVerdict[];
  /** Mutants of a file no case names, or cases the canary should have and does not. */
  readonly problems: readonly string[];
}

/** expected.json, checked: cases 1 to 5 in order, each with a file and at least one mutant, every status a status. */
export function parseExpected(value: unknown): Expected {
  const fail = (why: string): never => {
    throw new Error(`${EXPECTED_FILE}: ${why}`);
  };
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { cases?: unknown }).cases)) fail('holds no list of cases');
  const cases = (value as { cases: unknown[] }).cases;
  if (cases.length !== CANARY_CASES) fail(`holds ${String(cases.length)} cases, not ${String(CANARY_CASES)}`);
  return {
    cases: cases.map((item, index) => {
      const entry = item as Partial<ExpectedCase>;
      if (entry.case !== index + 1) fail(`case ${String(index + 1)} is numbered ${String(entry.case)}`);
      if (typeof entry.proves !== 'string' || entry.proves === '' || typeof entry.file !== 'string' || entry.file === '') fail(`case ${String(index + 1)} names no file or what it proves`);
      if (!Array.isArray(entry.mutants) || entry.mutants.length === 0) fail(`case ${String(index + 1)} expects no mutant`);
      for (const mutant of entry.mutants ?? []) {
        const statuses: unknown = (mutant as { expect?: unknown }).expect;
        const known = Array.isArray(statuses) && statuses.length > 0 && statuses.every((status: unknown) => typeof status === 'string' && (MUTANT_STATUSES as readonly string[]).includes(status));
        const shaped = typeof mutant.mutator === 'string' && typeof mutant.original === 'string' && Number.isInteger(mutant.occurrence) && mutant.occurrence >= 1 && typeof mutant.replacement === 'string';
        if (!known || !shaped) fail(`case ${String(index + 1)} has a mutant without a mutator, original, occurrence, replacement and known statuses: ${JSON.stringify(mutant)}`);
      }
      return entry as ExpectedCase;
    }),
  };
}

/** Judges the canary's report case by case, on the runtime and commit given (this process's and checkout's by default). */
export function judgeCanary(report: MutationReport, expected: Expected, shard: string | null = null, runtime: Runtime = currentRuntime(), commit: string = headCommit()): CanaryVerdict {
  const mutants = keyedMutants(report);
  const caseFiles = new Set(expected.cases.map((item) => item.file));
  const problems = [...new Set(mutants.filter((mutant) => !caseFiles.has(mutant.file)).map((mutant) => mutant.file))].map((file) => `${file} is mutated, but no case names it`);
  if (expected.cases.length !== CANARY_CASES) problems.push(`the canary has ${String(expected.cases.length)} cases, not ${String(CANARY_CASES)}`);
  const cases = expected.cases.map((item): CaseVerdict => {
    const reported = new Map<string, KeyedMutant>();
    const caseProblems: string[] = [];
    for (const mutant of mutants.filter((candidate) => candidate.file === item.file)) {
      const key = keyOf(mutant);
      if (reported.has(key)) caseProblems.push(`two mutants share a key: ${describeMutant(mutant)}`);
      reported.set(key, mutant);
    }
    const seen = new Set<string>();
    for (const want of item.mutants) {
      const key = keyOf({ file: item.file, ...want });
      seen.add(key);
      const found = reported.get(key);
      if (found === undefined) {
        caseProblems.push(`expected, not reported: ${describeMutant({ file: item.file, ...want })}`);
      } else if (!want.expect.includes(found.status)) {
        caseProblems.push(`${describeMutant(found)}: ${found.status}, expected ${want.expect.join(' or ')}${found.statusReason === undefined ? '' : ` (${found.statusReason.split('\n')[0] ?? ''})`}`);
      }
    }
    for (const [key, found] of reported) if (!seen.has(key)) caseProblems.push(`reported, not expected: ${describeMutant(found)} (${found.status})`);
    return { case: item.case, proves: item.proves, file: item.file, mutants: reported.size, asExpected: caseProblems.length === 0, problems: caseProblems };
  });
  const asExpected = problems.length === 0 ? cases.filter((item) => item.asExpected).length : 0;
  return { format: CANARY_FORMAT, shard, runtime, commit, total: CANARY_CASES, asExpected, cases, problems };
}

/** Whether a verdict lets its shard score: all five cases as expected and nothing else wrong. */
export function canaryPassed(verdict: CanaryVerdict): boolean {
  return verdict.problems.length === 0 && verdict.total === CANARY_CASES && verdict.asExpected === CANARY_CASES && verdict.cases.length === CANARY_CASES && verdict.cases.every((item) => item.asExpected);
}

/** The verdict as the shard's log shows it. */
export function verdictLines(verdict: CanaryVerdict): string[] {
  const lines = verdict.cases.flatMap((item) => [
    `canary case ${String(item.case)} (${item.proves}; ${item.file}, ${String(item.mutants)} mutants): ${item.asExpected ? 'as expected' : 'NOT as expected'}`,
    ...item.problems.map((problem) => `  ${problem}`),
  ]);
  lines.push(...verdict.problems.map((problem) => `canary: ${problem}`));
  lines.push(`canary: on ${describeRuntime(verdict.runtime)}, at commit ${verdict.commit === '' ? '(none: .git names none)' : verdict.commit}`);
  lines.push(`canary${verdict.shard === null ? '' : ` (${verdict.shard})`}: ${String(verdict.asExpected)} of ${String(verdict.total)} cases as expected`);
  return lines;
}

/** Where the verdict is written for the gate. */
export function verdictFile(shard: string | null): string {
  return shard === null ? 'reports/canary/verdict.json' : `reports/mutation/${shard}/canary.json`;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const shard = option('--shard') ?? null;
  const report = JSON.parse(readFileSync(path.resolve(repositoryRoot, option('--report') ?? CANARY_REPORT), 'utf8')) as MutationReport;
  const expected = parseExpected(JSON.parse(readFileSync(path.join(repositoryRoot, EXPECTED_FILE), 'utf8')));
  const verdict = judgeCanary(report, expected, shard);
  const out = path.join(repositoryRoot, verdictFile(shard));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(verdict, null, 2)}\n`);
  process.stdout.write(`${verdictLines(verdict).join('\n')}\n`);
  if (!canaryPassed(verdict)) {
    process.stdout.write('::error::The mutation canary is not 5 of 5 as expected, so this shard reports no score (docs/runbooks/ci.md, "Mutation testing").\n');
    process.exitCode = 1;
  }
}
