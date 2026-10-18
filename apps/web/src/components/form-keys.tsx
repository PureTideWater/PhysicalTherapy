import { randomUUID } from 'node:crypto';

import { CSRF_FIELD } from '../lib/http/csrf';
import { pageCsrfToken } from '../lib/http/csrf-page';

/**
 * The hidden fields every mutation's form carries: the request key it was rendered with (a replay does
 * nothing; docs/adr/0017) and the session's CSRF token (docs/adr/0053). A server component, so the token is
 * computed on the server from the HttpOnly session cookie and never by a script.
 */
export async function FormKeys() {
  return (
    <>
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name={CSRF_FIELD} value={await pageCsrfToken()} />
    </>
  );
}
