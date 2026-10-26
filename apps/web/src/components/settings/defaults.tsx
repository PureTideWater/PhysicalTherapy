import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import type { ActionState } from '../../lib/http/next';
import { dollarsForInput } from '../../lib/money-input';
import { ActionForm } from '../action-form';
import { Field } from '../field';
import { Money } from '../remittances/display';

/**
 * The cards of Settings → Defaults (PRD 7, Settings: "materiality defaults"; PRD 12; test matrix CAS-38): the
 * materiality thresholds and the pursuit cost, which the route returns as stored, in cents. Each amount is shown
 * through <Money> and each count of minutes in the mono face (brand: every money figure and unit count in mono), and
 * each dollar field is pre-filled with dollarsForInput, which the save's dollars field reads back to the same cents.
 * Plain components: the page passes its actions and a factory of its FormKeys, called once per form so each form has
 * its own request key (docs/adr/0017).
 */

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** A count in the mono face with tabular numerals, as <Money> sets an amount. */
function Count({ value }: { readonly value: number }) {
  return <span className="font-mono tabular-nums">{String(value)}</span>;
}

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
          A line whose shortfall is below the line threshold, or a case below the case threshold, is not pursued. Now <Money value={materiality.lineCents} /> per line and{' '}
          <Money value={materiality.caseCents} /> per case.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <ActionForm action={action} submit="Save materiality" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <Field label="Per line (dollars)" name="lineMateriality" defaultValue={dollarsForInput(materiality.lineCents)} inputMode="decimal" required />
            <Field label="Per case (dollars)" name="caseMateriality" defaultValue={dollarsForInput(materiality.caseCents)} inputMode="decimal" required />
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
              <Money value={pursuit.staffRateCentsPerHour} /> an hour, <Count value={pursuit.minutesPerPacket} /> minutes a packet, <Count value={pursuit.minutesPerFollowUp} /> minutes a follow-up.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <ActionForm action={action} submit="Save pursuit cost" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <Field
              label="Staff rate per hour (dollars)"
              name="staffRatePerHour"
              defaultValue={pursuit === null ? '' : dollarsForInput(pursuit.staffRateCentsPerHour)}
              inputMode="decimal"
              hint="All three together, or all blank to clear."
            />
            <Field label="Minutes per packet" name="minutesPerPacket" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerPacket)} inputMode="numeric" />
            <Field label="Minutes per follow-up" name="minutesPerFollowUp" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerFollowUp)} inputMode="numeric" />
          </ActionForm>
        ) : null}
      </CardContent>
    </Card>
  );
}
