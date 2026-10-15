import { describe, expect, it } from 'vitest';

import { type CauseTrace, type TraceRecordRef, differingRecords, lineCauses, recordsRead, ruleLabel } from './causes';
import { linePricesDiffer } from './impact';
import type { PricedLineInsert } from './store';

/**
 * The causes of a diff line, read from two traces (docs/adr/0037; test matrix PRC-19, MAP-03): each
 * input of the line that can differ between two runs is named, records re-sourced under a new hash with
 * the same value are not, and a line none of whose own inputs changed owes its difference to another
 * line of its claim.
 */

const ref = (type: string, key: Record<string, string>, sha: string, from = '2026-01-01', to: string | null = '2026-12-31'): TraceRecordRef => ({
  record_type: type,
  key,
  effective_from: from,
  effective_to: to,
  sha256: sha.repeat(64).slice(0, 64),
});

const rvu = (sha: string) => ref('pfs_rvu', { hcpcs: '97110', modifier: '' }, sha);
const gpci = ref('pfs_gpci', { carrier: '99999', locality: '01' }, 'b');

function trace(overrides: Partial<CauseTrace> & { readonly records?: readonly TraceRecordRef[] } = {}): CauseTrace & Record<string, unknown> {
  const { records = [rvu('a'), gpci], ...rest } = overrides;
  return {
    engine: 'phase-two/1',
    settings: { zip: '00011', default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility' } },
    claim: { claim_status_code: '1', reversed: false, corrected: false, remittance_date: '2026-03-25', payer_plan_key: 'plan' },
    agreement: { mapping_id: 'mapping-1', mapping_kind: 'ma_noncontracted', contract_version_id: null, rate_record_id: null },
    steps: { fee_schedule: { rvu: { record: records[0] ?? null }, gpci: { record: records[1] ?? null } }, adjustments: records.slice(2).map((record) => ({ records: [{ record }] })) },
    ...rest,
  };
}

const never = () => false;

describe('lineCauses', () => {
  it('names a rule record whose value changed, with both versions', () => {
    expect(lineCauses(trace(), trace({ records: [rvu('c'), gpci] }), never)).toEqual([
      {
        kind: 'release_record',
        recordType: 'pfs_rvu',
        key: { hcpcs: '97110', modifier: '' },
        before: { sha256: rvu('a').sha256, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
        after: { sha256: rvu('c').sha256, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
      },
    ]);
  });

  it('leaves out a record re-sourced under a new hash with the same value, and then blames the claim’s other lines', () => {
    const regpci = ref('pfs_gpci', { carrier: '99999', locality: '01' }, 'd');
    const same = (before: TraceRecordRef, after: TraceRecordRef) => before.record_type === 'pfs_gpci' && after.sha256 === regpci.sha256;
    expect(lineCauses(trace(), trace({ records: [rvu('a'), regpci] }), same)).toEqual([{ kind: 'claim_lines' }]);
    expect(lineCauses(trace(), trace(), never)).toEqual([{ kind: 'claim_lines' }]);
  });

  it('names a record read in one run only when the terms are the same, and not when the mapping or version changed', () => {
    const mue = ref('ncci_mue', { hcpcs: '97110' }, 'e');
    expect(lineCauses(trace(), trace({ records: [rvu('a'), gpci, mue] }), never)).toEqual([
      { kind: 'release_record', recordType: 'ncci_mue', key: { hcpcs: '97110' }, before: null, after: { sha256: mue.sha256, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' } },
    ]);
    expect(lineCauses(trace({ records: [rvu('a'), gpci, mue] }), trace(), never)).toEqual([
      { kind: 'release_record', recordType: 'ncci_mue', key: { hcpcs: '97110' }, before: { sha256: mue.sha256, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }, after: null },
    ]);
    const contract = { mapping_id: 'mapping-2', mapping_kind: 'contract', contract_version_id: 'version-1', rate_record_id: 'rate-1' };
    expect(lineCauses(trace({ agreement: null, records: [] }), trace({ agreement: contract, records: [rvu('a'), gpci, mue] }), never)).toEqual([
      { kind: 'mapping', before: { mappingId: null, mappingKind: null }, after: { mappingId: 'mapping-2', mappingKind: 'contract' } },
      { kind: 'contract_version', before: { contractVersionId: null, rateRecordId: null }, after: { contractVersionId: 'version-1', rateRecordId: 'rate-1' } },
    ]);
    // A changed value still counts under new terms.
    expect(lineCauses(trace(), trace({ agreement: { ...contract, mapping_id: 'mapping-1', mapping_kind: 'ma_noncontracted' }, records: [rvu('c'), gpci] }), never).map((cause) => cause.kind)).toEqual([
      'contract_version',
      'release_record',
    ]);
  });

  it('names the claim, the settings and the engine when they differ', () => {
    const before = trace();
    const after = trace({
      claim: { claim_status_code: '1', reversed: true, corrected: false, remittance_date: '2026-03-25', payer_plan_key: 'plan' },
      settings: { zip: '00012', default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility' } },
      engine: 'phase-three/1',
    });
    expect(lineCauses(before, after, never)).toEqual([{ kind: 'claim' }, { kind: 'settings' }, { kind: 'engine', before: 'phase-two/1', after: 'phase-three/1' }]);
  });
});

describe('the records a trace names', () => {
  it('finds every record reference, in nested objects and arrays, once per rule', () => {
    const mppr = ref('mppr_rate', { hcpcs: '97110' }, 'f');
    const found = recordsRead(trace({ records: [rvu('a'), gpci, mppr, rvu('a')] }));
    expect([...found.keys()]).toEqual([ruleLabel(rvu('a')), ruleLabel(gpci), ruleLabel(mppr)]);
    expect(recordsRead(null).size).toBe(0);
    expect(recordsRead({ record_type: 'pfs_rvu', key: null, sha256: 'x', effective_from: '2026-01-01' }).size).toBe(0);
  });

  it('pairs the records of one rule whose hashes differ, and nothing else', () => {
    expect(differingRecords(trace(), trace({ records: [rvu('c'), gpci, ref('ncci_mue', { hcpcs: '97110' }, 'e')] }))).toEqual([{ before: rvu('a'), after: rvu('c') }]);
    expect(differingRecords(trace(), trace())).toEqual([]);
  });
});

describe('what a diff and a dry run compare', () => {
  const row: PricedLineInsert = {
    serviceLineId: 'line',
    mappingId: null,
    contractVersionId: null,
    rateRecordId: null,
    method: 'PERCENT_OF_MEDICARE',
    expectedAllowedCents: '6000',
    expectedUnrounded: '6000',
    observedAllowedCents: '5000',
    varianceCents: '1000',
    unpricedReason: null,
    adjustmentsApplied: '[]',
    windowEndsOn: null,
    trace: '{}',
  };

  it('is expected allowed, the unpriced reason and the adjustments, never the trace or the window', () => {
    expect(linePricesDiffer(row, { ...row, trace: '{"other":true}', windowEndsOn: '2026-12-31', varianceCents: '0' })).toBe(false);
    expect(linePricesDiffer(row, { ...row, expectedAllowedCents: '6001' })).toBe(true);
    expect(linePricesDiffer(row, { ...row, unpricedReason: 'NO_PFS_VALUE' })).toBe(true);
    expect(linePricesDiffer(row, { ...row, adjustmentsApplied: '[{"name":"mppr"}]' })).toBe(true);
  });
});
