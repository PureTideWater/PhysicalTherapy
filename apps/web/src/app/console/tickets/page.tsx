import { Badge, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../components/action-form';
import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { CATEGORY_LABELS, ticketsPage } from '../../../lib/routes/support';
import { setTicketStatusAction } from './actions';

export const metadata: Metadata = { title: 'Support tickets' };

const FILTERS = ['open', 'answered', 'closed', 'all'] as const;

/**
 * The support desk's queue (PRD 19, Support; docs/adr/0053): tickets from every screen's help, with who asked and
 * their organizations, answered by email within the published target. A ticket names no practice's records: when
 * the answer needs them, the desk opens a support grant for the practice (Support in the console), which tells its
 * administrator.
 */
export default async function TicketsPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(ticketsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="tickets" roles={page.roles} message={page.message} nextStep="The ticket queue is for the support desk." />;
  }
  const { tickets, status, responseTarget, supportEmail } = page.data;
  return (
    <AppShell shell={page.shell} section="tickets">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Support tickets</h1>
      <p className="text-base text-muted-foreground">
        Answer within {responseTarget}. Mail to {supportEmail} from an account&apos;s own address opens a ticket here (screen: email); one whose text looked like it held patient
        information opens a ticket that says only that it came.
      </p>
      <nav aria-label="Filter" className="flex gap-3 text-sm">
        {FILTERS.map((filter) => (
          <Link key={filter} href={`/console/tickets?status=${filter}`} aria-current={filter === status ? 'page' : undefined} className={filter === status ? 'font-semibold underline' : 'underline'}>
            {filter}
          </Link>
        ))}
      </nav>
      {tickets.length === 0 ? (
        <EmptyState mark title="No tickets here" nextStep="Tickets opened from any screen's help appear here." />
      ) : (
        <table className="w-full text-left text-sm" aria-label="Tickets">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">Number</th>
              <th className="py-1 pr-3 font-medium">From</th>
              <th className="py-1 pr-3 font-medium">About</th>
              <th className="py-1 pr-3 font-medium">Message</th>
              <th className="py-1 pr-3 font-medium">Opened</th>
              <th className="py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id} className="border-t align-top" data-ticket-status={ticket.status}>
                <td className="py-1 pr-3 font-mono tabular-nums">{ticket.number}</td>
                <td className="py-1 pr-3">
                  {ticket.requesterEmail}
                  <br />
                  <span className="text-xs text-muted-foreground">{ticket.organizations.join(', ')}</span>
                </td>
                <td className="py-1 pr-3">
                  {CATEGORY_LABELS[ticket.category]}
                  <br />
                  <span className="text-xs text-muted-foreground">screen: {ticket.screen}</span>
                </td>
                <td className="py-1 pr-3">
                  <p className="font-medium">{ticket.subject}</p>
                  <p className="whitespace-pre-wrap">{ticket.message}</p>
                </td>
                <td className="py-1 pr-3">{utc(ticket.createdAt)}</td>
                <td className="py-1">
                  <Badge variant="outline">{ticket.status}</Badge>
                  <div className="mt-2 flex flex-col gap-1">
                    {(['answered', 'closed', 'open'] as const)
                      .filter((next) => next !== ticket.status)
                      .map((next) => (
                        <ActionForm key={next} action={setTicketStatusAction} submit={next === 'open' ? 'Reopen' : `Mark ${next}`} variant="outline" className="flex flex-col gap-1">
                          <FormKeys />
                          <input type="hidden" name="ticketId" value={ticket.id} />
                          <input type="hidden" name="status" value={next} />
                        </ActionForm>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
