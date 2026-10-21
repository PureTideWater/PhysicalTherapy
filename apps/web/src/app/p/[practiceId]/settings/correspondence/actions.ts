'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { setCorrespondenceContactAction } from '../../../../../lib/routes/settings';

/** Sets the practice's correspondence contact, which every payer's copy prints (the practice administrator; audit item #37 part 1). */
export async function setCorrespondenceContact(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setCorrespondenceContactAction, form, { practiceId: form.get('practiceId') });
}
