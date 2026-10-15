'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { findClaim } from '../../../../lib/routes/remittances';

/** The Claims and lines screen's search: a payer claim control number, posted, never put in a URL. */
export async function findClaimAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(findClaim, form, { practiceId: form.get('practiceId') });
}
