import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../components/action-form';
import { SelectField } from '../../../components/field';
import { FormKeys } from '../../../components/form-keys';
import { utc } from '../../../components/format';
import { ScrollTable } from '../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { type MailStreamView, PAUSE_REASON_LABELS, consoleMailPage } from '../../../lib/routes/console-mail';
import { pauseMailStreamAction, resumeMailStreamAction } from './actions';

export const metadata: Metadata = { title: 'Mail streams' };

const STREAM_NAMES: Readonly<Record<MailStreamView['stream'], string>> = {
  transactional: 'Transactional (invitations, codes, digests)',
  notices: 'Notices (support access, dunning)',
  screening: 'Screening (results, failure notices)',
};

/** A stream's state in words and as a badge: paused, resumed and waiting for SES, or sending. */
function streamState(stream: MailStreamView): { readonly label: string; readonly variant: 'default' | 'outline' | 'destructive' } {
  if (stream.pausedAt !== null) {
    return { label: 'Paused', variant: 'destructive' };
  }
  return stream.sending ? { label: 'Sending', variant: 'default' } : { label: 'Waiting for SES to confirm', variant: 'outline' };
}

/**
 * The mail streams (audit #76; docs/adr/0065; docs/runbooks/deliverability.md): each stream's state, the window's
 * counts, the probes and the screening's readiness; the screening's bounce marks by kind; the last week's undelivered
 * customer messages, and the screening's counted by kind and state. A platform administrator pauses the screening stream
 * by hand, and resumes it only with a reason. Counts, states and IDs, and a customer's user by the sign-in email the
 * console's other screens show; never a screening address, and never SES's own record of a recipient.
 */
