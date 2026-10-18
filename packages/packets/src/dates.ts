/** Calendar-date arithmetic on ISO dates (UTC days; service and payment dates are calendar dates). */

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function epochDay(date: string): number {
  if (!ISO_DATE.test(date)) {
    throw new RangeError('a calendar date is written YYYY-MM-DD');
  }
  const time = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new RangeError('no such calendar date');
  }
  return time / DAY_MS;
}

export function isIsoDate(value: string): boolean {
  try {
    epochDay(value);
    return true;
  } catch {
    return false;
  }
}

/** The date `days` calendar days after `date` (before, when negative). */
export function addDays(date: string, days: number): string {
  return new Date((epochDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysFrom(from: string, to: string): number {
  return epochDay(to) - epochDay(from);
}
