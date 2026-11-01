import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import type { ActionState } from '../../lib/http/next';
import type { OrganizationSuspension, StatusChange, SuspensionReach } from '../../lib/routes/console';
import { ActionForm } from '../action-form';
import { CheckboxField, Field, SelectField } from '../field';
import { FormKeys } from '../form-keys';
import { utc } from '../format';
import { ScrollTable } from '../scroll-table';
import {
  CHANGE_REASON_SUBMIT,
  HISTORY_CAPTION,
  HISTORY_CHANGES,
  HISTORY_COLUMNS,
  HISTORY_EMPTY,
  REINSTATE_SUBMITS,
  SUSPEND_SUBMIT,
  SUSPENSION_NOTE_HINT,
  SUSPENSION_NOTE_LABEL,
  SUSPENSION_REASON_HINT,
  SUSPENSION_REASON_OPTIONS,
  type SuspendableKind,
  reasonLabel,
  suspendedEffect,
  suspendedLines,
  suspendedNote,
  suspensionDescription,
  suspensionTick,
  suspensionTitle,
} from './suspension-text';

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/**
 * C4: the required reason select, starting empty, through the shared SelectField (docs/adr/0077): its hint at 14 px
 * under it, and a refusal shows "Error:" and the rule's words under it, marks it and names it "Reason" in the summary,
 * by the label the person sees. A refused form keeps the reason chosen (ActionForm).
 */
function ReasonSelect({ id }: { readonly id: string }) {
  return <SelectField label="Reason" id={id} name="reason" required defaultValue="" options={SUSPENSION_REASON_OPTIONS} hint={SUSPENSION_REASON_HINT} />;
}

/** C5: the optional note, one line of at most 500 characters (the CHECK organization_status_change_note's). */
function NoteField({ id }: { readonly id: string }) {
  return <Field label={SUSPENSION_NOTE_LABEL} id={id} name="note" maxLength={500} autoComplete="off" hint={SUSPENSION_NOTE_HINT} />;
}

/**
 * PaidWhole's suspension of a group or a firm (docs/adr/0080; SS-01 section 5.2): while active, what suspending stops
 * for this kind, the reason, the note and the tick with the real counts; while suspended, who suspended it, when and
 * why, what it stops, the note, a change of reason and the two one-click reinstatements (D9). The history follows.
 * Every form posts to console.organization_status, which Postgres checks again.
 */
export function SuspensionCard({
  organization,
  suspension,
  reach,
  action,
}: {
  readonly organization: { readonly id: string; readonly name: string; readonly kind: SuspendableKind; readonly status: string };
  readonly suspension: OrganizationSuspension | null;
  readonly reach: SuspensionReach;
  readonly action: Action;
}) {
  // A refusal of the hidden change reads "Status: …" (data-error-name, docs/adr/0077 D3), never the route's key.
  const hidden = (change: 'suspend' | 'reason' | 'reinstate') => (
    <>
      <FormKeys />
      <input type="hidden" name="change" value={change} data-error-name="Status" />
      <input type="hidden" name="organizationId" value={organization.id} />
    </>
  );
  return (
    <Card data-suspension={organization.status}>
      <CardHeader>
        <CardTitle>{suspensionTitle(organization.status)}</CardTitle>
        <CardDescription>{suspension === null ? suspensionDescription(organization.kind) : suspendedEffect(organization.kind, reach)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {suspension === null ? (
          <ActionForm action={action} submit={SUSPEND_SUBMIT} variant="destructive" className="grid max-w-xl gap-3" wrapSubmit>
            {hidden('suspend')}
            <ReasonSelect id="suspend-reason" />
            <NoteField id="suspend-note" />
            <CheckboxField id="suspend-confirm" name="confirm" required errorName="Confirmation" label={suspensionTick(organization.kind, organization.name, reach)} />
          </ActionForm>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-sm" data-suspended-lines>
              {suspendedLines(suspension).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {suspension.note === null ? null : <p className="break-words">{suspendedNote(suspension.note)}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
              {(['resolved', 'in_error'] as const).map((reason) => (
                <ActionForm key={reason} action={action} submit={REINSTATE_SUBMITS[reason]} className="flex flex-col gap-1" wrapSubmit>
                  {hidden('reinstate')}
                  <input type="hidden" name="reason" value={reason} />
                </ActionForm>
              ))}
            </div>
            <section aria-labelledby="change-reason-heading" className="flex flex-col gap-3">
              <h3 id="change-reason-heading" className="text-sm font-semibold">
                {CHANGE_REASON_SUBMIT}
              </h3>
              <ActionForm action={action} submit={CHANGE_REASON_SUBMIT} variant="outline" className="grid max-w-xl gap-3">
                {hidden('reason')}
                <ReasonSelect id="change-reason" />
                <NoteField id="change-note" />
              </ActionForm>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** C10: the organization's suspensions, reinstatements and changes of reason, newest first. */
export function SuspensionHistory({ history }: { readonly history: readonly StatusChange[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{HISTORY_CAPTION}</CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{HISTORY_EMPTY}</p>
        ) : (
          <ScrollTable label={HISTORY_CAPTION}>
            <table className="w-full min-w-[48rem] text-left text-sm" aria-label={HISTORY_CAPTION}>
              <thead className="text-muted-foreground">
                <tr>
                  {HISTORY_COLUMNS.map((column) => (
                    <th key={column} scope="col" className="py-1 pr-3 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((change) => (
                  <tr key={change.id} className="border-t align-top" data-change={change.change}>
                    <td className="whitespace-nowrap py-1 pr-3">{utc(change.at).replace(' UTC', '')}</td>
                    <td className="py-1 pr-3">{HISTORY_CHANGES[change.change]}</td>
                    <td className="py-1 pr-3">{reasonLabel(change.reason)}</td>
                    <td className="py-1 pr-3">
                      <span className="block min-w-40 wrap-anywhere">{change.by}</span>
                    </td>
                    <td className="py-1">
                      <span className="block min-w-48 wrap-anywhere">{change.note ?? ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </CardContent>
    </Card>
  );
}
