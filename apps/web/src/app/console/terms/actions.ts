'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { publishTerms } from '../../../lib/routes/console-onboarding';

/** Publishes a new version of the terms of use (src/lib/routes/console-onboarding.ts). */
export async function publishTermsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(publishTerms, form);
}
