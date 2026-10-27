import type { CalendarEntry, ContentCalendar } from '@tp/rules/calendar';

/**
 * The content calendar's source watch (audit #59; docs/adr/0071): each entry's public source page is read, the file
 * names it links to are compared with the ones the entry recorded, and an unreachable page, a page never recorded, a
 * changed list of files or a page that no longer lists any matching file is a finding. Every decoded link name is
 * matched and compared, so a new file is found whatever its name holds (fix round SB-1). The names come from a
 * third-party page and go into issue bodies on a public repository, so a plain name (letters, digits, dot, underscore,
 * hyphen; at most 120) is shown as it is and any other only percent-encoded, which leaves nothing but letters, digits
 * and `. _ - %`: no `@name`, issue reference, Markdown link or backtick from a page reaches an issue (review m6). The
 * page is read over https from the calendar's own hosts only, redirects included, and at most MAX_PAGE_BYTES of it
 * (fix round SB-3, SB-4).
 */

export const USER_AGENT = 'PaidWhole content calendar';
export const FETCH_TIMEOUT_MS = 20_000;
export const RETRY_AFTER_MS = 5_000;
/** The most names of each kind (plain, encoded) a "files not recorded" finding lists. */
export const UNRECORDED_LISTED = 50;
/** The most redirects followed from an entry's page. */
export const MAX_REDIRECTS = 3;
/** The most bytes read of a page: 5 MiB, far above any source listing page. */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
/** The longest encoded name shown; a longer one is cut, and still counted. */
const ENCODED_SHOWN = 200;

const PLAIN_NAME = /^[A-Za-z0-9._-]{1,120}$/;
const PLAIN_BYTE = /^[A-Za-z0-9._-]$/;
/** href="…", href='…' or an unquoted href value. */
const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`=]+))/gi;

export interface FetchAnswer {
  readonly status: number;
  readonly text: string;
}
/** Reads a page; throws on a timeout, a network failure, a refused redirect or a page over MAX_PAGE_BYTES. */
export type Fetcher = (url: string, options: { readonly timeoutMs: number }) => Promise<FetchAnswer>;
/** The global fetch's shape, injected so the fetcher's redirect and size rules are tested without the network. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

export const SOURCE_FINDINGS = ['source_unreachable', 'source_unrecorded', 'source_changed', 'source_lost'] as const;
export type SourceFindingKind = (typeof SOURCE_FINDINGS)[number];

export interface SourceFinding {
  readonly kind: SourceFindingKind;
  readonly entry: CalendarEntry;
  readonly title: string;
  /** The plain names (PLAIN_NAME) found, sorted. */
  readonly names: readonly string[];
  /** The other names found, percent-encoded (encodedName), sorted. */
  readonly encoded: readonly string[];
  /** Names found but not listed (source_unrecorded lists at most UNRECORDED_LISTED of each kind). */
  readonly unlisted: number;
}

/** A name as an issue may show it: a plain one as it is; any other with every byte but letters, digits, `.`, `_` and `-` as %XX of its UTF-8, cut to ENCODED_SHOWN. */
export function encodedName(name: string): string {
  if (PLAIN_NAME.test(name)) {
    return name;
  }
  const encoded = [...new TextEncoder().encode(name)]
    .map((byte) => (byte < 0x80 && PLAIN_BYTE.test(String.fromCharCode(byte)) ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`))
    .join('');
  return encoded.length <= ENCODED_SHOWN ? encoded : `${encoded.slice(0, ENCODED_SHOWN).replace(/%[0-9A-F]?$/, '')}...`;
}

/** The calendar's source hosts: the only hosts a page or a redirect is read from. */
export function sourceHosts(calendar: ContentCalendar): ReadonlySet<string> {
  return new Set(calendar.map((entry) => new URL(entry.source.page).hostname));
}

/** Why a page was not read; readPage turns it into source_unreachable. */
export class PageRefused extends Error {}

