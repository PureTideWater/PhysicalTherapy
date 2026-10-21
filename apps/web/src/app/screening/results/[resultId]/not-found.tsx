import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicHeader } from '../../../../components/public-header';
import { CLOSED_LINK_KEPT } from '../../../../lib/screening/retention';

export const metadata: Metadata = { title: 'Screening link not open', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * A screening link that opens nothing (Change Order 001, CO-04): unknown, not yet priced, past its 30 days, or
 * replaced by a later screening of the same practice, after which the result is deleted. The page says which can be
 * true without saying which is, how to screen again, and that only a record of counts naming no one is kept.
 */
export default function ScreeningResultNotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8 md:p-10" data-state="screening-not-found">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">This screening link is not open</h1>
        <p className="text-base text-muted-foreground">
          <span data-copy="kept" data-legal-surface="screening-kept-closed-link">
            {CLOSED_LINK_KEPT}
          </span> A link may also be one whose screening is still being priced: the email with the link is sent once it is ready. Check that the whole link was
          copied.
        </p>
        <p className="text-sm">
          <Link className="underline" href="/screening">
            Screen your file again
          </Link>{' '}
          or{' '}
          <Link className="underline" href="/request-audit">
            request an audit
          </Link>
          .
        </p>
      </main>
    </>
  );
}
