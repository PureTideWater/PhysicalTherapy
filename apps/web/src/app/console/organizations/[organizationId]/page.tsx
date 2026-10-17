import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { Field, SelectField } from '../../../../components/field';
import { roleName, roleNames, utcDate } from '../../../../components/format';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { organizationPage } from '../../../../lib/routes/console';
import {
  createPracticeAction,
  endMembershipAction,
  inviteMemberAction,
  recordAgreementAction,
  resendInvitationAction,
  setOrganizationStatusAction,
  unlockUserAction,
  uploadAgreementAction,
} from '../../actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Organization' };

const AGREEMENT_KINDS = [
  { value: 'baa', label: 'Business associate agreement' },
  { value: 'engagement', label: 'Engagement letter' },
  { value: 'terms', label: 'Terms' },
  { value: 'data_rights', label: 'Data-rights addendum' },
  { value: 'dpa', label: 'Data processing agreement' },
] as const;

/**
 * One organization in the internal console (PRD 7): its practices, members, agreements and grants,
 * and the v0 actions (create a practice, invite a member, end a membership, unlock an account,
 * record an agreement). Directory records only; no practice's data is read here.
 */
export default async function OrganizationPage(props: { readonly params: Promise<{ organizationId: string }> }) {
  const page = await loadPage(organizationPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="organizations" roles={page.roles} message={page.message} nextStep="The internal console is for platform administrators." />;
  }
  const { organization, roles, practices, members, agreements, grants, invitations } = page.data;
  const practiceName = new Map(practices.map((practice) => [practice.id, practice.name]));
  return (
    <AppShell shell={page.shell} section="organizations">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
        <p className="text-sm text-muted-foreground">
          {organization.kind} · {organization.status} · created {utcDate(organization.createdAt)}
        </p>
      </div>

      {organization.kind !== 'internal' && organization.status !== 'closed' ? (
        <Card>
          <CardHeader>
            <CardTitle>{organization.status === 'suspended' ? 'Suspended' : 'Suspension'}</CardTitle>
            <CardDescription>
              {organization.status === 'suspended'
                ? 'New runs are refused for every practice of the organization, with the reason; every record stays readable. Reinstating lifts it at once.'
                : 'Suspending refuses new runs for every practice of the organization (pricing, monitoring, packet exports, reports and uploads) and leaves every record readable.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={setOrganizationStatusAction}
              submit={organization.status === 'suspended' ? 'Reinstate the organization' : 'Suspend the organization'}
              variant={organization.status === 'suspended' ? 'default' : 'destructive'}
            >
              <FormKeys />
              <input type="hidden" name="organizationId" value={organization.id} />
              <input type="hidden" name="status" value={organization.status === 'suspended' ? 'active' : 'suspended'} />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {organization.kind === 'group' ? (
        <Card>
          <CardHeader>
            <CardTitle>Practices</CardTitle>
            <CardDescription>One practice per billing entity. Each is created with its own data key.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {practices.length === 0 ? (
              <EmptyState title="No practices yet" nextStep="Create the group's first practice, then invite its practice administrator." />
            ) : (
              <ul className="flex flex-col gap-1 text-sm" aria-label="Practices">
                {practices.map((practice) => (
                  <li key={practice.id}>
                    {practice.name} <span className="text-muted-foreground">· {practice.status}</span> ·{' '}
                    <Link className="underline" href={`/console/practices/${practice.id}`}>
                      Pricing and triage settings
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={createPracticeAction} submit="Create practice" className="grid max-w-xl gap-3">
              <FormKeys />
              <input type="hidden" name="organizationId" value={organization.id} />
              <Field label="Practice name" name="name" required maxLength={200} />
              <Field label="NPI (optional)" name="npi" inputMode="numeric" pattern="[0-9]{10}" />
              <Field label="Tax ID, last four (optional)" name="taxIdLast4" inputMode="numeric" pattern="[0-9]{4}" />
              <Field label="ZIP (optional)" name="zip" inputMode="numeric" pattern="[0-9]{5}" />
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>One role per membership. Ending a membership revokes the user's sessions at once.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {members.length === 0 ? (
            <EmptyState title="No members yet" nextStep={organization.kind === 'group' ? 'Invite the practice administrator.' : 'Invite the first member.'} />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Members">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Email</th>
                  <th className="py-1 font-medium">Role</th>
                  <th className="py-1 font-medium">Account</th>
                  <th className="py-1 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.membershipId} className="border-t align-top" data-member={member.email}>
                    <td className="py-1">{member.email}</td>
                    <td className="py-1">{roleName(member.role)}</td>
                    <td className="flex flex-wrap gap-1 py-1">
                      <Badge variant="outline">{member.userStatus}</Badge>
                      {member.mfaEnrolled ? null : <Badge variant="outline">no MFA yet</Badge>}
                      {member.locked ? <Badge variant="destructive">locked</Badge> : null}
                      {member.current ? null : <Badge variant="secondary">ended {utcDate(member.endsAt ?? new Date())}</Badge>}
                    </td>
                    <td className="flex flex-wrap gap-2 py-1">
                      {member.locked ? (
                        <ActionForm action={unlockUserAction} submit="Unlock" variant="outline" className="flex flex-col gap-1">
                          <FormKeys />
                          <input type="hidden" name="organizationId" value={organization.id} />
                          <input type="hidden" name="userId" value={member.userId} />
                        </ActionForm>
                      ) : null}
                      {member.current ? (
                        <ActionForm action={endMembershipAction} submit="End membership" variant="outline" className="flex flex-col gap-1">
                          <FormKeys />
                          <input type="hidden" name="membershipId" value={member.membershipId} />
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ActionForm action={inviteMemberAction} submit="Send invitation" className="grid max-w-xl gap-3">
            <FormKeys />
            <input type="hidden" name="organizationId" value={organization.id} />
            <Field label="Email" name="email" type="email" required />
            <SelectField label="Role" name="role" options={roles.map((role) => ({ value: role, label: roleName(role) }))} />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>Each lasts seven days, like the temporary password it sends. An expired one is sent again from here, never by the person invited.</CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invitations sent from the application yet.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Invitations">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Email</th>
                  <th className="py-1 font-medium">Role</th>
                  <th className="py-1 font-medium">Sent</th>
                  <th className="py-1 font-medium">State</th>
                  <th className="py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="border-t" data-invitation={invitation.acceptedAt !== null ? 'accepted' : invitation.expired ? 'expired' : 'pending'}>
                    <td className="py-1">{invitation.email}</td>
                    <td className="py-1">{roleName(invitation.role)}</td>
                    <td className="py-1">
                      {utcDate(invitation.sentAt)} ({invitation.sends} {invitation.sends === 1 ? 'send' : 'sends'})
                    </td>
                    <td className="py-1">{invitation.acceptedAt !== null ? `accepted ${utcDate(invitation.acceptedAt)}` : invitation.expired ? 'expired' : `open until ${utcDate(invitation.expiresAt)}`}</td>
                    <td className="py-1">
                      {invitation.acceptedAt === null ? (
                        <ActionForm action={resendInvitationAction} submit="Send again" variant="outline" className="flex flex-col gap-1">
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

      <Card>
        <CardHeader>
          <CardTitle>Agreements</CardTitle>
          <CardDescription>Signed documents, stored by reference and SHA-256 with version, signer and date. A grant cannot exist without one.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {agreements.length === 0 ? (
            <EmptyState title="No agreements yet" nextStep="Record the signed BAA and engagement letter from the e-signature vendor." />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Agreements">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Kind</th>
                  <th className="py-1 font-medium">Practice</th>
                  <th className="py-1 font-medium">Version</th>
                  <th className="py-1 font-medium">Signer</th>
                  <th className="py-1 font-medium">Signed</th>
                  <th className="py-1 font-medium">Reference</th>
                  <th className="py-1 font-medium">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((agreement) => (
                  <tr key={agreement.id} className="border-t">
                    <td className="py-1">{AGREEMENT_KINDS.find((kind) => kind.value === agreement.kind)?.label ?? agreement.kind}</td>
                    <td className="py-1">{agreement.practiceId === null ? 'Whole organization' : (practiceName.get(agreement.practiceId) ?? 'Another organization’s practice')}</td>
                    <td className="py-1">{agreement.version}</td>
                    <td className="py-1">{agreement.signer}</td>
                    <td className="py-1">{utcDate(agreement.signedAt)}</td>
                    <td className="py-1 font-mono text-xs">{agreement.documentRef}</td>
                    <td className="py-1 font-mono text-xs" title={agreement.sha256}>
                      {agreement.sha256.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ActionForm action={recordAgreementAction} submit="Record agreement" className="grid max-w-xl gap-3">
            <FormKeys />
            <input type="hidden" name="organizationId" value={organization.id} />
            <SelectField label="Kind" name="kind" options={AGREEMENT_KINDS} />
            <SelectField label="Practice" name="practiceId" options={[{ value: '', label: 'Whole organization' }, ...practices.map((practice) => ({ value: practice.id, label: practice.name }))]} />
            <Field label="Version" name="version" required maxLength={40} />
            <Field label="Signer" name="signer" required maxLength={200} />
            <Field label="Signed on" name="signedOn" type="date" required />
            <Field label="Document reference" name="documentRef" required hint="The e-signature vendor's envelope or document reference." />
            <Field label="SHA-256" name="sha256" required pattern="[0-9a-fA-F]{64}" hint="The signed document's SHA-256, 64 hexadecimal characters." />
          </ActionForm>
          <h3 className="text-sm font-semibold">Or upload the signed PDF</h3>
          <p className="text-xs text-muted-foreground">The server hashes it and keeps it under an opaque key; an agreement signed through the e-signature vendor arrives by its webhook instead.</p>
          <ActionForm action={uploadAgreementAction} submit="Upload agreement" className="grid max-w-xl gap-3">
            <FormKeys />
            <input type="hidden" name="organizationId" value={organization.id} />
            <SelectField label="Kind" id="upload-kind" name="kind" options={AGREEMENT_KINDS} />
            <SelectField
              label="Practice"
              id="upload-practice"
              name="practiceId"
              options={[{ value: '', label: 'Whole organization' }, ...practices.map((practice) => ({ value: practice.id, label: practice.name }))]}
            />
            <Field label="Version" id="upload-version" name="version" required maxLength={40} />
            <Field label="Signer" id="upload-signer" name="signer" required maxLength={200} />
            <Field label="Signed on" id="upload-signed-on" name="signedOn" type="date" required />
            <Field label="Signed PDF" id="upload-document" name="document" type="file" accept="application/pdf" required hint="At most 10 MB." />
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grants</CardTitle>
          <CardDescription>Access to a practice for another organization: scope, dates, the agreement it rests on. Practice administrators approve and revoke them.</CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <EmptyState title="No grants" nextStep="A practice administrator approves a firm's grant from the practice's settings." />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Grants">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Grantee</th>
                  <th className="py-1 font-medium">Practice</th>
                  <th className="py-1 font-medium">Roles admitted</th>
                  <th className="py-1 font-medium">From</th>
                  <th className="py-1 font-medium">Until</th>
                  <th className="py-1 font-medium">State</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t">
                    <td className="py-1">{grant.granteeName}</td>
                    <td className="py-1">{grant.practiceName}</td>
                    <td className="py-1">{roleNames(grant.roles)}</td>
                    <td className="py-1">{utcDate(grant.startsAt)}</td>
                    <td className="py-1">{utcDate(grant.endsAt)}</td>
                    <td className="py-1">{grant.revokedAt === null ? (new Date(grant.endsAt) > new Date() ? 'in force' : 'expired') : `revoked ${utcDate(grant.revokedAt)}`}</td>
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
