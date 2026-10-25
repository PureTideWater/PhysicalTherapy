/**
 * What the mutation tooling reads from a Stryker JSON report (mutation-testing-report-schema 1, which Stryker 10's json
 * reporter writes), and how it names a mutant so that a record of it survives unrelated edits: by the source text
 * Stryker replaced and that text's occurrence in the file, never by a line number (docs/adr/0066, Part 4). The gate
 * (tools/stryker/gate.ts), the recorded equivalents (tools/stryker/equivalent/<package>.json) and the canary's expected
 * statuses (tools/stryker/canary/expected.json) all match mutants this way.
 */

/** Every status a mutant can have in a report. */
export const MUTANT_STATUSES = ['Killed', 'Survived', 'NoCoverage', 'Timeout', 'RuntimeError', 'CompileError', 'Ignored', 'Pending'] as const;
export type MutantStatus = (typeof MUTANT_STATUSES)[number];

/** A position in a file: the line and the column, both from 1 (the report's own convention). */
export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface ReportMutant {
  readonly id: string;
  readonly mutatorName: string;
  readonly replacement?: string;
  readonly status: MutantStatus;
  readonly statusReason?: string;
  readonly static?: boolean;
  readonly coveredBy?: readonly string[];
  readonly killedBy?: readonly string[];
  /** From the start, inclusive, to the end, exclusive. */
  readonly location: { readonly start: Position; readonly end: Position };
}

export interface ReportFile {
  readonly source: string;
  readonly mutants: readonly ReportMutant[];
}

export interface MutationReport {
  readonly schemaVersion: string;
  /** By path, relative to the run's root (the repository's, or the sandbox's, which mirrors it). */
  readonly files: Readonly<Record<string, ReportFile>>;
  readonly testFiles?: Readonly<Record<string, { readonly tests: readonly { readonly id: string; readonly name: string }[] }>>;
}

/** A mutant as a record names it: its file, its mutator, the text it replaced (and which occurrence), and its replacement. */
export interface MutantKey {
  /** Relative to the repository's root, with forward slashes. */
  readonly file: string;
  readonly mutator: string;
  /** The exact source text Stryker replaced. */
  readonly original: string;
  /** Which occurrence of `original` in the file, from 1: every start position counts, overlapping ones included. */
  readonly occurrence: number;
  readonly replacement: string;
}

/** A mutant of a report, with its key, its status and where it is. */
export interface KeyedMutant extends MutantKey {
  readonly status: MutantStatus;
  readonly statusReason: string | undefined;
  readonly line: number;
  readonly column: number;
  /** The names of the tests that cover it, as the report gives them. */
  readonly coveredBy: readonly string[];
}

/** The offset in `source` of a report position. */
export function offsetOf(source: string, position: Position): number {
  let at = 0;
  for (let line = 1; line < position.line; line += 1) {
    const next = source.indexOf('\n', at);
    if (next === -1) throw new Error(`line ${String(position.line)} is past the end of the source`);
    at = next + 1;
  }
  return at + position.column - 1;
}

/** The 1-based occurrence of `original` that starts at `start`, counting every start position in `source`. */
export function occurrenceAt(source: string, original: string, start: number): number {
  if (source.slice(start, start + original.length) !== original) throw new Error('the original text is not at its start');
  let count = 0;
  for (let at = source.indexOf(original); at !== -1 && at <= start; at = source.indexOf(original, at + 1)) count += 1;
  return count;
}

/** The repository-relative form of a report's file path: forward slashes, no leading `./`. */
export function repositoryPath(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * A source read once for all its mutants: offsetOf's and occurrenceAt's answers, from the line starts and each
 * original's start positions, each found on first use. A report is then read in time linear in its source and mutants,
 * not in their product, which a scan of the whole source per mutant would take.
 */
export function sourceIndex(source: string): { offset(position: Position): number; occurrence(original: string, start: number): number } {
  const lineStarts = [0];
  for (let at = source.indexOf('\n'); at !== -1; at = source.indexOf('\n', at + 1)) lineStarts.push(at + 1);
  const startsOf = new Map<string, number[]>();
  return {
    offset(position) {
      const lineStart = lineStarts[position.line - 1];
      if (lineStart === undefined) throw new Error(`line ${String(position.line)} is past the end of the source`);
      return lineStart + position.column - 1;
    },
    occurrence(original, start) {
      let starts = startsOf.get(original);
      if (starts === undefined) {
        starts = [];
        for (let at = source.indexOf(original); at !== -1; at = source.indexOf(original, at + 1)) starts.push(at);
        startsOf.set(original, starts);
      }
      // How many start at or before `start`: the first position after it, by binary search.
      let low = 0;
      let high = starts.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if ((starts[middle] ?? Number.POSITIVE_INFINITY) <= start) low = middle + 1;
        else high = middle;
      }
      if (starts[low - 1] !== start) throw new Error('the original text is not at its start');
      return low;
    },
  };
}

/** Every mutant of a report, keyed, in the report's file order and each file's mutant order. */
export function keyedMutants(report: MutationReport): KeyedMutant[] {
  const names = new Map<string, string>();
  for (const testFile of Object.values(report.testFiles ?? {})) for (const test of testFile.tests) names.set(test.id, test.name);
  const keyed: KeyedMutant[] = [];
  for (const [name, file] of Object.entries(report.files)) {
    const index = sourceIndex(file.source);
    for (const mutant of file.mutants) {
      const start = index.offset(mutant.location.start);
      const original = file.source.slice(start, index.offset(mutant.location.end));
      keyed.push({
        file: repositoryPath(name),
        mutator: mutant.mutatorName,
        original,
        occurrence: index.occurrence(original, start),
        replacement: mutant.replacement ?? '',
        status: mutant.status,
        statusReason: mutant.statusReason,
        line: mutant.location.start.line,
        column: mutant.location.start.column,
        coveredBy: (mutant.coveredBy ?? []).map((id) => names.get(id) ?? id),
      });
    }
  }
  return keyed;
}

/** One string per key, for matching. */
export function keyOf(key: MutantKey): string {
  return JSON.stringify([key.file, key.mutator, key.original, key.occurrence, key.replacement]);
}

/** A short, one-line description of a mutant for a log: where it is, what it does. */
export function describeMutant(mutant: MutantKey & { readonly line?: number; readonly column?: number }): string {
  const clip = (text: string) => JSON.stringify(text.length > 80 ? `${text.slice(0, 77)}...` : text);
  const where = mutant.line === undefined ? mutant.file : `${mutant.file}:${String(mutant.line)}:${String(mutant.column ?? 1)}`;
  return `${where} ${mutant.mutator} ${clip(mutant.original)} #${String(mutant.occurrence)} -> ${clip(mutant.replacement)}`;
}

/** Whether a mutant counts as detected in Stryker's score. */
export const DETECTED: ReadonlySet<MutantStatus> = new Set(['Killed', 'Timeout']);
/** Whether a mutant counts as undetected in Stryker's score. */
export const UNDETECTED: ReadonlySet<MutantStatus> = new Set(['Survived', 'NoCoverage']);
