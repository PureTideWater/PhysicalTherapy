'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { generateReportDocumentAction } from '../../../../../lib/routes/report-documents';

/** Generates a coverage report or a month's summary with its figures as they stand, and queues its print (PRD 7, Reports: "generate"). */
export async function generateReportDocumentFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(generateReportDocumentAction, form, { practiceId: form.get('practiceId') });
}
