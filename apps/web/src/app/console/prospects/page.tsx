import { Badge, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { prospectsPage } from '../../../lib/routes/console-onboarding';
import { BILLING_ARRANGEMENT_LABELS } from '../../../lib/routes/onboarding';
import { convertProspectAction, reviewProspectAction } from './actions';

export const metadata: Metadata = { title: 'Audit requests' };

const FILTERS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
] as const;

/**
 * Audit requests from the public form (PRD 5, J1): who asked, their locations, payers and billing arrangement. The
 * founder scopes each on a call; converting one creates its practice group, named as the request named it, and
 * opens it to add the practice, record the agreements and invite the practice administrator.
 */
export default async function ProspectsPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(prospectsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="prospects" roles={page.roles} message={page.message} nextStep="Audit requests are for platform administrators." />;
  }
  const { prospects, status, page: current, pages, total } = page.data;
  return (
    <AppShell shell={page.shell} section="prospects">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Audit requests</h1>
      <nav aria-label="Filter" className="flex gap-3 text-sm">
        {FILTERS.map((filter) => (
          <Link key={filter.value} href={`/console/prospects?status=${filter.value}`} aria-current={filter.value === status ? 'page' : undefined} className={filter.value === status ? 'font-semibold underline' : 'underline'}>
            {filter.label}
          </Link>
        ))}
      </nav>
      {prospects.length === 0 ? (
        <EmptyState mark title="No requests here" nextStep="Requests from the public form at /request-audit appear here." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Audit requests">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Organization</th>
              <th className="py-1 font-medium">Contact</th>
              <th className="py-1 font-medium">Locations</th>
              <th className="py-1 font-medium">Payers</th>
              <th className="py-1 font-medium">Billing</th>
              <th className="py-1 font-medium">Received</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Next</th>
            </tr>
          </thead>
          <tbody>
            {prospects.map((prospect) => (
              <tr key={prospect.id} className="border-t align-top" data-prospect-status={prospect.status}>
                <td className="py-1">{prospect.organizationName}</td>
                <td className="py-1">
                  {prospect.contactName}
                  <br />
                  <span className="text-xs text-muted-foreground">{prospect.contactEmail}</span>
                </td>
                <td className="py-1 font-mono tabular-nums">{prospect.locations}</td>
                <td className="py-1">{prospect.payers.join(', ')}</td>
                <td className="py-1">{BILLING_ARRANGEMENT_LABELS[prospect.billingArrangement]}</td>
                <td className="py-1">{utc(prospect.createdAt)}</td>
                <td className="py-1">
                  <Badge variant="outline">{prospect.status}</Badge>
                </td>
                <td className="py-1">
                  {prospect.status === 'converted' && prospect.organizationId !== null ? (
                    <Link className="underline" href={`/console/organizations/${prospect.organizationId}`}>
                      Open organization
                    </Link>
                  ) : prospect.status === 'declined' ? null : (
                    <div className="flex flex-col gap-2">
                      <ActionForm action={convertProspectAction} submit="Create practice group" className="flex flex-col gap-1">
                        <FormKeys />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                      </ActionForm>
                      {prospect.status === 'new' ? (
                        <ActionForm action={reviewProspectAction} submit="Mark contacted" variant="outline" className="flex flex-col gap-1">
                          <FormKeys />
                          <input type="hidden" name="prospectId" value={prospect.id} />
                          <input type="hidden" name="status" value="contacted" />
                        </ActionForm>
                      ) : null}
                      <ActionForm action={reviewProspectAction} submit="Decline" variant="outline" className="flex flex-col gap-1">
                        <FormKeys />
                        <input type="hidden" name="prospectId" value={prospect.id} />
                        <input type="hidden" name="status" value="declined" />
                      </ActionForm>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-sm text-muted-foreground">
        {total} request{total === 1 ? '' : 's'}; page {current} of {pages}.
        {current < pages ? (
          <>
            {' '}
            <Link className="underline" href={`/console/prospects?status=${status}&page=${String(current + 1)}`}>
              Next page
            </Link>
          </>
        ) : null}
      </p>
    </AppShell>
  );
}
