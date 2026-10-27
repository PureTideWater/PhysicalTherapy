import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { Field, SelectField } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
import { roleName, utcDate } from '../../../../../components/format';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { usersSettingsPage } from '../../../../../lib/routes/settings';
import { changeRole, endMembership, inviteUser, resendInvitation } from './actions';

export const metadata: Metadata = { title: 'Users and roles' };

const NOTICES: Readonly<Record<string, string>> = {
  invited: 'Invitation sent. It lasts seven days.',
  role_changed: 'Role changed. It applies from their next request.',
  ended: 'Membership ended. Their sessions have ended.',
  resent: 'Invitation sent again, for another seven days.',
};

/**
 * Users and roles (PRD 7, Settings: "Invite, change roles"; PRD 5, J2: "invites a billing manager and a viewer"):
 * the organization's members and invitations, for its administrator. An invitation is the identity provider's
 * email with a temporary password; the person sets their own password and enrolls MFA at first sign-in.
 */
export default async function UsersSettingsPage(props: { readonly params: Promise<{ organizationId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(usersSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="users" roles={page.roles} message={page.message} nextStep="Users and roles are managed by the organization's administrator." />;
  }
  const { organization, roles, members, invitations, notice } = page.data;
  const roleOptions = roles.map((role) => ({ value: role, label: roleName(role) }));
  return (
    <AppShell shell={page.shell} section="users">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Users and roles</h1>
        <p className="text-base text-muted-foreground">{organization.name}. Changes here are for the organization&apos;s administrator.</p>
      </div>
      {notice === null ? null : (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{NOTICES[notice]}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-left text-sm" aria-label="Members">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Email</th>
                <th className="py-1 pr-3 font-medium">Role</th>
                <th className="py-1 pr-3 font-medium">State</th>
                <th className="py-1 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membershipId} className="border-t align-top" data-member-role={member.role}>
                  <td className="py-1 pr-3">
                    {member.email}
                    {member.self ? <span className="text-xs text-muted-foreground"> (you)</span> : null}
                  </td>
                  <td className="py-1 pr-3">{roleName(member.role)}</td>
                  <td className="py-1 pr-3">
                    <Badge variant="outline">{member.status === 'invited' ? 'invited' : member.mfaEnrolled ? member.status : `${member.status}, no MFA`}</Badge>
                  </td>
                  <td className="py-1">
                    {member.self ? null : (
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={changeRole} submit="Change role" variant="outline" className="flex items-end gap-2">
                          <FormKeys />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="membershipId" value={member.membershipId} />
                          <SelectField label="Role" id={`role-${member.membershipId}`} name="role" options={roleOptions} defaultValue={member.role} />
                        </ActionForm>
                        <ActionForm action={endMembership} submit="End membership" variant="destructive" className="flex items-end gap-2">
                          <FormKeys />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="membershipId" value={member.membershipId} />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" name="confirm" required /> They lose access now
                          </label>
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>They receive an email with a temporary password valid for seven days, set their own password, and enroll MFA before they see anything.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={inviteUser} submit="Send invitation" className="grid max-w-md gap-3">
            <FormKeys />
            <input type="hidden" name="organizationId" value={organization.id} />
            <Field label="Email" name="email" type="email" required />
            <SelectField label="Role" id="invite-role" name="role" options={roleOptions} defaultValue={roles.includes('billing_manager') ? 'billing_manager' : roles[0]} />
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations yet.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Invitations">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Email</th>
                  <th className="py-1 pr-3 font-medium">Role</th>
                  <th className="py-1 pr-3 font-medium">State</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr
                    key={invitation.id}
                    className="border-t"
                    data-invitation={invitation.acceptedAt !== null ? 'accepted' : invitation.undeliveredAt !== null ? 'undelivered' : invitation.expired ? 'expired' : 'pending'}
                  >
                    <td className="py-1 pr-3">{invitation.email}</td>
                    <td className="py-1 pr-3">{roleName(invitation.role)}</td>
                    <td className="py-1 pr-3">
                      {/*
                        An invitation email reported undelivered (docs/adr/0065, D10): the administrator checks the address and
                        invites again. One reported as spam was delivered, and SES now holds the address back from the
                        transactional stream, so the person is asked to find it, not sent another (the review of 2026-10-23).
                      */}
                      {invitation.acceptedAt !== null
                        ? `accepted ${utcDate(invitation.acceptedAt)}`
                        : invitation.undeliveredAt !== null
                          ? invitation.undeliveredReason === 'complained'
                            ? `Reported as spam ${utcDate(invitation.undeliveredAt)}: ask the person to find it in their spam folder; one sent again will not reach them`
                            : `Not delivered ${utcDate(invitation.undeliveredAt)}: check the address, then invite again`
                          : invitation.expired
                            ? 'expired'
                            : `open until ${utcDate(invitation.expiresAt)}`}
                    </td>
                    <td className="py-1">
                      {invitation.acceptedAt === null ? (
                        <ActionForm action={resendInvitation} submit="Send again" variant="outline" className="flex flex-col gap-1">
                          <FormKeys />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="invitationId" value={invitation.id} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
