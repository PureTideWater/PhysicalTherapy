import type { ExportAwaitingAttestation } from '@tp/worker/packets';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { utc } from '../../../../components/format';
import { Hash } from '../../../../components/packets/display';
import { Money } from '../../../../components/remittances/display';
import { ScrollTable } from '../../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../../components/shell';
import { StatusChip } from '../../../../components/status';
import { loadPage } from '../../../../lib/http/next';
import { NEVER_ATTESTED_LIST } from '../../../../lib/packets/unattested';
import { packetReviewsPage } from '../../../../lib/routes/packets';

export const metadata: Metadata = { title: 'Packets to attest' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** One export's row: the packet and its review, when it was exported, its lines and variance, the deadline it is filed against and its PDF's SHA-256. */
function ExportRow({ practiceId, entry }: { readonly practiceId: string; readonly entry: ExportAwaitingAttestation }) {
  return (
    <tr className="border-b align-top last:border-0" data-awaiting={entry.versionId} data-never-attested={entry.neverAttested ? 'true' : 'false'}>
      <td className="px-2 py-1">
        <Link className="underline" href={`/p/${practiceId}/cases/${entry.caseId}/packet/${entry.versionId}/review`}>
          {entry.payerName}, version {entry.versionNo}
        </Link>
        , dispute level <span className="font-mono tabular-nums">{entry.disputeLevel}</span>
        {entry.neverAttested ? (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <StatusChip tone="danger">{NEVER_ATTESTED_LIST.mark}</StatusChip>
          </span>
        ) : null}
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
  );
}

function ExportTable({ label, practiceId, entries }: { readonly label: string; readonly practiceId: string; readonly entries: readonly ExportAwaitingAttestation[] }) {
  return (
    <ScrollTable label={label}>
      <table className="w-full min-w-[48rem] text-sm" aria-label={label}>
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
          {entries.map((entry) => (
            <ExportRow key={entry.versionId} practiceId={practiceId} entry={entry} />
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

/**
 * The packets waiting for the reimbursement reviewer's attestation (D16; docs/adr/0061): each open case's current
 * packet version, exported and not attested yet, oldest first, with its files' SHA-256 and the deadline it is filed
 * against. The reviewer opens each to review and attest it. An export whose pricing went stale after it was made is
 * never attested (the founder's ruling of 2026-10-20), so it is listed apart, marked so, until the practice logs it
 * as sent without sign-off or replaces it: it is never shown as work waiting. Counts, dates, amounts and opaque IDs
 * only.
 */
export default async function PacketReviewsPage(props: Props) {
  const page = await loadPage(packetReviewsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="packet_reviews" roles={page.roles} message={page.message} nextStep="A reimbursement reviewer attests packets under a support grant." />;
  }
  const { practiceId, awaiting } = page.data;
  const waiting = awaiting.filter((entry) => !entry.neverAttested);
  const never = awaiting.filter((entry) => entry.neverAttested);
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
          {waiting.length === 0 ? (
            <EmptyState title="No export is waiting" nextStep={never.length === 0 ? 'An exported packet appears here until it is attested.' : NEVER_ATTESTED_LIST.emptyWithNever} />
          ) : (
            <ExportTable label="Exports waiting" practiceId={practiceId} entries={waiting} />
          )}
        </CardContent>
      </Card>
      {never.length === 0 ? null : (
        <Card role="region" aria-label={NEVER_ATTESTED_LIST.title}>
          <CardHeader>
            <CardTitle>{NEVER_ATTESTED_LIST.title}</CardTitle>
            <CardDescription>{NEVER_ATTESTED_LIST.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportTable label={NEVER_ATTESTED_LIST.title} practiceId={practiceId} entries={never} />
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
