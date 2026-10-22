import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { Field, SelectField } from '../../../../components/field';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { practiceSettingsPage } from '../../../../lib/routes/console';
import { setPracticeLocationAction, setPracticeSettingsAction } from '../../actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Practice settings' };

const ROUNDING = [
  { value: '', label: 'The default (half up to the cent)' },
  { value: 'HALF_UP_CENT', label: 'Half up to the cent' },
  { value: 'HALF_EVEN_CENT', label: 'Half even to the cent' },
  { value: 'TRUNCATE', label: 'Truncate to the cent' },
];

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A practice's pricing location and its pricing and triage settings in the internal console (PRD 5, J8: materiality
 * thresholds are practice settings with defaults; PRD 11, Inputs; PRD 12, Deadlines and pursuit cost; ADR 0040;
 * audit #33 and docs/adr/0064). The location (the billing ZIP and, where Medicare's locality list needs it, its ZIP+4)
 * gives the locality and has its own form; the place-of-service split decides the facility or non-facility practice
 * expense, the materiality thresholds decide what is actionable and what becomes a case, and the staff rate and
 * minutes give the pursuit-cost estimate. A blank field keeps the default. None of it is a patient's data; no
 * practice record is read here, and the location's ZIP+4 is set here but never read back.
 */
export default async function PracticeSettingsPage(props: Props) {
  const page = await loadPage(practiceSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="organizations" roles={page.roles} message={page.message} nextStep="The internal console is for platform administrators." />;
  }
  const { practice, form, saved, zip, location } = page.data;
  return (
    <AppShell shell={page.shell} section="organizations">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/console/organizations/${practice.organizationId}`}>
          Organization
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">{practice.name}: pricing and triage settings</h1>
        <p className="text-base text-muted-foreground">Runs price with these settings and triage judges with them; a run already priced keeps the settings it recorded.</p>
      </div>
      {saved ? (
        <Alert data-notice="saved">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>The next pricing run and triage of this practice read these settings.</AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Pricing location">
        <CardHeader>
          <CardTitle>Pricing location</CardTitle>
          <CardDescription>The billing ZIP gives the Medicare locality every line is priced at; a ZIP that spans two localities needs its ZIP+4. Saving queues the practice’s monitoring, so months waiting on the location price again.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            Billing ZIP: <span className="font-mono tabular-nums" data-location-zip>{zip ?? 'none'}</span>
          </p>
          {location === null ? null : (
            <Alert role="status" data-notice="location" data-location-status={location.status}>
              <AlertTitle>Location saved</AlertTitle>
              <AlertDescription>{location.text}</AlertDescription>
            </Alert>
          )}
          <ActionForm action={setPracticeLocationAction} submit="Save the location" className="grid max-w-xl gap-3">
            <FormKeys />
            <input type="hidden" name="practiceId" value={practice.id} />
            <Field
              label="Billing ZIP (ZIP+4 if Medicare needs one)"
              name="zip"
              required
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              hint="Five digits, or ZIP+4 such as 27601-1234. Enter it whole: saving replaces the ZIP+4 too, which the console does not show."
            />
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>Leave a field blank for its default: $5.00 per line, $250.00 per case, cohorts of 30 lines, a $5.00 anomaly threshold; no pursuit cost until all three of its fields are set.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={setPracticeSettingsAction} submit="Save the settings" className="grid max-w-xl gap-3">
            <FormKeys />
            <input type="hidden" name="practiceId" value={practice.id} />
            <Field label="Places of service priced as facility" name="facilityPlaces" defaultValue={form.facilityPlaces} hint="Two-digit codes, separated by commas (for example 19, 22)." />
            <Field label="Places of service priced as non-facility" name="nonFacilityPlaces" defaultValue={form.nonFacilityPlaces} hint="Two-digit codes, separated by commas (for example 11)." />
            <SelectField label="Default rounding when a contract is silent" name="defaultRounding" options={ROUNDING} defaultValue={form.defaultRounding} />
            <Field label="Per-line materiality (dollars)" name="lineMateriality" inputMode="decimal" defaultValue={form.lineMateriality} />
            <Field label="Case materiality (dollars)" name="caseMateriality" inputMode="decimal" defaultValue={form.caseMateriality} />
            <Field label="Anomaly cohort minimum (lines)" name="anomalyMinimumCohort" inputMode="numeric" defaultValue={form.anomalyMinimumCohort} />
            <Field label="Anomaly threshold (dollars short of the mode)" name="anomalyThreshold" inputMode="decimal" defaultValue={form.anomalyThreshold} />
            <Field label="Staff rate (dollars per hour)" name="staffRatePerHour" inputMode="decimal" defaultValue={form.staffRatePerHour} />
            <Field label="Minutes per packet" name="minutesPerPacket" inputMode="numeric" defaultValue={form.minutesPerPacket} />
            <Field label="Minutes per follow-up" name="minutesPerFollowUp" inputMode="numeric" defaultValue={form.minutesPerFollowUp} />
          </ActionForm>
        </CardContent>
      </Card>
    </AppShell>
  );
}
