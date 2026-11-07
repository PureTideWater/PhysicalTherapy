import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { Field, SelectField } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
import { roleName } from '../../../../../components/format';
import { ScrollTable } from '../../../../../components/scroll-table';
import { InvitationItem, InvitationRow, MemberRow } from '../../../../../components/settings/user-rows';
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
    return <Forbidden shell={page.shell} section="users" roles={page.roles} message={page.message} nextStep="Users and roles are managed by the organization’s administrator." />;
  }
  const { organization, roles, members, invitations, notice } = page.data;
  const roleOptions = roles.map((role) => ({ value: role, label: roleName(role) }));
  return (
    <AppShell shell={page.shell} section="users">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Users and roles</h1>
        <p className="text-base text-muted-foreground">{organization.name}. Changes here are for the organization’s administrator.</p>
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
          <ScrollTable label="Members">
            <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Members">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Email</th>
                  <th className="py-1 pr-3 font-medium">Role</th>
                  <th className="py-1 pr-3 font-medium">State</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">Change role or end membership</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <MemberRow key={member.membershipId} member={member} organizationId={organization.id} roleOptions={roleOptions} changeRole={changeRole} endMembership={endMembership} />
                ))}
              </tbody>
            </table>
          </ScrollTable>
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
            <>
              {/* Below the sm breakpoint each invitation is a list item, so the page never scrolls sideways (WCAG 1.4.10). */}
              <ul className="flex flex-col sm:hidden" aria-label="Invitations">
                {invitations.map((invitation) => (
                  <InvitationItem key={invitation.id} invitation={invitation} organizationId={organization.id} resend={resendInvitation} />
                ))}
              </ul>
              {/* The condition sits on a wrapper outside ScrollTable, so no empty region renders below sm (docs/adr/0078). */}
              <div className="hidden sm:block">
                <ScrollTable label="Invitations">
                  <table className="w-full min-w-[36rem] text-left text-sm" aria-label="Invitations">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Email</th>
                        <th className="py-1 pr-3 font-medium">Role</th>
                        <th className="py-1 pr-3 font-medium">State</th>
                        <th className="py-1 font-medium">
                          <span className="sr-only">Send again</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map((invitation) => (
                        <InvitationRow key={invitation.id} invitation={invitation} organizationId={organization.id} resend={resendInvitation} />
                      ))}
                    </tbody>
                  </table>
                </ScrollTable>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
