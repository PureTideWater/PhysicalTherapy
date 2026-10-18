import { type Cents, ZERO_CENTS, addCents } from '@tp/money';

import type { IsoDate } from './dates';
import type { PlanMappingRecord } from './records';
import { mappingInForce } from './resolver';

/**
 * Pricing never runs on an unmapped combination (PRD 5, J6; PRD 6, Payer and plan mapping; test
 * matrix MAP-01, MAP-02), and the Coverage screen shows the dollars waiting on mappings.
 *
 * - `assertPricingAllowed` is the guard a pricing run's creator calls with the run's lines: it
 *   refuses the run while any line has no plan, or names a plan with no mapping at all (an unmapped
 *   plan). A plan with mappings prices: its lines outside every mapping's window resolve to
 *   NO_MAPPING one by one (MAP-02), and resolution gives NO_MAPPING for every line of an unmapped
 *   plan too.
 * - `waitingOnMapping` totals, per plan, the lines with no mapping in force on their service date:
 *   lines, claims, billed and paid cents. load.ts runs the same question as one query.
 */

export interface MappedLine {
  /** The line's plan; null when the remittance named none. */
  readonly planId: string | null;
  readonly serviceDate: IsoDate;
}

/** Why a pricing run is refused before it starts. Counts and opaque plan IDs only. */
export class PricingRefusedError extends Error {
  override readonly name = 'PricingRefusedError';

  constructor(
    /** Plans of the run's lines that have no mapping at all. */
    readonly unmappedPlanIds: readonly string[],
    /** Lines of the run that name no plan. */
    readonly linesWithoutPlan: number,
  ) {
    const parts = [
      unmappedPlanIds.length > 0 ? `${String(unmappedPlanIds.length)} plan(s) have no mapping` : null,
      linesWithoutPlan > 0 ? `${String(linesWithoutPlan)} line(s) name no plan` : null,
    ].filter((part): part is string => part !== null);
    super(`pricing is refused until every plan is mapped: ${parts.join('; ')}`);
  }
}

/** The plans among the lines' that have no mapping at all, sorted. */
export function unmappedPlanIds(lines: readonly MappedLine[], mappings: readonly PlanMappingRecord[]): string[] {
  const mapped = new Set(mappings.map((mapping) => mapping.planId));
  return [...new Set(lines.flatMap((line) => (line.planId === null || mapped.has(line.planId) ? [] : [line.planId])))].sort();
}

/** Refuses a pricing run over lines of an unmapped plan, or of no plan (MAP-01). */
export function assertPricingAllowed(lines: readonly MappedLine[], mappings: readonly PlanMappingRecord[]): void {
  const unmapped = unmappedPlanIds(lines, mappings);
  const withoutPlan = lines.filter((line) => line.planId === null).length;
  if (unmapped.length > 0 || withoutPlan > 0) {
    throw new PricingRefusedError(unmapped, withoutPlan);
  }
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
