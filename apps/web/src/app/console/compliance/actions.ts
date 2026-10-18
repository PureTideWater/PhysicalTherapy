'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { recordEvidence, sendEvidence } from '../../../lib/routes/compliance';

/** Records evidence a person produced for the checklist (src/lib/routes/compliance.ts). */
export async function recordEvidenceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(recordEvidence, form);
}

/** Sends the checklist's export to the compliance platform. */
export async function sendEvidenceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(sendEvidence, form);
}
