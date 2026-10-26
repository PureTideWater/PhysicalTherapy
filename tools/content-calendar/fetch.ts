import type { CalendarEntry, ContentCalendar } from '@tp/rules/calendar';

/**
 * The content calendar's source watch (audit #59; docs/adr/0071): each entry's public source page is read, the file
 * names it links to are compared with the ones the entry recorded, and an unreachable page, a page never recorded or a
 * changed list of files is a finding. The names come from a third-party page and go into issue bodies on a public
 * repository, so only plain names (letters, digits, dot, underscore, hyphen; at most 120) are ever kept; any other is
 * counted, never shown, so no `@name`, issue reference, Markdown link or backtick from a page reaches an issue (review m6).
 */

export const USER_AGENT = 'PaidWhole content calendar';
export const FETCH_TIMEOUT_MS = 20_000;
export const RETRY_AFTER_MS = 5_000;
/** The most names a "files not recorded" finding lists. */
export const UNRECORDED_LISTED = 50;

const PLAIN_NAME = /^[A-Za-z0-9._-]{1,120}$/;

export interface FetchAnswer {
  readonly status: number;
  readonly text: string;
}
/** Reads a page; throws on a timeout or a network failure. */
export type Fetcher = (url: string, options: { readonly timeoutMs: number }) => Promise<FetchAnswer>;

export const SOURCE_FINDINGS = ['source_unreachable', 'source_unrecorded', 'source_changed'] as const;
export type SourceFindingKind = (typeof SOURCE_FINDINGS)[number];

export interface SourceFinding {
  readonly kind: SourceFindingKind;
  readonly entry: CalendarEntry;
  readonly title: string;
  /** Plain names only (PLAIN_NAME), sorted. */
  readonly names: readonly string[];
  /** Link names on the page that were not kept, because they hold other characters. */
  readonly notShown: number;
}

/** The global fetch, with the calendar's User-Agent and a timeout. */
export const httpFetcher: Fetcher = async (url, { timeoutMs }) => {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status, text: await response.text() };
};

/** The file name an href points at: its last path segment, percent-decoded, query and fragment dropped; null when it has none or does not decode. */
export function linkFileName(href: string): string | null {
  const bare = href.replaceAll('&amp;', '&').replace(/[?#].*$/s, '');
  const segment = bare.slice(bare.lastIndexOf('/') + 1);
  if (segment === '') {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** The plain file names a page links to, and how many link names were not kept. */
export function pageFileNames(html: string): { readonly names: readonly string[]; readonly notShown: number } {
  const names = new Set<string>();
  let notShown = 0;
  for (const match of html.matchAll(/href\s*=\s*"([^"]*)"/gi)) {
    const name = linkFileName(match[1] ?? '');
    if (name === null) {
      continue;
    }
    if (PLAIN_NAME.test(name)) {
      names.add(name);
    } else {
      notShown += 1;
    }
  }
  return { names: [...names].sort(), notShown };
}

async function readPage(url: string, fetcher: Fetcher, sleep: (ms: number) => Promise<void>): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      await sleep(RETRY_AFTER_MS);
    }
    try {
      const answer = await fetcher(url, { timeoutMs: FETCH_TIMEOUT_MS });
      if (answer.status >= 200 && answer.status < 300) {
        return answer.text;
      }
    } catch {
      // A timeout or a network failure: retried once, then a finding.
    }
  }
  return null;
}

/**
 * Watches every entry's source page, in calendar order. A page several entries share is read once. An entry with no
 * file pattern is watched for reachability alone. Names that left a page are not findings.
 */
export async function watchSources(
  calendar: ContentCalendar,
  fetcher: Fetcher = httpFetcher,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<SourceFinding[]> {
  const pages = new Map<string, Promise<string | null>>();
  const findings: SourceFinding[] = [];
  for (const entry of calendar) {
    const url = entry.source.page;
    let page = pages.get(url);
    if (page === undefined) {
      page = readPage(url, fetcher, sleep);
      pages.set(url, page);
    }
    const html = await page;
    if (html === null) {
      findings.push({ kind: 'source_unreachable', entry, title: `Content source unreachable: ${entry.title}`, names: [], notShown: 0 });
      continue;
    }
    if (entry.filePattern === null) {
      continue;
    }
    const pattern = new RegExp(entry.filePattern, 'i');
    const seen = pageFileNames(html);
    const matching = seen.names.filter((name) => pattern.test(name));
    if (entry.knownFiles === null) {
      findings.push({ kind: 'source_unrecorded', entry, title: `Content source files not recorded: ${entry.title}`, names: matching.slice(0, UNRECORDED_LISTED), notShown: seen.notShown });
      continue;
    }
    const known = new Set(entry.knownFiles);
    const added = matching.filter((name) => !known.has(name));
    if (added.length > 0) {
      findings.push({ kind: 'source_changed', entry, title: `Content source changed: ${entry.title}`, names: added, notShown: seen.notShown });
    }
  }
  return findings;
}