export default async function ConsoleMailPage(props: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(consoleMailPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="console_mail" roles={page.roles} message={page.message} nextStep="The mail streams are paused and resumed by platform administrators." />;
  }
  const { notice, streams, undelivered, resumeReasons } = page.data;
  return (
    <AppShell shell={page.shell} section="console_mail">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Mail streams</h1>
      {notice === null ? null : (
        <Alert data-notice={notice} role="status">
          <AlertTitle>{notice === 'paused' ? 'The screening stream is paused' : notice === 'resumed' ? 'The screening stream is resumed' : 'Nothing changed'}</AlertTitle>
          <AlertDescription>
            {notice === 'paused'
              ? 'New screenings are refused, and the platform disables its SES configuration set within a minute.'
              : notice === 'resumed'
                ? 'It sends again once the platform reads SES sending; the probes go at once, and the screening opens when they come back.'
                : 'The stream was already in that state.'}
          </AlertDescription>
        </Alert>
      )}
      {streams.map((stream) => {
        const state = streamState(stream);
        return (
          <Card key={stream.stream} data-stream={stream.stream} data-state={stream.pausedAt !== null ? 'paused' : stream.sending ? 'sending' : 'unconfirmed'}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Badge variant={state.variant}>{state.label}</Badge>
                {STREAM_NAMES[stream.stream]}
              </CardTitle>
              <CardDescription>
                {stream.pausedAt !== null
                  ? `Paused ${utc(stream.pausedAt)}: ${stream.pausedReason === null ? 'reason not recorded' : PAUSE_REASON_LABELS[stream.pausedReason]}.`
                  : stream.stream === 'screening'
                    ? // The cut-off as the database computes it (each rate over at least a floor of sends, in the window
                      // mail_window_counts() reads), so the floor's own count of hard bounces or complaints pauses it (7
                      // and 3), not only once that many sends exist.
                      'It pauses by itself when more than 3% of its sends bounce permanently (counted over at least 200 sends, so 7 hard bounces pause it) or more than 0.08% are reported as spam (over at least 2,500, so 3 complaints pause it), within 7 days or since the last resume; on the account’s warnings; or under an SES review.'
                    : 'It never pauses: it alarms instead.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
                <dt className="text-muted-foreground">Window</dt>
                <dd>
                  Since {utc(stream.windowStartsAt)}: <span className="font-mono tabular-nums">{stream.window.sends}</span> sent, <span className="font-mono tabular-nums">{stream.window.bounces}</span> hard bounces,{' '}
                  <span className="font-mono tabular-nums">{stream.window.complaints}</span> complaints
                </dd>
                {stream.pauseCounts === null ? null : (
                  <>
                    <dt className="text-muted-foreground">When paused</dt>
                    <dd>
                      <span className="font-mono tabular-nums">{stream.pauseCounts.sends}</span> sent, <span className="font-mono tabular-nums">{stream.pauseCounts.bounces}</span> hard bounces,{' '}
                      <span className="font-mono tabular-nums">{stream.pauseCounts.complaints}</span> complaints
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Last resumed</dt>
                <dd>{utc(stream.resumedAt)}</dd>
                <dt className="text-muted-foreground">SES confirmed sending</dt>
                <dd>{utc(stream.confirmedAt)}</dd>
                <dt className="text-muted-foreground">Last probe</dt>
                <dd>
                  sent {utc(stream.probes.sentAt)}; delivered {utc(stream.probes.deliveredAt)}; bounced {utc(stream.probes.bouncedAt)}
                </dd>
                {stream.stream === 'screening' ? (
                  <>
                    <dt className="text-muted-foreground">Ready to open</dt>
                    <dd data-ready={stream.ready ? 'yes' : 'no'}>{stream.ready ? 'Yes: sending, confirmed, and both probes back within 48 hours' : 'No: staging and production keep the screening closed'}</dd>
                    <dt className="text-muted-foreground">Bounce marks (7 days)</dt>
                    <dd>
                      {/* The account a mark is on is a work address's domain or a free-mail address's mailbox (rate.ts). */}
                      <span className="font-mono tabular-nums">{stream.marks.client}</span> on clients, <span className="font-mono tabular-nums">{stream.marks.account}</span> on email domains or mailboxes (3 refuse
                      a fourth screening)
                    </dd>
                  </>
                ) : null}
              </dl>
              {stream.stream !== 'screening' ? null : stream.pausedAt === null ? (
                <ActionForm action={pauseMailStreamAction} submit="Pause the screening stream" variant="destructive">
                  <FormKeys />
                  <input type="hidden" name="stream" value="screening" />
                </ActionForm>
              ) : (
                <ActionForm action={resumeMailStreamAction} submit="Resume the screening stream" className="grid max-w-md gap-3">
                  <FormKeys />
                  <input type="hidden" name="stream" value="screening" />
                  <SelectField label="Why it can resume" id="resume-reason" name="reason" required options={[{ value: '', label: 'Choose a reason' }, ...resumeReasons]} />
                  {/* The mail_events job reads SES's enforcement every minute and pauses the stream again under a review. */}
                  <p className="text-sm text-muted-foreground" data-copy="resume-review">
                    If SES still has the account under review, the platform pauses it again within a minute.
                  </p>
                </ActionForm>
              )}
            </CardContent>
          </Card>
        );
      })}
      <Card>
        <CardHeader>
          <CardTitle>Undelivered in the last 7 days</CardTitle>
          <CardDescription>
            Each customer message SES reported undelivered, newest first; reach the customer another way (docs/runbooks/deliverability.md). Screening messages are counted by kind and state, never
            listed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {undelivered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing undelivered.</p>
          ) : (
            <ScrollTable label="Undelivered messages">
              <table className="w-full text-left text-sm" aria-label="Undelivered messages">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">When</th>
                    <th className="py-1 pr-3 font-medium">Stream</th>
                    <th className="py-1 pr-3 font-medium">Kind</th>
                    <th className="py-1 pr-3 font-medium">State</th>
                    <th className="py-1 pr-3 font-medium">Recipient</th>
                    <th className="py-1 pr-3 font-medium">Practice</th>
                    <th className="py-1 text-right font-medium">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {undelivered.map((row, index) => (
                    <tr key={`${row.stream}-${row.kind}-${row.state}-${String(index)}`} className="border-t" data-undelivered={row.stream}>
                      <td className="py-1 pr-3">{utc(row.undeliveredAt)}</td>
                      <td className="py-1 pr-3">{row.stream}</td>
                      <td className="py-1 pr-3 font-mono text-xs">{row.kind}</td>
                      <td className="py-1 pr-3">{row.state}</td>
                      <td className="py-1 pr-3">{row.recipient ?? '—'}</td>
                      <td className="py-1 pr-3">{row.practice ?? '—'}</td>
                      <td className="py-1 text-right font-mono tabular-nums">{row.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
