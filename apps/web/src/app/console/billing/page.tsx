import { formatUsd, parseCents } from '@tp/money';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { SelectField } from '../../../components/field';
import { utcDate } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { consoleBillingPage } from '../../../lib/routes/billing';
import { issueAuditInvoice } from './actions';
import { FormKeys } from '../../../components/form-keys';

export const metadata: Metadata = { title: 'Billing status' };

const STANDING: Readonly<Record<string, string>> = { good: 'Good', past_due: 'Past due', suspended: 'Suspended for nonpayment' };
const KIND: Readonly<Record<string, string>> = { group: 'Practice group', firm: 'Billing firm' };

/**
 * Internal console: billing status per organization (PRD 7, Organizations and practices: "billing status";
 * PRD 3: the platform administrator "manages ... billing"; docs/adr/0050): each group's and firm's standing,
 * plan, what it owes and the latest nightly usage snapshot (granted and active practices, the seam firm
 * invoicing reads in milestone 12), and an audit invoice issued from here. Organization records and
 * invoices only; no practice's data.
 */
export default async function ConsoleBillingPage() {
  const page = await loadPage(consoleBillingPage, {});
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="console_billing" roles={page.roles} message={page.message} nextStep="Billing in the console is for platform administrators." />;
  }
  const { organizations, catalog } = page.data;
  return (
    <AppShell shell={page.shell} section="console_billing">
      <h1 className="text-2xl font-semibold tracking-tight">Billing status</h1>
      {organizations.length === 0 ? (
        <EmptyState title="No customer organizations yet" nextStep="Create a practice group or a billing firm under Organizations and practices." />
      ) : (
        <>
          <table className="w-full text-left text-sm" aria-label="Billing status">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Organization</th>
                <th className="py-1 font-medium">Standing</th>
                <th className="py-1 font-medium">Plan</th>
                <th className="py-1 font-medium">Owed</th>
                <th className="py-1 font-medium">Practices (granted, active)</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((row) => (
                <tr key={row.organizationId} className="border-t" data-standing={row.standing}>
                  <td className="py-1">
                    {row.name} <span className="text-xs text-muted-foreground">({KIND[row.kind] ?? row.kind})</span>
                    {row.status === 'active' ? null : (
                      <Badge className="ml-2" variant="destructive">
                        {row.status}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1">
                    <Badge variant={row.standing === 'good' ? 'outline' : 'destructive'}>{STANDING[row.standing] ?? row.standing}</Badge>
                    {row.suspendedSince !== null ? <span className="ml-2 text-xs">since {utcDate(row.suspendedSince)}</span> : row.pastDueSince !== null ? <span className="ml-2 text-xs">since {utcDate(row.pastDueSince)}</span> : null}
                  </td>
                  <td className="py-1">{row.plan === null ? 'None' : `${row.plan === 'monthly' ? 'Monthly' : 'Annual'} (${row.subscriptionStatus ?? ''})`}</td>
                  <td className="py-1 tabular-nums">{formatUsd(parseCents(row.openCents))}</td>
                  <td className="py-1">{row.snapshotOn === null ? '—' : `${String(row.grantedPractices)}, ${String(row.activePractices)} on ${row.snapshotOn}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Card>
            <CardHeader>
              <CardTitle>Issue an audit invoice</CardTitle>
              <CardDescription>
                {catalog.audit.name}, {formatUsd(parseCents(catalog.audit.amountCents))}, charged to the organization&apos;s payment method on file (its administrator adds one in Settings first).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={issueAuditInvoice} submit="Issue audit invoice" className="grid max-w-md gap-4">
                <FormKeys />
                <SelectField label="Organization" name="organizationId" options={organizations.map((row) => ({ value: row.organizationId, label: row.name }))} />
              </ActionForm>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
