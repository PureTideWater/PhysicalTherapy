'use server';

import { type ActionState, runAction } from '../../lib/http/next';
import { createTicket } from '../../lib/routes/support';

/** Opens a support ticket (src/lib/routes/support.ts). */
export async function createTicketAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(createTicket, form);
}
