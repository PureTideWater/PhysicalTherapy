import { randomUUID } from 'node:crypto';

import type { BillingProvider } from '@tp/billing';
import { LocalBillingProvider, SIMULATOR_TEST_ROUTING } from '@tp/billing/local';
import { type BillingPool, issueAuditInvoice, startPaymentMethodSetup } from '@tp/worker/billing';

/**
 * A group's billing for the generated route tests (docs/adr/0050), in the local Stripe test-mode simulator:
 * its customer, the simulator's settling test bank account on file, and an open audit invoice whose ACH
 * debit is still pending (the tests never settle it but through the settlement route), which the
 * pay-invoice route asks to pay.
 */
export async function seedBilling(options: {
  readonly owner: { query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }> };
  readonly pool: BillingPool;
  readonly provider: BillingProvider;
  readonly organizationId: string;
}): Promise<{ readonly billingInvoiceId: string }> {
  const { provider, organizationId } = options;
  if (!(provider instanceof LocalBillingProvider)) {
    throw new Error('the route tests bill through the local simulator');
  }
  const services = { pool: options.pool, provider };
  const intent = await startPaymentMethodSetup(services, organizationId, randomUUID());
  await provider.confirmSetupIntent({ setupIntentRef: intent.setupIntentRef, details: { kind: 'us_bank_account', routingNumber: SIMULATOR_TEST_ROUTING, accountNumber: '000123456789' }, idempotencyKey: randomUUID() });
  const invoiceRef = await issueAuditInvoice(services, organizationId, randomUUID());
  const { rows } = await options.owner.query('SELECT id FROM invoice WHERE stripe_invoice_id = $1', [invoiceRef]);
  const id = (rows[0] as { id: string } | undefined)?.id;
  if (id === undefined) {
    throw new Error('the audit invoice was not recorded');
  }
  return { billingInvoiceId: id };
}
