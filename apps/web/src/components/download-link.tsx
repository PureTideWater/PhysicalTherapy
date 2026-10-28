'use client';

import { cn } from '@tp/ui';
import { useRouter } from 'next/navigation';
import { type MouseEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { type DownloadSurface, type RefusedDownload, type ShownRefusal, refusedDownloadOf, shownRefusal } from '../lib/http/download-refusal-words';
import { RefusalAlert } from './refusal-notice';

/**
 * A download on a page that holds what a reload would lose (docs/adr/0079): the Uploads screen while a batch is still
 * being sent, the export review and the audit report's reviewer checklist once their items are ticked, the packet page
 * with words typed in its version form, the console's evidence checklist with a record being entered. A link's refusal
 * comes back to its page by a 303, which loads the page again, so here a plain click fetches the file as a script
 * instead: the response is the file, saved under the name the route gave it (Content-Disposition), or the route's JSON
 * outcome, whose refusal is said in place, in the product's words (lib/http/download-refusal-words.ts) and focused,
 * beside the links (DownloadLinks), while the page and everything on it stay. The browser shows a fetched file only
 * once the whole of it has arrived, so the same place says the fetch while it runs. What the notice cannot settle (a
 * signed-out session, maintenance, a body that is not an outcome, a request that failed) goes to the link itself, as a
 * navigation, whose 303 takes sign-in's steps. The href stays the link's own, so a new tab, a modifier click, "Save
 * link as" or a page without script still downloads, and is still refused back to its page.
 */

/** What a download fetched in place came to: the file, a refusal the page says, or a navigation that settles it. */
export type FetchedDownload =
  | { readonly kind: 'file'; readonly blob: Blob; readonly filename: string }
  | { readonly kind: 'refused'; readonly refusal: RefusedDownload }
  | { readonly kind: 'navigate' };

/**
 * The name a fetched file is saved under: the attachment's filename (handler.ts names every download
 * `attachment; filename="..."`, an opaque name the route chose), else the link's last path segment.
 */
export function attachmentFilename(disposition: string | null, href: string): string {
  const named = /;\s*filename\s*=\s*(?:"([^"]*)"|([^\s";]+))/i.exec(disposition ?? '');
  const filename = named?.[1] ?? named?.[2] ?? '';
  return filename === '' ? (href.split(/[?#]/)[0]?.split('/').pop() ?? '') : filename;
}

/**
 * Asks for the file as a script does (Fetch Metadata's cors mode and an empty destination, Accept JSON, so
 * isNavigation is false and a refusal is the JSON outcome, never the 303): the file when the route sends an attachment;
 * the refusal when its outcome is one a page says (refusedDownloadOf); a navigation to the link for anything else,
 * a request or a body that failed among them.
 */
export async function fetchDownload(href: string, fetcher: typeof fetch = fetch): Promise<FetchedDownload> {
  try {
    const response = await fetcher(href, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    const disposition = response.headers.get('content-disposition');
    if (response.ok && disposition !== null && /^\s*attachment\b/i.test(disposition)) {
      return { kind: 'file', blob: await response.blob(), filename: attachmentFilename(disposition, href) };
    }
    const refusal = response.ok ? null : refusedDownloadOf(await response.json().catch(() => null));
    return refusal === null ? { kind: 'navigate' } : { kind: 'refused', refusal };
  } catch {
    return { kind: 'navigate' };
  }
}

/**
 * Saves a fetched file as the browser saves a download: a hidden link to the file's object URL, with `download` naming
 * it, clicked once. The URL is revoked on the next task, once the browser has taken the file.
 */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  });
}

