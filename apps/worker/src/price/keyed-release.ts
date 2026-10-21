import type { IndexedRelease, IsoDate, RecordRef } from '@tp/pricing';
import { type RuleRecord, type RuleRecordOf, type RuleRecordType, canonicalJson } from '@tp/rules';

/**
 * A release read by key (audit #53 part 2; docs/adr/0062, "The release read"; built generic so the Release-operations
 * PR of audit #31 can reuse it for price jobs, triage and reports).
 *
 * A caller that prices a set of lines does not need the whole release in memory. The record types no line's own key
 * selects (the GPCIs, the conversion factors, the assistant and sequestration records, the code lists) are small and
 * shared by every run under a release: they are read and indexed once per release and manifest. The types a line looks
 * up by its own code or ZIP (KEYED_RECORD_TYPES) are read per run, by the keys the run's lines can ask for, and the
 * database returns the key set it used beside the records. This view joins the two into one IndexedRelease for the
 * unchanged engine:
 *
 * - a lookup of a shared type is served from the shared index;
 * - a lookup of a keyed type whose key is in `requested` is served from the run's index, and may legitimately find
 *   nothing (a code with no medically unlikely edit, most same-code pairs);
 * - a lookup of a keyed type whose key is NOT in `requested` would read a record the run never fetched, so a "not
 *   found" there would be silent and wrong: it sets `violation` (the record type and the key's field names only, never
 *   a value; the first one is kept and never cleared) and throws ReleaseReadOutsideFetch.
 *
 * The contract a caller keeps: the engine turns any throw into a line priced ENGINE_ERROR ('unexpected'; its
 * attempt() and the reduction step's try/catch, packages/pricing/src/engine.ts), so the throw alone would be quiet.
 * After every price() call, and before it stores anything, the caller checks `violation` and fails the whole run when
 * it is set: no row is ever stored on a lookup the run did not make (audit #31's rule).
 *
 * `ref` names a record by the SHA-256 the loader stored, as indexStoredRelease does: each index answers for its own
 * records.
 */

/** The record types a line looks up by its own key: read per run, by key. */
export const KEYED_RECORD_TYPES = ['pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map'] as const satisfies readonly RuleRecordType[];

export type KeyedRecordType = (typeof KEYED_RECORD_TYPES)[number];

const KEYED = new Set<string>(KEYED_RECORD_TYPES);

/** Whether a record type is read per run, by key. */
export function isKeyedRecordType(type: string): type is KeyedRecordType {
  return KEYED.has(type);
}

/** The keys a run fetched, per keyed type, each as its canonical JSON. */
export type RequestedKeys = Readonly<Record<KeyedRecordType, ReadonlySet<string>>>;

/** A lookup the run did not fetch: its record type and its key's field names, never a value. */
export interface ReleaseViolation {
  readonly recordType: KeyedRecordType;
  readonly keyFields: readonly string[];
}

/** A keyed lookup outside the keys the run fetched (RELEASE_READ_OUTSIDE_FETCH). */
export class ReleaseReadOutsideFetch extends Error {
  override readonly name = 'ReleaseReadOutsideFetch';
  readonly code = 'RELEASE_READ_OUTSIDE_FETCH';

  constructor(readonly violation: ReleaseViolation) {
    super(`a ${violation.recordType} lookup by (${violation.keyFields.join(', ')}) outside the keys the run fetched`);
  }
}

/** The engine's view of a release read by key, with the first lookup outside the fetch it saw. */
export interface KeyedReleaseView extends IndexedRelease {
  /** The first keyed lookup outside `requested`, or null; never cleared. */
  readonly violation: ReleaseViolation | null;
}

/** The canonical form of a key, as the release index compares keys. */
export function keyIdentity(key: Readonly<Record<string, string>>): string {
  return canonicalJson(key);
}

/** A set of keys per keyed type, from lists of keys. */
export function requestedKeys(keys: Readonly<Partial<Record<KeyedRecordType, readonly Readonly<Record<string, string>>[]>>>): RequestedKeys {
  const set = (type: KeyedRecordType) => new Set((keys[type] ?? []).map(keyIdentity));
  return { pfs_rvu: set('pfs_rvu'), ncci_mue: set('ncci_mue'), mppr_rate: set('mppr_rate'), ncci_ptp: set('ncci_ptp'), locality_map: set('locality_map') };
}

/**
 * The keys a screening run's lines can ask for (apps/worker/src/screening/adapter.ts; the same keys
 * operator_screening_run_records() reads): for each priced code, its relative values and its MPPR rate with no
 * modifier, its medically unlikely edit, and the same-code pair (a screening claim is one line, or two lines of one
 * code: screeningVisitClaim); the general practice-expense MPPR rate; and the prospect's ZIP.
 */
export function screeningRequestedKeys(codes: Iterable<string>, zip: string): RequestedKeys {
  const list = [...codes];
  return requestedKeys({
    pfs_rvu: list.map((hcpcs) => ({ hcpcs, modifier: '' })),
    ncci_mue: list.map((hcpcs) => ({ hcpcs })),
    mppr_rate: [...list.map((hcpcs) => ({ hcpcs, modifier: '' })), { component: 'practice_expense' }],
    ncci_ptp: list.map((code) => ({ column1: code, column2: code })),
    locality_map: [{ zip }],
  });
}

export interface KeyedReleaseParts {
  /** The release's shared types, indexed once per release and manifest. */
  readonly shared: IndexedRelease;
  /** The run's records of the keyed types (indexStoredRelease over what the database returned for the key set). */
  readonly records: IndexedRelease;
  /** The keys the run fetched. */
  readonly requested: RequestedKeys;
}

/** Joins a release's shared index and a run's keyed records into the engine's view (see the module comment). */
export function keyedRelease({ shared, records, requested }: KeyedReleaseParts): KeyedReleaseView {
  if (shared.releaseNo !== records.releaseNo || shared.manifestSha256 !== records.manifestSha256) {
    throw new RangeError('the shared types and the run’s records are of different releases');
  }
  let violation: ReleaseViolation | null = null;
  const admit = (type: KeyedRecordType, key: Readonly<Record<string, string>>): void => {
    if (!requested[type].has(keyIdentity(key))) {
      const found: ReleaseViolation = { recordType: type, keyFields: Object.keys(key).sort() };
      violation ??= found;
      throw new ReleaseReadOutsideFetch(found);
    }
  };
  return {
    releaseNo: shared.releaseNo,
    manifestSha256: shared.manifestSha256,
    get violation() {
      return violation;
    },
    inForce<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, date: IsoDate): RuleRecordOf<T> | null {
      if (isKeyedRecordType(type)) {
        admit(type, key);
        return records.inForce(type, key, date);
      }
      return shared.inForce(type, key, date);
    },
    latestInYear<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, year: number): RuleRecordOf<T> | null {
      if (isKeyedRecordType(type)) {
        admit(type, key);
        return records.latestInYear(type, key, year);
      }
      return shared.latestInYear(type, key, year);
    },
    ref(record: RuleRecord): RecordRef {
      return isKeyedRecordType(record.record_type) ? records.ref(record) : shared.ref(record);
    },
  };
}
