'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { reopenLineAction, writeOffLineAction } from '../../../../../lib/routes/triage';

/** Writes a case line off with a reason from the closed list (PRD 7, Cases: "write off a line with reason"). */
export async function writeOffFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(writeOffLineAction, form, { practiceId: form.get('practiceId') });
}

/** Reopens a written-off line with a reason (PRD 8: a reopen is an explicit action with a reason and an audit event). */
export async function reopenFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reopenLineAction, form, { practiceId: form.get('practiceId') });
}
