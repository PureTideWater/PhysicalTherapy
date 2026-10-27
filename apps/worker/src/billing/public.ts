/**
 * @tp/worker/billing: billing's services for the web app and the worker (docs/adr/0050): webhooks received
 * and applied once, an organization's billing as its administrators and the console read it, the changes
 * they ask Stripe for, the dunning notices, the nightly usage snapshot, the ROI statement's fees, and the
 * job chain's suspension check. Billing's own transactions run as tp_billing and read no PHI table.
 */
export { type AppliedEvent, type AppliedOutcome, type ReceiveDependencies, applyBillingEvent, receiveWebhook } from './events';
export {
  type BillingServices,
  BillingRefusedError,
  type ConsoleBillingRow,
  type HoldingInvoice,
  type InvoiceView,
  type OrganizationBilling,
  type SubscriptionView,
  assertManagesBilling,
  cancelPlan,
  consoleBillingStatus,
  ensureCustomer,
  issueAuditInvoice,
  organizationBilling,
  payOpenInvoice,
  paymentMethodOnFile,
  refusalMessage,
  startPaymentMethodSetup,
  subscribe,
} from './account';
export { type DunningEffect, type DunningOptions, type DunningOrganization, type DunningResult, billingLink, dunningEffect, dunningMessage, runDunning } from './dunning';
export { PAID_INVOICE_FEES } from './fees';
export { RUN_STARTING_JOBS, SUSPENDED_ERROR_CODE, practiceRunRefusal, practiceRunRefusalFor, startsRun } from './refusal';
export { type BillingClient, type BillingPool, billingRows, withBilling } from './scope';
export { type UsageSnapshotResult, recordUsageSnapshots } from './usage';
