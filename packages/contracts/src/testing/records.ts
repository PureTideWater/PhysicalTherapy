import { randomUUID } from 'node:crypto';

import type { ContractVersionRecord, PlanMappingRecord, RateRecord } from '../records';
import { type RateRecordTerms, parseRateTerms } from '../terms';

/**
 * Builders of loaded records for tests of agreement resolution and pricing: plain data, synthetic
 * IDs, nothing from a real contract.
 */

export function mapping(overrides: Partial<PlanMappingRecord> & Pick<PlanMappingRecord, 'planId'>): PlanMappingRecord {
  return {
    id: randomUUID(),
    kind: 'contract',
    contractVersionId: null,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    supersedesId: null,
    ...overrides,
  };
}

export function version(overrides: Partial<ContractVersionRecord> = {}): ContractVersionRecord {
  return {
    id: randomUUID(),
    contractId: randomUUID(),
    versionNo: 1,
    status: 'signed_off',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    supersedesId: null,
    sourceDocumentIds: [],
    windows: { timely_filing_days: null, dispute_window_days: null, appeal_levels: [] },
    noticeDays: null,
    ...overrides,
  };
}

/** Fixed-schedule terms for the codes at an amount per unit, flags off, rounding silent. */
export function fixedTerms(codes: readonly string[], amountCents: string, scope: Record<string, unknown> = {}): RateRecordTerms {
  return parseRateTerms({ scope: { codes: [...codes], ...scope }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: amountCents } }, true);
}

export function rate(contractVersionId: string, terms: RateRecordTerms, overrides: Partial<RateRecord> = {}): RateRecord {
  return {
    id: randomUUID(),
    contractVersionId,
    terms,
    citation: null,
    approvals: {},
    proposedBy: 'specialist',
    verifiedBy: randomUUID(),
    verifiedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}
