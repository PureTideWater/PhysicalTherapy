import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { Field, SelectField } from '../../../components/field';
import { roleName, utc } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { SUPPORT_GRANT_HOURS, supportPage } from '../../../lib/routes/console';
import { createSupportGrantAction, endSupportGrantAction } from '../actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Support' };

/**
 * Support (PRD 7; PRD 5, J15): open support grants with their expiry and the number of records read,
 * and a new break-glass grant from a ticket, for a support engineer or for a contract specialist who
 * abstracts the practice's contracts (docs/adr/0028: a specialist reaches a practice only this way,
 * and holds only the contract specialist's role there). The practice's administrators are notified
 * when it opens and when it ends, with the list of records read; only they see which records. An open
 * grant can be ended at once when its ticket closes (PRD 3: support never retains access after the
 * ticket).
 */
export default async function SupportPage() {
  const page = await loadPage(supportPage, {});
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="support" roles={page.roles} message={page.message} nextStep="Support grants are created by platform administrators." />;
  }
  const { grants, practices, engineers } = page.data;
  return (
    <AppShell shell={page.shell} section="support">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Support</h1>
      <Card>
        <CardHeader>
          <CardTitle>New support grant from a ticket</CardTitle>
          <CardDescription>
            One support engineer or contract specialist, one practice, one ticket, {SUPPORT_GRANT_HOURS} hours. Every read under it is logged, and the practice administrator is
            notified at creation and at expiry. No other path lets company staff read a practice's data. A contract specialist works only on the practice's contracts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {practices.length === 0 || engineers.length === 0 ? (
            <EmptyState
              title="Nothing to grant yet"
              nextStep={practices.length === 0 ? 'Create a practice first.' : 'Invite a support engineer or a contract specialist to the internal organization first.'}
            />
          ) : (
            <ActionForm action={createSupportGrantAction} submit="Create support grant" className="grid max-w-xl gap-3">
              <FormKeys />
              <SelectField label="Practice" name="practiceId" options={practices.map((practice) => ({ value: practice.id, label: practice.name }))} />
              <SelectField
                label="Support engineer or contract specialist"
                name="userId"
                options={engineers.map((engineer) => ({ value: engineer.id, label: `${engineer.email} (${roleName(engineer.role)})` }))}
              />
              <Field label="Ticket" name="ticket" required pattern="[A-Za-z0-9-]{1,64}" />
              <Field label="Reason" name="reason" required maxLength={500} hint="What the ticket needs. No patient details." />
            </ActionForm>
          )}
        </CardContent>
      </Card>
      {grants.length === 0 ? (
        <EmptyState mark title="No support grants" nextStep="Grants appear here when created from a ticket." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Support grants">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">State</th>
              <th className="py-1 font-medium">Ticket</th>
              <th className="py-1 font-medium">Practice</th>
              <th className="py-1 font-medium">Granted to</th>
              <th className="py-1 font-medium">Opened</th>
              <th className="py-1 font-medium">Expires</th>
              <th className="py-1 font-medium">Reads</th>
              <th className="py-1 font-medium">Expiry notice</th>
              <th className="py-1 font-medium">
                <span className="sr-only">End</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => (
              <tr key={grant.id} className="border-t" data-ticket={grant.ticket}>
                <td className="py-1">
                  <Badge variant={grant.open ? 'default' : 'outline'}>{grant.open ? 'Open' : 'Ended'}</Badge>
                </td>
                <td className="py-1">{grant.ticket}</td>
                <td className="py-1">{grant.practiceName}</td>
                <td className="py-1">
                  {grant.engineerEmail}
                  {grant.granteeRole === null ? null : <span className="block text-xs text-muted-foreground">{roleName(grant.granteeRole)}</span>}
                </td>
                <td className="py-1">{utc(grant.createdAt)}</td>
                <td className="py-1">{utc(grant.expiresAt)}</td>
                <td className="py-1">{grant.reads}</td>
                <td className="py-1">{utc(grant.notifiedAt)}</td>
                <td className="py-1">
                  {grant.open ? (
                    <ActionForm action={endSupportGrantAction} submit="End now" variant="outline" className="flex items-center gap-2">
                      <FormKeys />
                      <input type="hidden" name="supportGrantId" value={grant.id} />
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
