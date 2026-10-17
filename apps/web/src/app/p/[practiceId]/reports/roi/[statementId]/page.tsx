import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { VerifiedSeal } from '../../../../../../components/brand';
import { utc } from '../../../../../../components/format';
import { entryStage, proofLevelWords } from '../../../../../../components/reconciliation/display';
import { Money } from '../../../../../../components/remittances/display';
import { ShareLink } from '../../../../../../components/share';
import { AppShell, Forbidden } from '../../../../../../components/shell';
import { loadPage } from '../../../../../../lib/http/next';
import type { FigureView } from '../../../../../../lib/reconciliation/queries';
import { roiStatementPage } from '../../../../../../lib/routes/roi';

export const metadata: Metadata = { title: 'ROI statement' };

type Props = { readonly params: Promise<{ practiceId: string; statementId: string }> };

function Figure({
  id,
  title,
  qualifier,
  note,
  figure,
  practiceId,
  empty,
}: {
  readonly id: string;
  readonly title: string;
  /** Words shown after the title, such as the proof level a recovered figure is proved by. */
  readonly qualifier?: string;
  readonly note: string;
  readonly figure: FigureView;
  readonly practiceId: string;
  readonly empty: string;
}) {
  return (
    <Card role="region" aria-label={title} id={id}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-2">
          {title}
          {qualifier === undefined ? '' : ` ${qualifier}`}: <Money value={figure.storedCents} />
        </CardTitle>
        <CardDescription>
          {note}{' '}
          <span data-recomputed={id} data-matches={figure.matches ? 'yes' : 'no'}>
            {figure.matches ? `Recomputed from its ${String(figure.entries.length)} linked entries: ` : 'Its linked entries give '}
            <Money value={figure.recomputedCents} />
            {figure.matches ? ', the figure stored.' : ', not the figure stored.'}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {figure.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <table aria-label={`Entries of ${title.toLowerCase()}`} className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-3">Money moved</th>
                <th className="py-1 pr-3">Stage</th>
                <th className="py-1 pr-3 text-right">Amount</th>
                <th className="py-1">Entry</th>
              </tr>
            </thead>
            <tbody>
              {figure.entries.map((entry) => (
                <tr key={entry.id} className="border-b" data-entry={entry.id}>
                  <td className="py-1 pr-3">{entry.effectiveOn}</td>
                  <td className="py-1 pr-3">
                    {entryStage(entry.stage)}
                    {entry.allocated ? ' (allocated pro rata)' : ''}
                  </td>
                  <td className="py-1 pr-3 text-right">
                    <Money value={entry.amountCents} />
                  </td>
                  <td className="py-1">
                    <Link className="underline" href={`/p/${practiceId}/reconciliation?case=${entry.caseId}#entry-${entry.id}`}>
                      In its case’s ledger
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * An ROI statement (PRD 13, ROI statement: "fees paid to the product in the period; recovered
 * principal and interest, net; approved but not yet posted; actionable in open cases; pursuit hours
 * logged; the ratio of net recovered to fees. Every figure links to its entries"; test matrix LED-11):
 * each figure recomputed here from the entries it links, each entry linking to its case's ledger; the
 * proof level stated; fees as billing records them (none yet, so no ratio); its PDF, once printed, and
 * its CSV.
 */
export default async function RoiStatementPage(props: Props) {
  const page = await loadPage(roiStatementPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="reports" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, origin } = page.data;
  const path = `/p/${practiceId}/reports/roi/${detail.id}`;
  return (
    <AppShell shell={page.shell} section="reports">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/reports/roi`}>
          ROI statements
        </Link>
        <h1 className="text-2xl font-bold tracking-display">
          ROI statement, {detail.periodFrom} to {detail.periodTo}
        </h1>
        <p className="text-sm text-muted-foreground">
          {detail.quarterly ? 'The quarterly statement, written by the reconcile job' : `Generated on demand by ${detail.generatedBy ?? 'a member of the practice'}`}, {utc(detail.generatedAt)}. Recovered is{' '}
          <span data-proof-level={detail.proofLevel}>{proofLevelWords(detail.proofLevel)}</span>.
        </p>
      </div>
      {/* The seal and its definition, only when the ledger says the recovered total reconciles to cash. */}
      <VerifiedSeal reconciledToCash={detail.verified.reconciledToCash} source={detail.verified.source} className="self-end" />
      {detail.matches ? (
        <Alert data-state="recomputed">
          <AlertTitle>Recomputed from its entries</AlertTitle>
          <AlertDescription>Every figure below is the sum of the ledger entries it lists, as it was when the statement was written; an entry never changes.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive" data-state="mismatch">
          <AlertTitle>A figure is not what its entries give</AlertTitle>
          <AlertDescription>This cannot happen while the ledger is append-only; tell the operator.</AlertDescription>
        </Alert>
      )}
      <Card role="region" aria-label="Files">
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>The PDF is printed by the worker and stored sealed with the practice’s key; the CSV lists each figure and the entries it sums. Every download is audited.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p data-print={detail.print}>
            {detail.print === 'printed' ? (
              <>
                <a className="underline" href={`${path}/pdf`}>
                  PDF
                </a>{' '}
                <span className="font-mono text-xs">SHA-256 {detail.pdfSha256}</span>
              </>
            ) : detail.print === 'failed' ? (
              'The PDF could not be printed after three attempts; the operator was alerted. The figures below and the CSV stand.'
            ) : (
              'The PDF is being printed; reload in a moment.'
            )}
          </p>
          <p>
            <a className="underline" href={`${path}/csv`}>
              CSV
            </a>
          </p>
          <ShareLink href={`${origin}${path}`} />
        </CardContent>
      </Card>
      <Card role="region" aria-label="Fees paid">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            Fees paid to PaidWhole: <Money value={detail.feesCents} />
          </CardTitle>
          <CardDescription data-ratio={detail.recoveredToFees ?? 'none'}>
            {detail.recoveredToFees === null ? 'Billing records no fees paid in the period, so no ratio of recovered to fees is given.' : `Net recovered is ${detail.recoveredToFees} times the fees paid.`}
          </CardDescription>
        </CardHeader>
      </Card>
      <Figure
        id="recovered"
        title="Recovered principal, net"
        qualifier={`(${detail.proofLevel})`}
        note="Cash at the proof level whose money moved in the period, less recoupments and reversals; payer approved and interest are never in it."
        figure={detail.recovered}
        practiceId={practiceId}
        empty="No cash was recovered in the period."
      />
      <Figure id="interest" title="Interest, net" note="Interest the payer paid in the period, shown apart from principal." figure={detail.interest} practiceId={practiceId} empty="No interest was paid in the period." />
      <Figure
        id="approved-unposted"
        title="Payer approved, not yet at the proof level"
        note="Approved by the end of the period and not yet posted or deposited as the proof level needs: its own stage."
        figure={detail.approvedUnposted}
        practiceId={practiceId}
        empty="Nothing approved is waiting to be posted."
      />
      <Card role="region" aria-label="Actionable in open cases">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            Actionable in open cases: <Money value={detail.actionableOpenCents} />
          </CardTitle>
          <CardDescription>The actionable totals of the cases open when the statement was generated.</CardDescription>
        </CardHeader>
        <CardContent>
          {detail.actionableCases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No case was open.</p>
          ) : (
            <ul className="flex flex-wrap gap-3 text-sm">
              {detail.actionableCases.map((caseId) => (
                <li key={caseId}>
                  <Link className="underline" href={`/p/${practiceId}/cases/${caseId}`}>
                    Case
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card role="region" aria-label="Pursuit hours">
        <CardHeader>
          <CardTitle>Pursuit hours logged: {detail.pursuitHours}</CardTitle>
          <CardDescription>Hours the cases’ time log records for the period; no time log is kept yet.</CardDescription>
        </CardHeader>
      </Card>
    </AppShell>
  );
}