async function cappedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_PAGE_BYTES) {
    await response.body?.cancel();
    throw new PageRefused(`the page declares ${String(declared)} bytes, over ${String(MAX_PAGE_BYTES)}`);
  }
  if (response.body === null) {
    return '';
  }
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new PageRefused(`the page passes ${String(MAX_PAGE_BYTES)} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * A fetcher with the calendar's User-Agent and one timeout over the whole read, that follows at most MAX_REDIRECTS
 * redirects itself, each to https on one of `hosts` with no port and no credentials, and reads at most MAX_PAGE_BYTES.
 */
export function httpFetcherFor(hosts: ReadonlySet<string>, fetchFunction: FetchFunction = fetch): Fetcher {
  return async (url, { timeoutMs }) => {
    const signal = AbortSignal.timeout(timeoutMs);
    let target = new URL(url);
    for (let hop = 0; ; hop += 1) {
      if (target.protocol !== 'https:' || !hosts.has(target.hostname) || target.port !== '' || target.username !== '' || target.password !== '') {
        throw new PageRefused('a page is read over https from the calendar’s hosts only');
      }
      const response = await fetchFunction(target.href, { headers: { 'user-agent': USER_AGENT }, redirect: 'manual', signal });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location !== null) {
        await response.body?.cancel();
        if (hop >= MAX_REDIRECTS) {
          throw new PageRefused(`more than ${String(MAX_REDIRECTS)} redirects`);
        }
        target = new URL(location, target);
        continue;
      }
      return { status: response.status, text: await cappedText(response) };
    }
  };
}

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

/** Every file name a page links to, decoded, once each and sorted, plain or not: only an issue body tells the two apart. */
export function pageFileNames(html: string): readonly string[] {
  const names = new Set<string>();
  for (const match of html.matchAll(HREF)) {
    const name = linkFileName(match[1] ?? match[2] ?? match[3] ?? '');
    if (name !== null) {
      names.add(name);
    }
  }
  return [...names].sort();
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
      // A timeout, a network failure, a refused redirect or a page too large: retried once, then a finding.
    }
  }
  return null;
}

/** Names split as a body shows them: the plain ones, and the others percent-encoded. */
function shown(names: readonly string[]): { names: string[]; encoded: string[] } {
  return { names: names.filter((name) => PLAIN_NAME.test(name)), encoded: names.filter((name) => !PLAIN_NAME.test(name)).map(encodedName).sort() };
}

/**
 * Watches every entry's source page, in calendar order. A page several entries share is read once. An entry with no
 * file pattern is watched for reachability alone. A recorded name matches the page's name as it is or as an issue
 * shows it (encodedName). Names that left a page are not findings, unless no matching name is left at all while the
 * entry records some (source_lost: the watch could no longer see a new period's files).
 */
export async function watchSources(
  calendar: ContentCalendar,
  fetcher: Fetcher = httpFetcherFor(sourceHosts(calendar)),
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
    const none = { names: [], encoded: [], unlisted: 0 };
    if (html === null) {
      findings.push({ kind: 'source_unreachable', entry, title: `Content source unreachable: ${entry.title}`, ...none });
      continue;
    }
    if (entry.filePattern === null) {
      continue;
    }
    const pattern = new RegExp(entry.filePattern, 'i');
    const matching = pageFileNames(html).filter((name) => pattern.test(name));
    if (entry.knownFiles === null) {
      const all = shown(matching);
      const names = all.names.slice(0, UNRECORDED_LISTED);
      const encoded = all.encoded.slice(0, UNRECORDED_LISTED);
      findings.push({ kind: 'source_unrecorded', entry, title: `Content source files not recorded: ${entry.title}`, names, encoded, unlisted: matching.length - names.length - encoded.length });
      continue;
    }
    const known = new Set(entry.knownFiles);
    const added = matching.filter((name) => !known.has(name) && !known.has(encodedName(name)));
    if (added.length > 0) {
      findings.push({ kind: 'source_changed', entry, title: `Content source changed: ${entry.title}`, ...shown(added), unlisted: 0 });
    } else if (matching.length === 0 && known.size > 0) {
      findings.push({ kind: 'source_lost', entry, title: `Content source no longer lists its files: ${entry.title}`, ...none });
    }
  }
  return findings;
}
