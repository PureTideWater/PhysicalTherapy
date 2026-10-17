import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { billingSettingsPage } from '../../../lib/routes/billing';

export const metadata: Metadata = { title: 'Billing' };

const KIND_NAMES: Readonly<Record<string, string>> = { group: 'Practice group', firm: 'Billing firm' };

/**
 * Settings, billing (PRD 7, Settings: "billing"; PRD 5, J18: "invoices visible in the organization's
 * settings"): the organizations whose billing the person manages, each opening its plan, payment method
 * and invoices. Only an organization's administrator manages its billing.
 */
export default async function BillingSettingsPage() {
  const page = await loadPage(billingSettingsPage, {});
  if (page.kind !== 'ok') {
    return null;
  }
  const { organizations } = page.data;
  return (
    <AppShell shell={page.shell} section="billing">
      <h1 className="text-2xl font-bold tracking-display">Billing</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        The subscription, payment method and invoices of each organization you administer. Billing holds the organization&apos;s name and its invoices only, never a patient&apos;s or a claim&apos;s details.
      </p>
      {organizations.length === 0 ? (
        <EmptyState title="No organization's billing to manage" nextStep="Billing is managed by your organization's administrator (the practice administrator of a group, the firm principal of a firm)." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {organizations.map((organization) => (
            <Card key={organization.organizationId}>
              <CardHeader>
                <CardTitle>
                  <Link className="underline" href={`/settings/billing/${organization.organizationId}`}>
                    {organization.name}
                  </Link>
                </CardTitle>
                <CardDescription>{KIND_NAMES[organization.kind] ?? organization.kind}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Plan, payment method, invoices and standing.</CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
