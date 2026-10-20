'use server';

import { z } from 'zod';

import type { VersionIntent } from '../../../../../../components/packets/version-form';
import { refusalState } from '../../../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../../../lib/http/next';
import { draftNarrativeAction } from '../../../../../../lib/routes/models';
import { approvePacketVersionAction, exportPacketAction, requestApprovalAction, writeVersionAction } from '../../../../../../lib/routes/packets';

const intent = z.enum(['save', 'code_draft'] as const satisfies readonly VersionIntent[]);

/**
 * The version form's write (the best-option audit's item #61): the form's submit buttons share one set of fields
 * (the version edited, the prompt-pay state, the attached documents, the narrative), so no button drops a choice
 * another made, and their `intent` says what to write: `save` the person's narrative as a new version, `code_draft`
 * the code-built draft of the pattern statement (PRD 12: an edit is a new version, which clears the approval), both
 * through practice.cases.packet.write. The form's `model_draft` button sends the same fields to
 * draftNarrativeFormAction instead. Each route checks its own input, role, scope and audit event.
 */
export async function writeVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const chosen = intent.safeParse(form.get('intent'));
  if (!chosen.success) {
    return { error: 'Choose what to write: your narrative or the code-built draft.' };
  }
  form.delete('intent');
  if (chosen.data === 'code_draft') {
    form.delete('narrative');
    form.set('useDraft', 'on');
  } else {
    form.delete('useDraft');
  }
  return refusalState(await runAction(writeVersionAction, form, { practiceId: form.get('practiceId') }));
}

/** Asks the model for the narrative and writes it as the next version, verified as any (docs/adr/0052), from the version form's fields. */
export async function draftNarrativeFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  form.delete('intent');
  form.delete('narrative');
  form.delete('useDraft');
  return refusalState(await runAction(draftNarrativeAction, form, { practiceId: form.get('practiceId') }));
}

/** Asks a second person to approve the current version (PRD 7, Packet builder: "request approval"). */
export async function requestApprovalFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(requestApprovalAction, form, { practiceId: form.get('practiceId') }));
}

/** Approves the version, naming its hash (PRD 12, Approval); the database refuses its drafter. */
export async function approveFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(approvePacketVersionAction, form, { practiceId: form.get('practiceId') }));
}

/**
 * Asks the worker to export the approved version as PDF and CSV, identifiers inserted (CAS-11, CAS-12). A request
 * the export job would refuse comes back with one issue per reason, its field the reason's code (audit item #26),
 * which the export form lists with each fix; any other refusal comes back as the forms show it.
 */
export async function exportFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(exportPacketAction, form, { practiceId: form.get('practiceId') }));
}
