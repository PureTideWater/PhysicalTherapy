import type { KeyProvider, PracticeScope, ScopeClient } from '@tp/db/runtime';
import { verifyVersionNow } from '@tp/worker/packets';

import { REFUSED_FIELD } from '../cases/refusals';
import { InputError } from '../http/route';
import { failsNowRefusal } from './view';

/**
 * Refuses a step on a version the verifier passed when it was written and fails now (docs/adr/0086; the review of
 * 2026-11-01, CORR-5): a request for approval and an approval run the verifier again first, as the export job does
 * (@tp/worker/packets verifyVersionNow(), over the stored narrative and content with today's identifiers), and stop with
 * the refusal's plain words and each mismatch by its sentence, a figure in the role's words. Nothing is written. A version whose stored report failed
 * is left to the database, which refuses it in its own words. The database cannot run the reader: making it refuse
 * such a version too is Lane A's tp-packet-verifier/3 migration.
 */
export async function refuseFailingNow(scope: PracticeScope<ScopeClient>, keys: KeyProvider, input: { readonly practiceId: string; readonly versionId: string; readonly requestId: string }): Promise<void> {
  const now = await verifyVersionNow(scope, keys, input);
  if (now?.standing === 'fails_now') {
    throw new InputError([{ field: REFUSED_FIELD, message: failsNowRefusal(now.report, now.figures) }]);
  }
}
