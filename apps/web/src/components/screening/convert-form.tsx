import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import type { ActionState } from '../../lib/http/next';
import { type KeptWith, convertKept } from '../../lib/screening/retention';
import { ActionForm } from '../action-form';
import { Field, SelectField, TextAreaField } from '../field';

/**
 * From a screening to an audit request (Change Order 001, CO-04): the screening already holds the practice's name
 * and the contact's email, so the form asks only for the rest of what the audit request takes (PRD 5, J1: the
 * contact's name, locations, payers and billing arrangement). Sending it records an audit request and the
 * conversion as an audit event; a screening converts once. No patient information. The form says what the request
 * keeps: the screening's summary for 12 months from the screening, or, when the summary is already kept with an
 * earlier screening's request of the practice, that the new request is kept beside that one with no summary of its own
 * (the founder's rulings of 2026-10-20). A legal surface counsel reviews before the screening opens
 * (docs/product/legal-surfaces.md, screening-kept-convert).
 */
export function ScreeningConvertForm({
  action,
  resultId,
  arrangements,
  requested,
  converted,
  keptWith,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The result's link token, the page's own path parameter. */
  readonly resultId: string;
  readonly arrangements: readonly { readonly value: string; readonly label: string }[];
  /** The request was just sent (the page after the redirect). */
  readonly requested: boolean;
  /** An audit was already requested from this screening. */
  readonly converted: boolean;
  /** What the screening's summary is kept with now. */
  readonly keptWith: KeptWith;
}) {
  if (requested || converted) {
    return (
      <Alert data-state="requested">
        <AlertTitle>{requested ? 'Audit request received' : 'An audit was requested from this screening'}</AlertTitle>
        <AlertDescription>We will email you to set up a short scoping call. Please do not send any remittance or patient information by email.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Card data-section="convert">
      <CardHeader>
        <CardTitle id="screening-convert">Ask for a PaidWhole audit</CardTitle>
        <CardDescription>
          An audit prices every line under your signed contracts and the contracts&apos; own rules, the rows this screening could not. We already have your practice&apos;s name and your email from the screening. No patient information.{' '}
          <span data-copy="convert-kept" data-legal-surface="screening-kept-convert">
            {convertKept(keptWith)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={action} submit="Request an audit" className="grid gap-4">
          <input type="hidden" name="resultId" value={resultId} />
          <Field label="Your name" name="contactName" required maxLength={200} autoComplete="name" />
          <Field label="Locations" name="locations" type="number" min={1} max={1000} required inputMode="numeric" />
          <TextAreaField label="Payers you bill" name="payers" required hint="One per line, or separated by commas. Payer names only." />
          <SelectField label="How you bill" name="billingArrangement" options={arrangements} />
        </ActionForm>
      </CardContent>
    </Card>
  );
}
