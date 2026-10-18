'use server';

import { refusalState } from '../../../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../../../lib/http/next';
import { logSubmissionAction, recordResponseAction } from '../../../../../../lib/routes/submissions';

/** Logs a submission made through the payer's own channel, carrying the export's SHA-256 (CAS-12). */
export async function logSubmissionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(logSubmissionAction, form, { practiceId: form.get('practiceId') }));
}

/** Records the payer's response with its document (PRD 12; J10). */
export async function recordResponseFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(recordResponseAction, form, { practiceId: form.get('practiceId') }));
}
