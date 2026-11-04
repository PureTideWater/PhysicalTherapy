import { standingKind } from '@tp/billing/standing';
import { formatUsd, parseCents } from '@tp/money';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { SelectField } from '../../../components/field';
import { utcDate } from '../../../components/format';
import { Money } from '../../../components/remittances/display';
import { ScrollTable } from '../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { consoleBillingPage } from '../../../lib/routes/billing';
import { issueAuditInvoice } from './actions';
import { FormKeys } from '../../../components/form-keys';
import { suspendedByPaidWhole } from '../../../components/console/suspension-text';

export const metadata: Metadata = { title: 'Billing status' };

/** The one standing (standingKind) in the operator's words; billing's own standing beside it when the record's wins. */
const STANDING: Readonly<Record<string, string>> = {
  good: 'Good',
  past_due: 'Past due',
  suspended_nonpayment: 'Suspended for nonpayment',
  suspended_by_paidwhole: 'Suspended by PaidWhole',
  closed: 'Closed',
};
const KIND: Readonly<Record<string, string>> = { group: 'Practice group', firm: 'Billing firm' };

/**
 * Internal console: billing status per organization (PRD 7, Organizations and practices: "billing status";
 * PRD 3: the platform administrator "manages ... billing"; docs/adr/0050): each group's and firm's one standing (the
 * record's status and billing's, PaidWhole's suspensions first, with PaidWhole's reason when one is stored, O1;
 * @tp/billing/standing; docs/adr/0080) with billing's own beside it,
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
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Billing status</h1>
      {organizations.length === 0 ? (
        <EmptyState mark title="No customer organizations yet" nextStep="Create a practice group or a billing firm under Organizations and practices." />
      ) : (
        <>
          <ScrollTable label="Billing status">
            <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Billing status">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Organization</th>
                  <th className="py-1 pr-3 font-medium">Standing</th>
                  <th className="py-1 pr-3 font-medium">Plan</th>
                  <th className="py-1 pr-3 font-medium">Owed</th>
                  <th className="py-1 font-medium">Practices (granted, active)</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((row) => (
                  <tr key={row.organizationId} className="border-t" data-standing={row.standingKind}>
                    <td className="py-1 pr-3">
                      {row.name} <span className="text-xs text-muted-foreground">({KIND[row.kind] ?? row.kind})</span>
                    </td>
                    <td className="py-1 pr-3">
                      <Badge variant={row.standingKind === 'good' || row.standingKind === 'closed' ? 'outline' : 'destructive'}>
                        {row.standingKind === 'suspended_by_paidwhole' ? suspendedByPaidWhole(row.statusReason) : (STANDING[row.standingKind] ?? row.standingKind)}
                      </Badge>
                      {row.standingKind === 'suspended_nonpayment' && row.suspendedSince !== null ? (
                        <span className="ml-2 text-xs">
                          since <span className="whitespace-nowrap">{utcDate(row.suspendedSince)}</span>
                        </span>
                      ) : row.pastDueSince === null ? null : row.standingKind === 'past_due' ? (
                        <span className="ml-2 text-xs">
                          since <span className="whitespace-nowrap">{utcDate(row.pastDueSince)}</span>
                        </span>
                      ) : row.standingKind === 'suspended_by_paidwhole' || row.standingKind === 'closed' ? (
                        // Billing's own hold in the firm-aware words the customer page uses (a firm's billing suspension reads past due).
                        <span className="ml-2 text-xs">
                          billing{' '}
                          {standingKind('active', row.standing, row.kind) === 'suspended_nonpayment' && row.suspendedSince !== null ? (
                            <>
                              suspended for nonpayment since <span className="whitespace-nowrap">{utcDate(row.suspendedSince)}</span>
                            </>
                          ) : (
                            <>
                              past due since <span className="whitespace-nowrap">{utcDate(row.pastDueSince)}</span>
                            </>
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-3">{row.plan === null ? 'None' : `${row.plan === 'monthly' ? 'Monthly' : 'Annual'} (${row.subscriptionStatus ?? ''})`}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums">{formatUsd(parseCents(row.openCents))}</td>
                    <td className="py-1">
                      {row.snapshotOn === null ? (
                        '—'
                      ) : (
                        <>
                          {String(row.grantedPractices)}, {String(row.activePractices)} on <span className="whitespace-nowrap">{row.snapshotOn}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
          <Card>
            <CardHeader>
              <CardTitle>Issue an audit invoice</CardTitle>
              <CardDescription>
                {catalog.audit.name}, <Money value={catalog.audit.amountCents} />, charged to the organization’s payment method on file (its administrator adds one under Billing first).
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
