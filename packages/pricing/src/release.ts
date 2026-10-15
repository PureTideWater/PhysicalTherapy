import { type RuleRecord, type RuleRecordOf, type RuleRecordType, canonicalJson, recordSha256 } from '@tp/rules';

import { type IsoDate, inclusiveCovers } from './dates';
import { EngineInputError } from './reasons';

/**
 * A numbered rule release as the engine reads it (PRD section 9): its number, the SHA-256 of its
 * MANIFEST.json (what `rule_release.manifest_sha256` records), and its records. The caller reads it
 * from the database or, in tests, from a release directory; the engine never does.
 */
export interface RuleRelease {
  readonly releaseNo: number;
  readonly manifestSha256: string;
  readonly records: readonly RuleRecord[];
}

/** How a trace names the rule record it used: its type, key, window and `rule_record.sha256`. */
export interface RecordRef {
  readonly record_type: RuleRecordType;
  readonly key: Readonly<Record<string, string>>;
  readonly effective_from: IsoDate;
  readonly effective_to: IsoDate | null;
  readonly sha256: string;
}

/** A release indexed once for many claims: lookups by record type and key. Rule windows are inclusive. */
export interface IndexedRelease {
  readonly releaseNo: number;
  readonly manifestSha256: string;
  /** The record of the key in force on the date, or null. Two in force breaks a release invariant. */
  inForce<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, date: IsoDate): RuleRecordOf<T> | null;
  /** Of the key's records in force at any time during `year`, the one that starts latest; null when none. */
  latestInYear<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, year: number): RuleRecordOf<T> | null;
  /** The record's identity for a trace. */
  ref(record: RuleRecord): RecordRef;
}

function lookupKey(type: string, key: Readonly<Record<string, string>>): string {
  return `${type} ${canonicalJson(key)}`;
}

/** Indexes a release. Records of one key are kept in order of their start. */
export function indexRelease(release: RuleRelease): IndexedRelease {
  const byKey = new Map<string, RuleRecord[]>();
  for (const record of release.records) {
    const identity = lookupKey(record.record_type, record.key as Record<string, string>);
    const list = byKey.get(identity);
    if (list === undefined) {
      byKey.set(identity, [record]);
    } else {
      list.push(record);
    }
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0));
  }
  const refs = new Map<RuleRecord, RecordRef>();

  return {
    releaseNo: release.releaseNo,
    manifestSha256: release.manifestSha256,
    inForce<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, date: IsoDate): RuleRecordOf<T> | null {
      const found = (byKey.get(lookupKey(type, key)) ?? []).filter((record) => inclusiveCovers(record.effective_from, record.effective_to, date));
      if (found.length > 1) {
        throw new EngineInputError('release_records_overlap');
      }
      return (found[0] as RuleRecordOf<T> | undefined) ?? null;
    },
    latestInYear<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, year: number): RuleRecordOf<T> | null {
      const first = `${String(year).padStart(4, '0')}-01-01`;
      const last = `${String(year).padStart(4, '0')}-12-31`;
      const found = (byKey.get(lookupKey(type, key)) ?? []).filter((record) => record.effective_from <= last && (record.effective_to === null || record.effective_to >= first));
      return (found.at(-1) as RuleRecordOf<T> | undefined) ?? null;
    },
    ref(record: RuleRecord): RecordRef {
      let found = refs.get(record);
      if (found === undefined) {
        found = {
          record_type: record.record_type,
          key: { ...(record.key as Record<string, string>) },
          effective_from: record.effective_from,
          effective_to: record.effective_to,
          sha256: recordSha256(record),
        };
        refs.set(record, found);
      }
      return found;
    },
  };
}
