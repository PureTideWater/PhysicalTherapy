import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, cn } from '@tp/ui';
import { STAGE_LABELS } from '@tp/triage';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Figure, PricedShare } from '../../../components/coverage/share';
import { roleNames, utc, utcDate } from '../../../components/format';
import { NotificationText } from '../../../components/monitoring/display';
import { proofLevelWords, recoveredLabel } from '../../../components/reconciliation/display';
import { Money } from '../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { DEADLINE_WINDOW_DAYS, type Queues } from '../../../lib/dashboard/queries';
import { stageLinesHref } from '../../../lib/reports/links';
import { practiceHome } from '../../../lib/routes/practice';

/**
 * The dashboard's tiles (docs/brand/BRAND.md, section 7): label in Slate at 12 px, value in Plex Mono 500,
 * note in Slate; a tile is a link to the screen its figure comes from, in the foreground color.
 */
const TILE = 'flex flex-col gap-1 rounded-lg border bg-card p-4 text-fg no-underline hover:bg-accent hover:text-fg';
const TILE_LABEL = 'block text-xs font-medium text-fg-muted';
const TILE_VALUE = 'block text-2xl font-medium';
const TILE_NOTE = 'block text-xs text-fg-muted';

export const metadata: Metadata = { title: 'Practice' };

const VIA: Readonly<Record<string, string>> = {
  ownership: 'your practice group',
  grant: 'a grant the practice approved',
  support: 'a support grant (break-glass, four hours)',
  job: 'a job',
};

const AGREEMENT_NAMES: Readonly<Record<string, string>> = {
  baa: 'Business associate agreement',
  engagement: 'Engagement letter',
  terms: 'Terms',
  data_rights: 'Data-rights addendum',
  dpa: 'Data processing agreement',
};

const JOB_NAMES: Readonly<Record<string, string>> = {
  intake: 'Intake of an upload',
  parse_835: 'Parse and load of an 835',
  monitor: 'Monitoring of new files',
  price: 'Pricing run',
  triage: 'Triage',
  audit_report: 'Audit report',
  reconcile: 'Reconciliation',
  digest: 'Monthly digest',
  export: 'Export',
  packet_export: 'Packet export',
  roi_statement: 'ROI statement',
  report_document: 'Report printing',
};

/** Where to go next after a job failed three times: the screen that shows what it was doing, or the operator's replay. */
function failedNextStep(practiceId: string, jobType: string) {
  switch (jobType) {
    case 'intake':
    case 'parse_835':
      return (
        <>
          Retry it from the upload’s receipt on the{' '}
          <Link className="underline" href={`/p/${practiceId}/uploads`}>
            Uploads
          </Link>{' '}
          screen.
        </>
      );
    case 'monitor':
    case 'price':
      return (
        <>
          The month is planned again on the next upload or the next morning; its runs are on the{' '}
          <Link className="underline" href={`/p/${practiceId}/pricing-runs`}>
            Pricing runs
          </Link>{' '}
          screen.
        </>
      );
    case 'triage':
      return (
        <>
          Triage the run again from the{' '}
          <Link className="underline" href={`/p/${practiceId}/cases`}>
            Cases
          </Link>{' '}
          screen.
        </>
      );
    case 'audit_report':
    case 'roi_statement':
    case 'report_document':
      return (
        <>
          Request the report again from the{' '}
          <Link className="underline" href={`/p/${practiceId}/reports`}>
            Reports
          </Link>{' '}
          screen.
        </>
      );
    default:
      return <>The operator replays it with the same key; nothing it did is repeated.</>;
  }
}

const CASE_STATE_TEXT: Readonly<Record<string, string>> = {
  open: 'open',
  submitted: 'submitted',
  awaiting_response: 'awaiting a response',
  partially_resolved: 'partially resolved',
  resolved: 'resolved',
  closed_written_off: 'closed, written off',
};

