'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { saveNotificationPreferencesAction } from '../../../lib/routes/monitoring';

/** Saves the signed-in person's own notification preferences. */
export async function saveNotificationPreferences(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(saveNotificationPreferencesAction, form);
}
