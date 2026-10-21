import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { caseByReferencePage } from '../../../../../lib/routes/packet-reference';
import { ReferenceSearch } from '../../../../../components/packets/reference-search';

export const metadata: Metadata = { title: 'Packet by reference' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A packet found by the reference a payer quotes (audit item #37 part 1, D5; CAS-28): the practice's approved versions
 * whose reference it is, each with its case, version, dispute level, approval date, and whether it was exported and
 * submitted. One match links to its packet; several are listed together, since a reference is not unique; none says so.
 */
export default async function ByReferencePage(props: Props) {
  const page = await loadPage(caseByReferencePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="cases" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, asked, reference, refused, matches } = page.data;
  return (
    <AppShell shell={page.shell} section="cases">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/cases`}>
          Cases
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Find a packet by its reference</h1>
        <p className="text-base text-muted-foreground">The reference is printed in each packet’s approval line and names its files; a payer quotes it back by phone or letter.</p>
      </div>
      <ReferenceSearch practiceId={practiceId} defaultValue={asked ?? ''} />
      {refused === null ? null : (
        <Alert variant="destructive" data-reference-refused>
          <AlertTitle>Not a reference</AlertTitle>
          <AlertDescription>{refused}</AlertDescription>
        </Alert>
      )}
      {reference === null ? null : (
        <Card role="region" aria-label="Packets with this reference">
          <CardHeader>
            <CardTitle>
              Reference <span className="font-mono">{reference}</span>
            </CardTitle>
            <CardDescription>
              {matches.length === 0
                ? 'No approved packet version of this practice has this reference.'
                : matches.length === 1
                  ? 'One approved packet version has this reference.'
                  : `${String(matches.length)} approved packet versions share this reference: check which one the payer means by its dispute level and date.`}
            </CardDescription>
          </CardHeader>
          {matches.length === 0 ? null : (
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm" aria-label="Matching packet versions">
                {matches.map((match) => (
                  <li key={match.versionId} data-match={match.versionId}>
                    <Link className="font-medium underline" href={`/p/${practiceId}/cases/${match.caseId}/packet?version=${match.versionId}`}>
                      Open the packet, version {match.versionNo}
                    </Link>{' '}
                    (dispute level {match.disputeLevel}, approved {match.approvedOn}; {match.exported ? 'exported' : 'not exported'}, {match.submitted ? 'submitted' : 'not submitted'}).{' '}
                    <Link className="underline" href={`/p/${practiceId}/cases/${match.caseId}`}>
                      The case
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </AppShell>
  );
}
