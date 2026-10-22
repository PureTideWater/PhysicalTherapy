'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { confirmPricingLocationAction, setPricingLocationAction } from '../../../../../lib/routes/settings';

/** Sets the practice's pricing location, its billing ZIP and ZIP+4 (pricing_settings.set; audit #33). */
export async function setPricingLocation(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setPricingLocationAction, form, { practiceId: form.get('practiceId') });
}

/** Confirms the pricing location as it stands (Getting started's "Confirm your billing ZIP"). */
export async function confirmPricingLocation(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(confirmPricingLocationAction, form, { practiceId: form.get('practiceId') });
}
