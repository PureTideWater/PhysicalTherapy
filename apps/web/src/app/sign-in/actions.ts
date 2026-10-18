'use server';

import { type ActionState, runSignInStep } from '../../lib/http/next';
import { answerMfa, chooseNewPassword, enrollTotp, signInWithPassword } from '../../lib/routes/sign-in';

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
