/**
 * @tp/billing (PRD 4 Monitoring v1: "Stripe billing: annual and monthly plans, invoices, ACH"; PRD 5, J18;
 * PRD 6, Billing; PRD 15, Billing: "Stripe (no PHI: organization names and invoices only)"; docs/adr/0050):
 * the provider interface, the event reader both implementations share, the plan catalog and the dunning
 * schedule. The Stripe implementation is `@tp/billing/stripe`, the local Stripe test-mode simulator
 * `@tp/billing/local`.
 */
export * from './types';
export { BillingEventError, INVOICE_KIND_METADATA, ORGANIZATION_METADATA, readStripeEvent } from './events';
export { CatalogError, type CatalogPrice, type PlanCatalog, type PlanPrice, parseCatalog, planCatalog, requireConfirmedCatalog } from './catalog';
export {
  DUNNING_SCHEDULE,
  type DunningEnding,
  type DunningNotice,
  type DunningStageCode,
  type DunningState,
  SIMULATOR_RETRY_DAYS,
  SUSPENSION_DAYS,
  nextDunningStep,
  noticeDue,
  suspendsAt,
  suspensionAt,
} from './dunning';
export { SIGNATURE_TOLERANCE_SECONDS, signPayload, verifySignature } from './signature';
