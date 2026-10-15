/**
 * Retention classes (PRD 19, Data lifecycle; docs/adr/0014), as metadata the intake, packet, audit
 * and deletion code reads. The schedule is the plan's default until counsel and the first customers
 * settle it; changing it is a reviewed edit here and a new ADR.
 *
 * - records: remittances, claims, lines and ledger entries, for the contract term plus six years
 *   (the customer's own compliance period). Source documents and model-call logs (inputs as hashes
 *   only) are retained with the records they belong to, so they take this class too.
 * - packets: seven years, write-once (S3 Object Lock).
 * - audit: the audit log and its nightly copies, seven years, write-once.
 * - backups: 35 days, aging out on their own schedule, as the policy and the terms state.
 *
 * A legal hold pauses every deletion; that check belongs to the deletion workflow (milestone 12).
 */
export const RETENTION_CLASSES = {
  records: { basis: 'contract_term_end', years: 6, days: 0, writeOnce: false },
  packets: { basis: 'created', years: 7, days: 0, writeOnce: true },
  audit: { basis: 'created', years: 7, days: 0, writeOnce: true },
  backups: { basis: 'created', years: 0, days: 35, writeOnce: false },
} as const satisfies Record<string, { basis: 'created' | 'contract_term_end'; years: number; days: number; writeOnce: boolean }>;

export type RetentionClass = keyof typeof RETENTION_CLASSES;

export class RetentionError extends Error {
  override readonly name = 'RetentionError';
}

export interface RetentionStart {
  /** When the record or object was created. */
  readonly createdAt: Date;
  /** For the records class: the last day of the contract term. */
  readonly contractTermEnd?: Date;
}

/** The first instant the class allows deletion, in UTC calendar arithmetic. */
export function retainUntil(retention: RetentionClass, start: RetentionStart): Date {
  const rule = RETENTION_CLASSES[retention];
  const from = rule.basis === 'contract_term_end' ? start.contractTermEnd : start.createdAt;
  if (from === undefined || Number.isNaN(from.getTime())) {
    throw new RetentionError(`retention class ${retention} counts from the ${rule.basis === 'contract_term_end' ? 'contract term end' : 'creation time'}, which is missing`);
  }
  return new Date(
    Date.UTC(
      from.getUTCFullYear() + rule.years,
      from.getUTCMonth(),
      from.getUTCDate() + rule.days,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}
