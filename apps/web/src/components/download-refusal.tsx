import { Alert, AlertDescription, AlertTitle, cn } from '@tp/ui';

import { type RefusedDownload, minutesWords } from '../lib/http/download-refusal';
import { ForgetRefusal } from './forget-refusal';

/**
 * A refused download, said on the page it was opened from (docs/adr/0079): the route sent the browser back here with
 * the refusal in closed codes (lib/http/download-refusal.ts), and this says it in the product's own words, a title and
 * a next step per status, never text from the URL. It renders where the person's link or form is, takes focus on
 * arrival (tabIndex -1, autoFocus; no fragment, which would stop the focus) and keeps clear of the sticky header (h-14
 * plus 16 px). Once shown, the refusal leaves the address bar (ForgetRefusal), so a reload shows the page as it is now.
 * A form that marks its refused field instead (the letter) renders no notice, so the field takes the focus, and its
 * marks stay in the URL, so a reload keeps them with the entries.
 */

/** Who the download is for: a practice's people, or the console's platform administrators (the evidence export). */
export type DownloadSurface = 'practice' | 'console';

/** A refusal's words: its title and its next step. */
export interface DownloadRefusalWords {
  readonly title: string;
  readonly body: string;
}

const NOT_DOWNLOADED = 'Not downloaded';

/** The refusal's title and next step, by status (brand.md: plain, second person, a next step in each). */
export function downloadRefusalWords(refusal: RefusedDownload, surface: DownloadSurface = 'practice'): DownloadRefusalWords {
  switch (refusal.status) {
    case 'invalid':
      return { title: NOT_DOWNLOADED, body: 'This file could not be made from what was asked. Try the download again from this page.' };
    case 'not_found':
      return { title: NOT_DOWNLOADED, body: 'This file is not available here now. This page lists the files that are.' };
    case 'forbidden':
      // The product's permission title (PermissionState); roles are changed by the organization's administrator.
      return {
        title: 'Not available to your role',
        body: surface === 'console' ? 'Only a platform administrator can download the evidence export.' : 'Your role cannot download this file. Users and roles are managed by your organization’s administrator.',
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

/** The notice of a refused download, or nothing when there is none (pass downloadRefusal(await props.searchParams)). */
export function DownloadRefusal({
  refusal,
  surface = 'practice',
  className,
}: {
  readonly refusal: RefusedDownload | null;
  readonly surface?: DownloadSurface;
  readonly className?: string;
}) {
  if (refusal === null) {
    return null;
  }
  const words = downloadRefusalWords(refusal, surface);
  return (
    <>
      <Alert
        variant="destructive"
        role="alert"
        tabIndex={-1}
        autoFocus
        className={cn('scroll-mt-18', className)}
        data-download-refusal={refusal.status}
        data-retry-minutes={refusal.retryMinutes ?? undefined}
      >
        <AlertTitle>{words.title}</AlertTitle>
        <AlertDescription>
          <p>{words.body}</p>
        </AlertDescription>
      </Alert>
      <ForgetRefusal />
    </>
  );
}
