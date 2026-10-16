'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { matchClaimAction, matchDepositAction, matchPostingAction, reverseMatchAction } from '../../../../lib/routes/reconciliation';

/** Matches an unmatched posting row to a remittance by hand (PRD 13, Matching step 4: "a manual match records the user"). */
export async function matchPostingFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(matchPostingAction, form, { practiceId: form.get('practiceId') });
}

/** Matches an unmatched EFT or bank row to a remittance by hand. */
export async function matchDepositFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(matchDepositAction, form, { practiceId: form.get('practiceId') });
}

/** Matches an adjusted payment to an open case line by hand. */
export async function matchClaimFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(matchClaimAction, form, { practiceId: form.get('practiceId') });
}

/** Reverses a match with a reason, once the person confirms what it does (PRD 7: "reverse a match"). */
export async function reverseMatchFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(reverseMatchAction, form, { practiceId: form.get('practiceId') });
}
