'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { acceptPricingRunAction, createPricingRunAction, rerunPricingRunAction } from '../../../../lib/routes/pricing';

/** Creates a pricing run for a period, pinned to the current rule release, and queues the price job (PRD 5, J7). */
export async function createPricingRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createPricingRunAction, form, { practiceId: form.get('practiceId') });
}

/** Prices a complete run again under the release in force, never changing it, and queues the price job (J17, MAP-03). */
export async function rerunPricingRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(rerunPricingRunAction, form, { practiceId: form.get('practiceId') });
}

/** Accepts a complete re-run after its diff: from then on it is the run in effect (J17). */
export async function acceptPricingRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(acceptPricingRunAction, form, { practiceId: form.get('practiceId') });
}
