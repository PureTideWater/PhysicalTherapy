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
 * The rule a ticket keeps, in the hint of each field a person types into, so the field itself says it (docs/adr/0077).
 * Mail to the support address opens a ticket too, and no hint reaches it: the card says the rule for the mail, and
 * describes the address's link with it, so a person who tabs to the link hears it.
 */
const NO_PATIENT_INFORMATION = 'No patient names, dates of birth, member IDs or claim numbers. Name the screen and the record’s ID.';
const MAIL_RULE = 'Your mail takes no patient information either: no names, dates of birth, member IDs or claim numbers. Name the screen and the record’s ID.';

/**
 * Support (PRD 19, Support: "a support address that creates a ticket; a published response target"; docs/adr/0053):
 * a ticket opened from the screen the help link came from (on that screen's category, where it has one), the support
 * address beside it, and the person's own tickets. Support staff never see a practice's records through a ticket: when
 * they need to, a support grant is opened for the practice, and its administrator is told.
 */
export default async function SupportPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(supportRequestPage, props);
  if (page.kind === 'forbidden') {
    return null;
  }
  const { from, category, sent, supportEmail, responseTarget, categories, tickets } = page.data;
  return (
    <AppShell shell={page.shell} section="home">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Support</h1>
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
            We answer within {responseTarget}. Or write to{' '}
            <a className="underline" href={`mailto:${supportEmail}`} aria-describedby="support-mail-rule">
              {supportEmail}
            </a>{' '}
            from the address you sign in with: the mail opens a ticket here too. <span id="support-mail-rule">{MAIL_RULE}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={createTicketAction} submit="Open ticket" className="grid max-w-2xl gap-4">
            <FormKeys />
            <input type="hidden" name="screen" value={from} />
            <SelectField label="What is it about" name="category" options={categories} defaultValue={category ?? undefined} />
            <Field label="Subject" name="subject" required maxLength={200} hint={NO_PATIENT_INFORMATION} />
            <TextAreaField label="What happened, and what you expected" name="message" required maxLength={4000} rows={6} hint={NO_PATIENT_INFORMATION} />
          </ActionForm>
        </CardContent>
      </Card>
      <section aria-label="Your tickets" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Your tickets</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not opened a ticket yet.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Tickets">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Number</th>
                <th className="py-1 pr-3 font-medium">Subject</th>
                <th className="py-1 pr-3 font-medium">Opened</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t">
                  <td className="py-1 pr-3 font-mono tabular-nums">{ticket.number}</td>
                  <td className="py-1 pr-3">{ticket.subject}</td>
                  <td className="py-1 pr-3">{utc(ticket.createdAt)}</td>
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
