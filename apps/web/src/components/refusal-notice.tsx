'use client';

import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import type { ShownRefusal } from '../lib/http/download-refusal-words';
import { ForgetRefusal, pageOfRefusal } from './forget-refusal';

/** A notice held on screen, and the page it was shown on (pageOfRefusal). */
export interface HeldRefusal {
  readonly notice: ShownRefusal;
  readonly page: string;
}

function sameNotice(a: ShownRefusal, b: ShownRefusal): boolean {
  return a.status === b.status && a.retryMinutes === b.retryMinutes && a.title === b.title && a.body === b.body;
}

/**
 * The notice to hold, from the one held, the one the page renders now (null once its URL holds no refusal) and the page
 * the person is on: the page's own while it renders one; else the held one while the person is still on the page it was
 * shown on; else none. It returns the held object itself when nothing changed, so a render that keeps it sets no state.
 */
export function heldRefusal(held: HeldRefusal | null, notice: ShownRefusal | null, page: string): HeldRefusal | null {
  if (notice !== null) {
    return held !== null && held.page === page && sameNotice(held.notice, notice) ? held : { notice, page };
  }
  return held !== null && held.page === page ? held : null;
}

/**
 * A refused download's notice as it looks wherever it is said (docs/adr/0079): a destructive alert that takes the focus
 * when it mounts (tabIndex -1, autoFocus), its closed code and wait in data attributes. The page's scroll-padding-top
 * (packages/ui styles.css; ADR 0077 D4) keeps it clear of the sticky header, so it takes no margin of its own, which
 * would add to that padding. A page's notice is RefusalNotice; a download fetched in place says its refusal with this alone.
 */
export function RefusalAlert({ notice, className }: { readonly notice: ShownRefusal; readonly className?: string }) {
  return (
    <Alert
      variant="destructive"
      role="alert"
      tabIndex={-1}
      autoFocus
      className={className}
      data-download-refusal={notice.status}
      data-retry-minutes={notice.retryMinutes ?? undefined}
    >
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>
        <p>{notice.body}</p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The notice of a download refused on a page the 303 sent the browser back to (DownloadRefusal gives it the words):
 * RefusalAlert, then the refusal taken out of the address bar (ForgetRefusal, with the page's own keys it names in
 * forget). Once it has, a router refresh of the page (a live export's poll, a settled upload batch, a server action)
 * renders it with no refusal, and this keeps the notice the person arrived with, still focused, while they stay on the
 * page it was shown on. Another page, or other parameters of this one (a packet's version link: the router keeps this
 * component across them), lets it go, and a reload starts without it.
 */
export function RefusalNotice({ notice, forget, className }: { readonly notice: ShownRefusal | null; readonly forget?: readonly string[]; readonly className?: string }) {
  // Both are null outside the app router (a unit test's static render), where the page is ''.
  const pathname: string | null = usePathname();
  const search: URLSearchParams | null = useSearchParams();
  const page = pageOfRefusal(pathname ?? '', search?.toString() ?? '', forget);
  const [held, setHeld] = useState(() => heldRefusal(null, notice, page));
  const holding = heldRefusal(held, notice, page);
  if (holding !== held) {
    setHeld(holding);
  }
  if (holding === null) {
    return null;
  }
  return (
    <>
      <RefusalAlert notice={holding.notice} className={className} />
      <ForgetRefusal also={forget} />
    </>
  );
}
