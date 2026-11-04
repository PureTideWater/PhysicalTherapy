'use client';

import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { ForgetRefusal, pageOfRefusal } from '../forget-refusal';

/** A notice the mapping screens say after their own actions: its closed key (data-notice), title and text. */
export interface ShownNotice {
  readonly key: string;
  readonly title: string;
  readonly text: string;
}

/** A notice held on screen, and the page it was shown on (pageOfRefusal, without `notice`). */
export interface HeldNotice {
  readonly notice: ShownNotice;
  readonly page: string;
}

/** The query key the mapping screens' redirects name their notice by. */
export const NOTICE_KEY = ['notice'] as const;

/**
 * The notice to hold, from the one held, the one the page renders now (null once `notice` has left the URL) and the
 * page the person is on: the page's own while it renders one; else the held one while the person is still on the page
 * it was shown on; else none. It returns the held object itself when nothing changed, so a render that keeps it sets no
 * state (as heldRefusal does for a refusal).
 */
export function heldNotice(held: HeldNotice | null, notice: ShownNotice | null, page: string): HeldNotice | null {
  if (notice !== null) {
    return held !== null && held.page === page && held.notice.key === notice.key && held.notice.title === notice.title && held.notice.text === notice.text ? held : { notice, page };
  }
  return held !== null && held.page === page ? held : null;
}

/**
 * The notice of a mapping screen's own action (design 5.3), said once (PR #95 review UX-7: "notices never replay on
 * refresh or Back"): a note (role="status", never an alert: nothing failed; review C-2), after which `notice` leaves the
 * address bar in place (ForgetRefusal with also=['notice']: history.replaceState, no navigation), so a reload, Back or a
 * copied link shows the page as it is now. A router refresh while the person stays on the page (the months form's
 * refreshOnError) renders the page without the notice; this keeps it on screen then, as RefusalNotice keeps a refusal.
 * Every other parameter of the page, such as the list's view and payer, stays.
 */
export function MappingNotice({ notice, children }: { readonly notice: ShownNotice | null; readonly children?: ReactNode }) {
  // Both are null outside the app router (a unit test's static render), where the page is ''.
  const pathname: string | null = usePathname();
  const search: URLSearchParams | null = useSearchParams();
  const page = pageOfRefusal(pathname ?? '', search?.toString() ?? '', NOTICE_KEY);
  const [held, setHeld] = useState(() => heldNotice(null, notice, page));
  const holding = heldNotice(held, notice, page);
  if (holding !== held) {
    setHeld(holding);
  }
  if (holding === null) {
    return null;
  }
  return (
    <>
      <Alert role="status" data-notice={holding.notice.key}>
        <AlertTitle>{holding.notice.title}</AlertTitle>
        <AlertDescription>
          {holding.notice.text}
          {children}
        </AlertDescription>
      </Alert>
      <ForgetRefusal also={NOTICE_KEY} />
    </>
  );
}