/** A click the page takes over: the primary button with no modifier (a modifier asks for a new tab, a window or a save). */
export function isPlainClick(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

/**
 * What DownloadLinks says once a link inside has been clicked (before that, nothing: the notice the page arrived
 * with): the newest attempt's notice, and the fetches still running.
 */
export interface Said {
  /** The newest outcome's refusal; null from a fetch begun until a refusal comes back, and once a file is saved. */
  readonly notice: ShownRefusal | null;
  /** Counts the refusals, so a second refusal in the same words mounts a new notice, which is focused again. */
  readonly attempt: number;
  /** The links inside still fetching their files, which the status says. */
  readonly fetching: number;
}

/**
 * What a link tells the DownloadLinks it is inside: its fetch begun, the outcome it came to (a refusal, or null for a
 * file saved), its fetch ended.
 */
export type Told = { readonly kind: 'fetching' } | { readonly kind: 'said'; readonly notice: ShownRefusal | null } | { readonly kind: 'fetched' };

/**
 * What DownloadLinks says after a link tells it this. A fetch begun takes the place, so the newest attempt is the one
 * on screen: the notice before it leaves, and the status says the fetch until the last one running has ended; its
 * outcome is said there (a file saved, nothing).
 */
export function nextSaid(said: Said | null, told: Told): Said {
  const { notice, attempt, fetching } = said ?? { notice: null, attempt: 0, fetching: 0 };
  switch (told.kind) {
    case 'fetching':
      return { notice: null, attempt, fetching: fetching + 1 };
    case 'said':
      return { notice: told.notice, attempt: told.notice === null ? attempt : attempt + 1, fetching };
    case 'fetched':
      return { notice, attempt, fetching: Math.max(fetching - 1, 0) };
  }
}

/** The words of a fetch running: the status's, in the product's busy words ("Working…", "Sending…"). */
const FETCHING = 'Downloading the file…';

const TellDownloads = createContext<((told: Told) => void) | null>(null);

/**
 * Focuses the notice it holds as it mounts (a ref callback): autoFocus focuses a notice only as the page loads (the
 * browser's own), and React focuses only a form control, so a notice said in place is focused here.
 */
function focusNotice(place: HTMLDivElement | null): void {
  place?.querySelector<HTMLElement>('[data-download-refusal]')?.focus();
}

/**
 * DownloadLinks' place, as it says what its links come to: a status, mounted from the first render so a screen reader
 * hears what it later says, empty and out of the layout's flow while no fetch runs (so a page's gaps stay as they
 * were), and "Downloading the file…" while one does; then the notice: the one the page arrived with until a link is
 * clicked (said null), the newest outcome's after (none from a fetch begun until a refusal comes back, nor for a file
 * saved).
 */
export function NoticePlace({ said, arrived }: { readonly said: Said | null; readonly arrived?: ReactNode }) {
  return (
    <>
      <p role="status" className="text-sm text-muted-foreground empty:sr-only">
        {said !== null && said.fetching > 0 ? FETCHING : null}
      </p>
      {said === null ? (
        arrived
      ) : said.notice === null ? null : (
        <div key={said.attempt} ref={focusNotice}>
          <RefusalAlert notice={said.notice} />
        </div>
      )}
    </>
  );
}

/**
 * Where the download links inside (DownloadLink) say their fetches and their refusals (NoticePlace): above them, or
 * below them (below: links in a page's header, the reviewer checklist's, whose notice follows the header), in place of
 * the notice the page arrived with (arrived: its DownloadRefusal, from a 303), so the newest attempt is the one on
 * screen (nextSaid); a file saved takes the notice away. One inside another says nothing of its own: the outer one's
 * place is the page's (the Uploads screen's, above its receipts), and the inner one's (a receipt list's own) serves
 * where there is none.
 */
export function DownloadLinks({ arrived, below = false, children }: { readonly arrived?: ReactNode; readonly below?: boolean; readonly children: ReactNode }) {
  const outer = useContext(TellDownloads);
  const [said, setSaid] = useState<Said | null>(null);
  const tell = useCallback((told: Told) => {
    setSaid((last) => nextSaid(last, told));
  }, []);
  if (outer !== null) {
    return (
      <>
        {below ? null : arrived}
        {children}
        {below ? arrived : null}
      </>
    );
  }
  const place = <NoticePlace said={said} arrived={arrived} />;
  return (
    <TellDownloads.Provider value={tell}>
      {below ? null : place}
      {children}
      {below ? place : null}
    </TellDownloads.Provider>
  );
}

/**
 * Reads the page again once a file is saved (DownloadLink's `refresh`). A component of its own, rendered only for a
 * link that asks, so the router is read only there and every other link renders outside the app router too (a
 * component test's renderToStaticMarkup).
 */
function RefreshOnSave({ saved }: { readonly saved: number }) {
  const router = useRouter();
  useEffect(() => {
    if (saved > 0) {
      router.refresh();
    }
  }, [router, saved]);
  return null;
}

/**
 * A download link whose plain click fetches the file in place (see above), inside DownloadLinks; outside one it is a
 * plain link. refresh reads the page again once the file is saved, for a page that shows what the download recorded
 * (the export review opens its checklist once both files are downloaded). surface picks the refusal's words. While
 * its file is fetched it tells its DownloadLinks, whose status says so, and is aria-busy, with the progress cursor.
 */
export function DownloadLink({
  href,
  children,
  className,
  surface = 'practice',
  refresh = false,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly surface?: DownloadSurface;
  readonly refresh?: boolean;
}) {
  const tell = useContext(TellDownloads);
  const busy = useRef(false);
  const [fetching, setFetching] = useState(false);
  const [saved, setSaved] = useState(0);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (tell === null || !isPlainClick(event)) {
      return;
    }
    event.preventDefault();
    // A second click while the first is fetched asks for nothing more.
    if (busy.current) {
      return;
    }
    busy.current = true;
    setFetching(true);
    tell({ kind: 'fetching' });
    void fetchDownload(href)
      .then((fetched) => {
        switch (fetched.kind) {
          case 'file':
            saveFile(fetched.blob, fetched.filename);
            tell({ kind: 'said', notice: null });
            setSaved((count) => count + 1);
            return;
          case 'refused':
            tell({ kind: 'said', notice: shownRefusal(fetched.refusal, surface) });
            return;
          case 'navigate':
            window.location.assign(href);
            return;
        }
      })
      .finally(() => {
        busy.current = false;
        setFetching(false);
        tell({ kind: 'fetched' });
      });
  };
  return (
    <>
      <a className={cn('aria-busy:cursor-progress', className)} href={href} onClick={onClick} aria-busy={fetching ? true : undefined}>
        {children}
      </a>
      {refresh ? <RefreshOnSave saved={saved} /> : null}
    </>
  );
}
