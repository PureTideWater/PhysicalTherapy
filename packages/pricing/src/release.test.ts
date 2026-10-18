import { type RuleRecord, recordSha256 } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { EngineInputError } from './reasons';
import { indexRelease } from './release';
import { SYNTHETIC_RELEASES, keyOf, readRuleRelease, ruleRecordLike } from './testing';

const base = readRuleRelease(SYNTHETIC_RELEASES[900002]);
const rvu97110 = (year: string) => base.records.find((record) => record.record_type === 'pfs_rvu' && keyOf(record).hcpcs === '97110' && record.effective_from.startsWith(year)) as RuleRecord;

describe('an indexed release', () => {
  const release = indexRelease(base);

  it('finds the record of a key in force on a date, inclusive of both ends', () => {
    expect(release.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-12-31')?.effective_from).toBe('2026-01-01');
    expect(release.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2025-01-01')?.effective_from).toBe('2025-01-01');
    expect(release.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2024-12-31')).toBeNull();
    expect(release.inForce('pfs_rvu', { hcpcs: '97750', modifier: '' }, '2026-03-10')).toBeNull();
  });

  it('finds the latest record in force during a year', () => {
    const quarterly = indexRelease({ ...base, records: [...base.records, ruleRecordLike(rvu97110('2025'), { effective_from: '2025-07-01', effective_to: '2025-12-31' })] });
    expect(quarterly.latestInYear('pfs_rvu', { hcpcs: '97110', modifier: '' }, 2025)?.effective_from).toBe('2025-07-01');
    expect(release.latestInYear('pfs_rvu', { hcpcs: '97110', modifier: '' }, 2025)?.effective_from).toBe('2025-01-01');
    expect(release.latestInYear('pfs_rvu', { hcpcs: '97110', modifier: '' }, 2024)).toBeNull();
    expect(release.latestInYear('pfs_rvu', { hcpcs: '97750', modifier: '' }, 2025)).toBeNull();
    // An open-ended record is in force in every later year.
    expect(release.latestInYear('sequestration', { program: 'medicare' }, 2030)?.effective_from).toBe('2026-01-01');
  });

  it('refuses two records of one key in force on one date, whichever order they start in', () => {
    const same = indexRelease({ ...base, records: [...base.records, ruleRecordLike(rvu97110('2026'), {})] });
    expect(() => same.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-03-10')).toThrow(EngineInputError);
  });

  it('names a record by type, key, window and its rule_record SHA-256, once per record', () => {
    const record = rvu97110('2026');
    const ref = release.ref(record);
    expect(ref).toEqual({ record_type: 'pfs_rvu', key: { hcpcs: '97110', modifier: '' }, effective_from: '2026-01-01', effective_to: '2026-12-31', sha256: recordSha256(record) });
    expect(release.ref(record)).toBe(ref);
    expect([release.releaseNo, release.manifestSha256]).toEqual([900002, base.manifestSha256]);
  });
});
