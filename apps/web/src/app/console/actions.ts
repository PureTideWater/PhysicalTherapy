'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { createOrganization, createPractice, createSupportGrant, endMembership, endSupportGrant, inviteMember, recordAgreement, unlockUser } from '../../lib/routes/console';

/** Server actions for the internal console; each runs its registered route (src/lib/routes/console.ts). */

export async function createOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createOrganization, form);
}

export async function createPracticeAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createPractice, form);
}

export async function inviteMemberAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(inviteMember, form);
}

export async function endMembershipAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(endMembership, form);
}

export async function unlockUserAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(unlockUser, form);
}

export async function recordAgreementAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(recordAgreement, form);
}

export async function createSupportGrantAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createSupportGrant, form);
}

export async function endSupportGrantAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(endSupportGrant, form);
}
