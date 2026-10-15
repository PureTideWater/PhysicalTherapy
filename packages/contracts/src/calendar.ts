import type { CalendarEventKind } from '@tp/db/runtime';

import { type IsoDate, addDays, addYears, januaryFirst, windowCovers, yearOf } from './dates';
import type { ContractVersionRecord, RateRecord } from './records';

/**
 * The contract calendar (PRD 6, Contract repository: "a contract calendar"; Data dictionary,
 * contract_calendar_event): dates to act on, derived by code when a version is signed off, from that
 * version and its contract. Each kind is the next one on or after the sign-off date that the
 * version's window covers:
 *
 * - anniversary: the next anniversary of the contract's start (the earliest start among its
 *   signed-off versions);
 * - notice_deadline: that many days before the next anniversary whose deadline has not passed, when
 *   the version states a notice period;
 * - fee_schedule_year: the next January 1 after the version starts, when any of its rate records
 *   follows the current Medicare fee schedule (its percent-of-Medicare amounts move with the year);
 * - amendment: the day an amendment (a successor starting after the version it names) takes effect.
 *
 * Notes are written here from codes and numbers, never from a document's text.
 */

export interface DerivedCalendarEvent {
  readonly kind: CalendarEventKind;
  readonly onDate: IsoDate;
  readonly note: string;
}

export interface CalendarInput {
  /** The version just signed off. */
  readonly version: ContractVersionRecord;
  /** Every version of its contract, the one just signed off included. */
  readonly contractVersions: readonly ContractVersionRecord[];
  /** The signed-off version's rate records. */
  readonly rateRecords: readonly RateRecord[];
  /** The sign-off's date (UTC). */
  readonly signedOffOn: IsoDate;
}

/** How far ahead an anniversary is looked for: the window may end sooner, never later. */
const MAX_YEARS = 200;

function followsCurrentYear(record: RateRecord): boolean {
  const { terms } = record;
  if (terms.method === 'PERCENT_OF_MEDICARE') {
    return terms.parameters.year_basis === 'CURRENT';
  }
  return terms.method === 'LESSER_OF' && terms.parameters.schedule.method === 'PERCENT_OF_MEDICARE' && terms.parameters.schedule.year_basis === 'CURRENT';
}

function covered(version: ContractVersionRecord, date: IsoDate): boolean {
  return windowCovers(version.effectiveFrom, version.effectiveTo, date);
}

/** The first anniversary of `start` on or after `from` that satisfies `wanted`, inside the version's window. */
function nextAnniversary(start: IsoDate, from: IsoDate, version: ContractVersionRecord, wanted: (anniversary: IsoDate) => boolean): IsoDate | null {
  for (let years = 1; years <= MAX_YEARS; years += 1) {
    const anniversary = addYears(start, years);
    if (version.effectiveTo !== null && anniversary >= version.effectiveTo) {
      return null;
    }
    if (anniversary >= from && covered(version, anniversary) && wanted(anniversary)) {
      return anniversary;
    }
  }
  return null;
}

export function deriveCalendarEvents(input: CalendarInput): DerivedCalendarEvent[] {
  const { version, signedOffOn } = input;
  const events: DerivedCalendarEvent[] = [];
  const label = `version ${String(version.versionNo)}`;
  const starts = input.contractVersions.filter((candidate) => candidate.status === 'signed_off' || candidate.id === version.id).map((candidate) => candidate.effectiveFrom);
  const contractStart = [...starts, version.effectiveFrom].sort()[0] ?? version.effectiveFrom;

  const anniversary = nextAnniversary(contractStart, signedOffOn, version, () => true);
  if (anniversary !== null) {
    events.push({ kind: 'anniversary', onDate: anniversary, note: `Contract anniversary (${label} in force)` });
  }
  if (version.noticeDays !== null) {
    const days = version.noticeDays;
    const noticed = nextAnniversary(contractStart, signedOffOn, version, (candidate) => addDays(candidate, -days) >= signedOffOn);
    if (noticed !== null) {
      events.push({ kind: 'notice_deadline', onDate: addDays(noticed, -days), note: `Notice due ${String(days)} days before the anniversary on ${noticed} (${label})` });
    }
  }
  if (input.rateRecords.some(followsCurrentYear)) {
    const after = signedOffOn > version.effectiveFrom ? signedOffOn : version.effectiveFrom;
    const january = januaryFirst(yearOf(after) + 1);
    if (covered(version, january)) {
      events.push({ kind: 'fee_schedule_year', onDate: january, note: `Medicare fee schedule year ${String(yearOf(january))} begins; percent-of-Medicare rates of ${label} follow it` });
    }
  }
  const prior = version.supersedesId === null ? undefined : input.contractVersions.find((candidate) => candidate.id === version.supersedesId);
  if (prior !== undefined && version.effectiveFrom > prior.effectiveFrom) {
    events.push({ kind: 'amendment', onDate: version.effectiveFrom, note: `Amendment (${label}) takes effect; version ${String(prior.versionNo)} ends the day before` });
  }
  return events;
}
