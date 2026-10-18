'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { issueAuditInvoiceAction } from '../../../lib/routes/billing';

/** Issues an audit invoice to an organization (platform administrators; src/lib/routes/billing.ts). */
export async function issueAuditInvoice(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(issueAuditInvoiceAction, form);
}
