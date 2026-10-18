import { describe, expect, it } from 'vitest';

import { RETENTION_CLASSES, RetentionError, retainUntil } from './retention';

describe('retention classes (PRD 19, Data lifecycle)', () => {
  it('states the plan’s schedule', () => {
    expect(RETENTION_CLASSES).toEqual({
      records: { basis: 'contract_term_end', years: 6, days: 0, writeOnce: false },
      packets: { basis: 'created', years: 7, days: 0, writeOnce: true },
      audit: { basis: 'created', years: 7, days: 0, writeOnce: true },
      backups: { basis: 'created', years: 0, days: 35, writeOnce: false },
    });
  });

  it('keeps records six years past the contract term', () => {
    expect(retainUntil('records', { createdAt: new Date('2026-03-01T00:00:00Z'), contractTermEnd: new Date('2027-12-31T00:00:00Z') })).toEqual(new Date('2033-12-31T00:00:00Z'));
  });

  it('keeps packets and the audit log seven years from creation, and backups 35 days', () => {
    const createdAt = new Date('2026-10-14T12:30:00.250Z');
    expect(retainUntil('packets', { createdAt })).toEqual(new Date('2033-10-14T12:30:00.250Z'));
    expect(retainUntil('audit', { createdAt })).toEqual(new Date('2033-10-14T12:30:00.250Z'));
    expect(retainUntil('backups', { createdAt })).toEqual(new Date('2026-11-18T12:30:00.250Z'));
  });

  it('carries a leap day to the first of March', () => {
    expect(retainUntil('audit', { createdAt: new Date('2028-02-29T00:00:00Z') })).toEqual(new Date('2035-03-01T00:00:00Z'));
  });

  it('refuses a missing start', () => {
    expect(() => retainUntil('records', { createdAt: new Date() })).toThrow(new RetentionError('retention class records counts from the contract term end, which is missing'));
    expect(() => retainUntil('audit', { createdAt: new Date('not a date') })).toThrow(/creation time/);
  });
});
