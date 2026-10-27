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

  it('keeps the records of a key in order of their start, whatever order the release lists them in', () => {
    const key = { hcpcs: '97110', modifier: '' };
    // A 2025 quarter listed before the 2025 year it falls in: the latest start during 2025 is still the quarter's.
    const quarter = ruleRecordLike(rvu97110('2025'), { effective_from: '2025-07-01', effective_to: '2025-12-31' });
    expect(indexRelease({ ...base, records: [quarter, ...base.records] }).latestInYear('pfs_rvu', key, 2025)).toBe(quarter);
    expect(indexRelease({ ...base, records: [...base.records].reverse() }).latestInYear('pfs_rvu', key, 2025)).toBe(rvu97110('2025'));
    // Two records of one key that start on one day, which a checked release never holds: the one listed last.
    const twin = ruleRecordLike(rvu97110('2025'), {});
    expect(indexRelease({ ...base, records: [...base.records, twin] }).latestInYear('pfs_rvu', key, 2025)).toBe(twin);
    expect(indexRelease({ ...base, records: [twin, ...base.records] }).latestInYear('pfs_rvu', key, 2025)).toBe(rvu97110('2025'));
  });

  it('counts a record in force during a year from its first day to its last, both inclusive, and none after', () => {
    const key = { hcpcs: '97110', modifier: '' };
    const lastDay = ruleRecordLike(rvu97110('2025'), { effective_from: '2025-12-31', effective_to: null });
    expect(indexRelease({ ...base, records: [...base.records.filter((record) => record !== rvu97110('2026')), lastDay] }).latestInYear('pfs_rvu', key, 2025)).toBe(lastDay);
    const firstDay = ruleRecordLike(rvu97110('2025'), { effective_from: '2025-07-01', effective_to: '2026-01-01' });
    expect(indexRelease({ ...base, records: [firstDay] }).latestInYear('pfs_rvu', key, 2026)).toBe(firstDay);
    expect(indexRelease({ ...base, records: [firstDay] }).latestInYear('pfs_rvu', key, 2027)).toBeNull();
    // Every record of 97110 ends in 2026, so none is in force during 2027.
    expect(release.latestInYear('pfs_rvu', key, 2027)).toBeNull();
    expect(release.inForce('pfs_rvu', key, '2027-01-01')).toBeNull();
  });

  it('writes a year before 1000 in four digits, as the records date themselves', () => {
    const key = { hcpcs: '97110', modifier: '' };
    const year999 = ruleRecordLike(rvu97110('2025'), { effective_from: '0999-01-01', effective_to: '0999-12-31' });
    const year1000 = ruleRecordLike(rvu97110('2025'), { effective_from: '1000-01-01', effective_to: '1000-12-31' });
    const early = indexRelease({ ...base, records: [year999, year1000] });
    expect(early.latestInYear('pfs_rvu', key, 999)).toBe(year999);
    expect(early.latestInYear('pfs_rvu', key, 1000)).toBe(year1000);
    expect(early.latestInYear('pfs_rvu', key, 998)).toBeNull();
  });

  it('names the overlap it refuses', () => {
    const same = indexRelease({ ...base, records: [...base.records, ruleRecordLike(rvu97110('2026'), {})] });
    expect(() => same.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-03-10')).toThrow(new EngineInputError('release_records_overlap'));
    expect(() => same.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-03-10')).toThrow('pricing input problem: release_records_overlap');
  });
});
