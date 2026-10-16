import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '../auth/sessions';
import { services } from '../server/services';
import { csrfTokenFor } from './csrf';

/**
 * The CSRF token of the session the page renders for (docs/adr/0053): what its forms and scripts send with
 * every mutation. Computed from the session cookie on the server; empty without a session (the mutation is
 * then refused anyway).
 */
export async function pageCsrfToken(): Promise<string> {
  return csrfTokenFor(services().sealer, (await cookies()).get(SESSION_COOKIE)?.value) ?? '';
}
