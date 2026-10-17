import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { dataSettingsPage } from '../../../../../lib/routes/settings';

export const metadata: Metadata = { title: 'Export and deletion' };

/**
 * Export and deletion (PRD 5, J14; PRD 7, Settings): a placeholder, said plainly. The workflows (the encrypted
 * export archive, deletion under the retention policy with legal holds, key destruction and a certificate) are
 * milestone 12's; until then a request goes through support and the security official handles it by hand under
 * the data retention policy.
 */
export default async function DataSettingsPage(props: { readonly params: Promise<{ practiceId: string }> }) {
  const page = await loadPage(dataSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, canRequestExport, canRequestDeletion } = page.data;
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Export and deletion</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="data" />
      <Card data-placeholder="milestone-12">
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>The export and deletion workflows arrive in a later release (milestone 12).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            When they do, a full export arrives as an encrypted archive (JSON and CSV per table, your documents and packets, a schema readme), and a deletion is scheduled under the data
            retention policy: what you choose to keep is exported first, the practice&apos;s data key is destroyed at the end of the retention window, and you receive a certificate of
            destruction. Backups age out on their own 35-day schedule.
          </p>
          {canRequestExport || canRequestDeletion ? (
            <p>
              Until then, ask for either through{' '}
              <Link className="underline" href="/support?from=settings">
                support
              </Link>
              ; the security official handles it by hand under the same policy.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Export and deletion are requested by the practice administrator.</p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
