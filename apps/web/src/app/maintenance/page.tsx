import type { Metadata } from 'next';
import Link from 'next/link';

import { loadPublicPage } from '../../lib/http/next';
import { maintenancePage } from '../../lib/routes/support';

export const metadata: Metadata = { title: 'Maintenance' };

/** Where every customer screen sends the browser while the platform is in maintenance (docs/adr/0053). */
export default async function MaintenancePage() {
  const { maintenance, supportEmail } = await loadPublicPage(maintenancePage, {});
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-10" data-maintenance={maintenance ? 'on' : 'off'}>
      <h1 className="text-2xl font-semibold tracking-tight">{maintenance ? 'We are doing scheduled maintenance' : 'Maintenance is over'}</h1>
      <p className="text-sm">
        {maintenance
          ? 'The workspace is closed for a short while. Nothing you saved is lost, and uploads and runs already queued continue when we are back.'
          : 'The workspace is open again.'}
      </p>
      <p className="text-sm">
        {maintenance ? (
          <>
            Follow progress on the{' '}
            <Link className="underline" href="/status">
              status page
            </Link>
            , or write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.
          </>
        ) : (
          <Link className="underline" href="/">
            Back to your workspace
          </Link>
        )}
      </p>
    </main>
  );
}
