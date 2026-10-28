'use client';

import { useEffect } from 'react';

/** The refusal's own query keys (downloadRefusalParams in lib/http/download-refusal.ts; a test holds them equal). */
export const REFUSAL_QUERY_KEYS = ['refused', 'fields', 'retry'] as const;

const NONE: readonly string[] = [];

/**
 * Where a shown refusal leaves the address bar: the page's path, query and fragment without the refusal's keys and
 * the page's own keys it names (also: the values a page keeps only beside a refusal, such as the letter's entries or
 * the Reports list a file was in), every other parameter kept; or null when the URL holds none of them.
 */
export function forgetRefusalUrl(href: string, also: readonly string[] = NONE): string | null {
  const url = new URL(href);
  const shown = [...REFUSAL_QUERY_KEYS, ...also].filter((key) => url.searchParams.has(key));
  if (shown.length === 0) {
    return null;
  }
  for (const key of shown) {
    url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The page a refusal is shown on, the same before ForgetRefusal and after it: its path and its query without the keys
 * a shown refusal takes out of the URL (the refusal's and also). RefusalNotice holds its notice while this holds.
 */
export function pageOfRefusal(pathname: string, search: string, also: readonly string[] = NONE): string {
  const query = new URLSearchParams(search);
  for (const key of [...REFUSAL_QUERY_KEYS, ...also]) {
    query.delete(key);
  }
  return `${pathname}?${query.toString()}`;
}

/**
 * Takes a shown download refusal out of the address bar (docs/adr/0079): once the notice has rendered, the refusal's
 * keys and the page's own keys it names (also) leave the URL in place (history.replaceState, no navigation and no new
 * history entry), so a reload, a bookmark or a copied link shows the page as it is now, not the same notice again.
 * Every other parameter of the page is kept. It replaces on a timer, once the router has patched history (on the first
 * render the patch is not in yet, and a bare replace would wipe the router's own entry), and with no state of its own,
 * so Next copies its entry and moves its canonical URL too, with no request: a router refresh (a live export's poll, a
 * settled upload, a server action) then asks for the page without the refusal and never writes it back. The notice
 * outlasts that refresh while the person stays on the page (RefusalNotice).
 */
export function ForgetRefusal({ also = NONE }: { readonly also?: readonly string[] }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const path = forgetRefusalUrl(window.location.href, also);
      if (path !== null) {
        window.history.replaceState(null, '', path);
      }
    });
    return () => {
      window.clearTimeout(timer);
    };
  }, [also]);
  return null;
}
