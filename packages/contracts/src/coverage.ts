import { type Cents, ZERO_CENTS, addCents } from '@tp/money';

import type { IsoDate } from './dates';
import type { PlanMappingRecord } from './records';
import { mappingInForce } from './resolver';

/**
 * A plan with no mapping is never priced, and the Coverage screen shows the dollars waiting on
 * mappings (PRD 5, J6; PRD 6, Payer and plan mapping; test matrix MAP-01, MAP-02, MAP-06; combined
 * audit #32, docs/adr/0075).
 *
 * - `unmappedPlanIds` names the plans among a run's lines that have no mapping at all. Nothing
 *   refuses a run for them: resolution gives NO_MAPPING for every line of such a plan that reaches
 *   the resolver, one by one, as it does for a line outside every mapping's window (MAP-02), and the
 *   run prices every other line of its period. The worker refuses only a period none of whose plans
 *   has a mapping (MAP-07, it would price nothing), and records the unmapped plans, with their lines
 *   and billed cents, in the run's coverage (tp-pricing-coverage/2, PRC-30).
 * - `waitingOnMapping` totals, per plan, the lines with no mapping in force on their service date:
 *   lines, claims, billed and paid cents. load.ts runs the same question as one query.
 */

export interface MappedLine {
  /** The line's plan; null when the remittance named none. */
  readonly planId: string | null;
  readonly serviceDate: IsoDate;
}

/**
 * The plans among the lines' that have no mapping at all, sorted: the plans a run never prices
 * (each of their lines the resolver reaches is NO_MAPPING) and its coverage records (MAP-01, PRC-30).
 * A line that names no plan is not a plan's; it resolves to NO_MAPPING too.
 */
export function unmappedPlanIds(lines: readonly MappedLine[], mappings: readonly PlanMappingRecord[]): string[] {
  const mapped = new Set(mappings.map((mapping) => mapping.planId));
  return [...new Set(lines.flatMap((line) => (line.planId === null || mapped.has(line.planId) ? [] : [line.planId])))].sort();
}

export interface CoverageLine extends MappedLine {
  readonly claimId: string;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
}

/** The dollars waiting on one plan's mapping. planId null gathers the lines that name no plan. */
export interface WaitingOnMapping {
  readonly planId: string | null;
  readonly lines: number;
  readonly claims: number;
  readonly chargeCents: Cents;
  readonly paidCents: Cents;
}

/** Per plan, the lines with no mapping in force on their service date, largest billed total first. */
export function waitingOnMapping(lines: readonly CoverageLine[], mappings: readonly PlanMappingRecord[]): WaitingOnMapping[] {
  const byPlan = new Map<string, PlanMappingRecord[]>();
  for (const mapping of mappings) {
    byPlan.set(mapping.planId, [...(byPlan.get(mapping.planId) ?? []), mapping]);
  }
  const totals = new Map<string | null, { lines: number; claims: Set<string>; charge: Cents; paid: Cents }>();
  for (const line of lines) {
    if (line.planId !== null && mappingInForce(byPlan.get(line.planId) ?? [], line.planId, line.serviceDate) !== null) {
      continue;
    }
    const total = totals.get(line.planId) ?? { lines: 0, claims: new Set<string>(), charge: ZERO_CENTS, paid: ZERO_CENTS };
    total.lines += 1;
    total.claims.add(line.claimId);
    total.charge = addCents(total.charge, line.chargeCents);
    total.paid = addCents(total.paid, line.paidCents);
    totals.set(line.planId, total);
  }
  return [...totals]
    .map(([planId, total]) => ({ planId, lines: total.lines, claims: total.claims.size, chargeCents: total.charge, paidCents: total.paid }))
    .sort((a, b) => (a.chargeCents === b.chargeCents ? String(a.planId).localeCompare(String(b.planId)) : a.chargeCents > b.chargeCents ? -1 : 1));
}
