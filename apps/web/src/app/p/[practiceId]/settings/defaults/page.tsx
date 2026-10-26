import { Alert, AlertDescription, AlertTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { FormKeys } from '../../../../../components/form-keys';
import { MaterialityCard, PursuitCard } from '../../../../../components/settings/defaults';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { defaultsSettingsPage } from '../../../../../lib/routes/settings';
import { setMateriality, setPursuit } from './actions';

export const metadata: Metadata = { title: 'Materiality and pursuit' };

/**
 * Materiality and pursuit defaults (PRD 7, Settings: "materiality defaults"; PRD 12): the smallest shortfall worth a
 * line and a case, and what a packet and a follow-up cost the practice, set by the people who work cases. Amounts
 * are dollars and cents; the database keeps them in cents.
 */
export default async function DefaultsSettingsPage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(defaultsSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, materiality, pursuit, canEdit, notice } = page.data;
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Materiality and pursuit</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="defaults" />
      {notice === null ? null : (
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{notice === 'materiality' ? 'The materiality thresholds apply from the next triage.' : 'The pursuit cost applies from the next triage.'}</AlertDescription>
        </Alert>
      )}
      <MaterialityCard practiceId={practiceId} materiality={materiality} canEdit={canEdit} action={setMateriality} formKeys={() => <FormKeys />} />
      <PursuitCard practiceId={practiceId} pursuit={pursuit} canEdit={canEdit} action={setPursuit} formKeys={() => <FormKeys />} />
    </AppShell>
  );
}
