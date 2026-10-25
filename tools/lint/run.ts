import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { repositoryRoot } from '../content-files';
import { type Host, LINT_GROUPS, type LintGroup, RESERVED_MB, budgetMb, currentHost, eslintArgs, groupProblems, heapFor, largestFirst, runScheduled } from './groups';

/**
 * `pnpm lint` (docs/adr/0066 Part 1; test matrix CI-08): ESLint over the repository as three memory-bounded groups
 * (./groups.ts), each its own `node --max-old-space-size=<heap> node_modules/eslint/bin/eslint.js <dir> ...
 * --max-warnings=0` process, as many at once as the host's memory and cores admit. Each group prints its file count,
 * its problems (ESLint's stylish format, as one run printed them), its peak RSS and its duration; the run fails when
 * any group does. `pnpm lint --fix` passes --fix to every group. Under GitHub Actions the table also goes to the step
 * summary.
 */

/**
 * A module each measured child imports first: at exit it writes the process's peak resident set (KB, from
 * getrusage) to file descriptor 3, which the parent reads. Node offers no child's rusage, and a data: URL needs no
 * file beside the runner.
 */
export const PEAK_RSS_PROBE = `data:text/javascript,${encodeURIComponent(
  "import{writeSync}from'node:fs';process.on('exit',()=>{try{writeSync(3,String(process.resourceUsage().maxRSS))}catch{}});",
)}`;

/** One child's outcome. */
export interface Measured {
  /** The exit code, or null when a signal ended it. */
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Peak resident set in MB, when the child lived to report it. */
  readonly peakRssMb: number | undefined;
  readonly seconds: number;
}

/** Runs `node <args>` (with the peak-RSS probe) and resolves when it exits, never rejecting. */
export function runMeasured(args: readonly string[], options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }): Promise<Measured> {
  const started = process.hrtime.bigint();
  const seconds = () => Number(process.hrtime.bigint() - started) / 1e9;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', PEAK_RSS_PROBE, ...args], { cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const probe: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    (child.stdio[3] as NodeJS.ReadableStream | null)?.on('data', (chunk: Buffer) => probe.push(chunk));
    child.on('error', (error) => {
      resolve({ code: null, signal: null, stdout: '', stderr: `${error.message}\n`, peakRssMb: undefined, seconds: seconds() });
    });
    child.on('close', (code, signal) => {
      const kb = Number.parseInt(Buffer.concat(probe).toString('utf8'), 10);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        peakRssMb: Number.isFinite(kb) ? Math.round(kb / 1024) : undefined,
        seconds: seconds(),
      });
    });
  });
}

const thousands = new Intl.NumberFormat('en-US');

/** 4813 → "4,813 MB"; unknown → "unknown". */
export function formatMb(mb: number | undefined): string {
  return mb === undefined ? 'unknown' : `${thousands.format(mb)} MB`;
}

/** 1 → "1 file", 2 → "2 files"; words that take -es give their plural. */
export function plural(count: number, word: string, words = `${word}s`): string {
  return `${thousands.format(count)} ${count === 1 ? word : words}`;
}

/** Appends Markdown to the GitHub Actions step summary, when there is one. */
export function appendStepSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file !== undefined && file !== '') {
    appendFileSync(file, `${markdown}\n`);
  }
}

/** The part of ESLint's LintResult the runner reads. */
interface LintResult {
  readonly filePath: string;
  /** Fatal (parsing) errors included. */
  readonly errorCount: number;
  readonly warningCount: number;
}

interface GroupOutcome {
  readonly group: LintGroup;
  readonly heapMb: number;
  readonly measured: Measured;
  /** Undefined when ESLint wrote no results (it crashed, or its configuration did not load). */
  readonly results: readonly LintResult[] | undefined;
  /** The problems in ESLint's stylish format, as one ESLint run prints them. */
  readonly problems: string;
  readonly passed: boolean;
}

export interface LintOptions {
  readonly root: string;
  readonly groups?: readonly LintGroup[];
  readonly host?: Host;
  /** ESLint's CLI, node_modules/eslint/bin/eslint.js under the root unless given. */
  readonly eslintBin?: string;
  /** The arguments after `pnpm lint`. */
  readonly extraArgs?: readonly string[];
  /** Colours in the problems, or (undefined) as ESLint would decide for this terminal. */
  readonly color?: boolean;
  readonly write?: (text: string) => void;
}

/** The arguments `pnpm lint` passes on to every group. */
const PASSED_THROUGH = new Set(['--fix']);

