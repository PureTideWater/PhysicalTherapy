import { type Cents, ZERO_CENTS, addCents } from '@tp/money';

import type { IsoDate } from './dates';
import type { PlanMappingRecord } from './records';
import { mappingInForce } from './resolver';

/**
 * A plan with no mapping is never priced, and the Coverage screen shows the dollars waiting on
 * mappings (PRD 5, J6; PRD 6, Payer and plan mapping; test matrix MAP-01, MAP-02, MAP-06; combined
 * audit #32, docs/adr/0075).
 *
 * - `unmappedPlanIds` names the plans among a set of lines (a run's, a period's) none of whose lines
 *   has a mapping in force on its service date (mappingInForce, the resolver's own rule): a plan with
 *   no mapping at all, and a plan mapped only for other dates (PR #95 review R3N-1, security F2; a
 *   mapping is decided per line on the line's date, never by its mere existence). Nothing refuses a
 *   run for them: resolution gives NO_MAPPING for every line of such a plan that reaches the
 *   resolver, one by one, and the run prices every other line of its period; a mapped plan's line
 *   outside every mapping's window is NO_MAPPING the same way (MAP-02). The worker refuses only a
 *   period none of whose lines has a mapping in force (MAP-07, it would price nothing), and records
 *   the plans named here, with their lines and billed cents, in the run's coverage
 *   (tp-pricing-coverage/2, PRC-30).
 * - `waitingOnMapping` totals, per plan, the lines with no mapping in force on their service date:
 *   lines, claims, billed and paid cents. load.ts runs the same question as one query.
 */

export interface MappedLine {
  /** The line's plan; null when the remittance named none. */
  readonly planId: string | null;
  readonly serviceDate: IsoDate;
}

/**
 * The plans among the lines' none of whose lines has a mapping in force on its service date, sorted:
 * over a run's lines, the plans it never prices (each of their lines the resolver reaches is
 * NO_MAPPING) and its coverage records (MAP-01, PRC-30). A plan with a mapping in force on any one of
 * its lines' dates is not named; its other lines resolve one by one (MAP-02). A line that names no plan
 * is not a plan's; it resolves to NO_MAPPING too. The lines may repeat a plan, one per service date.
 */
export function unmappedPlanIds(lines: readonly MappedLine[], mappings: readonly PlanMappingRecord[]): string[] {
  const byPlan = new Map<string, PlanMappingRecord[]>();
  for (const mapping of mappings) {
    byPlan.set(mapping.planId, [...(byPlan.get(mapping.planId) ?? []), mapping]);
  }
  const seen = new Set<string>();
  const mapped = new Set<string>();
  for (const line of lines) {
    if (line.planId === null) {
      continue;
    }
    seen.add(line.planId);
    if (!mapped.has(line.planId) && mappingInForce(byPlan.get(line.planId) ?? [], line.planId, line.serviceDate) !== null) {
      mapped.add(line.planId);
    }
  }
  return [...seen].filter((planId) => !mapped.has(planId)).sort();
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
