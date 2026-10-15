import { type Cents, cents, sumCents } from '@tp/money';

import { type NotActionableReason, type TriageFacts, judgeLine } from './actionable';
import { type AdjustmentBehavior } from './behavior';

/**
 * Case grouping by payer pattern (PRD 12, From validated to actionable; PRD 5, J8; test matrix CAS-03,
 * CAS-04). Lines are grouped into a case by payer pattern: the same payer and plan, the same rate
 * record (for a Medicare Advantage non-contracted line, which has none, the fee schedule it priced
 * from), and the same adjustment behavior detected from the trace. One case per pattern: a pattern
 * with an open case adds its new lines to it. Case materiality (default $250) decides whether a case
 * is created at all: a pattern whose actionable lines total less is not created and accumulates, its
 * lines waiting (validated) until later lines of the same pattern carry it across.
 *
 * Which lines a case holds: its pattern's actionable lines, and its lines that would be actionable but
 * for a window that has passed, which join it struck through (written off, window passed) and out of
 * its actionable total (J8). Lines below the line materiality, of a reversed or superseded claim, of a
 * version no longer signed off, or written off already stay validated and join no case.
 */

/** A payer pattern (stored as case.pattern_key). */
export interface PatternKey {
  readonly payer_id: string;
  readonly plan_id: string;
  /** contract or ma_noncontracted. */
  readonly mapping_kind: string;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly behavior: AdjustmentBehavior;
}

/** A pattern as one stable string. */
export function patternId(key: PatternKey): string {
  return JSON.stringify([key.payer_id, key.plan_id, key.mapping_kind, key.contract_version_id, key.rate_record_id, key.behavior]);
}

/** A validated line that is in no case yet. */
export interface CandidateLine extends TriageFacts {
  readonly serviceLineId: string;
  readonly pricedLineId: string;
  readonly pattern: PatternKey;
}

/** A line a case takes: actionable, or struck through because its window passed. */
export interface PlannedLine {
  readonly serviceLineId: string;
  readonly pricedLineId: string;
  readonly varianceCents: Cents;
  readonly windowPassed: boolean;
}

export interface PlannedCase {
  readonly pattern: PatternKey;
  readonly lines: readonly PlannedLine[];
  /** The sum of the lines' variance less the struck lines': what the case asks for. */
  readonly actionableCents: Cents;
}

export interface HeldPattern {
  readonly pattern: PatternKey;
  readonly actionableLines: number;
  readonly actionableCents: Cents;
}

export interface CasePlan {
  /** Patterns at or above the case materiality with no open case: a case each. */
  readonly created: readonly PlannedCase[];
  /** New lines of patterns that have an open case. */
  readonly added: readonly (PlannedCase & { readonly caseId: string })[];
  /** Patterns below the case materiality: no case yet; their lines accumulate. */
  readonly held: readonly HeldPattern[];
  /** Why each validated line joins no case, by line. */
  readonly waiting: ReadonlyMap<string, readonly NotActionableReason[]>;
}

export interface GroupingSettings {
  readonly lineMaterialityCents: Cents;
  readonly caseMaterialityCents: Cents;
}

function byPattern(a: { readonly pattern: PatternKey }, b: { readonly pattern: PatternKey }): number {
  const left = patternId(a.pattern);
  const right = patternId(b.pattern);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The cases a triage creates and extends on its triage date. `openCases` names, by pattern, the open
 * case of each pattern that has one. Validated lines only: an unpriced or overpaid candidate is left
 * out (it never becomes a case).
 */
export function planCases(candidates: readonly CandidateLine[], openCases: ReadonlyMap<string, string>, settings: GroupingSettings, asOf: string): CasePlan {
  const groups = new Map<string, { readonly pattern: PatternKey; readonly lines: PlannedLine[] }>();
  const waiting = new Map<string, readonly NotActionableReason[]>();
  for (const line of candidates) {
    const judgement = judgeLine(line, settings.lineMaterialityCents, asOf);
    if (!judgement.validated) {
      continue;
    }
    const windowPassed = judgement.reasons.length === 1 && judgement.reasons[0] === 'WINDOW_PASSED';
    if (!judgement.actionable && !windowPassed) {
      waiting.set(line.serviceLineId, judgement.reasons);
      continue;
    }
    const id = patternId(line.pattern);
    const group = groups.get(id) ?? { pattern: line.pattern, lines: [] };
    group.lines.push({ serviceLineId: line.serviceLineId, pricedLineId: line.pricedLineId, varianceCents: cents(line.varianceCents ?? 0n), windowPassed });
    groups.set(id, group);
  }
  const created: PlannedCase[] = [];
  const added: (PlannedCase & { readonly caseId: string })[] = [];
  const held: HeldPattern[] = [];
  for (const [id, group] of groups) {
    const lines = [...group.lines].sort((a, b) => (a.serviceLineId < b.serviceLineId ? -1 : a.serviceLineId > b.serviceLineId ? 1 : 0));
    const actionable = lines.filter((line) => !line.windowPassed);
    const actionableCents = sumCents(actionable.map((line) => line.varianceCents));
    const caseId = openCases.get(id);
    if (caseId !== undefined) {
      added.push({ caseId, pattern: group.pattern, lines, actionableCents });
    } else if (actionable.length > 0 && actionableCents >= settings.caseMaterialityCents) {
      created.push({ pattern: group.pattern, lines, actionableCents });
    } else {
      held.push({ pattern: group.pattern, actionableLines: actionable.length, actionableCents });
      for (const line of lines) {
        waiting.set(line.serviceLineId, line.windowPassed ? ['WINDOW_PASSED'] : []);
      }
    }
  }
  return { created: created.sort(byPattern), added: added.sort(byPattern), held: held.sort(byPattern), waiting };
}
