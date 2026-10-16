'use server';

import { refusalState } from '../../../../lib/cases/refusals';
import { type ActionState, runAction } from '../../../../lib/http/next';
import { triageRunAction } from '../../../../lib/routes/triage';
import { openCaseAction, setMaterialityAction } from '../../../../lib/routes/workbench';

/** Queues the triage of the run in effect for its period (PRD 12): anomalies, the actionable judgement, cases by payer pattern. */
export async function triageRunFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(triageRunAction, form, { practiceId: form.get('practiceId') });
}

/** Opens a case on a payer pattern that reaches the case materiality, with its owner (PRD 5, J8; PRD 7, Cases: "create from a pattern"). */
export async function openCaseFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(openCaseAction, form, { practiceId: form.get('practiceId') }));
}

/** Sets the practice's materiality thresholds, per line and per case (PRD 5, J8; PRD 7, Cases: "set materiality"). */
export async function setMaterialityFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return refusalState(await runAction(setMaterialityAction, form, { practiceId: form.get('practiceId') }));
}
