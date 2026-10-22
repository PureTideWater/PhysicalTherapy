'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import {
  createOrganization,
  createPractice,
  createSupportGrant,
  endMembership,
  endSupportGrant,
  inviteMember,
  recordAgreement,
  setOrganizationStatus,
  setPracticeLocation,
  setPracticeSettings,
  unlockUser,
} from '../../lib/routes/console';
import { resendInvitationFromConsole, uploadAgreement } from '../../lib/routes/console-onboarding';

/** Server actions for the internal console; each runs its registered route (src/lib/routes/console.ts). */

export async function createOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createOrganization, form);
}

export async function setOrganizationStatusAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setOrganizationStatus, form);
}

export async function createPracticeAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createPractice, form);
}

export async function setPracticeSettingsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setPracticeSettings, form);
}

/** Sets a practice's pricing location, its billing ZIP and ZIP+4 (audit #33). */
export async function setPracticeLocationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setPracticeLocation, form);
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

export async function resendInvitationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(resendInvitationFromConsole, form);
}

/** Records a signed agreement uploaded as a PDF, hashed on the server (docs/adr/0053). */
export async function uploadAgreementAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(uploadAgreement, form, {}, { fileField: 'document' });
}
