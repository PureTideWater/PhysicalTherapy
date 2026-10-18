import type { Metadata } from 'next';
import Link from 'next/link';

import { PublicHeader } from '../../../../components/public-header';

export const metadata: Metadata = { title: 'Screening link not open', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/**
 * A screening link that opens nothing (Change Order 001, CO-04): unknown, not yet priced, or past its 30 days, after
 * which the result is deleted. The page says which can be true without saying which is, and how to screen again.
 */
export default function ScreeningResultNotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8 md:p-10" data-state="screening-not-found">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">This screening link is not open</h1>
        <p className="text-base text-muted-foreground">
          A screening link opens its result for 30 days from the upload, and then the result is deleted. A link may also be one whose screening is still being priced: the email with the link is sent
          once it is ready. Check that the whole link was copied.
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
