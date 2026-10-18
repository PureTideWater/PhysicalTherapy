'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { markNotificationsReadAction } from '../../../../lib/routes/monitoring';

/** Marks the person's notifications in the practice read. */
export async function markNotificationsReadFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(markNotificationsReadAction, form, { practiceId: form.get('practiceId') });
}
