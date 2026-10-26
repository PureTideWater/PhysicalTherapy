import type { ScopeClient } from '@tp/db/runtime';
import { type ContentId, type DateRange, type RuleRecordType, dayBefore, mergeRanges } from '@tp/rules';
import { CONTENT_CALENDAR, type ContentCalendar, type ContentFamilyId, type ContentState, type ContentStates, familyLoadedThrough } from '@tp/rules/calendar';
import { type ContentSpans, type ContentWindows, type HalfOpenRange, currentReleaseNo, releaseContentSpans, releaseContentWindows } from '@tp/worker/pricing';

/**
 * The days each content of a rule release is loaded for, as the web reads them (audit #7 and #59; docs/adr/0071): the
 * per-content windows (releaseContentWindows, one aggregate over the release's records) for the console's Content due,
 * the Releases page's loaded-through dates and Coverage's fee-schedule sentence, and the span contents
 * (releaseContentSpans: the per-code MPPR, the general MPPR rate and the MUE) for Coverage's months waiting on Medicare
 * content. One computation for all of them.
 *
 * Both are read once per release and kept here by its number and manifest SHA-256, as the screening's spans are
 * (lib/screening/content-span.ts): a published release never changes, so a kept value is never stale, and a release
 * republished under another manifest is read again. The aggregate scans the release once per web process; the cache is
 * what keeps it off every page view. What is kept is a few dozen rows per release, never a record. A practice's page
 * reads only the record types of the contents it shows (Coverage the fee schedule's, Releases the dated families'), so
 * Coverage never aggregates the code-pair edits (most of a release) and Releases leaves out the contents typed in when
 * they change; the console reads every content.
 */

/** How many releases are kept (the release in force and the few a page names). */
const KEPT_RELEASES = 8;

/** A first-in, first-out cache of at most KEPT_RELEASES entries, by release number and manifest. */
class ReleaseCache<T> {
  private readonly kept = new Map<string, Promise<T>>();

  async get(releaseNo: number, manifestSha256: string, read: () => Promise<T>, part = 'all'): Promise<T> {
    const key = `${String(releaseNo)}:${manifestSha256}:${part}`;
    const found = this.kept.get(key);
    if (found !== undefined) {
      return found;
    }
    if (this.kept.size >= KEPT_RELEASES) {
      const oldest = this.kept.keys().next().value;
      if (oldest !== undefined) {
        this.kept.delete(oldest);
      }
    }
    const reading = read();
    this.kept.set(key, reading);
    // A failed read is not kept: the next request reads again.
    reading.catch(() => {
      if (this.kept.get(key) === reading) {
        this.kept.delete(key);
      }
    });
    return reading;
  }

  clear(): void {
    this.kept.clear();
  }
}

const windowsKept = new ReleaseCache<ContentWindows>();
const spansKept = new ReleaseCache<ContentSpans>();

/** Empties both caches (tests only). */
export function forgetContentThrough(): void {
  windowsKept.clear();
  spansKept.clear();
}

/** A published release's manifest SHA-256, or null when no such release is published. */
export async function releaseManifest(client: ScopeClient, releaseNo: number): Promise<string | null> {
  const { rows } = await client.query<{ manifest_sha256: string }>('SELECT manifest_sha256 FROM rule_release WHERE release_no = $1 AND published_at IS NOT NULL', [releaseNo]);
  return rows[0]?.manifest_sha256 ?? null;
}

/** The record type a content is read from: the MPPR's two contents are mppr_rate's. */
function recordTypeOf(content: ContentId): RuleRecordType {
  return content === 'mppr_code' || content === 'mppr_general' ? 'mppr_rate' : content;
}

/** The contents of the calendar's dated families (every family but those typed in when they change), as the Releases page lists them. */
export const DATED_FAMILY_CONTENTS: readonly ContentId[] = CONTENT_CALENDAR.filter((entry) => entry.cadence.kind !== 'on_change').flatMap((entry) => entry.contents);

/**
 * The windows of a release's contents, read once per release, manifest and contents: every content's when `contents`
 * is omitted, else only the record types those contents are read from (the windows of the other contents of those
 * types come with them).
 */
export async function contentWindowsOf(client: ScopeClient, releaseNo: number, manifestSha256: string, contents?: readonly ContentId[]): Promise<ContentWindows> {
  if (contents === undefined) {
    return windowsKept.get(releaseNo, manifestSha256, async () => releaseContentWindows(client, releaseNo));
  }
  const types = [...new Set(contents.map(recordTypeOf))].sort();
  return windowsKept.get(releaseNo, manifestSha256, async () => releaseContentWindows(client, releaseNo, types), types.join(','));
}

