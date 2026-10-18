'use server';

import { type ActionState, runAction } from '../../../../../lib/http/next';
import { changeRoleAction, endMembershipAction, inviteUserAction, resendInvitationAction } from '../../../../../lib/routes/settings';

/** Users and roles of an organization, for its administrator (src/lib/routes/settings.ts). */
export async function inviteUser(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(inviteUserAction, form, { organizationId: form.get('organizationId') });
}

export async function changeRole(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(changeRoleAction, form, { organizationId: form.get('organizationId') });
}

export async function endMembership(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(endMembershipAction, form, { organizationId: form.get('organizationId') });
}

export async function resendInvitation(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(resendInvitationAction, form, { organizationId: form.get('organizationId') });
}
