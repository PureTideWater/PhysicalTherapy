import { Badge, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { UtcTime } from '../../../components/dates';
import { SelectField } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { ScrollTable } from '../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { DECLINED_REASON_LABELS, prospectsPage } from '../../../lib/routes/console-onboarding';
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
 * opens it to add the practice, record the agreements and invite the practice administrator. Declining one asks why,
 * from a closed list (audit #57; the founder's ruling of 2026-10-20); PR 7 shows attribution and the funnel.
 */
export default async function ProspectsPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(prospectsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="prospects" roles={page.roles} message={page.message} nextStep="Audit requests are for platform administrators." />;
  }
  const { prospects, status, page: current, pages, total, declinedReasons } = page.data;
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
        <ScrollTable label="Audit requests">
          <table className="w-full min-w-[54rem] text-left text-sm" aria-label="Audit requests">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Organization</th>
                <th className="py-1 pr-3 font-medium">Contact</th>
                <th className="py-1 pr-3 font-medium">Locations</th>
                <th className="py-1 pr-3 font-medium">Payers</th>
                <th className="py-1 pr-3 font-medium">Billing</th>
                <th className="py-1 pr-3 font-medium">Received</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 font-medium">Next</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((prospect) => (
                <tr key={prospect.id} className="border-t align-top" data-prospect-status={prospect.status}>
                  <td className="py-1 pr-3">{prospect.organizationName}</td>
                  <td className="py-1 pr-3">
                    {/* The email is text-xs, so 8rem holds as many of its characters as 10rem of a text-sm one. */}
                    <span className="block min-w-32 wrap-anywhere">
                      {prospect.contactName}
                      <br />
                      <span className="text-xs text-muted-foreground">{prospect.contactEmail}</span>
                    </span>
                  </td>
                  <td className="py-1 pr-3 font-mono tabular-nums">{prospect.locations}</td>
                  <td className="py-1 pr-3">{prospect.payers.join(', ')}</td>
                  <td className="py-1 pr-3">{BILLING_ARRANGEMENT_LABELS[prospect.billingArrangement]}</td>
                  <td className="py-1 pr-3">
                    <UtcTime at={prospect.createdAt} />
                  </td>
                  <td className="py-1 pr-3">
                    <Badge variant="outline">{prospect.status}</Badge>
                    {prospect.declinedReason === null ? null : (
                      <span className="mt-1 block text-xs text-muted-foreground" data-declined-reason={prospect.declinedReason}>
                        {DECLINED_REASON_LABELS[prospect.declinedReason]}
                      </span>
                    )}
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
                          {/* Contained, the select takes the column's width instead of setting it to its longest reason, so the table still fits its card at 1280 px. */}
                          <div className="contain-inline-size">
                            <SelectField
                              label="Why declined"
                              name="declinedReason"
                              id={`declined-reason-${prospect.id}`}
                              required
                              options={[{ value: '', label: 'Choose a reason' }, ...declinedReasons]}
                            />
                          </div>
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
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
