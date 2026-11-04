/**
 * The database connections each of a web task's pools holds at most (services.ts servicesFromConfig and the queue's
 * producer, uploads/queue.ts), in one place for the app and for the infrastructure's connection budget
 * (infra/lib/connections.ts), which adds them up for every task an environment can run at once against its database's
 * max_connections at synthesis (docs/adr/0083, "The practice pool"). Every pool connects on demand and closes a
 * connection idle for thirty seconds (packages/db/src/connect.ts), so these are each pool's worst case.
 */
export const WEB_POOL_CONNECTIONS = {
  /** The application login's pool: every request's practice-scoped transaction. */
  application: 10,
  /** Billing's own login (docs/adr/0055): Stripe's webhook and the billing screens. */
  billing: 4,
  /** The e-signature vendor's login, opened only where one is configured (ESIGN_PROVIDER other than none). */
  esign: 2,
  /**
   * The model gateway's pool on the application login: one for each model call the process lets be in flight at once
   * (DEFAULT_CALL_LIMITS.perProcess, packages/model-gateway) and one to spare; pools.test.ts holds them equal.
   */
  model: 5,
  /** pg-boss as a producer only, on the queue login (uploads/queue.ts). */
  queue: 2,
} as const;
