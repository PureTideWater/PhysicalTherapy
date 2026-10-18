'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { mapPlanAction } from '../../../../lib/routes/mapping';

/** Maps a plan, or corrects one of its mappings (PRD 5, J6; MAP-03). */
export async function mapPlanFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(mapPlanAction, form, { practiceId: form.get('practiceId') });
}
