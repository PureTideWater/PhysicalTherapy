import type { MutationPackage, Shard } from '../../stryker/base.mjs';
import { type CanaryVerdict, CANARY_CASES, CANARY_FORMAT } from './canary/verdict';
import type { EquivalentEntry, ShardResult } from './gate';
import type { MutantStatus, MutationReport, ReportMutant } from './mutants';

/**
 * Synthetic Stryker reports, canary verdicts and equivalents for the mutation tooling's tests (gate, canary verdict,
 * mutant keys): built in memory from source text, so each test states exactly the mutants it judges.
 */

export interface MutantSpec {
  readonly original: string;
  /** Which occurrence of `original` in the source, from 1 (default 1). */
  readonly occurrence?: number;
  readonly mutator?: string;
  readonly replacement?: string;
  readonly status: MutantStatus;
  readonly statusReason?: string;
  readonly coveredBy?: readonly string[];
}

function positionAt(source: string, offset: number) {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/** A report of the given files, each mutant placed at its original text's occurrence in the file's source. */
export function reportOf(files: Readonly<Record<string, { readonly source: string; readonly mutants: readonly MutantSpec[] }>>): MutationReport {
  let id = 0;
  const tests = new Set<string>();
  const built: Record<string, { source: string; mutants: ReportMutant[] }> = {};
  for (const [file, { source, mutants }] of Object.entries(files)) {
    built[file] = {
      source,
      mutants: mutants.map((spec) => {
        let start = -1;
        for (let seen = 0; seen < (spec.occurrence ?? 1); seen += 1) {
          start = source.indexOf(spec.original, start + 1);
          if (start === -1) throw new Error(`${file}: no occurrence ${String(spec.occurrence ?? 1)} of ${spec.original}`);
        }
        for (const test of spec.coveredBy ?? []) tests.add(test);
        id += 1;
        return {
          id: String(id),
          mutatorName: spec.mutator ?? 'StringLiteral',
          replacement: spec.replacement ?? '""',
          status: spec.status,
          ...(spec.statusReason === undefined ? {} : { statusReason: spec.statusReason }),
          coveredBy: [...(spec.coveredBy ?? [])],
          location: { start: positionAt(source, start), end: positionAt(source, start + spec.original.length) },
        };
      }),
    };
  }
  return { schemaVersion: '1.0', files: built, testFiles: { 'synthetic.test.ts': { tests: [...tests].map((name) => ({ id: name, name })) } } };
}

/** A file of `count` one-line mutants, each `x` at its own occurrence: the first `detected` Killed, the rest Survived. */
export function scoredFile(count: number, detected: number): { source: string; mutants: MutantSpec[] } {
  return {
    source: 'x\n'.repeat(count),
    mutants: Array.from({ length: count }, (_, index) => ({ original: 'x', occurrence: index + 1, status: index < detected ? 'Killed' : 'Survived' })),
  };
}

/** An equivalent record of a scoredFile mutant (or any `x` mutant), reviewed unless told otherwise. */
export function equivalentOf(file: string, occurrence: number, overrides: Partial<EquivalentEntry> = {}): EquivalentEntry {
  return {
    file,
    mutator: 'StringLiteral',
    original: 'x',
    occurrence,
    replacement: '""',
    reason: 'no input reaches a difference',
    proposedBy: 'M3',
    reviewedBy: 'the integrator',
    reviewedOn: '2026-10-25',
    ...overrides,
  };
}

/** The canary verdict of a shard whose five cases were as expected, or of one whose listed cases were not. */
export function canaryOf(shard: string, failing: readonly number[] = []): CanaryVerdict {
  const cases = Array.from({ length: CANARY_CASES }, (_, index) => ({
    case: index + 1,
    proves: `case ${String(index + 1)}`,
    file: `tools/stryker/canary/case${String(index + 1)}.ts`,
    mutants: 2,
    asExpected: !failing.includes(index + 1),
    problems: failing.includes(index + 1) ? ['a mutant not as expected'] : [],
  }));
  return { format: CANARY_FORMAT, shard, total: CANARY_CASES, asExpected: cases.filter((item) => item.asExpected).length, cases, problems: [] };
}

/** A shard's result: its canary verdict (as expected unless given) and its packages' reports. */
export function shardResult(name: string, reports: Partial<Record<MutationPackage, MutationReport>>, canary: unknown = canaryOf(name)): ShardResult {
  return { canary, reports: new Map(Object.entries(reports) as [MutationPackage, MutationReport][]), stray: [] };
}

/** Four packages over five shards: money and ledger together, pricing over two, packets alone. */
export const TEST_SHARDS: readonly Shard[] = [
  { name: 'money-ledger', mutate: { money: ['packages/money/src/a.ts'], ledger: ['packages/ledger/src/b.ts'] } },
  { name: 'pricing-one', mutate: { pricing: ['packages/pricing/src/c.ts'] } },
  { name: 'pricing-two', mutate: { pricing: ['packages/pricing/src/d.ts'] } },
  { name: 'packets-all', mutate: { packets: ['packages/packets/src/e.ts'] } },
];
