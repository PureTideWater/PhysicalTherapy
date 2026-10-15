'use client';

import { Button, ErrorState } from '@tp/ui';

/**
 * Shown when a workspace screen fails to render. The reference is Next's opaque error digest; the
 * error's message never reaches the browser or a log.
 */
export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      className="max-w-4xl"
      title="This screen could not be loaded"
      nextStep="Try again. If it fails again, contact support and quote the reference."
      {...(error.digest === undefined ? {} : { reference: error.digest })}
      action={
        <Button type="button" variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
