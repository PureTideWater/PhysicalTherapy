'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { confirmRegulationAction } from '../../../../../lib/routes/specialist';

/** The contract specialist confirms the Medicare Advantage regulation applies to a case (PRD 2, step 5). */
export async function confirmRegulationFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(confirmRegulationAction, form, { practiceId: form.get('practiceId') });
}
