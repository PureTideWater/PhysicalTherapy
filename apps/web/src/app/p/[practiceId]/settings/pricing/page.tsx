import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { Field } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
import { MonthsWaitingOnLocation } from '../../../../../components/pricing/location';
import { Money } from '../../../../../components/remittances/display';
import { ScrollTable } from '../../../../../components/scroll-table';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { LOCATION_CHANGED, LOCATION_NOTE, locationSettled, waitingHeadline } from '../../../../../lib/pricing/location';
import { pricingSettingsPage } from '../../../../../lib/routes/settings';
import { confirmPricingLocation, setPricingLocation } from './actions';

export const metadata: Metadata = { title: 'Pricing settings' };

/** Where "tell us" goes: the support form, opened from Settings. */
const SUPPORT_HREF = '/support?from=settings';

/** What a save says, by the location it leaves: one that prices (or waits only on PaidWhole's content), or one that still asks for something. */
const SAVED_SETTLED = 'Months waiting on the billing ZIP are being priced.';
const SAVED_UNSETTLED = 'Months that need the location still wait: see the status below.';

/**
 * Pricing settings (audit #33; #16's minimal record; the founder's answers of 2026-10-21 to PR 6b's Q2 (a) and Q5 (a);
 * docs/adr/0064): the practice's pricing location and its status in the rule release in force, in plain words (known;
 * needs its ZIP+4; or PaidWhole has not loaded the content for those dates, which never asks the customer to change
 * anything), the places of service in effect, the months waiting on the location and the months priced before it last
 * changed. The practice administrator, the billing manager and the firm principal set and confirm it; everyone who
 * opens the practice reads it.
 */
