'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { acceptTerms } from '../../lib/routes/onboarding';

/** Accepts the terms of use in force (src/lib/routes/onboarding.ts). */
export async function acceptTermsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(acceptTerms, form);
}
