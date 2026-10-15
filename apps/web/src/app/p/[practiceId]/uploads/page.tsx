import type { Metadata } from 'next';

import { roleNames } from '../../../../components/format';
import { AppShell, Forbidden } from '../../../../components/shell';
import { Uploader } from '../../../../components/uploads/uploader';
import { loadPage } from '../../../../lib/http/next';
import { uploadsPage } from '../../../../lib/routes/uploads';

export const metadata: Metadata = { title: 'Uploads' };

/**
 * The Uploads screen (PRD 7): a drop zone for single files, batches and zips, a receipt per file with
 * its status and reason, batch progress, the error report and retry. Disabled, with the reason, until
 * the practice's BAA is on file (J1); the permission state for roles that cannot upload; the receipts'
 * own empty, loading and error states.
 */
export default async function UploadsPage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(uploadsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="uploads" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const data = page.data;
  return (
    <AppShell shell={page.shell} section="uploads">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Uploads</h1>
        <p className="text-sm text-muted-foreground">835 remittances: received, scanned, parsed, balanced and loaded, or held with a reason.</p>
      </div>
      <Uploader practiceId={data.practiceId} canUpload={data.canUpload} roleNames={roleNames(data.roles)} gate={data.gate} limits={data.limits} />
    </AppShell>
  );
}
