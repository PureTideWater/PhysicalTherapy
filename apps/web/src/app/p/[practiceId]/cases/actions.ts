'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { triageRunAction } from '../../../../lib/routes/triage';

/** Queues the triage of a complete run (PRD 12): anomalies, the actionable judgement, cases by payer pattern. */
export async function triageRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(triageRunAction, form, { practiceId: form.get('practiceId') });
}
