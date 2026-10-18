'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { setModelFlag } from '../../../lib/routes/console-models';

/** A model flag set by a platform administrator (src/lib/routes/console-models.ts). */
export async function setModelFlagAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setModelFlag, form);
}
