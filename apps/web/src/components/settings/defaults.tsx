import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';
import { Field } from '../field';

/** The cards of Settings → Defaults, as the page rendered them at c5195ee (tests first: moved unchanged). */

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

export function MaterialityCard({
  practiceId,
  materiality,
  canEdit,
  action,
  formKeys,
}: {
  readonly practiceId: string;
  readonly materiality: { readonly lineCents: string; readonly caseCents: string };
  readonly canEdit: boolean;
  readonly action: Action;
  readonly formKeys: () => ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Materiality</CardTitle>
        <CardDescription>
          A line whose shortfall is below the line threshold, or a case below the case threshold, is not pursued. Now ${materiality.lineCents} per line and ${materiality.caseCents} per case.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <ActionForm action={action} submit="Save materiality" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <Field label="Per line (dollars)" name="lineMateriality" defaultValue={materiality.lineCents} inputMode="decimal" required />
            <Field label="Per case (dollars)" name="caseMateriality" defaultValue={materiality.caseCents} inputMode="decimal" required />
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
  readonly pursuit: { readonly staffRateCentsPerHour: string; readonly minutesPerPacket: number; readonly minutesPerFollowUp: number } | null;
  readonly canEdit: boolean;
  readonly action: Action;
  readonly formKeys: () => ReactNode;
}) {
  return (
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
          <ActionForm action={action} submit="Save pursuit cost" className="grid max-w-md gap-3">
            {formKeys()}
            <input type="hidden" name="practiceId" value={practiceId} />
            <Field label="Staff rate per hour (dollars)" name="staffRatePerHour" defaultValue={pursuit?.staffRateCentsPerHour ?? ''} inputMode="decimal" hint="All three together, or all blank to clear." />
            <Field label="Minutes per packet" name="minutesPerPacket" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerPacket)} inputMode="numeric" />
            <Field label="Minutes per follow-up" name="minutesPerFollowUp" defaultValue={pursuit === null ? '' : String(pursuit.minutesPerFollowUp)} inputMode="numeric" />
          </ActionForm>
        ) : null}
      </CardContent>
    </Card>
  );
}
