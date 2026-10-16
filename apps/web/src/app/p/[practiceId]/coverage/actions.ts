'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { reviewEvidenceAction, suggestEvidenceAction } from '../../../../lib/routes/models';

/** The Coverage screen's model steps (docs/adr/0052); each runs its registered route (src/lib/routes/models.ts). */

const practice = (form: FormData) => ({ practiceId: form.get('practiceId') });

/** Asks the model for a checklist of documents to obtain for the coverage gaps. */
export async function suggestEvidenceFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(suggestEvidenceAction, form, practice(form));
}

/** Keeps the checked items of the model's checklist, or dismisses it. */
export async function reviewEvidenceFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reviewEvidenceAction, form, practice(form));
}
