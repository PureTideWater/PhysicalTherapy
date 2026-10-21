import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../../components/action-form';
import { Field, SelectField } from '../../../../../components/field';
import { FormKeys } from '../../../../../components/form-keys';
import { SettingsNav, currentOrganization } from '../../../../../components/settings/nav';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { CONTACT_MALFORMED_TEXT } from '../../../../../lib/packets/contact';
import { correspondenceSettingsPage } from '../../../../../lib/routes/settings';
import { setCorrespondenceContact } from './actions';

export const metadata: Metadata = { title: 'Correspondence contact' };

/** A stored phone as the form shows it again: (919) 555-0100. */
const phoneShown = (digits: string) => `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;

/**
 * The practice's correspondence contact (audit item #37 part 1, D6; the founder's ruling of 2026-10-20, Q1 (a);
 * docs/adr/0061): who a payer's examiner writes to or calls about a dispute. Every packet's payer copy closes with it,
 * and no packet is exported without it. A name or office and a phone are required; the extension, an email (the only
 * email the payer's copy prints) and a mailing address are optional. The practice administrator sets it; everyone who
 * opens the practice sees it and the words the payer's copy prints. A packet already exported keeps the contact it
 * was printed with.
 */
export default async function CorrespondencePage(props: { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const page = await loadPage(correspondenceSettingsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="settings" roles={page.roles} message={page.message} nextStep="Ask the practice administrator." />;
  }
  const { practiceId, stored, state, printed, states, canSet, notice } = page.data;
  return (
    <AppShell shell={page.shell} section="settings">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Correspondence contact</h1>
      <SettingsNav practiceId={practiceId} organizationId={currentOrganization(page.shell)} current="correspondence" />
      {notice === null ? null : (
        <Alert data-notice="saved">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>Packets exported from now on print this contact. Packets already exported keep the contact they were printed with.</AlertDescription>
        </Alert>
      )}
      <Card role="region" aria-label="What the payer’s copy prints">
        <CardHeader>
          <CardTitle>What the payer’s copy prints</CardTitle>
          <CardDescription>Every packet’s PDF closes with its approval line and this contact, so a payer’s examiner knows whom to write to or call about the dispute. No packet is exported until it is set.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {state === 'set' ? (
            <p data-contact="set" data-preview>
              Correspondence about this dispute: {printed}.
            </p>
          ) : state === 'missing' ? (
            <p data-contact="missing">No correspondence contact is set, so no packet is exported yet.</p>
          ) : (
            <p data-contact="malformed">{CONTACT_MALFORMED_TEXT}</p>
          )}
          <p className="text-muted-foreground">Packets already exported keep the contact they were printed with: each export’s PDF and its SHA-256 are the record of what was printed.</p>
        </CardContent>
      </Card>
      <Card role="region" aria-label="Correspondence contact">
        <CardHeader>
          <CardTitle>{state === 'set' ? 'Change the contact' : 'Set the contact'}</CardTitle>
          <CardDescription>
            A name or office and a phone number are required. The extension, an email and a mailing address are optional; the email is the only one the payer’s copy prints, so use a shared office address rather than a person’s sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canSet ? (
            <ActionForm action={setCorrespondenceContact} submit="Save the contact" className="grid max-w-xl gap-3">
              <FormKeys />
              <input type="hidden" name="practiceId" value={practiceId} />
              <Field label="Name or office" name="name" required maxLength={120} defaultValue={stored?.name ?? ''} />
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <Field label="Phone" name="phone" required inputMode="tel" hint="Ten digits, such as (919) 555-0100." defaultValue={stored === null ? '' : phoneShown(stored.phone)} />
                <Field label="Extension (optional)" name="phone_extension" inputMode="numeric" maxLength={6} defaultValue={stored?.phone_extension ?? ''} />
              </div>
              <Field label="Email (optional)" name="email" type="email" maxLength={254} defaultValue={stored?.email ?? ''} />
              <fieldset className="grid min-w-0 gap-3">
                <legend className="text-sm font-medium">Mailing address (optional: all of street, city, state and ZIP, or none)</legend>
                <Field label="Street" name="address_line1" maxLength={100} defaultValue={stored?.address?.line1 ?? ''} />
                <Field label="Suite or floor (optional)" name="address_line2" maxLength={100} defaultValue={stored?.address?.line2 ?? ''} />
                <div className="grid gap-3 sm:grid-cols-[1fr_6rem_8rem]">
                  <Field label="City" name="address_city" maxLength={100} defaultValue={stored?.address?.city ?? ''} />
                  <SelectField label="State" name="address_state" options={[{ value: '', label: '—' }, ...states.map((code) => ({ value: code, label: code }))]} defaultValue={stored?.address?.state ?? ''} />
                  <Field label="ZIP" name="address_zip" inputMode="text" autoComplete="postal-code" maxLength={10} defaultValue={stored?.address?.zip ?? ''} />
                </div>
              </fieldset>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground" data-read-only>
              The correspondence contact is set by the practice administrator.
            </p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
