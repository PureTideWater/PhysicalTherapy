import { type DownloadSurface, type RefusedDownload, shownRefusal } from '../lib/http/download-refusal-words';
import { RefusalNotice } from './refusal-notice';

/**
 * A refused download, said on the page it was opened from (docs/adr/0079): the route sent the browser back here with
 * the refusal in closed codes (lib/http/download-refusal.ts), and this says it in the product's own words, a title and
 * a next step per status (lib/http/download-refusal-words.ts, which a client component that downloads in place says
 * its refusals in too), never text from the URL. It renders where the person's link or form is, takes focus on arrival
 * (tabIndex -1, autoFocus; no fragment, which would stop the focus) and keeps clear of the sticky header (h-14 plus
 * 16 px). Once shown, the refusal leaves the address bar (ForgetRefusal), with the page's own keys it names (forget), so
 * a reload shows the page as it is now; the notice stays on screen through a router refresh while the person stays on
 * the page (RefusalNotice). A form that marks its refused field instead (the letter) renders no notice, so the field
 * takes the focus, and its marks stay in the URL, so a reload keeps them with the entries.
 */

export { type DownloadRefusalWords, type DownloadSurface, NOT_DOWNLOADED, type ShownRefusal, downloadRefusalWords, shownRefusal } from '../lib/http/download-refusal-words';

/**
 * The notice of a refused download, or nothing when there is none (pass downloadRefusal(await props.searchParams)).
 * forget names the page's own query keys that only a refusal gives meaning to (the letter's kept entries, the Reports
 * list a file was in): they leave the address bar with the refusal's.
 */
export function DownloadRefusal({
  refusal,
  surface = 'practice',
  forget,
  className,
}: {
  readonly refusal: RefusedDownload | null;
  readonly surface?: DownloadSurface;
  readonly forget?: readonly string[];
  readonly className?: string;
}) {
  // Rendered without a refusal too, so a notice shown on arrival outlasts a refresh that no longer carries it.
  return <RefusalNotice notice={refusal === null ? null : shownRefusal(refusal, surface)} forget={forget} className={className} />;
}
