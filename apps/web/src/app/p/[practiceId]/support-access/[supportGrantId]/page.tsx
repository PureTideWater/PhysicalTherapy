import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { utc } from '../../../../../components/format';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { supportAccessPage } from '../../../../../lib/routes/practice';

export const metadata: Metadata = { title: 'Support access' };

/**
 * One support grant and every record read under it (PRD 5, J15): what the practice administrator's
 * notices at creation and at expiry link to. From the practice's access log; administrators only.
 */
export default async function SupportAccessPage(props: { readonly params: Promise<{ practiceId: string; supportGrantId: string }> }) {
  const page = await loadPage(supportAccessPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="practice" roles={page.roles} message={page.message} nextStep="The practice's administrators read its access log." />;
  }
  const { grant, reads } = page.data;
  return (
    <AppShell shell={page.shell} section="practice">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Support access for ticket {grant.ticket}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant={grant.open ? 'default' : 'outline'}>{grant.open ? 'Open' : 'Ended'}</Badge>
            {utc(grant.createdAt)} to {utc(grant.expiresAt)}
          </CardTitle>
          <CardDescription>Reason: {grant.reason}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Expiry notice sent: {utc(grant.notifiedAt)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Records read</CardTitle>
          <CardDescription>Every read under this grant, from the access log.</CardDescription>
        </CardHeader>
        <CardContent>
          {reads.length === 0 ? (
            <EmptyState title="No records read" nextStep="Nothing of this practice was read under this grant." />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">When</th>
                  <th className="py-1 font-medium">Record type</th>
                  <th className="py-1 font-medium">Record</th>
                  <th className="py-1 font-medium">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {reads.map((read, index) => (
                  <tr key={index} className="border-t">
                    <td className="py-1">{utc(read.at)}</td>
                    <td className="py-1">{read.objectType}</td>
                    <td className="py-1 font-mono text-xs">{read.objectId ?? '—'}</td>
                    <td className="py-1">{read.purpose ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
