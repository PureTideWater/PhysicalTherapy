/**
 * How a proposal's fields are counted against what is true (docs/adr/0070, Part 1; audit item #84). One
 * tally serves both scorers: the synthetic gate's (eval/score.ts, a document against its truth) and the
 * in-boundary run's (./permitted.ts, a permitted example against the specialist's final records), so the
 * two can never count a field differently.
 *
 * Each true record pairs with the candidate that gets most of its fields right (greedy, in the order the
 * records and candidates come, as the scorers always paired them). For each field, against that pair:
 *
 * | Truth has it       | Candidate states it        | Verified | Value is the truth's | Count                        |
 * |--------------------|----------------------------|----------|----------------------|------------------------------|
 * | yes                | yes                        | yes      | yes                  | tp                           |
 * | yes                | yes                        | yes      | no                   | wrong                        |
 * | yes                | yes                        | no       | yes                  | rejected, and rejected_right |
 * | yes                | yes                        | no       | no                   | rejected                     |
 * | yes, a scope field | no, on a rate record       |          |                      | widened                      |
 * | yes                | no (or no pair)            |          |                      | missed                       |
 * | no                 | yes                        | yes      |                      | extra                        |
 * | no                 | yes                        | no       |                      | rejected_extra               |
 *
 * A candidate paired with no record counts `extra` or `rejected_extra` for every field it states.
 *
 * "Verified" is the gateway verifier's own answer for the field; a scorer decides it for a field the
 * verifier never cites (the lesser-of schedule counts as verified when stated, a wrong one being wrong
 * but verified, which is what it is).
 *
 * `widened` (review M2): a scope field (SCOPE_FIELDS: the codes, modifiers, places of service and
 * effective dates a rate record applies to) that the paired truth states and the paired candidate leaves
 * out, where the candidate was proposed as a rate record (`Stated.rateRecord`). A scope field left out is
 * not a default the specialist confirms: the record applies to every code, modifier, place or date, and
 * the specialist sees no row for the field at all, every row shown marked as found on the page. So it is
 * the dangerous kind, beside a wrong value that verified, and never a plain miss: a change that turns a
 * rejected modifier (visible) into a left-out one (silent) would otherwise read as better precision. A
 * scope field left out of a candidate that became no rate record widens nothing, and stays `missed`.
 * A scorer that does not say whether a candidate became a rate record (`rateRecord` absent) has every
 * omission counted `missed`, as before the key existed.
 *
 * Until 6ddd587 the scorers kept only tp, fp and fn, so a field the verifier rejected (the specialist
 * sees it marked and enters it by hand) and a wrong field the verifier passed (the specialist sees it
 * marked as checked) were the same count, and a change that turned the one into the other passed the
 * gate. `wrongVerified` (wrong + extra + widened) is that second kind on its own. The old counts are
 * derived (`asCounts`), so precision and recall keep the meaning they had and every recorded fraction
 * still compares: `widened` is a field the truth states and the answer does not, a false negative, which
 * is what /1 counted it (as missed), and nothing the answer stated, so never a false positive. Counts are
 * integers; nothing here is a float.
 *
 * Beside the counts, tallyFields names each paired record and field it counted wrong but verified
 * (`wrongVerifiedAt`), so a cap can hold which values are wrong, not only how many (review n4). A field
 * of a candidate paired with no record has no record to name, and is bounded by its count alone.
 */

export interface FieldTally {
  /** Stated, verified and the truth's value. */
  readonly tp: number;
  /** Stated and verified, but not the truth's value: wrong but shown as checked. */
  readonly wrong: number;
  /** Stated and verified where the paired truth states nothing (or no truth pairs with the candidate). */
  readonly extra: number;
  /** Stated and rejected by the verifier, where the truth states the field. */
  readonly rejected: number;
  /** Of `rejected`, those whose value was the truth's: a right value the verifier could not tie to its quote. */
  readonly rejected_right: number;
  /** Stated and rejected where the truth states nothing. */
  readonly rejected_extra: number;
  /** The truth states it and the paired candidate does not (or nothing pairs with the record), and leaving it out widens no rate record. */
  readonly missed: number;
  /** A scope field the truth states, left out of a candidate proposed as a rate record: the record applies more widely than the contract, with nothing marked. */
  readonly widened: number;
}

