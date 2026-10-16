'use client';

/**
 * The last-resort error page, when the root layout itself failed (docs/adr/0053). It renders its own document,
 * without the application's styles or scripts, and shows only Next's opaque reference, never the error.
 */
export default function GlobalError({ error }: { readonly error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '2.5rem', maxWidth: '40rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>The workspace could not load</h1>
        <p>Try again in a few minutes. If it keeps happening, contact support with the reference below.</p>
        {error.digest === undefined ? null : (
          <p>
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <p>
          <a href="/status">Service status</a> · <a href="/support?from=error">Contact support</a>
        </p>
      </body>
    </html>
  );
}
