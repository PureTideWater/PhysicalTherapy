'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { setProofLevelAction } from '../../../../../lib/routes/settings';

/** Sets the practice's proof level for "recovered" (the practice administrator; docs/adr/0053). */
export async function setProofLevel(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setProofLevelAction, form, { practiceId: form.get('practiceId') });
}
