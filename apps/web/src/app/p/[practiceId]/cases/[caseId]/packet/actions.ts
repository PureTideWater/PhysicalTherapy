'use server';

import { refusalState } from '../../../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../../../lib/http/next';
import { draftNarrativeAction } from '../../../../../../lib/routes/models';
import { approvePacketVersionAction, exportPacketAction, requestApprovalAction, writeVersionAction } from '../../../../../../lib/routes/packets';

/** Writes a new packet version (PRD 12: an edit is a new version, which clears the approval). */
export async function writeVersionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(writeVersionAction, form, { practiceId: form.get('practiceId') }));
}

/** Asks the model for the narrative and writes it as the next version, verified as any (docs/adr/0052). */
export async function draftNarrativeFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
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

/** Asks the worker to export the approved version as PDF and CSV, identifiers inserted (CAS-11, CAS-12). */
export async function exportFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(exportPacketAction, form, { practiceId: form.get('practiceId') }));
}
