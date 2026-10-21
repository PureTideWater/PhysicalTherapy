'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { screeningSplitApprove } from '../../../lib/screening/routes';

/** A contract specialist approves the screening's place-of-service split (src/lib/screening/routes.ts). */
export async function approveScreeningSplitAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(screeningSplitApprove, form);
}
