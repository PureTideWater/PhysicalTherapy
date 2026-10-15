import { EmptyState } from '@tp/ui';
import { redirect } from 'next/navigation';

import { AppShell } from '../components/shell';
import { loadPage } from '../lib/http/next';
import { homePage } from '../lib/routes';

/**
 * Where a signed-in user starts: their first practice (PRD 7: one practice at a time, with the
 * switcher for groups and firms), the specialist queue for a contract specialist (who reaches a
 * practice only under a support grant), or the internal console for a platform administrator.
 * Without a session, sign-in.
 */
export default async function Home() {
  const page = await loadPage(homePage, {});
  if (page.shell?.platformRoles.includes('contract_specialist') === true) {
    redirect('/console/specialist-queue');
  }
  const first = page.shell?.practices[0];
  if (first !== undefined) {
    redirect(`/p/${first.practiceId}`);
  }
  if (page.shell?.platformRoles.includes('platform_admin') === true) {
    redirect('/console/organizations');
  }
  return (
    <AppShell shell={page.shell} section="home">
      <h1 className="text-2xl font-semibold tracking-tight">Therapy contract-payment platform</h1>
      <EmptyState
        title="No practice to open"
        nextStep="You have no current access to a practice. A practice administrator approves access for your organization; support access comes from a ticket. Ask your administrator."
      />
    </AppShell>
  );
}
