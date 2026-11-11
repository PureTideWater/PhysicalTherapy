import type { Logger } from '@tp/observability';

import type { AfterCommit } from '../http/route';
import type { AuthProvider } from './provider';

/** `error_code` when the user's provider subject could not be read in the transaction, so the provider was not asked. */
export const NO_PROVIDER_SUBJECT = 'NO_PROVIDER_SUBJECT';

/**
 * Asks the provider to sign a user out everywhere once the request's transaction has committed (docs/adr/0094). End
 * membership ends the membership and the app's own sessions in that transaction, and they stay ended whatever the
 * provider answers: the provider is never called inside it, so its failure rolls nothing back and its slowness holds no
 * row. A failure is one line at error (the alarm MembershipEndProviderSignOutFailed counts its words:
 * infra/lib/security-events.ts, tied by infra/test/monitoring.test.ts) with the user's ID, the request's ID and the error's name only (never the
 * subject, an address or the error's text), which pages the operator (docs/runbooks/incident-response.md, "An ended
 * membership whose provider sign-out failed"). A subject that could not be read is logged the same way, never skipped
 * in silence.
 */
export function signOutAtProviderAfterCommit(
  afterCommit: AfterCommit,
  deps: { readonly provider: Pick<AuthProvider, 'globalSignOut'>; readonly logger: Logger },
  ids: { readonly userId: string; readonly requestId: string },
  subject: string | undefined,
): void {
  afterCommit(async () => {
    if (subject === undefined) {
      deps.logger.error('security event: membership end provider sign-out failed', { user_id: ids.userId, request_id: ids.requestId, error_code: NO_PROVIDER_SUBJECT });
      return;
    }
    try {
      await deps.provider.globalSignOut(subject);
    } catch (error) {
      deps.logger.error('security event: membership end provider sign-out failed', { user_id: ids.userId, request_id: ids.requestId, error_code: error instanceof Error ? error.name : 'unknown' });
    }
  });
}