export const TALLY_KEYS = ['tp', 'wrong', 'extra', 'rejected', 'rejected_right', 'rejected_extra', 'missed', 'widened'] as const satisfies readonly (keyof FieldTally)[];

export const ZERO_TALLY: FieldTally = { tp: 0, wrong: 0, extra: 0, rejected: 0, rejected_right: 0, rejected_extra: 0, missed: 0, widened: 0 };

/**
 * The fields that bound what a rate record applies to, as both scorers name them (src/baseline-format.ts
 * BASELINE_FIELDS; ./permitted.ts PERMITTED_FIELDS). A rate record that leaves one out is not held back
 * and takes no code default (./functions/contract-terms.ts enteredTerms): it applies to every value of it.
 */
export const SCOPE_FIELDS = ['codes', 'modifiers', 'places_of_service', 'effective_from', 'effective_to'] as const;
const SCOPE: ReadonlySet<string> = new Set(SCOPE_FIELDS);

export function addTally(a: FieldTally, b: FieldTally): FieldTally {
  return {
    tp: a.tp + b.tp,
    wrong: a.wrong + b.wrong,
    extra: a.extra + b.extra,
    rejected: a.rejected + b.rejected,
    rejected_right: a.rejected_right + b.rejected_right,
    rejected_extra: a.rejected_extra + b.rejected_extra,
    missed: a.missed + b.missed,
    widened: a.widened + b.widened,
  };
}

/** A tally of zero for each field. */
export function zeroTallies<F extends string>(fields: readonly F[]): Record<F, FieldTally> {
  return Object.fromEntries(fields.map((field) => [field, ZERO_TALLY])) as Record<F, FieldTally>;
}

/** Each field's tallies summed over several results (a report's fields over its cases or examples). */
export function sumTallies<F extends string>(fields: readonly F[], each: readonly Readonly<Record<F, FieldTally>>[]): Record<F, FieldTally> {
  return Object.fromEntries(fields.map((field) => [field, each.reduce((sum, tallies) => addTally(sum, tallies[field]), ZERO_TALLY)])) as Record<F, FieldTally>;
}

/** Every field's tally summed into one. */
export function totalTally<F extends string>(fields: readonly F[], tallies: Readonly<Record<F, FieldTally>>): FieldTally {
  return fields.reduce((sum, field) => addTally(sum, tallies[field]), ZERO_TALLY);
}

/** What one candidate states, field by field, as code reads it (null where code cannot), and which of its fields verified. */
export interface Stated<F extends string> {
  /** A field is stated when it is a key here, whatever its value (null is a value code could not read). */
  readonly keys: Readonly<Partial<Record<F, string | null>>>;
  readonly verified: ReadonlySet<F>;
  /**
   * Whether the gateway proposed the candidate as a rate record (its review's `rateRecord`), so that a
   * scope field it leaves out widens that record (`widened`). Absent is read as false: a scorer that
   * does not say has its omissions counted `missed`, as before review M2.
   */
  readonly rateRecord?: boolean;
}

/** A true record's fields as the same comparable keys; a field the record does not state is absent. */
export type TrueKeys<F extends string> = Readonly<Partial<Record<F, string>>>;

const right = <F extends string>(stated: Stated<F>, field: F, truth: string) => stated.verified.has(field) && stated.keys[field] === truth;

/**
 * For each true record, the index of the candidate it pairs with, or null: the unpaired candidate that
 * gets most of the record's fields right (verified and the truth's value), the first such on a tie, and
 * none when no candidate gets any field right. A candidate pairs with one record at most.
 */
