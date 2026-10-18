'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import {
  addRateRecordAction,
  amendVersionAction,
  approveFieldAction,
  approveVersionAction,
  askQuestionAction,
  citeWindowAction,
  removeRateRecordAction,
  startAbstraction,
  supersedeVersionAction,
  updateVersionAction,
  verifyWindowAction,
  withdrawQuestionAction,
} from '../../../../lib/routes/abstraction';
import { proposeTermsAction, rejectProposalAction } from '../../../../lib/routes/models';

/** The contract specialist's server actions in a practice; each runs its registered route (src/lib/routes/abstraction.ts). */

const practice = (form: FormData) => ({ practiceId: form.get('practiceId') });

export async function startAbstractionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(startAbstraction, form, practice(form));
}

export async function updateVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(updateVersionAction, form, practice(form));
}

export async function citeWindowFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(citeWindowAction, form, practice(form));
}

export async function verifyWindowFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(verifyWindowAction, form, practice(form));
}

export async function addRateRecordFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(addRateRecordAction, form, practice(form));
}

export async function removeRateRecordFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(removeRateRecordAction, form, practice(form));
}

export async function approveFieldFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(approveFieldAction, form, practice(form));
}

export async function approveVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(approveVersionAction, form, practice(form));
}

export async function amendVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(amendVersionAction, form, practice(form));
}

export async function supersedeVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(supersedeVersionAction, form, practice(form));
}

export async function askQuestionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(askQuestionAction, form, practice(form));
}

export async function withdrawQuestionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(withdrawQuestionAction, form, practice(form));
}

/** Asks the model to propose a draft version's terms from one of its documents (docs/adr/0052). */
export async function proposeTermsFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(proposeTermsAction, form, practice(form));
}

/** Discards a model proposal: its records not yet verified are removed. */
export async function rejectProposalFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(rejectProposalAction, form, practice(form));
}
