import { describe, expect, it } from 'vitest';

import {
  MA_TERMS,
  contractAgreement,
  lineFacts,
  maAgreement,
  percentTerms,
  pricingInput,
  readRuleRelease,
  syntheticRelease,
} from './testing';

describe('@tp/pricing/testing', () => {
  it('reads the SYNTHETIC releases and refuses a directory that does not verify', () => {
    expect(syntheticRelease().releaseNo).toBe(900001);
    expect(syntheticRelease(900002).releaseNo).toBe(900002);
    expect(() => readRuleRelease('fixtures/golden/claims')).toThrow(/does not verify/);
  });

  it('builds agreements, terms, lines and inputs with defaults and overrides', () => {
    expect(maAgreement({ id: 'map-2' })).toMatchObject({ outcome: 'MA_NONCONTRACTED', mapping: { id: 'map-2', kind: 'ma_noncontracted' }, terms: MA_TERMS });
    const terms = percentTerms({ percentage: '110', yearBasis: 'LOCKED:2025', conversionFactor: 'qualifying_apm', flags: { apply_mppr: true }, rounding: 'TRUNCATE', codes: ['97140'] });
    expect(terms).toMatchObject({ scope: { codes: ['97140'] }, parameters: { year_basis: 'LOCKED:2025', conversion_factor: 'qualifying_apm' }, flags: { apply_mppr: true, apply_ncci: false }, rounding: 'TRUNCATE' });
    expect(terms.method === 'PERCENT_OF_MEDICARE' && terms.parameters.percentage.toString()).toBe('110');
    const agreement = contractAgreement({ terms, rateRecordId: 'rr-2', version: { id: 'cv-2' }, windows: { timely_filing_days: 1, dispute_window_days: 2, appeal_levels: [] }, mapping: { id: 'map-3' } });
    expect(agreement).toMatchObject({ outcome: 'CONTRACT_RATE', mapping: { id: 'map-3', contractVersionId: 'cv-2' }, rate: { rateRecordId: 'rr-2', windows: { dispute_window_days: 2 } } });
    expect(lineFacts({ lineNo: 4 }).lineNo).toBe(4);
    const input = pricingInput(syntheticRelease(), [lineFacts()], { asOf: '2026-01-02', claim: { claimStatusCode: '4' } });
    expect([input.asOf, input.claim.claimStatusCode, input.claim.lines.length]).toEqual(['2026-01-02', '4', 1]);
    expect(pricingInput(syntheticRelease(), []).claim.claimStatusCode).toBe('1');
  });
});
