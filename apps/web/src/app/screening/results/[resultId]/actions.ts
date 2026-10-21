'use server';

import { type ActionState, runAction } from '../../../../lib/http/next';
import { screeningConvert } from '../../../../lib/screening/routes';

/** Turns a screening into an audit request (public; src/lib/screening/routes.ts); the form carries the link's token. */
export async function convertScreeningAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(screeningConvert, form);
}
