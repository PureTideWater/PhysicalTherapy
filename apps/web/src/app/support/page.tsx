import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../components/action-form';
import { Field, SelectField, TextAreaField } from '../../components/field';
import { FormKeys } from '../../components/form-keys';
import { utc } from '../../components/format';
import { AppShell } from '../../components/shell';
import { loadPage } from '../../lib/http/next';
import { supportRequestPage } from '../../lib/routes/support';
import { createTicketAction } from './actions';

export const metadata: Metadata = { title: 'Support' };

const STATUS: Readonly<Record<string, string>> = { open: 'Open', answered: 'Answered', closed: 'Closed' };

/**
 * Support (PRD 19, Support: "a support address that creates a ticket; a published response target"; docs/adr/0053):
 * a ticket opened from the screen the help link came from, the support address beside it, and the person's own
 * tickets. Support staff never see a practice's records through a ticket: when they need to, a support grant is
 * opened for the practice, and its administrator is told.
 */
export default async function SupportPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(supportRequestPage, props);
  if (page.kind === 'forbidden') {
    return null;
  }
  const { from, sent, supportEmail, responseTarget, categories, tickets } = page.data;
  return (
    <AppShell shell={page.shell} section="home">
      <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
      {sent === null ? null : (
        <Alert>
          <AlertTitle>Ticket {sent} opened</AlertTitle>
          <AlertDescription>We answer within {responseTarget}, by email to the address you sign in with.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Open a ticket</CardTitle>
          <CardDescription>
            We answer within {responseTarget}. Or write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a> from the address you sign in with: the mail opens a ticket
            here too. Never send a patient&apos;s
            name, date of birth, member ID or claim number: name the screen and the record&apos;s ID from its address instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createTicketAction} submit="Open ticket" className="grid max-w-2xl gap-4">
            <FormKeys />
            <input type="hidden" name="screen" value={from} />
            <SelectField label="What is it about" name="category" options={categories} />
            <Field label="Subject" name="subject" required maxLength={200} />
            <TextAreaField label="What happened, and what you expected" name="message" required maxLength={4000} rows={6} />
          </ActionForm>
        </CardContent>
      </Card>
      <section aria-label="Your tickets" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your tickets</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not opened a ticket yet.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Tickets">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Number</th>
                <th className="py-1 font-medium">Subject</th>
                <th className="py-1 font-medium">Opened</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t">
                  <td className="py-1 tabular-nums">{ticket.number}</td>
                  <td className="py-1">{ticket.subject}</td>
                  <td className="py-1">{utc(ticket.createdAt)}</td>
                  <td className="py-1">
                    <Badge variant="outline">{STATUS[ticket.status] ?? ticket.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-sm text-muted-foreground">
        <Link className="underline" href="/status">
          Service status
        </Link>
      </p>
    </AppShell>
  );
}
