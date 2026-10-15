'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { releaseReportAction } from '../../../../../lib/routes/reports';

/** Releases an attested audit report (an unsigned one is refused). */
export async function releaseReportFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(releaseReportAction, form, { practiceId: form.get('practiceId') });
}
