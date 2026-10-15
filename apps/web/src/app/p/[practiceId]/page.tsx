import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { roleNames, utc, utcDate } from '../../../components/format';
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

/**
 * The practice workspace home (a PHI route: MFA, the 30-minute idle limit, private no-store, the
 * practice record read through readWithAudit). The workspace screens of PRD 7 (dashboard, uploads,
 * remittances...) arrive with their milestones.
 */
export default async function PracticePage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(practiceHome, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="practice" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practice, agreements, access, supportGrants } = page.data;
  return (
    <AppShell shell={page.shell} section="practice">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{practice.name}</h1>
        <p className="text-sm text-muted-foreground">
          You reach this practice through {VIA[access.via] ?? access.via}, as {roleNames(access.roles)}.
        </p>
      </div>
      <EmptyState
        title="No remittances or contracts loaded yet"
        nextStep="The practice's workspace fills as its billing team uploads 835 files and contracts. Uploads open once the agreement chain below is on file."
      />
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
