import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, Forbidden } from '../../../../../components/shell';
import { ReceiptList, ReceiptStatus } from '../../../../../components/uploads/receipts';
import { loadPage } from '../../../../../lib/http/next';
import { uploadDocumentPage } from '../../../../../lib/routes/uploads';
import { KIND_NAMES, type ParsedTransaction, centsText, errorPosition, errorText, formatBytes, shortId, utcMinute } from '../../../../../lib/uploads/receipt-labels';
import { pageCsrfToken } from '../../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Upload receipt' };

const OUTCOME_NAMES: Readonly<Record<ParsedTransaction['outcome'], string>> = {
  loaded: 'Loaded',
  loaded_for_review: 'Loaded, for review: its trace was used before',
  duplicate_remittance: 'Already loaded from another file',
  held: 'Held',
};

/**
 * One upload's receipt; for a zip, the batch receipt with a receipt per file in it (PAR-27); for a
 * parsed 835, its parse report: what each transaction set became, and every error with its segment
 * and position (milestone 3: "a held file shows its segment and position").
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
        <h1 className="text-2xl font-bold tracking-display">Receipt {receipt.documentId.slice(0, 8)}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{receipt.parentDocumentId === null ? 'Upload' : 'File from a zip'}</CardTitle>
          <CardDescription>Received {utcMinute(receipt.receivedAt)}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <ReceiptStatus receipt={receipt} />
            </dd>
            <dt className="text-muted-foreground">Kind</dt>
            <dd>{KIND_NAMES[receipt.kind]}</dd>
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
          <a className="mt-4 inline-block text-sm underline" href={`/p/${practiceId}/uploads/${receipt.documentId}/report`} download>
            Download the report (CSV)
          </a>
        </CardContent>
      </Card>
      {receipt.parse === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Parse report</CardTitle>
            <CardDescription>
              {receipt.parse.transactions === 1 ? '1 transaction set' : `${String(receipt.parse.transactions)} transaction sets`}, {receipt.parse.claims} claims, {receipt.parse.lines} lines,{' '}
              {receipt.parse.reversals} reversals; provider adjustments ${centsText(receipt.parse.plbTotalCents)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {receipt.parse.transactionOutcomes.length === 0 ? null : (
              <table className="w-full text-left text-sm" aria-label="Transaction sets">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Transaction set</th>
                    <th className="py-1 font-medium">Outcome</th>
                    <th className="py-1 text-right font-medium">Claims</th>
                    <th className="py-1 text-right font-medium">Lines</th>
                    <th className="py-1 font-medium">Remittance</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.parse.transactionOutcomes.map((item) => {
                    const remittance = item.remittanceId ?? item.linkedRemittanceId;
                    return (
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
                          {remittance === null ? (
                            '—'
                          ) : (
                            <Link className="underline" href={`/p/${practiceId}/remittances/${remittance}`}>
                              {shortId(remittance)}
                            </Link>
                          )}
                          {item.linkedDocumentId === null ? null : (
                            <>
                              {' '}
                              from file{' '}
                              <Link className="underline" href={`/p/${practiceId}/uploads/${item.linkedDocumentId}`}>
                                {shortId(item.linkedDocumentId)}
                              </Link>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {receipt.parse.errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No errors.</p>
            ) : (
              <table className="w-full text-left text-sm" aria-label="Errors">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Code</th>
                    <th className="py-1 font-medium">Where</th>
                    <th className="py-1 font-medium">What</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.parse.errors.map((error, index) => (
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
            {receipt.parse.unknownCodes.length === 0 ? null : <p className="text-sm">Unknown codes, loaded with a flag: {receipt.parse.unknownCodes.join(', ')}</p>}
          </CardContent>
        </Card>
      )}
      {receipt.entries === null ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Files in this zip</h2>
          <ReceiptList csrfToken={await pageCsrfToken()} practiceId={practiceId} parentId={receipt.documentId} canUpload={canUpload} title="Files in this zip" />
        </div>
      )}
    </AppShell>
  );
}
