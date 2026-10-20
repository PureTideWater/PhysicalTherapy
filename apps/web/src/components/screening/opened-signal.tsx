'use client';

import { useEffect } from 'react';

import { sendOpened, watchFirstOpen } from '../../lib/screening/opened';

/**
 * The result page's opened signal (audit #57; src/lib/screening/opened.ts): once the page has been visible two seconds
 * and a person has used it, one POST to /api/screening/opened, then nothing. It renders nothing, stores nothing and
 * reads no cookie; the page's GET records nothing, so a mail scanner opening the link counts as no open.
 */
export function ScreeningOpenedSignal({ resultId }: { readonly resultId: string }) {
  useEffect(() => watchFirstOpen({ document, send: () => sendOpened(resultId, fetch) }), [resultId]);
  return null;
}