export default async function PricingSettingsPage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(pricingSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, location, locationText, reading, confirmed, places, split, waiting, pricedBefore, canEdit, notice } = page.data;
  const headline = waitingHeadline(waiting);
  // The location as it reads now decides what the save's notice promises, and whether it can be confirmed as it stands.
  const settled = locationSettled(reading);
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Pricing settings</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="pricing" />
      {notice === 'saved' ? (
        <Alert role="status" data-notice="saved" data-settled={settled ? 'yes' : 'no'}>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{settled ? SAVED_SETTLED : SAVED_UNSETTLED}</AlertDescription>
        </Alert>
      ) : notice === 'confirmed' ? (
        <Alert role="status" data-notice="confirmed">
          <AlertTitle>Confirmed</AlertTitle>
          <AlertDescription>The billing ZIP is confirmed as it stands.</AlertDescription>
        </Alert>
      ) : notice === 'changed' ? (
        <Alert role="status" data-notice="changed">
          <AlertDescription>{LOCATION_CHANGED}</AlertDescription>
        </Alert>
      ) : null}
      <Card role="region" aria-label="Pricing location">
        <CardHeader>
          <CardTitle>Pricing location</CardTitle>
          <CardDescription>Medicare prices each line at the payment locality of the practice’s billing ZIP. A few ZIP codes span more than one locality; for those, Medicare needs the ZIP+4.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Billing ZIP</dt>
            <dd className="font-mono tabular-nums" data-location-zip>
              {locationText ?? '—'}
            </dd>
          </dl>
          <p data-location-status={reading.status}>
            {reading.text}
            {reading.status === 'zip_plus_four_unknown' ? (
              <>
                {' '}
                <Link className="underline" href={SUPPORT_HREF}>
                  Contact support
                </Link>
              </>
            ) : null}
          </p>
          {location !== null && confirmed ? <p className="text-muted-foreground" data-confirmed>Confirmed by the practice since it last changed.</p> : null}
          <p className="text-muted-foreground" data-location-note>
            {LOCATION_NOTE}{' '}
            <Link className="underline" href={SUPPORT_HREF}>
              Contact support
            </Link>
          </p>
          {canEdit ? (
            <div className="flex flex-col gap-4">
              <ActionForm action={setPricingLocation} submit="Save the billing ZIP" className="grid max-w-md gap-3">
                <FormKeys />
                <input type="hidden" name="practiceId" value={practiceId} />
                <Field
                  label="Billing ZIP (ZIP+4 if Medicare needs one)"
                  name="zip"
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={10}
                  defaultValue={locationText ?? ''}
                  hint="Five digits, or ZIP+4 such as 27601-1234."
                />
              </ActionForm>
              {location !== null && settled && !confirmed ? (
                <ActionForm action={confirmPricingLocation} submit="Confirm the billing ZIP" variant="outline" className="flex flex-col gap-2">
                  <FormKeys />
                  <input type="hidden" name="practiceId" value={practiceId} />
                  <input type="hidden" name="confirm" value="on" />
                  {/* The location this page shows: only it is confirmed, never one changed since the page loaded. */}
                  <input type="hidden" name="shownZip" value={location.zip} />
                  <input type="hidden" name="shownZipPlusFour" value={location.zipPlusFour ?? ''} />
                  <p className="text-muted-foreground">If the billing ZIP above is right, confirm it.</p>
                </ActionForm>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground" data-read-only>
              The pricing location is set by the practice administrator, the billing manager or the firm principal.
            </p>
          )}
        </CardContent>
      </Card>
      <Card role="region" aria-label="Places of service">
        <CardHeader>
          <CardTitle>Places of service</CardTitle>
          <CardDescription>Each place of service prices at the facility or the non-facility rate: the practice’s own setting where it has one, and the approved place-of-service split’s for every other place.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {places.length === 0 ? null : (
            <ScrollTable label="Places of service in effect">
              <table className="w-full text-left" aria-label="Places of service in effect">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Place of service</th>
                    <th className="py-1 pr-3 font-medium">Rate</th>
                    <th className="py-1 font-medium">Set by</th>
                  </tr>
                </thead>
                <tbody>
                  {places.map((place) => (
                    <tr key={place.code} className="border-t" data-place={place.code} data-source={place.source}>
                      <td className="py-1 pr-3 font-mono tabular-nums">{place.code}</td>
                      <td className="py-1 pr-3">{place.setting === 'facility' ? 'Facility' : 'Non-facility'}</td>
                      <td className="py-1">{place.source === 'practice' ? 'The practice' : 'The approved split'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
          {split === 'not_read' ? <p className="text-muted-foreground">The approved split’s places show here once a run of this practice has priced under it.</p> : null}
          {split === 'none' ? <p className="text-muted-foreground">No place-of-service split is approved yet, so only the practice’s own places apply.</p> : null}
          <p className="text-muted-foreground">The practice’s own places of service are set by PaidWhole on request.</p>
        </CardContent>
      </Card>
      <Card role="region" aria-label="Months waiting on your billing ZIP">
        <CardHeader>
          <CardTitle>
            Months waiting on your billing ZIP{waiting.length === 0 ? null : <>: <Money value={headline.chargeCents} /> billed</>}
          </CardTitle>
          <CardDescription>A month with a line that needs the billing ZIP or its ZIP+4 waits for it, and is priced by itself once the location is ready.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {waiting.length === 0 ? <p className="text-muted-foreground">No month is waiting on the billing ZIP.</p> : <MonthsWaitingOnLocation months={waiting} label="Months waiting on the billing ZIP" />}
        </CardContent>
      </Card>
      {pricedBefore.length === 0 ? null : (
        <Card role="region" aria-label="Months priced before the location changed">
          <CardHeader>
            <CardTitle>Months priced before the location changed</CardTitle>
            <CardDescription>These months keep the prices of the location they were priced under until each is re-run.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm" aria-label="Runs priced before the location changed">
              {pricedBefore.map((run) => (
                <li key={run.runId} data-run={run.runId}>
                  <span className="font-mono tabular-nums">
                    {run.periodFrom} to {run.periodTo}
                  </span>
                  , rule release <span className="font-mono tabular-nums">{run.releaseNo}</span> ·{' '}
                  <Link className="underline" href={`/p/${practiceId}/pricing-runs/${run.runId}`}>
                    Open the run to re-run it
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
