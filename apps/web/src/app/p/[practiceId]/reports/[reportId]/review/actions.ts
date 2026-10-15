'use server';

import { type ActionState, runAction } from '../../../../../../lib/http/next';
import { attestReportAction } from '../../../../../../lib/routes/reports';

/** Signs the reviewer's attestation of an audit report over its files' SHA-256 (PRD 2, Reimbursement reviewer). */
export async function attestReportFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(attestReportAction, form, { practiceId: form.get('practiceId') });
}
