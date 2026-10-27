'use client';

import { useEffect } from 'react';

/** The refusal's own query keys (downloadRefusalParams in lib/http/download-refusal.ts; a test holds them equal). */
export const REFUSAL_QUERY_KEYS = ['refused', 'fields', 'retry'] as const;

/**
 * Takes a shown download refusal out of the address bar (docs/adr/0079): once the notice has rendered, the refusal's
 * keys leave the URL in place (history.replaceState, no navigation and no new history entry), so a reload, a bookmark
 * or a copied link shows the page as it is now, not the same notice again. The notice stays on screen, focused, until
 * the person moves on. Every other parameter of the page is kept.
 */
export function ForgetRefusal() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const shown = REFUSAL_QUERY_KEYS.filter((key) => url.searchParams.has(key));
    if (shown.length === 0) {
      return;
    }
    for (const key of shown) {
      url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);
  return null;
}