/** The queues the dashboard jumps to (PRD 7, Practice dashboard: "jump to any queue"), each with its count and the screen it is worked on. */
function queueLinks(practiceId: string, queues: Queues, followUpsDue: number): readonly { readonly key: string; readonly label: string; readonly count: number; readonly href: string }[] {
  return [
    { key: 'held-files', label: 'Files held or failed at intake', count: queues.heldFiles, href: `/p/${practiceId}/uploads` },
    { key: 'plans-waiting', label: 'Plans waiting on a mapping', count: queues.plansWaiting, href: `/p/${practiceId}/mapping` },
    { key: 'questions', label: 'The contract specialist’s open questions', count: queues.openQuestions, href: `/p/${practiceId}/contracts` },
    { key: 'anomalies', label: 'Anomaly cohorts to review (investigatory)', count: queues.anomaliesToReview, href: `/p/${practiceId}/anomalies` },
    { key: 'unassigned', label: 'Cases with no owner', count: queues.unassignedCases, href: `/p/${practiceId}/cases?owner=none` },
    { key: 'follow-ups', label: 'Follow-ups overdue', count: followUpsDue, href: `/p/${practiceId}/cases` },
    { key: 'unmatched', label: 'Payments, postings and deposits matching nothing', count: queues.unmatched, href: `/p/${practiceId}/reconciliation` },
  ];
}

const OUTCOME_NAMES: Readonly<Record<string, string>> = {
  running: 'Running',
  retrying: 'Failed; retrying',
  succeeded: 'Succeeded',
  failed: 'Failed three times',
  refused: 'Refused: the organization is suspended',
};

/**
 * The practice dashboard (PRD 7, Practice dashboard; PRD 12, What a customer sees as the headline; a
 * PHI route: MFA, the 30-minute idle limit, private no-store, the practice record read through
 * readWithAudit): the headline's three numbers (actionable, payer approved, recovered) with flagged and
 * validated below them, data freshness (the last file and the last run, and a banner with the job
 * reference when a run failed on its last attempt; test matrix JOB-02), coverage, cases by stage,
 * deadlines in 14 days, overdue follow-ups, recovered this quarter (stage five only), the queues to jump
 * to, the practice record and its agreements. Every number links to the screen and stage it came from;
 * before the first file, the empty state says to upload it.
 */
