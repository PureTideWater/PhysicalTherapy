'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { revokeDeviceAction, signOutAction } from '../../lib/routes/account';

/** Server actions for the signed-in user's account; each runs its registered route (src/lib/routes/account.ts). */

export async function signOut(form: FormData): Promise<void> {
  await runAction(signOutAction, form);
}

export async function revokeDevice(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(revokeDeviceAction, form);
}
