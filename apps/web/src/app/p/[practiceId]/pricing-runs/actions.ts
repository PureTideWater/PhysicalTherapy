'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { createPricingRunAction } from '../../../../lib/routes/pricing';

/** Creates a pricing run for a period, pinned to the current rule release, and queues the price job (PRD 5, J7). */
export async function createPricingRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createPricingRunAction, form, { practiceId: form.get('practiceId') });
}
