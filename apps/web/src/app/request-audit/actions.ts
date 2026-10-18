'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { requestAudit } from '../../lib/routes/onboarding';

/** Sends the audit request (public; src/lib/routes/onboarding.ts). */
export async function requestAuditAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(requestAudit, form);
}
