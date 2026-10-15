/**
 * Calendar dates as ISO text (YYYY-MM-DD), compared as text and moved by integer arithmetic on the
 * proleptic Gregorian calendar. Nothing here reads a clock or a time zone: the engine is told the
 * date it judges windows against.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function parts(text: string): readonly [number, number, number] | null {
  const match = ISO_DATE.exec(text);
  if (match === null) {
    return null;
  }
  const [year, month, day] = match.slice(1, 4).map((part) => Number.parseInt(part, 10)) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return [year, month, day];
}

/** Whether `value` is a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && parts(value) !== null;
}

function checked(date: IsoDate): readonly [number, number, number] {
  const found = parts(date);
  if (found === null) {
    throw new RangeError('not a calendar date (YYYY-MM-DD)');
  }
  return found;
}

function format(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days since 1970-01-01 (negative before it), by the civil-from-days algorithm. */
function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromDayNumber(days: number): IsoDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;
  return format(yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day);
}

/** `days` days after `date` (before it when negative). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = checked(date);
  return fromDayNumber(dayNumber(year, month, day) + days);
}

/** The same day `months` months later; a day past the end of the target month falls back to its last day. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = checked(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** The calendar year of a date. */
export function yearOf(date: IsoDate): number {
  return checked(date)[0];
}

/** Whether the inclusive window [from, to] covers `date`; a null `to` is open-ended. */
export function inclusiveCovers(from: IsoDate, to: IsoDate | null, date: IsoDate): boolean {
  return from <= date && (to === null || date <= to);
}
