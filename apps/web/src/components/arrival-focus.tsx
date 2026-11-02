'use client';

import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import { useEffect, useRef } from 'react';

/**
 * What a person arrives at, focused once when it mounts (docs/adr/0081): the sign-in page's notice after a step closed
 * or was started again, which Next's client-side navigation (Start again's POST, a closed step's redirect from a server
 * action) would otherwise leave unread, the focus on the page. Only when nothing holds the focus (RefusalTakeover's
 * guard), so a person who tabbed into the form before the page was live keeps their place. The notice itself takes the
 * focus, as hardware-key.tsx's Problem does, and it is a note, never a live region: a status inserted already filled and
 * then focused can be read twice (VoiceOver with Safari); read where the focus lands, it is said once.
 */
export function ArrivalNotice({ reason, title, text }: { readonly reason: string; readonly title: string; readonly text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      ref.current?.focus();
    }
  }, []);
  return (
    <Alert ref={ref} role="note" tabIndex={-1} data-slot="arrival-focus" data-reason={reason} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
