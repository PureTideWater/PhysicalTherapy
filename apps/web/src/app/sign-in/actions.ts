'use server';

import { redirect } from 'next/navigation';

import { type ActionState, runSignInStep } from '../../lib/http/next';
import { RESTARTED, answerMfa, chooseNewPassword, enrollTotp, resetConfirm, resetRequest, restartSignIn, signInWithPassword } from '../../lib/routes/sign-in';

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

/** A forgotten password's request, from the first phase and from Send a new code (docs/adr/0081, the forgotten password). */
export async function resetRequestStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(resetRequest, form);
}

/** The mailed code and the new password. */
export async function resetConfirmStep(_state: ActionState, form: FormData): Promise<ActionState> {
  return runSignInStep(resetConfirm, form);
}

/**
 * Use a different email (review UXR-01): ends the reset step, then the forgot page's first phase with nothing filled,
 * since the typed address was never proven. The destination is this action's, never the form's.
 */
export async function useDifferentEmailStep(form: FormData): Promise<void> {
  form.set('to', 'forgot_password');
  await runSignInStep(restartSignIn, form);
  redirect('/sign-in/forgot-password');
}

/** Back to sign in: ends the reset step, so "Forgot your password?" opens the first phase again, then the sign-in page. */
export async function backToSignInStep(form: FormData): Promise<void> {
  form.set('to', 'sign_in');
  await runSignInStep(restartSignIn, form);
  redirect('/sign-in');
}
