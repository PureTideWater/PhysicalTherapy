import { Badge } from '@tp/ui';

import type { ActionState } from '../../lib/http/next';
import { INVITATION_HELD_BACK, type InvitationView, type MemberView } from '../../lib/routes/settings';
import { ActionForm } from '../action-form';
import { CheckboxField, SelectField } from '../field';
import { FormKeys } from '../form-keys';
import { roleName } from '../format';
import { InvitationStateText } from './invitations';

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/**
 * One member's row on the users page: the email is the row's header, and each control in the row keeps its visible
 * words and adds the member's email to its name, so a screen reader can tell one row's "Change role" from the next
 * (WCAG 1.3.1, 2.4.4; 2.5.3, the name starts with the visible words).
 */
export function MemberRow({
  member,
  organizationId,
  roleOptions,
  changeRole,
  endMembership,
}: {
  readonly member: MemberView;
  readonly organizationId: string;
  readonly roleOptions: readonly { readonly value: string; readonly label: string }[];
  readonly changeRole: Action;
  readonly endMembership: Action;
}) {
  return (
    <tr className="border-t align-top" data-member-role={member.role}>
      <th scope="row" className="py-1 pr-3 font-normal">
        {member.email}
        {member.self ? <span className="text-xs text-muted-foreground"> (you)</span> : null}
      </th>
      <td className="py-1 pr-3">{roleName(member.role)}</td>
      <td className="py-1 pr-3">
        <Badge variant="outline">{member.status === 'invited' ? 'invited' : member.mfaEnrolled ? member.status : `${member.status}, no MFA`}</Badge>
      </td>
      <td className="py-1">
        {member.self ? null : (
          <div className="flex flex-wrap gap-2">
            <ActionForm
              action={changeRole}
              submit={
                <>
                  Change role<span className="sr-only"> for {member.email}</span>
                </>
              }
              variant="outline"
              className="flex items-end gap-2"
            >
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="membershipId" value={member.membershipId} />
              <SelectField label="Role" aria-label={`Role for ${member.email}`} id={`role-${member.membershipId}`} name="role" options={roleOptions} defaultValue={member.role} />
            </ActionForm>
            <ActionForm
              action={endMembership}
              submit={
                <>
                  End membership<span className="sr-only"> of {member.email}</span>
                </>
              }
              variant="destructive"
              className="flex items-end gap-2"
            >
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="membershipId" value={member.membershipId} />
              <CheckboxField
                id={`confirm-${member.membershipId}`}
                name="confirm"
                errorName="Confirmation"
                required
                label={
                  <>
                    They lose access now. End their membership.<span className="sr-only"> ({member.email})</span>
                  </>
                }
              />
            </ActionForm>
          </div>
        )}
      </td>
    </tr>
  );
}

/** Where an invitation stands, for its data attribute. */
export function invitationState(invitation: InvitationView): string {
  return invitation.acceptedAt !== null ? 'accepted' : invitation.undeliveredAt !== null ? 'undelivered' : invitation.expired ? 'expired' : 'pending';
}

/** One invitation as a list item, below the sm breakpoint. */
export function InvitationItem({ invitation, organizationId, resend }: { readonly invitation: InvitationView; readonly organizationId: string; readonly resend: Action }) {
  return (
    <li className="flex flex-col gap-1 border-t py-2 text-sm" data-invitation={invitationState(invitation)}>
      <span className="break-all font-medium">{invitation.email}</span>
      <span className="text-muted-foreground">{roleName(invitation.role)}</span>
      <InvitationStateText invitation={invitation} />
      <ResendForm invitation={invitation} organizationId={organizationId} resend={resend} />
    </li>
  );
}

/** One invitation as a table row, from the sm breakpoint: the email is the row's header. */
export function InvitationRow({ invitation, organizationId, resend }: { readonly invitation: InvitationView; readonly organizationId: string; readonly resend: Action }) {
  return (
    <tr className="border-t" data-invitation={invitationState(invitation)}>
      <th scope="row" className="py-1 pr-3 font-normal">
        {invitation.email}
      </th>
      <td className="py-1 pr-3">{roleName(invitation.role)}</td>
      <td className="py-1 pr-3">
        <InvitationStateText invitation={invitation} />
      </td>
      <td className="py-1">
        <ResendForm invitation={invitation} organizationId={organizationId} resend={resend} />
      </td>
    </tr>
  );
}

/**
 * Send again, for an invitation not accepted, unless SES would hold the email back (INVITATION_HELD_BACK). The button
 * says "Send again" and its name adds the invitation's email.
 */
function ResendForm({ invitation, organizationId, resend }: { readonly invitation: InvitationView; readonly organizationId: string; readonly resend: Action }) {
  if (invitation.acceptedAt !== null || (invitation.undeliveredReason !== null && INVITATION_HELD_BACK.includes(invitation.undeliveredReason))) {
    return null;
  }
  return (
    <ActionForm
      action={resend}
      submit={
        <>
          Send again<span className="sr-only"> to {invitation.email}</span>
        </>
      }
      variant="outline"
      className="flex flex-col gap-1"
    >
      <FormKeys />
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="invitationId" value={invitation.id} />
    </ActionForm>
  );
}
