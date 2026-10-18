'use server';

import { type ActionState, runAction } from '../../../lib/http/next';
import { choosePlanAction, payInvoiceAction, simulateSettlementAction, simulatedPaymentMethodAction } from '../../../lib/routes/billing';

/**
 * Server actions of an organization's billing settings; each runs its registered route
 * (src/lib/routes/billing.ts), which checks the organization the form names.
 */

export async function choosePlan(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(choosePlanAction, form, { organizationId: form.get('organizationId') });
}

export async function payInvoice(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(payInvoiceAction, form, { organizationId: form.get('organizationId') });
}

export async function addSimulatedPaymentMethod(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(simulatedPaymentMethodAction, form, { organizationId: form.get('organizationId') });
}

export async function settleSimulatedPayments(_state: ActionState, form: FormData): Promise<ActionState> {
  return runAction(simulateSettlementAction, form, { organizationId: form.get('organizationId') });
}
