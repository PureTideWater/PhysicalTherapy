import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { Field } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
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
      <Card>
        <CardHeader>
          <CardTitle>Materiality</CardTitle>
          <CardDescription>
            A line whose shortfall is below the line threshold, or a case below the case threshold, is not pursued. Now ${materiality.lineCents} per line and ${materiality.caseCents} per case.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <ActionForm action={setMateriality} submit="Save materiality" className="grid max-w-md gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <Field label="Per line (dollars)" name="lineMateriality" defaultValue={materiality.lineCents} inputMode="decimal" required />
              <Field label="Per case (dollars)" name="caseMateriality" defaultValue={materiality.caseCents} inputMode="decimal" required />
            </ActionForm>
          ) : (
            <p className="text-xs text-muted-foreground">Changed by the people who work cases (billing managers and analysts).</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pursuit cost</CardTitle>
          <CardDescription>
            {pursuit === null
              ? 'Not set: cases show no pursuit cost.'
              : `$${pursuit.staffRateCentsPerHour} an hour, ${String(pursuit.minutesPerPacket)} minutes a packet, ${String(pursuit.minutesPerFollowUp)} minutes a follow-up.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <ActionForm action={setPursuit} submit="Save pursuit cost" className="grid max-w-md gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <Field label="Staff rate per hour (dollars)" name="staffRatePerHour" defaultValue={pursuit?.staffRateCentsPerHour ?? ''} inputMode="decimal" hint="All three together, or all blank to clear." />
              <Field label="Minutes per packet" name="minutesPerPacket" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerPacket)} inputMode="numeric" />
              <Field label="Minutes per follow-up" name="minutesPerFollowUp" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerFollowUp)} inputMode="numeric" />
            </ActionForm>
          ) : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}
