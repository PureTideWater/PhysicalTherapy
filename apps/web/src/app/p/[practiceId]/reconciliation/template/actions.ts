'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { saveTemplateAction } from '../../../../../lib/routes/reconciliation';

/** Saves the practice's posting-export template (PRD 20: one per practice-management system, mapped once). */
export async function saveTemplateFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(saveTemplateAction, form, { practiceId: form.get('practiceId') });
}