/** The release in force and its windows (of `contents` only, when given); null when no release is in force. */
export async function windowsInForce(client: ScopeClient, contents?: readonly ContentId[]): Promise<{ readonly releaseNo: number; readonly windows: ContentWindows } | null> {
  const releaseNo = await currentReleaseNo(client);
  const manifest = releaseNo === null ? null : await releaseManifest(client, releaseNo);
  return releaseNo === null || manifest === null ? null : { releaseNo, windows: await contentWindowsOf(client, releaseNo, manifest, contents) };
}

/** The span contents' loaded days in a release (rule_release_content_span()), read once per release and manifest. */
export async function contentSpansOf(client: ScopeClient, releaseNo: number, manifestSha256: string): Promise<ContentSpans> {
  return spansKept.get(releaseNo, manifestSha256, async () => releaseContentSpans(client, releaseNo));
}

/** Half-open ranges as the calendar's inclusive ones, merged. A range with no lower bound never occurs (every record has a start). */
export function inclusiveRanges(ranges: readonly HalfOpenRange[]): DateRange[] {
  return mergeRanges(ranges.flatMap((range) => (range.from === null ? [] : [{ from: range.from, to: range.until === null ? null : dayBefore(range.until) }])));
}

/** A release's windows as the content calendar judges them (contentDue(), familyLoadedThrough()). */
export function contentStatesOf(windows: ContentWindows): ContentStates {
  const states: Partial<Record<ContentId, ContentState>> = {};
  for (const window of windows.values()) {
    states[window.content] = { windows: inclusiveRanges(window.loaded), newestFrom: window.newestFrom, newestRetrieved: window.newestRetrieved };
  }
  return states;
}

/** Ranges as a datemultirange literal, for a query parameter: `{[2026-01-01,2026-10-01)}`; `{}` when none. */
export function multirangeLiteral(ranges: readonly HalfOpenRange[]): string {
  return `{${ranges.map((range) => `[${range.from ?? ''},${range.until ?? ''})`).join(',')}}`;
}

/** A family's loaded-through date on a day, as the Releases page and the console show it. */
export interface FamilyThrough {
  readonly family: ContentFamilyId;
  readonly title: string;
  /** The last day loaded (of the window holding the day, else the latest before it); null when open or not loaded. */
  readonly through: string | null;
  /** In force with no end date. */
  readonly open: boolean;
  /** Its last day loaded is before the day: it has ended, and the days after it are not loaded. */
  readonly ended: boolean;
  /** Whether every content of the family has a record in the release. */
  readonly loaded: boolean;
  /** Not loaded, but some of the family's contents have a record in the release (a ZIP5 file with no ZIP+4 file). */
  readonly partly: boolean;
  /** Loaded only for days after `today`: the first day every content of the family is loaded from; else null. */
  readonly from: string | null;
}

/**
 * Per family of the calendar, in its order, its loaded-through date in a release on `today` (familyLoadedThrough(): the
 * earliest of its contents'); `windows` null reads as nothing loaded. Every family is listed, a family not loaded or
 * loaded only from a later day included, so a list of them is never read as complete when it is not. The families
 * PaidWhole types in when they change (`on_change`) have no date to run out, and are left out unless `onChange` asks
 * for them (the console lists every family).
 */
export function familiesLoadedThrough(windows: ContentWindows | null, today: string, options: { readonly onChange?: boolean; readonly calendar?: ContentCalendar } = {}): FamilyThrough[] {
  const states = windows === null ? {} : contentStatesOf(windows);
  return (options.calendar ?? CONTENT_CALENDAR)
    .filter((entry) => options.onChange === true || entry.cadence.kind !== 'on_change')
    .map((entry) => {
      const through = familyLoadedThrough(entry, states, today);
      const later = through.loaded && !through.open && through.through === null;
      const partly = !through.loaded && entry.contents.some((content) => (states[content]?.windows.length ?? 0) > 0);
      return { family: entry.family, title: entry.title, ...through, ended: through.through !== null && through.through < today, partly, from: later ? firstDayLoaded(entry.contents, states, today) : null };
    });
}

/** The first day after `today` from which every one of `contents` loaded only later is loaded: the latest of their first windows' starts. */
function firstDayLoaded(contents: readonly ContentId[], states: ContentStates, today: string): string | null {
  const starts = contents.flatMap((content) => {
    const windows = states[content]?.windows ?? [];
    if (windows.some((window) => window.from <= today)) {
      return [];
    }
    const first = windows.map((window) => window.from).sort()[0];
    return first === undefined ? [] : [first];
  });
  return starts.sort().at(-1) ?? null;
}
