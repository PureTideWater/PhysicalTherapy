import { randomUUID } from 'node:crypto';

import { CSRF_FIELD } from '../lib/http/csrf';
import { pageCsrfToken } from '../lib/http/csrf-page';
import { pageFormActor } from '../lib/http/next';

/**
 * The hidden fields every mutation's form carries: the request key it was rendered with (a replay does
 * nothing; docs/adr/0017) and the session's CSRF token (docs/adr/0053). A server component, so the token is
 * computed on the server from the HttpOnly session cookie and never by a script. Beside them, on a page rendered
 * for someone signed in, that person's opaque mark (pageFormActor, lib/http/next.ts) on an element that is never
 * posted: the form clears what was typed when a refresh in place shows another person (docs/adr/0077, D10).
 */
export async function FormKeys() {
  const person = pageFormActor();
  return (
    <>
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name={CSRF_FIELD} value={await pageCsrfToken()} />
      {person === undefined ? null : <span hidden data-form-actor={person} />}
    </>
  );
}
