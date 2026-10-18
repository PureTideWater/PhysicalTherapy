'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { screeningSubmit } from '../../lib/screening/routes';

/** Sends a screening's rows of totals (public; src/lib/screening/routes.ts). The file itself never reaches the server. */
export async function submitScreeningAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(screeningSubmit, form);
}
