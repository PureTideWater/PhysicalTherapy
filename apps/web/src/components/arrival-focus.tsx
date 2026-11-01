'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/**
 * What a person arrives at, focused once when it mounts (docs/adr/0081): the sign-in page's notice after a step closed
 * or was started again, which Next's client-side redirect from a server action would otherwise leave unread, the focus
 * on the page. Only when nothing holds the focus (RefusalTakeover's guard), so a person who tabbed into the form
 * before the page was live keeps their place. It adds no live region: the notice is read where the focus lands.
 */
export function ArrivalFocus({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      ref.current?.focus();
    }
  }, []);
  return (
    <div ref={ref} tabIndex={-1} data-slot="arrival-focus" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </div>
  );
}
