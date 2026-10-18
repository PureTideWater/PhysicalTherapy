'use server';

import { refusalState } from '../../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../../lib/http/next';
import { reopenLineAction, writeOffLineAction } from '../../../../../lib/routes/triage';
import { addNoteAction, assignCaseAction } from '../../../../../lib/routes/workbench';

/** Writes a case line off with a reason from the closed list (PRD 7, Cases: "write off a line with reason"). */
export async function writeOffFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(writeOffLineAction, form, { practiceId: form.get('practiceId') });
}

/** Reopens a written-off line with a reason (PRD 8: a reopen is an explicit action with a reason and an audit event). */
export async function reopenFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reopenLineAction, form, { practiceId: form.get('practiceId') });
}

/** Assigns the case to a person who works the practice's cases, or leaves it unassigned (PRD 7, Cases: "assign"). */
export async function assignFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(assignCaseAction, form, { practiceId: form.get('practiceId') }));
}

/** Adds a note to the case (PRD 7, Cases: "notes"). */
export async function noteFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(addNoteAction, form, { practiceId: form.get('practiceId') }));
}