export function pairRecords<F extends string>(fields: readonly F[], truths: readonly TrueKeys<F>[], stated: readonly Stated<F>[]): (number | null)[] {
  const unpaired = new Set(stated.keys());
  return truths.map((truth) => {
    let best: number | null = null;
    let agreed = 0;
    for (const index of unpaired) {
      const candidate = stated[index] as Stated<F>;
      const count = fields.filter((field) => {
        const value = truth[field];
        return value !== undefined && right(candidate, field, value);
      }).length;
      if (count > agreed) {
        best = index;
        agreed = count;
      }
    }
    if (best !== null) {
      unpaired.delete(best);
    }
    return best;
  });
}

/** A paired record's field counted wrong but verified (wrong, extra or widened), by the record's index among the truths. */
export interface WrongAt<F extends string> {
  readonly field: F;
  readonly record: number;
}

export interface Tallied<F extends string> {
  readonly tallies: Record<F, FieldTally>;
  /** For each true record, the candidate it paired with (pairRecords). */
  readonly pairs: readonly (number | null)[];
  /** Each paired record's fields counted wrong but verified, in record order and then the fields' order. */
  readonly wrongVerifiedAt: readonly WrongAt<F>[];
}

/** The fields' tallies of a set of candidates against a set of true records (the table above). */
export function tallyFields<F extends string>(fields: readonly F[], truths: readonly TrueKeys<F>[], stated: readonly Stated<F>[]): Tallied<F> {
  const tallies = zeroTallies(fields);
  const bump = (field: F, key: keyof FieldTally) => {
    tallies[field] = { ...tallies[field], [key]: tallies[field][key] + 1 };
  };
  const counted = new Set(fields);
  const pairs = pairRecords(fields, truths, stated);
  const wrongVerifiedAt: WrongAt<F>[] = [];
  truths.forEach((truth, index) => {
    const pairedWith = pairs[index];
    const pair = pairedWith === null || pairedWith === undefined ? undefined : stated[pairedWith];
    const dangerous = (field: F, key: 'wrong' | 'extra' | 'widened') => {
      bump(field, key);
      wrongVerifiedAt.push({ field, record: index });
    };
    for (const field of fields) {
      const value = truth[field];
      const says = pair !== undefined && field in pair.keys;
      const verified = says && pair.verified.has(field);
      if (value === undefined) {
        if (verified) {
          dangerous(field, 'extra');
        } else if (says) {
          bump(field, 'rejected_extra');
        }
      } else if (!says) {
        if (pair?.rateRecord === true && SCOPE.has(field)) {
          dangerous(field, 'widened');
        } else {
          bump(field, 'missed');
        }
      } else if (verified) {
        if (pair.keys[field] === value) {
          bump(field, 'tp');
        } else {
          dangerous(field, 'wrong');
        }
      } else {
        bump(field, 'rejected');
        if (pair.keys[field] === value) {
          bump(field, 'rejected_right');
        }
      }
    }
  });
  const paired = new Set(pairs.filter((pair): pair is number => pair !== null));
  stated.forEach((candidate, index) => {
    if (paired.has(index)) {
      return;
    }
    // A field the scorer does not count (flags and rounding in the in-boundary run) is left out here too.
    for (const field of (Object.keys(candidate.keys) as F[]).filter((key) => counted.has(key))) {
      bump(field, candidate.verified.has(field) ? 'extra' : 'rejected_extra');
    }
  });
  return { tallies, pairs, wrongVerifiedAt };
}

/**
 * Wrong but verified: what the specialist would see marked as checked that is not the truth's (a wrong
 * value, a value the truth does not state), and a rate record's scope left wider than the truth's with
 * nothing marked at all (widened).
 */
export const wrongVerified = (tally: FieldTally): number => tally.wrong + tally.extra + tally.widened;

/** The tp, fp and fn the scorers kept before the tally (6ddd587), derived: precision and recall are computed over these. */
export interface DerivedCounts {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
}

/**
 * The /1 counts, derived: equal, case by case, to what scoreContract and scorePermitted computed at
 * 6ddd587. A widened field is fn, as the missed field /1 counted it; it states nothing, so it is never fp.
 */
export function asCounts(tally: FieldTally): DerivedCounts {
  return { tp: tally.tp, fp: tally.wrong + tally.extra + tally.rejected + tally.rejected_extra, fn: tally.wrong + tally.rejected + tally.missed + tally.widened };
}
