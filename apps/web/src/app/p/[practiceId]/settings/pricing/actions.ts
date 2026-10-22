'use server';

import { redirect } from 'next/navigation';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { confirmPricingLocationAction, isLocationChanged, pricingSettingsPath, setPricingLocationAction } from '../../../../../lib/routes/settings';

/** Sets the practice's pricing location, its billing ZIP and ZIP+4 (pricing_settings.set; audit #33). */
export async function setPricingLocation(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setPricingLocationAction, form, { practiceId: form.get('practiceId') });
}

/**
 * Confirms the pricing location the page showed (Getting started's "Confirm your billing ZIP"). When it changed since
 * the page loaded, nothing is confirmed and the page is read again, showing the location as it stands with the notice
 * that it changed (verification of PR 6b-2, finding 1); the route has checked the practice and the role by then.
 */
export async function confirmPricingLocation(_state: ActionState, form: FormData): Promise<ActionState> {
  const practiceId = form.get('practiceId');
  const state = await runAction(confirmPricingLocationAction, form, { practiceId });
  if (typeof practiceId === 'string' && isLocationChanged(state.issues)) {
    redirect(`${pricingSettingsPath(practiceId.toLowerCase())}?notice=changed`);
  }
  return state;
}
