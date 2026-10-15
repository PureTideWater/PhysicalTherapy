import { describe, expect, it } from 'vitest';

import { deriveCalendarEvents } from './calendar';
import { addDays, addYears, isIsoDate, utcDate, windowsOverlap } from './dates';
import { parseRateTerms } from './terms';
import { fixedTerms, rate, version } from './testing/records';

const percentCurrent = parseRateTerms(
  { scope: { codes: ['97110'] }, method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' } },
  true,
);

describe('the contract calendar', () => {
  it('derives the next anniversary, the notice deadline before it and the next fee-schedule year', () => {
    const signed = version({ effectiveFrom: '2025-04-01', noticeDays: 90 });
    const events = deriveCalendarEvents({ version: signed, contractVersions: [signed], rateRecords: [rate(signed.id, percentCurrent)], signedOffOn: '2026-10-15' });
    expect(events).toEqual([
      { kind: 'anniversary', onDate: '2027-04-01', note: 'Contract anniversary (version 1 in force)' },
      { kind: 'notice_deadline', onDate: '2027-01-01', note: 'Notice due 90 days before the anniversary on 2027-04-01 (version 1)' },
      { kind: 'fee_schedule_year', onDate: '2027-01-01', note: 'Medicare fee schedule year 2027 begins; percent-of-Medicare rates of version 1 follow it' },
    ]);
  });

  it('moves the notice deadline to the next anniversary when this one’s has passed', () => {
    const signed = version({ effectiveFrom: '2025-11-01', noticeDays: 30 });
    const events = deriveCalendarEvents({ version: signed, contractVersions: [signed], rateRecords: [], signedOffOn: '2026-10-15' });
    expect(events).toEqual([
      { kind: 'anniversary', onDate: '2026-11-01', note: 'Contract anniversary (version 1 in force)' },
      { kind: 'notice_deadline', onDate: '2027-10-02', note: 'Notice due 30 days before the anniversary on 2027-11-01 (version 1)' },
    ]);
  });

  it('dates an amendment, counts anniversaries from the contract’s start, and keeps everything inside the window', () => {
    const first = version({ effectiveFrom: '2024-07-01', effectiveTo: '2026-11-01' });
    const amendment = version({ contractId: first.contractId, versionNo: 2, effectiveFrom: '2026-11-01', effectiveTo: '2027-06-01', supersedesId: first.id, noticeDays: 400 });
    const events = deriveCalendarEvents({ version: amendment, contractVersions: [first, amendment], rateRecords: [rate(amendment.id, fixedTerms(['97110'], '3200'))], signedOffOn: '2026-10-15' });
    expect(events).toEqual([{ kind: 'amendment', onDate: '2026-11-01', note: 'Amendment (version 2) takes effect; version 1 ends the day before' }]);
  });

  it('derives no amendment for a correction, and a fee-schedule year only for records that follow the current year', () => {
    const first = version({ effectiveFrom: '2026-01-01', status: 'superseded' });
    const correction = version({ contractId: first.contractId, versionNo: 2, effectiveFrom: '2026-01-01', supersedesId: first.id });
    const locked = parseRateTerms(
      {
        scope: { codes: ['97110'] },
        method: 'LESSER_OF',
        parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100', year_basis: 'LOCKED:2025', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' },
      },
      true,
    );
    const lesserCurrent = parseRateTerms(
      {
        scope: { codes: ['97110'] },
        method: 'LESSER_OF',
        parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100', year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' }, charge_basis: 'LINE_CHARGE' },
      },
      true,
    );
    const kinds = (records: ReturnType<typeof rate>[]) => deriveCalendarEvents({ version: correction, contractVersions: [first, correction], rateRecords: records, signedOffOn: '2026-10-15' }).map((event) => event.kind);
    expect(kinds([rate(correction.id, locked)])).toEqual(['anniversary']);
    expect(kinds([rate(correction.id, lesserCurrent)])).toEqual(['anniversary', 'fee_schedule_year']);
  });

  it('starts the fee-schedule year after a version that starts later', () => {
    const future = version({ effectiveFrom: '2027-03-01' });
    const events = deriveCalendarEvents({ version: future, contractVersions: [future], rateRecords: [rate(future.id, percentCurrent)], signedOffOn: '2026-10-15' });
    expect(events.find((event) => event.kind === 'fee_schedule_year')?.onDate).toBe('2028-01-01');
    expect(events.find((event) => event.kind === 'anniversary')?.onDate).toBe('2028-03-01');
  });
});

describe('calendar dates', () => {
  it('adds years and days on the calendar, February 29 falling back in a common year', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    expect(addYears('2026-01-31', 1)).toBe('2027-01-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => addYears('2026-13-01', 1)).toThrow(RangeError);
  });

  it('knows a calendar date and the UTC date of an instant', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-2-28')).toBe(false);
    expect(isIsoDate(20_260_228)).toBe(false);
    expect(utcDate(new Date('2026-10-15T23:30:00-05:00'))).toBe('2026-10-16');
  });

  it('overlaps half-open windows', () => {
    expect(windowsOverlap({ from: '2026-01-01', to: '2026-06-01' }, { from: '2026-06-01', to: null })).toBe(false);
    expect(windowsOverlap({ from: '2026-01-01', to: null }, { from: '2026-06-01', to: '2026-07-01' })).toBe(true);
    expect(windowsOverlap({ from: '2026-06-01', to: '2026-07-01' }, { from: '2026-01-01', to: null })).toBe(true);
  });
});
