import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AppShell, Forbidden } from '../../../../../components/shell';
import { ReceiptList, ReceiptStatus } from '../../../../../components/uploads/receipts';
import { loadPage } from '../../../../../lib/http/next';
import { uploadDocumentPage } from '../../../../../lib/routes/uploads';
import { KIND_NAMES, formatBytes, utcMinute } from '../../../../../lib/uploads/receipt-labels';

export const metadata: Metadata = { title: 'Upload receipt' };

/** One upload's receipt; for a zip, the batch receipt with a receipt per file in it (PAR-27). */
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
        <h1 className="text-2xl font-semibold tracking-tight">Receipt {receipt.documentId.slice(0, 8)}</h1>
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
      {receipt.entries === null ? null : (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Files in this zip</h2>
          <ReceiptList practiceId={practiceId} parentId={receipt.documentId} canUpload={canUpload} title="Files in this zip" />
        </div>
      )}
    </AppShell>
  );
}
