'use server';

import { redirect } from 'next/navigation';

import { type ActionState, runSignInStep } from '../../lib/http/next';
import { RESTARTED, answerMfa, chooseNewPassword, enrollTotp, restartSignIn, signInWithPassword } from '../../lib/routes/sign-in';

/** Server actions for the sign-in steps; each runs its registered route (src/lib/routes/sign-in.ts). */

export async function signInStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(signInWithPassword, form);
}

export async function newPasswordStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(chooseNewPassword, form);
}

export async function enrollStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(enrollTotp, form);
}

export async function mfaStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(answerMfa, form);
}

/**
 * Start again (docs/adr/0081): ends the step, then goes to the sign-in page with the email kept. A form's action, with
 * no state to show: a refusal (its rate limit) still goes there, where the first step ends what this one could not.
 */
export async function restartStep(form: FormData): Promise<void> {
  await runSignInStep(restartSignIn, form);
  redirect(RESTARTED.redirect);
}
