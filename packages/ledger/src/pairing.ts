/**
 * A claim's lines paired with the lines of a claim that reprocesses or reverses it (PRD 13, Matching
 * step 1: "a match with a higher observed allowed than the original creates an approved entry for the
 * difference"; step 2: "partial postings are matched line by line"; CLAUDE.md rule 1). Two lines of one
 * claim may share a code and a date of service (97110 and 97110-59, or the same code twice), so a case
 * line is compared with, posted from and deposited from exactly one line of the other claim, and each
 * line of the other claim stands for at most one line of the original:
 *
 * 1. a line of the same procedure code, modifiers, units and date of service, in line order among the
 *    lines alike in all four;
 * 2. for what is left, a line of the same code and date of service, in line order among those.
 *
 * A line left unpaired has nothing to compare with. The 835 carries no line item control number the
 * loader keeps (the data dictionary's service_line holds none), so these are the line's identity.
 */

export interface PairableLine {
  readonly procedureCode: string;
  /** In their positions; an empty position is ignored. */
  readonly modifiers: readonly string[];
  /** SVC05 as stored (numeric text), or null. */
  readonly units: string | null;
  readonly serviceDate: string | null;
}

function modifiersOf(line: PairableLine): string {
  return line.modifiers.filter((modifier) => modifier !== '').join(':');
}

function sameCodeAndDate(a: PairableLine, b: PairableLine): boolean {
  return a.procedureCode === b.procedureCode && a.serviceDate === b.serviceDate;
}

function sameLine(a: PairableLine, b: PairableLine): boolean {
  return sameCodeAndDate(a, b) && modifiersOf(a) === modifiersOf(b) && a.units === b.units;
}

/**
 * For each line of `original`, the index of its line in `other`, or null when it has none: the pairing
 * is one to one, and the same inputs always give the same pairs.
 */
export function pairLines(original: readonly PairableLine[], other: readonly PairableLine[]): (number | null)[] {
  const pairs: (number | null)[] = original.map(() => null);
  const taken = new Set<number>();
  for (const alike of [sameLine, sameCodeAndDate]) {
    original.forEach((line, index) => {
      if (pairs[index] !== null) {
        return;
      }
      const found = other.findIndex((candidate, at) => !taken.has(at) && alike(line, candidate));
      if (found >= 0) {
        pairs[index] = found;
        taken.add(found);
      }
    });
  }
  return pairs;
}

/** The line of `other` paired with the `index`-th line of `original`, or undefined when it has none. */
export function pairedLine<T extends PairableLine>(original: readonly PairableLine[], index: number, other: readonly T[]): T | undefined {
  const at = pairLines(original, other)[index];
  return at === null || at === undefined ? undefined : other[at];
}