/** Lints the repository in groups; resolves with the exit code (0 passed, 1 a group failed, 2 refused to run). */
export async function lint(options: LintOptions): Promise<number> {
  const write = options.write ?? ((text: string) => void process.stdout.write(text));
  const groups = options.groups ?? LINT_GROUPS;
  // pnpm 10 passes `pnpm lint -- --fix`'s separator on.
  const extra = (options.extraArgs ?? []).filter((arg, index) => !(index === 0 && arg === '--'));
  const refused = extra.filter((arg) => !PASSED_THROUGH.has(arg));
  if (refused.length > 0) {
    write(`lint: pnpm lint takes no argument but --fix (given: ${refused.join(' ')}). Run node_modules/eslint/bin/eslint.js directly for anything else.\n`);
    return 2;
  }
  const invalid = groupProblems(groups);
  if (invalid.length > 0) {
    write(`lint: the groups would not lint each file exactly once:\n${invalid.map((problem) => `- ${problem}\n`).join('')}`);
    return 2;
  }
  if (existsSync(path.join(options.root, 'eslint-suppressions.json'))) {
    write(
      'lint: eslint-suppressions.json exists, and bulk suppressions cannot run in groups: each group would report the suppressions of the files it does not lint as unused. Fix the problems instead (the repository lints with --max-warnings=0).\n',
    );
    return 2;
  }
  const host = options.host ?? currentHost();
  const eslintBin = options.eslintBin ?? path.join(options.root, 'node_modules/eslint/bin/eslint.js');
  const planned = largestFirst(groups.map((group) => ({ group, heapMb: heapFor(group.nominalHeapMb, host) })));
  write(
    `lint: ${plural(groups.length, 'group')}, largest heap first, within a memory budget of ${formatMb(budgetMb(host))} (${formatMb(host.memoryMb)} less ${formatMb(RESERVED_MB)} reserved) and ${plural(host.parallelism, 'process', 'processes')} at once\n`,
  );

  const { ESLint } = await import('eslint');
  const stylish = await new ESLint({ cwd: options.root }).loadFormatter('stylish');
  const resultsDir = mkdtempSync(path.join(tmpdir(), 'tp-lint-'));
  const started = process.hrtime.bigint();
  let outcomes: GroupOutcome[];
  try {
    outcomes = await runScheduled(
      planned,
      host,
      async ({ group, heapMb }): Promise<GroupOutcome> => {
        write(`lint ${group.name}: started (heap ${formatMb(heapMb)})\n`);
        const output = path.join(resultsDir, `${String(groups.indexOf(group))}.json`);
        const measured = await runMeasured([...eslintArgs(group, heapMb, eslintBin, extra), '--format', 'json', '--output-file', output], { cwd: options.root });
        const parsed = existsSync(output) ? (JSON.parse(readFileSync(output, 'utf8')) as Parameters<typeof stylish.format>[0]) : undefined;
        const problems = parsed === undefined ? '' : await stylish.format(parsed, options.color === undefined ? {} : { color: options.color });
        return { group, heapMb, measured, results: parsed, problems, passed: measured.code === 0 && parsed !== undefined };
      },
      (_, outcome) => {
        write(`${groupLine(outcome)}\n`);
        for (const text of [outcome.problems, outcome.measured.stdout, outcome.measured.stderr]) {
          if (text !== '') {
            write(text.endsWith('\n') ? text : `${text}\n`);
          }
        }
      },
    );
  } finally {
    rmSync(resultsDir, { recursive: true, force: true });
  }
  const wall = Number(process.hrtime.bigint() - started) / 1e9;

  const failed = outcomes.filter((outcome) => !outcome.passed).map((outcome) => outcome.group.name);
  const files = outcomes.reduce((sum, outcome) => sum + (outcome.results?.length ?? 0), 0);
  const errors = outcomes.reduce((sum, outcome) => sum + counts(outcome).errors, 0);
  const warnings = outcomes.reduce((sum, outcome) => sum + counts(outcome).warnings, 0);
  const verdict = failed.length === 0 ? 'passed' : `failed (${failed.join(', ')})`;
  write(`lint: ${verdict}, ${plural(files, 'file')} in ${plural(groups.length, 'group')}, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${wall.toFixed(1)} s wall\n`);
  appendStepSummary(
    [
      `### pnpm lint: ${verdict}`,
      '',
      '| Group | Files | Errors | Warnings | Peak RSS | Heap | Time | Result |',
      '|---|---:|---:|---:|---:|---:|---:|---|',
      ...outcomes.map((outcome) => {
        const { errors: e, warnings: w } = counts(outcome);
        const n = outcome.results?.length;
        return `| \`${outcome.group.name}\` | ${n === undefined ? 'none' : thousands.format(n)} | ${String(e)} | ${String(w)} | ${formatMb(outcome.measured.peakRssMb)} | ${formatMb(outcome.heapMb)} | ${outcome.measured.seconds.toFixed(1)} s | ${outcome.passed ? 'passed' : 'failed'} |`;
      }),
      '',
      `${plural(files, 'file')}, ${wall.toFixed(1)} s wall, memory budget ${formatMb(budgetMb(host))}, ${plural(host.parallelism, 'process', 'processes')} at once.`,
    ].join('\n'),
  );
  return failed.length === 0 ? 0 : 1;
}

function counts(outcome: GroupOutcome): { errors: number; warnings: number } {
  return (outcome.results ?? []).reduce(
    (sum, result) => ({ errors: sum.errors + result.errorCount, warnings: sum.warnings + result.warningCount }),
    { errors: 0, warnings: 0 },
  );
}

/** "lint packages: passed, 450 files, 0 errors, 0 warnings, peak RSS 2,622 MB (heap 4,096 MB), 45.0 s". */
function groupLine(outcome: GroupOutcome): string {
  const { group, heapMb, measured, results } = outcome;
  const memory = `peak RSS ${formatMb(measured.peakRssMb)} (heap ${formatMb(heapMb)}), ${measured.seconds.toFixed(1)} s`;
  if (results === undefined) {
    const ended = measured.signal === null ? `exited with ${String(measured.code)}` : `was ended by ${measured.signal}`;
    return `lint ${group.name}: failed (ESLint ${ended} and wrote no results), ${memory}`;
  }
  const { errors, warnings } = counts(outcome);
  return `lint ${group.name}: ${outcome.passed ? 'passed' : 'failed'}, ${plural(results.length, 'file')}, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${memory}`;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  lint({ root: repositoryRoot, extraArgs: process.argv.slice(2) }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`lint: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
