import type { Metadata } from 'next';

import { roleNames } from '../../../../components/format';
import { AppShell, Forbidden } from '../../../../components/shell';
import { Uploader } from '../../../../components/uploads/uploader';
import { loadPage } from '../../../../lib/http/next';
import { uploadsPage } from '../../../../lib/routes/uploads';
import { KIND_NAMES } from '../../../../lib/uploads/receipt-labels';
import { pageCsrfToken } from '../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Uploads' };

/**
 * The Uploads screen (PRD 7): a drop zone for single files, batches and zips, a receipt per file with
 * its status and reason, batch progress, the error report and retry. Disabled, with the reason, until
 * the practice's BAA is on file (J1); the permission state for roles that cannot upload; the receipts'
 * own empty, loading and error states. An 835, or a practice-management system's ERA export with the
 * system it came from chosen first (CO-03; docs/adr/0060): each file of the batch is read with that
 * system's layout, and an unconfirmed layout says so before the upload. The kinds are offered by the
 * names the receipts give them (KIND_NAMES), which show whole in the drop zone at a phone's width; the
 * system's select and its help say where an ERA export comes from.
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
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Uploads</h1>
        <p className="text-base text-muted-foreground">835 remittances and ERA exports: received, scanned, parsed, balanced and loaded, or held with a reason.</p>
      </div>
      <Uploader
        csrfToken={await pageCsrfToken()}
        practiceId={data.practiceId}
        canUpload={data.canUpload}
        roleNames={roleNames(data.roles)}
        gate={data.gate}
        limits={data.limits}
        heading="Drop 835 files or ERA exports here"
        initialKind="x12_835"
        kinds={[
          { kind: 'x12_835', label: KIND_NAMES.x12_835, contentTypes: data.limits.contentTypes },
          {
            kind: 'era_export',
            label: KIND_NAMES.era_export,
            contentTypes: data.eraExport.contentTypes,
            formats: data.eraExport.formats.map((format) => ({ id: format.id, label: `${format.vendorName} ERA export`, unconfirmed: format.unconfirmed })),
          },
        ]}
      />
    </AppShell>
  );
}
