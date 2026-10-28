'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { pauseMailStream, resumeMailStream } from '../../../lib/routes/console-mail';

/** The screening stream paused by hand (src/lib/routes/console-mail.ts). */
export async function pauseMailStreamAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(pauseMailStream, form);
}

/** The screening stream resumed, with its reason (src/lib/routes/console-mail.ts). */
export async function resumeMailStreamAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(resumeMailStream, form);
}
