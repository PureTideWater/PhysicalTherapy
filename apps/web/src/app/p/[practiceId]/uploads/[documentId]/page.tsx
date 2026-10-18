import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, Forbidden } from '../../../../../components/shell';
import { FormatUnconfirmedBadge } from '../../../../../components/uploads/format-flag';
import { ReceiptList, ReceiptStatus } from '../../../../../components/uploads/receipts';
import { unconfirmedFormatExplanation } from '../../../../../lib/contracts/format-sources';
import { loadPage } from '../../../../../lib/http/next';
import { uploadDocumentPage } from '../../../../../lib/routes/uploads';
import {
  EXPORT_REMEDIES,
  type ExportParseSummary,
  type ExportPayment,
  type ParsedTransaction,
  type Provenance,
  type X12ParseSummary,
  centsText,
  documentName,
  errorPosition,
  errorText,
  exportErrorPosition,
  exportErrorText,
  formatBytes,
  shortId,
  utcMinute,
} from '../../../../../lib/uploads/receipt-labels';
import { pageCsrfToken } from '../../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Upload receipt' };

const OUTCOME_NAMES: Readonly<Record<ParsedTransaction['outcome'], string>> = {
  loaded: 'Loaded',
  loaded_for_review: 'Loaded, for review: its trace was used before',
  duplicate_remittance: 'Already loaded from another file',
  held: 'Held',
  held_for_review: 'Held for review: this payment was already loaded from an ERA export, so nothing of it loads beside it',
};

const PAYMENT_OUTCOME_NAMES: Readonly<Record<ExportPayment['outcome'], string>> = {
  loaded: 'Loaded',
  loaded_for_review: 'Loaded, for review: its trace was used before',
  duplicate_remittance: 'Already loaded, so nothing of it loads again',
  held: 'Held',
};

/** What a linked remittance was loaded from, for the link's words. */
const SOURCE_NAMES: Readonly<Record<Provenance, string>> = { x12_835: '835 file', era_export: 'ERA export file' };

/** The remittance a transaction set or payment loaded, repeats or is held against, and the file it came from. */
function RemittanceLinks(props: { readonly practiceId: string; readonly remittanceId: string | null; readonly documentId: string | null; readonly provenance: Provenance | null }) {
  const { practiceId, remittanceId, documentId, provenance } = props;
  return (
    <>
      {remittanceId === null ? (
        '—'
      ) : (
        <Link className="underline" href={`/p/${practiceId}/remittances/${remittanceId}`}>
          {shortId(remittanceId)}
        </Link>
      )}
      {documentId === null ? null : (
        <>
          {' '}
          from {provenance === null ? 'file' : SOURCE_NAMES[provenance]}{' '}
          <Link className="underline" href={`/p/${practiceId}/uploads/${documentId}`}>
            {shortId(documentId)}
          </Link>
        </>
      )}
    </>
  );
}