export default async function PracticePage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(practiceHome, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="practice" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practice, agreements, access, supportGrants, freshness, dashboard, notifications, suspension } = page.data;
  return (
    <AppShell shell={page.shell} section="practice">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">{practice.name}</h1>
        <p className="text-base text-muted-foreground">
          You reach this practice through {VIA[access.via] ?? access.via}, as {roleNames(access.roles)}.
        </p>
      </div>
      {suspension === null ? null : (
        <Alert variant="destructive" data-notice="suspended" role="alert">
          <AlertTitle>New runs have stopped</AlertTitle>
          <AlertDescription>
            {suspension[0]?.toUpperCase()}
            {suspension.slice(1)}. Everything here stays readable; uploads, pricing runs, monitoring, packet exports and reports start again once it is resolved. The organization&apos;s administrator sees why in Settings, Billing.
          </AlertDescription>
        </Alert>
      )}
      {freshness.failedRun === null ? null : (
        <Alert variant="destructive" data-job={freshness.failedRun.jobId}>
          <AlertTitle>Last run failed</AlertTitle>
          <AlertDescription>
            {JOB_NAMES[freshness.failedRun.jobType] ?? freshness.failedRun.jobType} failed three times on {utc(freshness.failedRun.finishedAt)}. The operator has been alerted (job reference{' '}
            <span className="font-mono">{freshness.failedRun.jobId.slice(0, 8)}</span>). {failedNextStep(practice.id, freshness.failedRun.jobType)}
          </AlertDescription>
        </Alert>
      )}
      {freshness.lastFileAt === null ? (
        <EmptyState
          mark
          title="Upload your first 835 files"
          nextStep="The practice's workspace fills as its billing team uploads 835 files and contracts: each file's receipt follows it from received to loaded, and the dashboard counts what it finds here. Uploads open once the agreement chain below is on file."
          action={
            <Link className="text-sm underline" href={`/p/${practice.id}/uploads`}>
              Go to Uploads
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="Headline" className="flex flex-col gap-3">
            <h2 className="text-xl font-bold tracking-display">The headline</h2>
            <p className="text-sm text-muted-foreground">Three numbers, never one: each is its own stage, and none is added to another. Each opens the screen it comes from.</p>
            <div className="grid gap-3 sm:grid-cols-3" data-slot="tile-row">
              <Link href={`/p/${practice.id}/cases`} className={TILE} data-figure="actionable">
                <span className={TILE_LABEL}>{STAGE_LABELS.actionable}</span>
                <span className={TILE_VALUE}>
                  <Money value={dashboard.headline.actionable.cents} />
                </span>
                <span className={TILE_NOTE}>
                  what the packets ask for: {dashboard.headline.actionable.lines} {dashboard.headline.actionable.lines === 1 ? 'line' : 'lines'} in cases still being worked
                </span>
              </Link>
              <Link href={`/p/${practice.id}/reconciliation`} className={TILE} data-figure="payer-approved">
                <span className={TILE_LABEL}>{STAGE_LABELS.payer_approved}</span>
                <span className={TILE_VALUE}>
                  <Money value={dashboard.headline.payerApprovedCents} />
                </span>
                <span className={TILE_NOTE}>what payers have agreed to pay on the lines they corrected, from the recovery ledger; not cash until it posts</span>
              </Link>
              <Link href={`/p/${practice.id}/reconciliation`} className={cn(TILE, 'border-border-strong')} data-figure="recovered-total">
                <span className={TILE_LABEL}>{recoveredLabel(dashboard.headline.proofLevel)}</span>
                <span className={TILE_VALUE}>
                  <Money value={dashboard.headline.recoveredCents} />
                </span>
                <span className={TILE_NOTE}>stage five: cash {proofLevelWords(dashboard.headline.proofLevel)}, net of recoupments and reversals</span>
              </Link>
            </div>
            <ul className="flex flex-col gap-1 text-sm" aria-label="Below the headline">
              <li data-figure="flagged">
                <Link className="underline" href={stageLinesHref(practice.id, 'flagged')}>
                  {STAGE_LABELS.flagged}
                </Link>
                : {dashboard.headline.flagged.lines} {dashboard.headline.flagged.lines === 1 ? 'line' : 'lines'} short of their cohort; a count, never a claim, and in no total (
                <Link className="underline" href={`/p/${practice.id}/anomalies`}>
                  Anomalies
                </Link>
                ).
              </li>
              <li data-figure="validated">
                <Link className="underline" href={stageLinesHref(practice.id, 'validated')}>
                  {STAGE_LABELS.validated}
                </Link>
                : <Money value={dashboard.headline.validated.cents} /> across {dashboard.headline.validated.lines} {dashboard.headline.validated.lines === 1 ? 'line' : 'lines'} priced under signed-off terms and paid below them, not actionable (below a materiality, past its window, or waiting for its case).
              </li>
            </ul>
          </section>
          <Card role="region" aria-label="Data freshness">
            <CardHeader>
              <CardTitle>Data freshness</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
                <dt className="text-muted-foreground">Last file</dt>
                <dd data-figure="last-file">
                  {utc(freshness.lastFileAt)}{' '}
                  <Link className="underline" href={`/p/${practice.id}/uploads`}>
                    (uploads)
                  </Link>
                </dd>
                <dt className="text-muted-foreground">Last run</dt>
                <dd data-figure="last-run">
                  {freshness.lastRun === null ? (
                    '—'
                  ) : (
                    <>
                      {JOB_NAMES[freshness.lastRun.jobType] ?? freshness.lastRun.jobType}, {utc(freshness.lastRun.finishedAt ?? freshness.lastRun.startedAt)}:{' '}
                      <Badge variant={freshness.lastRun.outcome === 'failed' ? 'destructive' : freshness.lastRun.outcome === 'succeeded' ? 'default' : 'secondary'} data-outcome={freshness.lastRun.outcome}>
                        {OUTCOME_NAMES[freshness.lastRun.outcome] ?? freshness.lastRun.outcome}
                      </Badge>
                    </>
                  )}
                </dd>
              </dl>
              <div className="mt-4 flex gap-4 text-sm">
                <Link className="underline" href={`/p/${practice.id}/remittances`}>
                  Remittances
                </Link>
                <Link className="underline" href={`/p/${practice.id}/claims`}>
                  Claims and lines
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Dashboard">
            <CardHeader>
              <CardTitle>Where things stand</CardTitle>
              <CardDescription>Counts and dollar totals, each at its own stage; each opens the screen it counts.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Coverage</dt>
                <dd data-figure="coverage">
                  {dashboard.coverage === null ? (
                    <>
                      No pricing run in effect yet.{' '}
                      <Link className="underline" href={`/p/${practice.id}/pricing-runs`}>
                        Pricing runs
                      </Link>
                    </>
                  ) : (
                    <Link className="underline" href={`/p/${practice.id}/coverage`}>
                      <PricedShare
                        priced={{ lines: dashboard.coverage.pricedLines, chargeCents: dashboard.coverage.pricedChargeCents }}
                        of={{ lines: dashboard.coverage.lines, chargeCents: dashboard.coverage.chargeCents }}
                      />
                      , each line at its pricing in effect, across <Figure>{dashboard.coverage.runs}</Figure> {dashboard.coverage.runs === 1 ? 'run' : 'runs'} in effect (service{' '}
                      {dashboard.coverage.periodFrom} to {dashboard.coverage.periodTo})
                    </Link>
                  )}
                </dd>
                <dt className="text-muted-foreground">Cases by stage</dt>
                <dd data-figure="cases">
                  {dashboard.casesByState.length === 0 ? (
                    'No case yet.'
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {dashboard.casesByState.map((entry) => (
                        <li key={entry.state} data-state={entry.state}>
                          <Link className="underline" href={`/p/${practice.id}/cases?state=${entry.state}`}>
                            {entry.cases} {CASE_STATE_TEXT[entry.state] ?? entry.state}
                          </Link>
                          {entry.actionableCents === '0' ? null : (
                            <>
                              , <Money value={entry.actionableCents} /> {STAGE_LABELS.actionable.toLowerCase()}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
                <dt className="text-muted-foreground">Deadlines in {DEADLINE_WINDOW_DAYS} days</dt>
                <dd data-figure="deadlines">
                  {dashboard.deadlines.cases === 0 ? (
                    'No deadline of a case still being worked falls in the next 14 days.'
                  ) : (
                    <Link className="underline" href={`/p/${practice.id}/cases?deadline=${String(DEADLINE_WINDOW_DAYS)}`}>
                      {dashboard.deadlines.cases} {dashboard.deadlines.cases === 1 ? 'case' : 'cases'}, <Money value={dashboard.deadlines.actionableCents} /> actionable, the first on {dashboard.deadlines.earliest}
                    </Link>
                  )}
                </dd>
                <dt className="text-muted-foreground">Follow-ups overdue</dt>
                <dd data-figure="follow-ups">
                  {dashboard.followUps.due === 0 ? (
                    'No submission is waiting past its follow-up date.'
                  ) : (
                    <>
                      {dashboard.followUps.due} {dashboard.followUps.due === 1 ? 'case has' : 'cases have'} a submission the payer has not answered by its follow-up date, the first due {dashboard.followUps.earliest}:{' '}
                      {dashboard.followUps.first.map((item, index) => (
                        <span key={item.caseId}>
                          {index === 0 ? '' : ', '}
                          <Link className="underline" href={`/p/${practice.id}/cases/${item.caseId}/submissions`}>
                            due {item.followUpOn}
                          </Link>
                        </span>
                      ))}
                      .
                    </>
                  )}
                </dd>
                <dt className="text-muted-foreground">{recoveredLabel(dashboard.headline.proofLevel)} this quarter</dt>
                <dd data-figure="recovered">
                  <Link className="underline" href={`/p/${practice.id}/reconciliation`}>
                    <Money value={dashboard.recoveredQuarter.cents} />
                  </Link>{' '}
                  ({dashboard.recoveredQuarter.quarter}, {dashboard.recoveredQuarter.from} to {dashboard.recoveredQuarter.to}: stage five only, cash {proofLevelWords(dashboard.headline.proofLevel)}, net of recoupments and reversals, from the
                  recovery ledger)
                </dd>
              </dl>
            </CardContent>
          </Card>
          <Card role="region" aria-label="Queues">
            <CardHeader>
              <CardTitle>Queues</CardTitle>
              <CardDescription>What waits for a person, by the screen it is done on.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm sm:grid-cols-2" aria-label="Jump to a queue">
                {queueLinks(practice.id, dashboard.queues, dashboard.followUps.due).map((queue) => (
                  <li key={queue.key} data-queue={queue.key} data-count={queue.count}>
                    <Link className="underline" href={queue.href}>
                      {queue.label}
                    </Link>
                    : {queue.count}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
      {notifications.latest.length === 0 ? null : (
        <Card role="region" aria-label="Notifications">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              {notifications.unread === 0 ? 'Nothing new.' : `${String(notifications.unread)} new.`} What monitoring found, as counts and dollar totals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {notifications.latest.map((notification) => (
                <li key={notification.id} data-kind={notification.kind}>
                  <NotificationText practiceId={practice.id} notification={notification} />
                </li>
              ))}
            </ul>
            <Link className="mt-3 inline-block text-sm underline" href={`/p/${practice.id}/notifications`}>
              All notifications
            </Link>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Practice record</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">NPI</dt>
            <dd>{practice.npi ?? '—'}</dd>
            <dt className="text-muted-foreground">Tax ID (last four)</dt>
            <dd>{practice.taxIdLast4 ?? '—'}</dd>
            <dt className="text-muted-foreground">Billing ZIP</dt>
            <dd className="font-mono tabular-nums" data-location-zip>
              {practice.zip === null ? '—' : practice.zipPlusFour === null ? practice.zip : `${practice.zip}-${practice.zipPlusFour}`}
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{practice.status}</dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Agreements</CardTitle>
          <CardDescription>The signed documents this practice's data rests on, stored by reference and SHA-256.</CardDescription>
        </CardHeader>
        <CardContent>
          {agreements.length === 0 ? (
            <EmptyState title="No agreements on file" nextStep="A platform administrator records the signed BAA and engagement letter. Nothing can be uploaded until they exist." />
          ) : (
            // Its own scroller at a phone's width: the page never scrolls sideways.
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm" aria-label="Agreements">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Agreement</th>
                    <th className="py-1 pr-3 font-medium">Version</th>
                    <th className="py-1 pr-3 font-medium">Signer</th>
                    <th className="py-1 pr-3 font-medium">Signed</th>
                    <th className="py-1 font-medium">SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.map((agreement) => (
                    <tr key={agreement.id} className="border-t align-top">
                      <td className="py-1 pr-3">{AGREEMENT_NAMES[agreement.kind] ?? agreement.kind}</td>
                      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">{agreement.version}</td>
                      <td className="py-1 pr-3">{agreement.signer}</td>
                      <td className="py-1 pr-3 font-mono text-xs whitespace-nowrap">{utcDate(agreement.signedAt)}</td>
                      <td className="py-1 font-mono text-xs whitespace-nowrap" title={agreement.sha256}>
                        {agreement.sha256.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {supportGrants === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Support access</CardTitle>
            <CardDescription>Break-glass grants to company support for one ticket, four hours at most, with every record read under each.</CardDescription>
          </CardHeader>
          <CardContent>
            {supportGrants.length === 0 ? (
              <EmptyState title="No support access" nextStep="Support can reach this practice only through a grant from a ticket. You are notified when one opens and when it ends." />
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Support grants">
                {supportGrants.map((grant) => (
                  <li key={grant.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant={grant.open ? 'default' : 'outline'}>{grant.open ? 'Open' : 'Ended'}</Badge>
                    <span>Ticket {grant.ticket}</span>
                    <span className="text-muted-foreground">
                      {utc(grant.createdAt)} to {utc(grant.expiresAt)}
                    </span>
                    <Link className="underline" href={`/p/${practice.id}/support-access/${grant.id}`}>
                      Records read
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
