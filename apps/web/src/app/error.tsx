'use client';

import { Button, ErrorState } from '@tp/ui';
import Link from 'next/link';

/**
 * The error state (PRD 7: an error state with a next step). The reference is Next's opaque digest of
 * the server error, which support can find in the logs; the error's message is never shown. Support and the
 * status page are one link away (PRD 19, Support; docs/adr/0053).
 */
export default function ErrorPage({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-10">
      <ErrorState
        title="Something went wrong"
        nextStep="Try again. If it keeps happening, open a support ticket with the reference below, or check the status page."
        reference={error.digest}
        action={
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
      <p className="text-sm">
        <Link className="underline" href={`/support?from=error`}>
          Contact support
        </Link>{' '}
        ·{' '}
        <Link className="underline" href="/status">
          Service status
        </Link>
      </p>
    </main>
  );
}
