'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { adjustEntryAction } from '../../../../../lib/routes/specialist';

/** The contract specialist corrects an entry's amount with a reason, once they confirm what it does (PRD 13, Entries: adjusted). */
export async function adjustEntryFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(adjustEntryAction, form, { practiceId: form.get('practiceId') });
}
