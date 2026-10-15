'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { prepareRuleReleaseAction } from '../../../lib/routes/rule-releases';

/** Prepares the next rule release from the drafts at L2 or higher, as `pnpm release:assemble` does (never publishes). */
export async function prepareRuleReleaseFormAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(prepareRuleReleaseAction, form);
}
