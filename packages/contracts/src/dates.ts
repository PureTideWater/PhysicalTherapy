/**
 * Calendar dates as the plan stores them (CLAUDE.md: "service dates as calendar dates"): ISO text
 * YYYY-MM-DD, compared as text, never through a local clock. Windows are half-open [from, to): `to`
 * is the first day not covered (an amendment's start), null while open-ended.
 */

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') {
    return false;
  }
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whether the window [from, to) covers `date`. */
export function windowCovers(from: IsoDate, to: IsoDate | null, date: IsoDate): boolean {
  return from <= date && (to === null || date < to);
}

/** Whether two windows [from, to) share a day. */
export function windowsOverlap(a: { readonly from: IsoDate; readonly to: IsoDate | null }, b: { readonly from: IsoDate; readonly to: IsoDate | null }): boolean {
  return (b.to === null || a.from < b.to) && (a.to === null || b.from < a.to);
}

function parts(date: IsoDate): [number, number, number] {
  const match = ISO_DATE.exec(date);
  if (match === null || !isIsoDate(date)) {
    throw new RangeError('not a calendar date (YYYY-MM-DD)');
  }
  return [Number.parseInt(match[1] ?? '', 10), Number.parseInt(match[2] ?? '', 10), Number.parseInt(match[3] ?? '', 10)];
}

function format(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The same month and day `years` later; February 29 falls back to February 28 in a common year. */
export function addYears(date: IsoDate, years: number): IsoDate {
  const [year, month, day] = parts(date);
  const target = year + years;
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  return format(target, month, month === 2 && day === 29 && !leap ? 28 : day);
}

/** `days` days later (earlier when negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = parts(date);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
}

/** The calendar year of a date. */
export function yearOf(date: IsoDate): number {
  return parts(date)[0];
}

/** January 1 of a year. */
export function januaryFirst(year: number): IsoDate {
  return format(year, 1, 1);
}

/** Today's date in UTC, from an instant (the caller supplies the clock). */
export function utcDate(at: Date): IsoDate {
  return at.toISOString().slice(0, 10);
}
