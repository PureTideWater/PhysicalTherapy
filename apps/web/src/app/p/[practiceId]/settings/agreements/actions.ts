'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { confirmAgreementsAction } from '../../../../../lib/routes/settings';

/** The practice administrator confirms the agreement chain (src/lib/routes/settings.ts). */
export async function confirmAgreements(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(confirmAgreementsAction, form, { practiceId: form.get('practiceId') });
}
