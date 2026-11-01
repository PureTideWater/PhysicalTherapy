/**
 * A refused download in the product's words, for a page and for the browser alike (docs/adr/0079): the closed list of
 * refusals a page shows, what a page shows for one (RefusedDownload) and how it is read from a route's outcome, and the
 * title and next step each is said in. It imports nothing, so a client component that fetches a download and says its
 * refusal in place takes the same codes and the same words as a page the 303 sent back with ?refused=, without the PHI
 * guard, the rate limits or sign-in's steps that download-refusal.ts brings. download-refusal.ts re-exports what it
 * shares from here, so the writer of the query, its reader and the in-place notice never differ.
 */

/** The refusals a page shows beside its download: the closed list refused= carries. */
export const DOWNLOAD_REFUSALS = ['invalid', 'not_found', 'forbidden', 'rate_limited', 'suspended', 'duplicate', 'csrf_refused'] as const;

export type DownloadRefusalStatus = (typeof DOWNLOAD_REFUSALS)[number];

/** A refused field's name as fields= carries it: a parameter or input name, never a dotted path, a value or a message. */
export const REFUSED_FIELD = /^[a-z][A-Za-z0-9_]{0,39}$/;

/** At most this many refused fields are carried; a refusal naming more is cut to its first. */
export const MAX_REFUSED_FIELDS = 8;

/** The longest wait retry= carries, in whole minutes (a day). */
export const MAX_RETRY_MINUTES = 1440;

/** The names fields= carries: those that match, each once, at most eight. */
export function refusedFields(names: readonly string[]): string[] {
  return [...new Set(names.filter((name) => REFUSED_FIELD.test(name)))].slice(0, MAX_REFUSED_FIELDS);
}

/**
 * The whole minutes a rate limit's refusal says to wait, from its Retry-After seconds: rounded up, at least 1, as
 * retryMinutes (rate-limit.ts) rounds a refused form's wait, which a test holds this to; at most a day, and a day for a
 * wait that is not finite.
 */
export function waitMinutes(retryAfterSeconds: number): number {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return Number.isFinite(minutes) ? Math.min(MAX_RETRY_MINUTES, minutes) : MAX_RETRY_MINUTES;
}

/** What a page shows for a refused download (downloadRefusal() from its query, refusedDownloadOf() from an outcome). */
export interface RefusedDownload {
  readonly status: DownloadRefusalStatus;
  /** For invalid: the refused fields' names; the page says the ones it knows in its own words and ignores the rest. */
  readonly fields: readonly string[];
  /** For rate_limited: the whole minutes to wait, or null when the link (or the body) carries none. */
  readonly retryMinutes: number | null;
}

/**
 * A route's refusal of a download as a page shows it: the route's own outcome (refusalLocation writes the query from
 * it), or the JSON body a script's request gets (handler.ts outcomeResponse), read as data. Null for anything else: a
 * success, a signed-out status or maintenance (a navigation to the link settles those: sign-in's steps), or a body that
 * is not an outcome. Only the closed codes come out of it: the status, the refused fields that are names, and the wait.
 */
export function refusedDownloadOf(outcome: unknown): RefusedDownload | null {
  if (typeof outcome !== 'object' || outcome === null || !('status' in outcome)) {
    return null;
  }
  const status = DOWNLOAD_REFUSALS.find((refusal) => refusal === outcome.status);
  if (status === undefined) {
    return null;
  }
  const issues: readonly unknown[] = status === 'invalid' && 'issues' in outcome && Array.isArray(outcome.issues) ? outcome.issues : [];
  const fields = issues.map((issue: unknown) => (typeof issue === 'object' && issue !== null && 'field' in issue && typeof issue.field === 'string' ? issue.field : ''));
  const seconds = status === 'rate_limited' && 'retryAfterSeconds' in outcome && typeof outcome.retryAfterSeconds === 'number' ? outcome.retryAfterSeconds : null;
  return { status, fields: refusedFields(fields), retryMinutes: seconds === null ? null : waitMinutes(seconds) };
}

/** The minutes, as a refusal's sentence says them ("1 minute", "3 minutes"); guardMessage and a download's refusal both say them so. */
export function minutesWords(minutes: number): string {
  return `${String(minutes)} minute${minutes === 1 ? '' : 's'}`;
}

/** Who the download is for: a practice's people, or the console's platform administrators (the evidence export). */
export type DownloadSurface = 'practice' | 'console';

/** A refusal's words: its title and its next step. */
export interface DownloadRefusalWords {
  readonly title: string;
  readonly body: string;
}

/** Every refused download's title: the outcome first, as a refused form's "Not done"; the cause and the next step follow. */
export const NOT_DOWNLOADED = 'Not downloaded';

/** The refusal's title and next step, by status (brand.md: plain, second person, a next step in each). */
export function downloadRefusalWords(refusal: RefusedDownload, surface: DownloadSurface = 'practice'): DownloadRefusalWords {
  switch (refusal.status) {
    case 'invalid':
      return { title: NOT_DOWNLOADED, body: 'This file could not be made from what was asked. Try the download again from this page.' };
    case 'not_found':
      return { title: NOT_DOWNLOADED, body: 'This file is not available here now. This page lists the files that are.' };
    case 'forbidden':
      // Titled by outcome like every refusal (ActionForm's "Not done"); the role is in the body, and roles are changed on
      // the organization's Users and roles page, by its administrator.
      return {
        title: NOT_DOWNLOADED,
        body: surface === 'console' ? 'Only a platform administrator can download the evidence export.' : 'Your role cannot download this file. Ask your organization’s administrator, who manages users and roles.',
      };
    case 'rate_limited':
      return { title: NOT_DOWNLOADED, body: `Too many downloads in a short time. Wait ${refusal.retryMinutes === null ? 'a few minutes' : minutesWords(refusal.retryMinutes)} and try again.` };
    case 'suspended':
      return { title: NOT_DOWNLOADED, body: 'Downloads are paused while the organization is suspended. The billing page says why and what lifts it.' };
    case 'duplicate':
    case 'csrf_refused':
      return { title: NOT_DOWNLOADED, body: 'This download could not be checked against your session. Try it again from this page.' };
  }
}

/** A refusal as a notice says it: its closed code and its wait (the notice's data attributes) and its words. */
export interface ShownRefusal extends DownloadRefusalWords {
  readonly status: DownloadRefusalStatus;
  readonly retryMinutes: number | null;
}

/** A refused download's notice: its codes and its words for the surface (DownloadRefusal on a page, or in place). */
export function shownRefusal(refusal: RefusedDownload, surface: DownloadSurface = 'practice'): ShownRefusal {
  return { status: refusal.status, retryMinutes: refusal.retryMinutes, ...downloadRefusalWords(refusal, surface) };
}
