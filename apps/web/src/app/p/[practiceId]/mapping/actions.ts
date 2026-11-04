'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { mapPlanAction, priceAgainAction, priceWaitingAction } from '../../../../lib/routes/mapping';

/** Maps a plan, or corrects one of its mappings (PRD 5, J6; MAP-03), queuing monitoring of the months it completes (MAP-07). */
export async function mapPlanFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(mapPlanAction, form, { practiceId: form.get('practiceId') });
}

/** "Price these months again": one re-run of each ready month, in the person's name, each accepted by hand (combined audit #32; MAP-08, MAP-09). */
export async function priceAgainFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(priceAgainAction, form, { practiceId: form.get('practiceId') });
}

/** "Price them now": monitoring of every month no run covers, mixed months included (combined audit #32; MAP-07). */
export async function priceWaitingFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(priceWaitingAction, form, { practiceId: form.get('practiceId') });
}
