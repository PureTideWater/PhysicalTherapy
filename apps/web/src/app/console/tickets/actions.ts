'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { setTicketStatus } from '../../../lib/routes/support';

/** Moves a ticket's status (src/lib/routes/support.ts). */
export async function setTicketStatusAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(setTicketStatus, form);
}
