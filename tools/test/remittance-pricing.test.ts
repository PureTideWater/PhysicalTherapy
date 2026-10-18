import { readFileSync } from 'node:fs';
import path from 'node:path';

import { type AgreementRecords, agreementResolver, parseRateTerms } from '@tp/contracts';
import { type Claim, type Remittance, parse835, remittancesOf } from '@tp/edi835';
import { releaseDirectoryCodeLists } from '@tp/edi835/testing';
import type { Cents } from '@tp/money';
import { type LineFacts, type LinePricing, price, recompute } from '@tp/pricing';
import { practiceSettings, syntheticRelease } from '@tp/pricing/testing';
import type { CaseExpectation, X12FileExpectation } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';

/**
 * The parser's cases that complete in milestone 5 (test matrix PAR-14: "Adjustment stored; variance
 * computed later against expected"; PAR-15: "Claim status 2; line unpriced SECONDARY_PAYER"): each
 * SYNTHETIC 835 is parsed, its lines become the engine's line facts as a pricing run builds them
 * (the claim's plan resolved by @tp/contracts against a SYNTHETIC contract at 110% of Medicare, every
 * flag off; the place of service from CLP08; the patient share from the PR adjustments; observed
 * allowed as the parser derived it), and the engine prices them under SYNTHETIC release 900001.
 */

const FIXTURES = path.join(repositoryRoot, 'fixtures/synthetic');

function fixture(id: string): { readonly expected: X12FileExpectation; readonly remittance: Remittance } {
  const expectation = JSON.parse(readFileSync(path.join(FIXTURES, id, 'expected.json'), 'utf8')) as CaseExpectation;
  const file = expectation.files[0];
  if (file?.x12 === undefined) {
    throw new Error(`${id} has no 835`);
  }
  const [remittance] = remittancesOf(parse835(readFileSync(path.join(FIXTURES, id, file.path)), { codeLists: releaseDirectoryCodeLists() }));
  if (remittance === undefined) {
    throw new Error(`${id} loads no remittance`);
  }
  return { expected: file.x12, remittance };
}

/** A SYNTHETIC contract for the plans the PAR fixtures name: 110% of Medicare for every code, flags off, timed units per code. */
function records(planIds: readonly string[]): AgreementRecords {
  const version = {
    id: 'cv-par-1',
    contractId: 'contract-par',
    versionNo: 1,
    status: 'signed_off' as const,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    supersedesId: null,
    sourceDocumentIds: [],
    windows: { timely_filing_days: null, dispute_window_days: 90, appeal_levels: [] },
    noticeDays: null,
  };
  const terms = parseRateTerms(
    { scope: {}, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, flags: { timed_units_rule: 'PER_CODE' } },
    true,
  );
  return {
    mappings: planIds.map((planId) => ({ id: `map-${planId}`, planId, kind: 'contract' as const, contractVersionId: version.id, effectiveFrom: '2026-01-01', effectiveTo: null, supersedesId: null })),
    versions: [version],
    rateRecords: [{ id: 'rr-par-1', contractVersionId: version.id, terms, citation: null, approvals: {}, proposedBy: 'specialist', verifiedBy: 'synthetic-specialist', verifiedAt: '2026-01-02T00:00:00.000Z' }],
  };
}

function priceClaim(remittance: Remittance, claim: Claim): LinePricing[] {
  const resolver = agreementResolver(records([claim.planRef ?? '']));
  const lines: LineFacts[] = claim.lines.map((line) => {
    const serviceDate = line.serviceFrom ?? claim.serviceFrom ?? '';
    const modifiers = line.procedure.modifiers.filter((modifier) => modifier !== '');
    return {
      lineNo: line.lineNo,
      procedureCode: line.procedure.code,
      modifiers,
      units: line.units ?? '1',
      serviceDate,
      placeOfService: claim.facilityCode,
      chargeCents: line.chargeCents,
      observedAllowedCents: line.observedAllowed.cents,
      observedAllowedBasis: line.observedAllowed.basis,
      patientShareAdjustments: line.adjustments.filter((item) => item.group === 'PR').map((item) => ({ groupCode: 'PR' as const, reasonCode: item.reason, amountCents: item.cents })),
      agreement: resolver.resolve({ planId: claim.planRef, serviceDate, procedureCode: line.procedure.code, modifiers, placeOfService: claim.facilityCode }),
    };
  });
  return price({
    claim: { claimStatusCode: claim.status, reversed: false, corrected: false, remittanceDate: remittance.payment?.date ?? null, payerPlanKey: claim.planRef, lines },
    release: syntheticRelease(900001),
    settings: practiceSettings(),
    asOf: '2026-10-15',
  });
}

describe('the parser cases milestone 5 completes', () => {
  it('PAR-15: a secondary remittance (claim status 2) leaves its line unpriced SECONDARY_PAYER, as its expected.json says', () => {
    const { expected, remittance } = fixture('PAR-15');
    const pricing = expected.parse.pricing ?? [];
    expect(pricing.length).toBeGreaterThan(0);
    for (const entry of pricing.filter((item) => item.milestone <= 5)) {
      const claim = remittance.claims[entry.claim] as Claim;
      expect(claim.status).toBe('2');
      const result = priceClaim(remittance, claim)[entry.line];
      expect(result?.outcome === 'unpriced' && result.reason).toBe(entry.unpricedReason);
      // The amount was worked through before the claim stopped it (fixtures/golden QUESTIONS Q24).
      expect(result?.trace.steps.units?.base_cents).toBeDefined();
      expect(recompute(JSON.parse(JSON.stringify(result?.trace))).differences).toEqual([]);
    }
  });

  it('PAR-14: the CO-45 write-off is stored, and the variance is expected allowed less observed allowed, not the write-off', () => {
    const { remittance } = fixture('PAR-14');
    const [claim] = remittance.claims;
    expect(claim?.status).toBe('1');
    expect(claim?.lines.map((line) => line.adjustments.find((item) => item.group === 'CO')?.reason)).toEqual(['45', '45']);
    const results = priceClaim(remittance, claim as Claim);
    const [first, second] = results;
    // 97110 x 2 at 110% in the SYNTHETIC locality, flags off: golden line G02 line 1, to the cent.
    expect(first?.outcome === 'priced' && first.expectedAllowedCents).toBe(4646n as Cents);
    for (const [index, result] of results.entries()) {
      const line = claim?.lines[index];
      expect(result.outcome, `line ${String(index + 1)}`).toBe('priced');
      if (result.outcome === 'priced' && line !== undefined) {
        expect(result.observedAllowedCents).toBe(line.observedAllowed.cents);
        expect(result.varianceCents).toBe((result.expectedAllowedCents - line.observedAllowed.cents) as Cents);
        expect(result.patientShareCents).toBe(line.patientShareCents);
        expect(result.window).toEqual({ endsOn: expect.any(String) as string, status: expect.stringMatching(/^(OPEN|WINDOW_PASSED)$/) as string });
        expect(recompute(JSON.parse(JSON.stringify(result.trace))).differences).toEqual([]);
      }
    }
    expect(second?.outcome).toBe('priced');
  });
});
