import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { roleNames, utc, utcDate } from '../../../components/format';
import { NotificationText } from '../../../components/monitoring/display';
import { AppShell, Forbidden } from '../../../components/shell';
import { loadPage } from '../../../lib/http/next';
import { practiceHome } from '../../../lib/routes/practice';

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

const OUTCOME_NAMES: Readonly<Record<string, string>> = {
  running: 'Running',
  retrying: 'Failed; retrying',
  succeeded: 'Succeeded',
  failed: 'Failed three times',
};

/**
 * The practice workspace home (a PHI route: MFA, the 30-minute idle limit, private no-store, the
 * practice record read through readWithAudit): data freshness (the last file and the last run, and a
 * banner with the job reference when a run failed on its last attempt; test matrix JOB-02), the
 * practice record and its agreements. The rest of the dashboard of PRD 7 arrives with its milestones.
 */
export default async function PracticePage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(practiceHome, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="practice" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practice, agreements, access, supportGrants, freshness, notifications } = page.data;
  return (
    <AppShell shell={page.shell} section="practice">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{practice.name}</h1>
        <p className="text-sm text-muted-foreground">
          You reach this practice through {VIA[access.via] ?? access.via}, as {roleNames(access.roles)}.
        </p>
      </div>
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
          title="Upload your first 835 files"
          nextStep="The practice's workspace fills as its billing team uploads 835 files and contracts. Uploads open once the agreement chain below is on file."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Data freshness</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Last file</dt>
              <dd>
                {utc(freshness.lastFileAt)}{' '}
                <Link className="underline" href={`/p/${practice.id}/uploads`}>
                  (uploads)
                </Link>
              </dd>
              <dt className="text-muted-foreground">Last run</dt>
              <dd>
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
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">NPI</dt>
            <dd>{practice.npi ?? '—'}</dd>
            <dt className="text-muted-foreground">Tax ID (last four)</dt>
            <dd>{practice.taxIdLast4 ?? '—'}</dd>
            <dt className="text-muted-foreground">ZIP</dt>
            <dd>{practice.zip ?? '—'}</dd>
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
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Agreement</th>
                  <th className="py-1 font-medium">Version</th>
                  <th className="py-1 font-medium">Signer</th>
                  <th className="py-1 font-medium">Signed</th>
                  <th className="py-1 font-medium">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((agreement) => (
                  <tr key={agreement.id} className="border-t">
                    <td className="py-1">{AGREEMENT_NAMES[agreement.kind] ?? agreement.kind}</td>
                    <td className="py-1">{agreement.version}</td>
                    <td className="py-1">{agreement.signer}</td>
                    <td className="py-1">{utcDate(agreement.signedAt)}</td>
                    <td className="py-1 font-mono text-xs" title={agreement.sha256}>
                      {agreement.sha256.slice(0, 12)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
