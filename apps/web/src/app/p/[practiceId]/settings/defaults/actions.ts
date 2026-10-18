'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { settingsMaterialityAction, settingsPursuitAction } from '../../../../../lib/routes/settings';

/** The materiality and pursuit-cost defaults (src/lib/routes/settings.ts). */
export async function setMateriality(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(settingsMaterialityAction, form, { practiceId: form.get('practiceId') });
}

export async function setPursuit(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(settingsPursuitAction, form, { practiceId: form.get('practiceId') });
}
