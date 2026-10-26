import { centsToString } from '@tp/money';
import { DEFAULT_TRIAGE_SETTINGS } from '@tp/triage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import type { ActionState } from '../../lib/http/next';
import { dollarsForInput } from '../../lib/money-input';
import { ActionForm } from '../action-form';
import { Field } from '../field';
import { MoneyField, moneyLabel } from '../money-field';
import { Counted, Money } from '../remittances/display';

/**
 * The cards of Settings → Defaults (PRD 7, Settings: "materiality defaults"; PRD 12; test matrix CAS-38): the
 * materiality thresholds and the pursuit cost, which the route returns as stored, in cents. Each amount is shown
 * through <Money> and each count of minutes in the mono face (brand: every money figure and unit count in mono), and
 * each dollar field is a <MoneyField> pre-filled with dollarsForInput, which the save's dollars field reads back to
 * the same cents. Each field takes its label from MATERIALITY_LABELS or PURSUIT_LABELS; a refusal names the field by
 * that label as the page shows it, never by its key.
 * Plain components: the page passes its actions and a factory of its FormKeys, called once per form so each form has
 * its own request key (docs/adr/0017).
 */

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** The label of each field of the materiality form, by its key, as the form shows it. */
export const MATERIALITY_LABELS = { lineMateriality: moneyLabel('Per line'), caseMateriality: moneyLabel('Per case') } as const;

/** The label of each field of the pursuit form, by its key, as the form shows it. */
export const PURSUIT_LABELS = { staffRatePerHour: moneyLabel('Staff rate per hour'), minutesPerPacket: 'Minutes per packet', minutesPerFollowUp: 'Minutes per follow-up' } as const;

export function MaterialityCard({
  practiceId,
  materiality,
  canEdit,
  action,
  formKeys,
}: {
  readonly practiceId: string;
  /** The thresholds in cents, as canonical integer text. */
  readonly materiality: { readonly lineCents: string; readonly caseCents: string };
  readonly canEdit: boolean;
  readonly action: Action;
  readonly formKeys: () => ReactNode;
}) {
  return (
    <Card role="region" aria-label="Materiality">
      <CardHeader>
        <CardTitle>Materiality</CardTitle>
        <CardDescription>
          A line whose shortfall is below the line threshold, or a case below the case threshold, is not pursued. The thresholds are <Money value={materiality.lineCents} /> per line and{' '}
          <Money value={materiality.caseCents} /> per case; the defaults are <Money value={centsToString(DEFAULT_TRIAGE_SETTINGS.lineMaterialityCents)} /> and{' '}
          <Money value={centsToString(DEFAULT_TRIAGE_SETTINGS.caseMaterialityCents)} />.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <ActionForm action={action} submit="Save materiality" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <MoneyField label="Per line" name="lineMateriality" defaultValue={dollarsForInput(materiality.lineCents)} required />
            <MoneyField label="Per case" name="caseMateriality" defaultValue={dollarsForInput(materiality.caseCents)} required />
          </ActionForm>
        ) : (
          <p className="text-xs text-muted-foreground">Changed by the people who work cases (billing managers and analysts).</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PursuitCard({
  practiceId,
  pursuit,
  canEdit,
  action,
  formKeys,
}: {
  readonly practiceId: string;
  /** The staff rate in cents an hour, as canonical integer text, and the minutes; null when not set. */
  readonly pursuit: { readonly staffRateCentsPerHour: string; readonly minutesPerPacket: number; readonly minutesPerFollowUp: number } | null;
  readonly canEdit: boolean;
  readonly action: Action;
  readonly formKeys: () => ReactNode;
}) {
  return (
    <Card role="region" aria-label="Pursuit cost">
      <CardHeader>
        <CardTitle>Pursuit cost</CardTitle>
        <CardDescription>
          {pursuit === null ? (
            'Not set: cases show no pursuit cost.'
          ) : (
            <>
              <Money value={pursuit.staffRateCentsPerHour} /> an hour, <Counted value={pursuit.minutesPerPacket} one="minute" /> a packet, <Counted value={pursuit.minutesPerFollowUp} one="minute" /> a
              follow-up.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <ActionForm action={action} submit="Save pursuit cost" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <fieldset className="grid min-w-0 gap-3" aria-describedby="pursuit-rule">
              <legend className="text-sm font-medium">Staff rate and times</legend>
              <p id="pursuit-rule" className="text-xs text-muted-foreground">
                All three together, or all blank to clear.
              </p>
              <MoneyField label="Staff rate per hour" name="staffRatePerHour" defaultValue={pursuit === null ? '' : dollarsForInput(pursuit.staffRateCentsPerHour)} />
              <Field label={PURSUIT_LABELS.minutesPerPacket} name="minutesPerPacket" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerPacket)} inputMode="numeric" />
              <Field label={PURSUIT_LABELS.minutesPerFollowUp} name="minutesPerFollowUp" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerFollowUp)} inputMode="numeric" />
            </fieldset>
          </ActionForm>
        ) : null}
      </CardContent>
    </Card>
  );
}
