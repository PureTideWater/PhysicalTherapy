'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { requestValidationAction, reviewAnomalyAction } from '../../../../lib/routes/triage';

/** Marks a cohort reviewed (PRD 7, Anomalies: "mark reviewed"). */
export async function reviewAnomalyFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reviewAnomalyAction, form, { practiceId: form.get('practiceId') });
}

/** Converts a cohort to a validation request (PRD 7, Anomalies: "convert to a validation request"). */
export async function requestValidationFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(requestValidationAction, form, { practiceId: form.get('practiceId') });
}
