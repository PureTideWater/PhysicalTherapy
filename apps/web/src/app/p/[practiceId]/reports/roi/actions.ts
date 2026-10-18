'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { generateRoiAction } from '../../../../../lib/routes/roi';

/** Generates an ROI statement for a period from the ledger's entries (PRD 13: "quarterly and on demand per practice"). */
export async function generateRoiFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(generateRoiAction, form, { practiceId: form.get('practiceId') });
}
