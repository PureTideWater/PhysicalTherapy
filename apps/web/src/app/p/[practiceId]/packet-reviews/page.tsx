import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../../components/format';
import { Hash } from '../../../../components/packets/display';
import { Money } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { packetReviewsPage } from '../../../../lib/routes/packets';

export const metadata: Metadata = { title: 'Packets to attest' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The packets waiting for the reimbursement reviewer's attestation (D16; docs/adr/0061): each case's
 * current packet version, exported and not attested yet, oldest first, with its files' SHA-256 and the
 * deadline it is filed against. The reviewer opens each to review and attest it. Counts, dates, amounts
 * and opaque IDs only.
 */
export default async function PacketReviewsPage(props: Props) {
  const page = await loadPage(packetReviewsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="packet_reviews" roles={page.roles} message={page.message} nextStep="A reimbursement reviewer attests packets under a support grant." />;
  }
  const { practiceId, awaiting } = page.data;
  return (
    <AppShell shell={page.shell} section="packet_reviews">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Packets to attest</h1>
        <p className="text-base text-muted-foreground">Each exported packet is attested over its PDF’s and CSV’s SHA-256 before the practice logs its submission. You attest none you drafted, wrote or approved.</p>
      </div>
      <Card role="region" aria-label="Exports waiting">
        <CardHeader>
          <CardTitle>Exports waiting for an attestation</CardTitle>
          <CardDescription>Oldest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {awaiting.length === 0 ? (
            <EmptyState title="No export is waiting" nextStep="An exported packet appears here until it is attested." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Exports waiting">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-1 font-medium">Packet</th>
                    <th className="px-2 py-1 font-medium">Exported</th>
                    <th className="px-2 py-1 font-medium">Lines, variance</th>
                    <th className="px-2 py-1 font-medium">File by</th>
                    <th className="px-2 py-1 font-medium">PDF SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {awaiting.map((entry) => (
                    <tr key={entry.versionId} className="border-b align-top last:border-0" data-awaiting={entry.versionId}>
                      <td className="px-2 py-1">
                        <Link className="underline" href={`/p/${practiceId}/cases/${entry.caseId}/packet/${entry.versionId}/review`}>
                          {entry.payerName}, version {entry.versionNo}
                        </Link>
                        , dispute level <span className="font-mono tabular-nums">{entry.disputeLevel}</span>
                      </td>
                      <td className="px-2 py-1">{utc(entry.exportedAt.toISOString())}</td>
                      <td className="px-2 py-1">
                        <span className="font-mono tabular-nums">{entry.lines}</span>, <Money value={entry.varianceCents.toString()} />
                      </td>
                      <td className="px-2 py-1 font-mono tabular-nums">{entry.deadlineEndsOn ?? '—'}</td>
                      <td className="px-2 py-1">
                        <Hash value={entry.exportSha256} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
