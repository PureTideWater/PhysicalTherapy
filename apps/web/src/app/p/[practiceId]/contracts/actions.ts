'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { answerQuestionAction, signOffAction, tagContractDocument } from '../../../../lib/routes/contracts';

/** The Contracts screens' server actions; each runs its registered route (src/lib/routes/contracts.ts). */

export async function tagDocumentFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(tagContractDocument, form, { practiceId: form.get('practiceId') });
}

export async function signOffFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(signOffAction, form, { practiceId: form.get('practiceId') });
}

export async function answerQuestionFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(answerQuestionAction, form, { practiceId: form.get('practiceId') });
}
