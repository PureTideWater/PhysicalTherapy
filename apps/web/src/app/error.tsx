'use client';

import { Button, ErrorState } from '@tp/ui';

/**
 * The error state (PRD 7: an error state with a next step). The reference is Next's opaque digest of
 * the server error, which support can find in the logs; the error's message is never shown.
 */
export default function ErrorPage({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl p-10">
      <ErrorState
        title="Something went wrong"
        nextStep="Try again. If it keeps happening, contact support with the reference below."
        reference={error.digest}
        action={
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        }
      />
    </main>
  );
}
