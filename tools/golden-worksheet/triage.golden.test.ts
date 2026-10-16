import { type Cents, sumCents } from '@tp/money';
import { type LinePricing, price } from '@tp/pricing';
import { type CandidateLine, judgeLine, planCases } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import { type GoldenClaim, goldenPricingInput, readGoldenClaims } from './engine';

/**
 * Triage of golden claims (PRD 11 step 2, PER_VISIT; PRD 2 point 6 and PRD 11 step 3, NCCI edits for
 * review; PRD 12, From validated to actionable; QUESTIONS Q41 and Q44; test matrix PRC-07, PRC-11):
 * the engine prices the claim from its golden inputs, and each priced line is judged as triage judges
 * it, its visit's net variance worked out from the traces the way the database's
 * priced_line_visit_variance_cents() works it out from the stored lines (the run's lines of the claim
 * whose per-visit step names the same date and carrying line under the same rate record).
 *
 * A per-visit line validates at most its visit's net shortfall, and nothing when the visit as a whole
 * was paid in full; it and a line with an NCCI procedure-to-procedure review flag stay validated for a
 * person's review and join no case until the specialist answers Q44 and Q41. The triage date is the
 * claim's remittance date, on which every window is open.
 */

const files = readGoldenClaims();

function claim(id: string): GoldenClaim {
  const found = files.find((file) => file.claim.id === id);
  if (found === undefined) {
    throw new Error(`no golden claim ${id}`);
  }
  return found.claim;
}

function visitKey(result: LinePricing): string | null {
  if (result.outcome !== 'priced') {
    return null;
  }
  const visit = result.trace.steps.per_visit;
  return visit === null ? null : JSON.stringify([visit.service_date, visit.carrier_line_no, result.terms.rateRecordId]);
}

function candidates(id: string): { readonly asOf: string; readonly lines: CandidateLine[] } {
  const golden = claim(id);
  const results = price(goldenPricingInput(golden));
  const visits = new Map<string, Cents[]>();
  for (const result of results) {
    const key = visitKey(result);
    if (key !== null && result.outcome === 'priced') {
      visits.set(key, [...(visits.get(key) ?? []), result.varianceCents]);
    }
  }
  const lines = results.flatMap((result): CandidateLine[] => {
    if (result.outcome !== 'priced') {
      return [];
    }
    const key = visitKey(result);
    return [
      {
        serviceLineId: `${id}-line-${String(result.lineNo)}`,
        pricedLineId: `${id}-priced-${String(result.lineNo)}`,
        pattern: { payer_id: 'payer', plan_id: 'plan', mapping_kind: result.terms.mappingKind, contract_version_id: result.terms.contractVersionId, rate_record_id: result.terms.rateRecordId, behavior: 'BELOW_CONTRACT_RATE' },
        varianceCents: result.varianceCents,
        windowEndsOn: result.window.endsOn,
        claimReversed: false,
        claimSuperseded: false,
        mappingKind: result.terms.mappingKind,
        contractVersionStatus: 'signed_off',
        writtenOff: false,
        visitVarianceCents: key === null ? null : sumCents(visits.get(key) ?? []),
        reviewFlags: result.reviewFlags.map((flag) => flag.flag),
      },
    ];
  });
  return { asOf: golden.inputs.claim.remittance_date ?? golden.inputs.as_of, lines };
}

const SETTINGS = { lineMaterialityCents: 500n as Cents, caseMaterialityCents: 1000n as Cents };

function judged(id: string) {
  const { asOf, lines } = candidates(id);
  return { asOf, lines, judgements: lines.map((line) => ({ line: line.serviceLineId, variance: line.varianceCents, visit: line.visitVarianceCents, ...judgeLine(line, SETTINGS.lineMaterialityCents, asOf) })) };
}

describe('per-visit lines are judged with their visit (Q44, PRC-07)', () => {
  it('validates nothing of a visit the payer spread over its lines and paid in full as a whole (G141)', () => {
    const { asOf, lines, judgements } = judged('G141');
    expect(judgements.map((item) => [item.variance, item.visit, item.validated])).toEqual([
      [4566n, -234n, false],
      [-2500n, -234n, false],
      [-2300n, -234n, false],
    ]);
    // The carrier's own variance would have opened a case at this materiality; the visit's does not.
    expect(planCases(lines, new Map(), SETTINGS, asOf).created).toEqual([]);
  });

  it('validates nothing of either visit of a claim with two dates, each paid in full (G145)', () => {
    const { asOf, lines, judgements } = judged('G145');
    expect(judgements.map((item) => [item.variance, item.visit, item.validated])).toEqual([
      [4236n, 0n, false],
      [-4236n, 0n, false],
      [0n, 0n, false],
      [0n, 0n, false],
    ]);
    expect(planCases(lines, new Map(), SETTINGS, asOf).created).toEqual([]);
  });

  it('validates the visit’s net shortfall on the carrier, never its own larger variance, and holds it for review (G150)', () => {
    const { asOf, lines, judgements } = judged('G150');
    expect(judgements.map((item) => [item.variance, item.visit, item.validated, item.validatedCents, item.reasons])).toEqual([
      [1996n, 496n, true, 496n, ['BELOW_LINE_MATERIALITY', 'PER_VISIT_REVIEW']],
      [-1500n, 496n, false, null, []],
    ]);
    const plan = planCases(lines, new Map(), SETTINGS, asOf);
    expect(plan.created).toEqual([]);
    expect(plan.waiting.get('G150-line-1')).toEqual(['BELOW_LINE_MATERIALITY', 'PER_VISIT_REVIEW']);
  });
});

describe('an NCCI procedure-to-procedure flag keeps a line for review (Q41, PRC-11)', () => {
  it('validates the flagged line at its own variance and keeps it out of every case (G184)', () => {
    const { asOf, lines, judgements } = judged('G184');
    const flagged = judgements.find((item) => item.line === 'G184-line-2');
    expect(lines.find((line) => line.serviceLineId === 'G184-line-2')?.reviewFlags).toEqual(['NCCI_PTP']);
    expect(flagged).toMatchObject({ variance: 502n, validated: true, actionable: false, validatedCents: 502n, reasons: ['NCCI_REVIEW'] });
    const plan = planCases(lines, new Map(), { ...SETTINGS, caseMaterialityCents: 1n as Cents }, asOf);
    expect(plan.created).toEqual([]);
    expect(plan.waiting.get('G184-line-2')).toEqual(['NCCI_REVIEW']);
  });
});
