'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { addLineNote } from '../../../../../lib/routes/remittances';

/** Adds a note to a service line (PRD 7, Claims and lines: "add a note"). */
export async function addLineNoteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(addLineNote, form, { practiceId: form.get('practiceId'), lineId: form.get('lineId') });
}
