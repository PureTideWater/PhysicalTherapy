/**
 * Calendar dates as ISO text ("2026-03-05"), with day arithmetic done on whole day numbers (the
 * days-from-civil algorithm), so nothing depends on a time zone, a locale or the clock.
 */
declare const CALENDAR_DATE: unique symbol;

/** A calendar date, "YYYY-MM-DD". */
export type CalendarDate = string & { readonly [CALENDAR_DATE]: true };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = month > 2 ? month - 3 : month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days: number): [number, number, number] {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function calendarDate(year: number, month: number, day: number): CalendarDate {
  const text = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  return parseCalendarDate(text);
}

/** Checks "YYYY-MM-DD" names a real day. */
export function parseCalendarDate(text: string): CalendarDate {
  const match = ISO.exec(text);
  if (!match) {
    throw new RangeError(`not a calendar date: ${text}`);
  }
  const [year, month, day] = [Number.parseInt(match[1] ?? '', 10), Number.parseInt(match[2] ?? '', 10), Number.parseInt(match[3] ?? '', 10)];
  const [y, m, d] = civilFromDays(daysFromCivil(year, month, day));
  if (y !== year || m !== month || d !== day) {
    throw new RangeError(`not a calendar date: ${text}`);
  }
  return text as CalendarDate;
}

export function dayNumber(date: CalendarDate): number {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  return daysFromCivil(year ?? 0, month ?? 0, day ?? 0);
}

export function fromDayNumber(days: number): CalendarDate {
  const [year, month, day] = civilFromDays(days);
  return calendarDate(year, month, day);
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromDayNumber(dayNumber(date) + days);
}

export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  return dayNumber(to) - dayNumber(from);
}

/** CCYYMMDD, the X12 date format. */
export function toX12Date(date: CalendarDate): string {
  return date.replaceAll('-', '');
}

/** YYMMDD, the ISA09 interchange date. */
export function toIsaDate(date: CalendarDate): string {
  return toX12Date(date).slice(2);
}

/** CCYYMMDD back to a calendar date. */
export function fromX12Date(text: string): CalendarDate {
  if (!/^\d{8}$/.test(text)) {
    throw new RangeError(`not an X12 date: ${text}`);
  }
  return parseCalendarDate(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`);
}

/** MM/DD/YYYY, how the synthetic posting export writes dates. */
export function toUsDate(date: CalendarDate): string {
  const [year, month, day] = date.split('-');
  return `${month ?? ''}/${day ?? ''}/${year ?? ''}`;
}
