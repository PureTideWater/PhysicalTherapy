'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { convertProspect, reviewProspect } from '../../../lib/routes/console-onboarding';

/** Marks an audit request contacted or declined (src/lib/routes/console-onboarding.ts). */
export async function reviewProspectAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reviewProspect, form);
}

/** Creates the request's practice group (J1). */
export async function convertProspectAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(convertProspect, form);
}