/** An 835's parse report: what each transaction set became, and every error with its segment and position. */
function X12Report({ practiceId, parse }: { readonly practiceId: string; readonly parse: X12ParseSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parse report</CardTitle>
        <CardDescription>
          {parse.transactions === 1 ? '1 transaction set' : `${String(parse.transactions)} transaction sets`}, {parse.claims} claims, {parse.lines} lines, {parse.reversals} reversals; provider
          adjustments ${centsText(parse.plbTotalCents)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {parse.transactionOutcomes.length === 0 ? null : (
          <table className="w-full text-left text-sm" aria-label="Transaction sets">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Transaction set</th>
                <th className="py-1 pr-3 font-medium">Outcome</th>
                <th className="py-1 pr-3 text-right font-medium">Claims</th>
                <th className="py-1 pr-3 text-right font-medium">Lines</th>
                <th className="py-1 font-medium">Remittance</th>
              </tr>
            </thead>
            <tbody>
              {parse.transactionOutcomes.map((item) => (
                <tr key={`${String(item.interchange)}:${String(item.group)}:${String(item.transaction)}`} className="border-t" data-outcome={item.outcome}>
                  <td className="py-1 pr-3 font-mono text-xs">
                    ST02 {item.st02} (segment {item.segmentIndex})
                  </td>
                  <td className="py-1 pr-3">
                    {OUTCOME_NAMES[item.outcome]}
                    {item.reasons.length === 0 ? '' : ` (${item.reasons.join(', ')})`}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{item.claims}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{item.lines}</td>
                  <td className="py-1 font-mono text-xs">
                    <RemittanceLinks practiceId={practiceId} remittanceId={item.remittanceId ?? item.linkedRemittanceId} documentId={item.linkedDocumentId} provenance={item.linkedProvenance ?? null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parse.errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No errors.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Errors">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Code</th>
                <th className="py-1 pr-3 font-medium">Where</th>
                <th className="py-1 font-medium">What</th>
              </tr>
            </thead>
            <tbody>
              {parse.errors.map((error, index) => (
                <tr key={index} className="border-t" data-code={error.code}>
                  <td className="py-1 pr-3 font-mono text-xs">{error.code}</td>
                  <td className="py-1 pr-3">
                    {errorPosition(error)}
                    {error.transaction === undefined ? '' : ` (ST02 ${error.transaction.st02})`}
                  </td>
                  <td className="py-1">{errorText(error)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parse.unknownCodes.length === 0 ? null : <p className="text-sm">Unknown codes, loaded with a flag: {parse.unknownCodes.join(', ')}</p>}
      </CardContent>
    </Card>
  );
}

/** An ERA export's parse report: what each payment became, and every hold by its column header and row, with what to do. */
function ExportReport({ practiceId, parse }: { readonly practiceId: string; readonly parse: ExportParseSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parse report</CardTitle>
        <CardDescription>
          {parse.transactions === 1 ? '1 payment' : `${String(parse.transactions)} payments`}, {parse.claims} claims, {parse.lines} lines, {parse.reversals} reversals.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {parse.transactionOutcomes.length === 0 ? null : (
          <table className="w-full text-left text-sm" aria-label="Payments">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Payment</th>
                <th className="py-1 pr-3 font-medium">Outcome</th>
                <th className="py-1 pr-3 text-right font-medium">Claims</th>
                <th className="py-1 pr-3 text-right font-medium">Lines</th>
                <th className="py-1 font-medium">Remittance</th>
              </tr>
            </thead>
            <tbody>
              {parse.transactionOutcomes.map((item) => (
                <tr key={item.payment} className="border-t" data-outcome={item.outcome}>
                  <td className="py-1 pr-3">
                    <span className="font-mono tabular-nums">{item.payment}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      ({item.rows === 1 ? `row ${String(item.firstRow)}` : `rows ${String(item.firstRow)} to ${String(item.firstRow + item.rows - 1)}`} below the header)
                    </span>
                  </td>
                  <td className="py-1 pr-3">
                    {PAYMENT_OUTCOME_NAMES[item.outcome]}
                    {item.reasons.length === 0 ? '' : ` (${item.reasons.join(', ')})`}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{item.claims}</td>
                  <td className="py-1 pr-3 text-right font-mono tabular-nums">{item.lines}</td>
                  <td className="py-1 font-mono text-xs">
                    <RemittanceLinks practiceId={practiceId} remittanceId={item.remittanceId ?? item.linkedRemittanceId} documentId={item.linkedDocumentId} provenance={item.linkedProvenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parse.errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing held.</p>
        ) : (
          <table className="w-full text-left text-sm" aria-label="Holds">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Reason</th>
                <th className="py-1 pr-3 font-medium">Where</th>
                <th className="py-1 font-medium">What, and what to do</th>
              </tr>
            </thead>
            <tbody>
              {parse.errors.map((error, index) => (
                <tr key={index} className="border-t align-top" data-reason={error.reason}>
                  <td className="py-1 pr-3 font-mono text-xs">{error.reason}</td>
                  <td className="py-1 pr-3">{exportErrorPosition(error)}</td>
                  <td className="py-1">
                    {exportErrorText(error)} {EXPORT_REMEDIES[error.reason]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {parse.unknownCodes.length === 0 ? null : <p className="text-sm">Unknown codes, loaded with a flag: {parse.unknownCodes.join(', ')}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * One upload's receipt; for a zip, the batch receipt with a receipt per file in it (PAR-27); for a
 * parsed 835, its parse report: what each transaction set became, and every error with its segment
 * and position (milestone 3: "a held file shows its segment and position"); for an ERA export, what
 * each payment became and every hold by its column and row, its format named and, while the format is
 * unconfirmed, flagged (docs/adr/0060).
 */
export default async function UploadDocumentPage(props: { readonly params: Promise<{ practiceId: string; documentId: string }> }) {
  const page = await loadPage(uploadDocumentPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="uploads" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, receipt, canUpload } = page.data;
  return (
    <AppShell shell={page.shell} section="uploads">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/uploads`}>
          Uploads
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Receipt {receipt.documentId.slice(0, 8)}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{receipt.parentDocumentId === null ? 'Upload' : 'File from a zip'}</CardTitle>
          <CardDescription>Received {utcMinute(receipt.receivedAt)}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <ReceiptStatus receipt={receipt} />
            </dd>
            <dt className="text-muted-foreground">Kind</dt>
            <dd>{documentName(receipt)}</dd>
            <dt className="text-muted-foreground">Size</dt>
            <dd>{formatBytes(Number(receipt.sizeBytes))}</dd>
            <dt className="text-muted-foreground">SHA-256</dt>
            <dd className="font-mono text-xs break-all">{receipt.sha256 ?? 'Computed once the file is scanned'}</dd>
            <dt className="text-muted-foreground">Document</dt>
            <dd className="font-mono text-xs">{receipt.documentId}</dd>
            {receipt.parentDocumentId === null ? null : (
              <>
                <dt className="text-muted-foreground">Zip</dt>
                <dd>
                  <Link className="font-mono text-xs underline" href={`/p/${practiceId}/uploads/${receipt.parentDocumentId}`}>
                    {receipt.parentDocumentId}
                  </Link>
                </dd>
              </>
            )}
          </dl>
          {receipt.format?.unconfirmed === true ? (
            <div className="mt-4 flex flex-col gap-1 text-sm" role="note" aria-label="Format unconfirmed" data-format={receipt.format.id}>
              <FormatUnconfirmedBadge />
              <p className="text-muted-foreground">{unconfirmedFormatExplanation(receipt.format.name)}</p>
            </div>
          ) : null}
          <a className="mt-4 inline-block text-sm underline" href={`/p/${practiceId}/uploads/${receipt.documentId}/report`} download>
            Download the report (CSV)
          </a>
        </CardContent>
      </Card>
      {receipt.parse === null ? null : receipt.parse.source === 'era_export' ? (
        <ExportReport practiceId={practiceId} parse={receipt.parse} />
      ) : (
        <X12Report practiceId={practiceId} parse={receipt.parse} />
      )}
      {receipt.entries === null ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold tracking-display">Files in this zip</h2>
          <ReceiptList csrfToken={await pageCsrfToken()} practiceId={practiceId} parentId={receipt.documentId} canUpload={canUpload} title="Files in this zip" />
        </div>
      )}
    </AppShell>
  );
}
