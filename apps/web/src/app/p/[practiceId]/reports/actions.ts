'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { generateReportAction } from '../../../../lib/routes/reports';

/** Requests an audit report of the run in effect for its period and queues the report job (PRD 7, Reports: "generate"). */
export async function generateReportFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(generateReportAction, form, { practiceId: form.get('practiceId') });
}
