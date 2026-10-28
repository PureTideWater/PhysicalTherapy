import { DAY_MS, EXCLUDE_MAX_DAYS, MINIMUM_RELEASE_AGE_MINUTES, MINUTE_MS, type Workspace } from './policy';

/**
 * One release-age floor and one exclude window for every list that holds what the repository runs to the founder's
 * F2 (b) three days (docs/adr/0066, Part 5): npm versions (release-age-exceptions.json, here), action pins
 * (tools/check-action-pins) and image digests. Each caller reads its own facts and decides which entries this change
 * adds or rewrites; the bounds live here alone, so the lists cannot drift:
 * - `releaseAgeMinutes(workspace)`: the floor, pnpm-workspace.yaml's minimumReleaseAge, never under
 *   MINIMUM_RELEASE_AGE_MINUTES;
 * - `ageWords(minutes)`: the floor as a message says it;
 * - `excludeWindowProblems(subject, entry, window, now)`: an added or rewritten entry's dates against its kind's window;
 * - `expiredExclude(subject, expires, now, where)`: the expired rule, an error on a pull request that edits the list and
 *   a warning elsewhere;
 * - `READ_DEADLINE_MS`: the one deadline each checker's age reads run under (E3).
 */

/**
 * The deadline of each checker's age reads, from its first read (E3): check-action-pins' reads of a pin's dates and
 * check-toolchain's Docker Hub reads of an image's push time, 180 s each, so an outage fails closed in bounded time and
 * both steps' limits stay inside static's `timeout-minutes: 15`.
 */
export const READ_DEADLINE_MS = 180_000;

/**
 * The floor, in minutes: pnpm-workspace.yaml's minimumReleaseAge, never under MINIMUM_RELEASE_AGE_MINUTES. A setting
 * that is not a finite number reads as the minimum (NaN would make every age comparison false; the workspace's schema
 * admits only an integer, and gatesRule refuses one under the minimum).
 */
export function releaseAgeMinutes(workspace: Pick<Workspace, 'minimumReleaseAge'>): number {
  const minutes = workspace.minimumReleaseAge;
  return typeof minutes === 'number' && Number.isFinite(minutes) ? Math.max(minutes, MINIMUM_RELEASE_AGE_MINUTES) : MINIMUM_RELEASE_AGE_MINUTES;
}

/** "three days" for 4,320 minutes, otherwise the minutes and the days. */
export function ageWords(minutes: number): string {
  return minutes === MINIMUM_RELEASE_AGE_MINUTES ? 'three days' : `${String(minutes)} minutes (${(minutes / 1440).toFixed(2)} days)`;
}

/** An exclude entry's two instants, ISO 8601 in UTC, as its list holds them. */
export interface ExcludeDates {
  readonly added: string;
  readonly expires: string;
}

/**
 * The instant from which what an exclude names counts as known, and how a message says it: npm's publish time of a
 * version ("the version", "published"), an action pin's youngest signal, an image digest's push time.
 */
export interface KnownTime {
  /** What the entry names: "the version", "the pin", "the digest". */
  readonly what: string;
  /** The instant, ISO 8601, as it was read. */
  readonly at: string;
  /** Its source: "published", "committed", "pushed". */
  readonly as: string;
}

/**
 * An exclude kind's window. `security-fix` waives the floor, so it must last until what it names is old enough by
 * itself: `known` + `minutes`; `known` is null only when the caller could not read that time, and the caller then
 * reports why. `reasoned` (an action's `age-unprovable` or `off-default-branch`, an image's `age-unprovable`) waives
 * no age, so `added` and the seven days alone bound it.
 */
export type ExcludeWindow = { readonly kind: 'security-fix'; readonly known: KnownTime | null; readonly minutes: number } | { readonly kind: 'reasoned' };

/**
 * Why an entry this change adds or rewrites falls outside its kind's window, one message per bound, each naming the
 * subject (empty: inside it). Both kinds: `added` no later than now, and an expiry at most EXCLUDE_MAX_DAYS after
 * `added`. `security-fix` also: an expiry no earlier than the known time + the floor. An `added` or `expires` that does
 * not parse is refused, never read as inside the window (each list's schema already holds them to instants).
 */
export function excludeWindowProblems(subject: string, entry: ExcludeDates, window: ExcludeWindow, now: Date): string[] {
  const added = Date.parse(entry.added);
  const expires = Date.parse(entry.expires);
  const unparsed = [
    ...(Number.isNaN(added) ? [`${subject}: added ${entry.added}, not an instant (ISO 8601, UTC)`] : []),
    ...(Number.isNaN(expires) ? [`${subject}: expires ${entry.expires}, not an instant (ISO 8601, UTC)`] : []),
  ];
  if (unparsed.length > 0) {
    return unparsed;
  }
  const problems: string[] = [];
  if (added > now.getTime()) {
    problems.push(`${subject}: added ${entry.added}, a time in the future`);
  }
  if (expires > added + EXCLUDE_MAX_DAYS * DAY_MS) {
    problems.push(`${subject}: expires ${entry.expires}, more than ${String(EXCLUDE_MAX_DAYS)} days after it was added (${entry.added}); F2 (b) allows seven`);
  }
  if (window.kind === 'security-fix' && window.known !== null) {
    const { what, at, as } = window.known;
    const matureAt = Date.parse(at) + window.minutes * MINUTE_MS;
    if (expires < matureAt) {
      problems.push(`${subject}: expires ${entry.expires}, before ${what} is ${ageWords(window.minutes)} old (${new Date(matureAt).toISOString()}; ${as} ${at}), so it would lapse while still needed`);
    }
  }
  return problems;
}

/**
 * The expired rule. Once expired, what the entry names is old enough or no longer excused, so the entry changes
 * nothing: it fails only a pull request that edits its list (`edited`), and warns elsewhere (a push follows a green pull
 * request; Dependabot's pull requests leave the lists alone). `event` is check-toolchain's: every event but a push is
 * read as a pull request. `list` is where to remove it from ("both lists", or the file). Null while unexpired.
 */
export function expiredExclude(
  subject: string,
  expires: string,
  now: Date,
  where: { readonly event: 'push' | 'pull_request'; readonly edited: boolean; readonly list: string },
): { readonly level: 'error' | 'warning'; readonly message: string } | null {
  const expired = Date.parse(expires) <= now.getTime();
  if (!expired) {
    return null;
  }
  return {
    level: where.event === 'pull_request' && where.edited ? 'error' : 'warning',
    message: `${subject}: expired ${expires}; remove it from ${where.list} (the weekly triage, docs/runbooks/dependency-upgrades.md)`,
  };
}
