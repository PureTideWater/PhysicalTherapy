import { type Cents, sumCents } from '@tp/money';
import { type LinePricing, price } from '@tp/pricing';
import { type CandidateLine, type DeadlineStatus, deadlineVerification, judgeLine, planCases } from '@tp/triage';
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
 * claim's remittance date, on which every window is open, and every line's deadline is declared verified
 * (D17 a: these claims test the engine and triage, not the evidence behind a window), except in the last
 * case, where a contract window carries no citation yet and its line waits with DEADLINE_UNVERIFIED.
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

function candidates(id: string, deadlineStatus: DeadlineStatus = 'verified'): { readonly asOf: string; readonly lines: CandidateLine[] } {
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
        deadlineStatus,
        // Every golden window is judged as the engine counts it: no golden contract cites a rule the engine does not compute.
        windowRuleComputed: true,
        claimReversed: false,
        claimSuperseded: false,
        mappingKind: result.terms.mappingKind,
        // Each golden line prices under the one mapping of its plan, never corrected.
        mappingInForce: true,
        contractVersionStatus: 'signed_off',
        // The golden lines' contract versions cover their own service dates, and no golden release is withdrawn.
        contractVersionCoversService: true,
        releaseWithdrawn: false,
        // Priced in memory: no stored release's spans judge the trace, so the hold is off, as for content loaded for its date.
        contentNotLoaded: false,
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

describe('a contract window with no citation keeps its line from becoming actionable (D17 a)', () => {
  it('opens a case on G118 with its window verified, and none while the window is uncited: the line waits with DEADLINE_UNVERIFIED, its price unchanged', () => {
    const [result] = price(goldenPricingInput(claim('G118')));
    if (result?.outcome !== 'priced') {
      throw new Error('G118 prices');
    }
    const versionId = result.trace.agreement?.contract_version_id ?? '';
    const uncited = deadlineVerification({
      trace: result.trace,
      recordLevel: null,
      releaseWithdrawn: false,
      contractWindow: { contractVersionId: versionId, status: 'signed_off', disputeWindowDays: 90, evidence: null, verifiedBy: null, verifiedAt: null },
    });
    expect(uncited).toMatchObject({ status: 'unverified', source: 'contract', endsOn: result.window.endsOn, cause: 'CONTRACT_WINDOW_UNCITED' });

    const verified = candidates('G118');
    expect(planCases(verified.lines, new Map(), SETTINGS, verified.asOf).created.map((planned) => planned.actionableCents)).toEqual([3250n]);

    const waiting = candidates('G118', uncited.status);
    expect(waiting.lines.map((line) => line.varianceCents)).toEqual([3250n]);
    expect(judgeLine(waiting.lines[0] as CandidateLine, SETTINGS.lineMaterialityCents, waiting.asOf)).toMatchObject({ validated: true, actionable: false, validatedCents: 3250n, reasons: ['DEADLINE_UNVERIFIED'] });
    const plan = planCases(waiting.lines, new Map(), SETTINGS, waiting.asOf);
    expect(plan.created).toEqual([]);
    expect(plan.waiting.get('G118-line-1')).toEqual(['DEADLINE_UNVERIFIED']);
  });
});
