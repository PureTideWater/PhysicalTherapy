import { addDays } from './dates';

/**
 * The next dispute window after a denial (PRD 12: "a denial with a reason can reopen the case for a
 * second-level dispute within the next window"). The first dispute runs in the lines' own window (the
 * contract's dispute window, or Medicare redetermination); a denial of the dispute at level n opens the
 * next level in the window the record names for it, counted from the day the denial was received:
 *
 * - a contract: its version's appeal levels, the entry numbered n (the n-th appeal after the dispute);
 * - Medicare Advantage non-contracted: the Medicare reconsideration window of the rule release (the
 *   dispute_window record) after a level-one denial; nothing after that.
 *
 * No such window: the case cannot be reopened for another level, and the denial stands.
 */

export interface AppealLevel {
  readonly level: number;
  readonly days: number;
}

export interface WindowLength {
  readonly length: number;
  readonly unit: 'days' | 'months';
}

export type NextWindowBasis =
  | { readonly kind: 'contract'; readonly appealLevels: readonly AppealLevel[] }
  | { readonly kind: 'regulation'; readonly reconsideration: WindowLength | null };

export interface NextWindow {
  readonly level: number;
  readonly endsOn: string;
}

function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/** The window of the level after `deniedLevel`, from the day the denial was received; null when none is known. */
export function nextDisputeWindow(basis: NextWindowBasis, deniedLevel: number, deniedOn: string): NextWindow | null {
  if (basis.kind === 'contract') {
    const entry = basis.appealLevels.find((item) => item.level === deniedLevel);
    return entry === undefined ? null : { level: deniedLevel + 1, endsOn: addDays(deniedOn, entry.days) };
  }
  if (deniedLevel !== 1 || basis.reconsideration === null) {
    return null;
  }
  const { length, unit } = basis.reconsideration;
  return { level: 2, endsOn: unit === 'days' ? addDays(deniedOn, length) : addMonths(deniedOn, length) };
}
