import { DUNNING_SCHEDULE, type DunningStageCode, SUSPENSION_DAYS, nextDunningStep, suspensionAt } from '@tp/billing';
import { formatUsd, parseCents } from '@tp/money';

import type { MailMessage, MailSender } from '../mail/mail';
import { type BillingPool, billingRows, withBilling } from './scope';

/**
 * The daily dunning job (PRD 5, J18: "failed payments follow dunning and suspend new runs after 30 days";
 * PRD 6, Billing: "dunning; suspension rules"; docs/adr/0050). A platform job, as tp_billing on the
 * operator's login: for each invoice whose payment has failed, the notice the schedule has reached
 * (@tp/billing nextDunningStep: on the day it failed, a week later, two weeks later, a week before the
 * suspension, on the day the suspension takes effect), and once it is paid the ending (reinstated after a
 * suspension, unless another unpaid invoice still holds the organization suspended; resolved before one).
 * It looks only at invoices that may still need a word: unpaid ones short of the suspension's notice, and
 * paid ones whose ending has not been recorded (a payment before any notice and before the suspension needs
 * none). Invoices never notified come first, so a new failure is never crowded out by older ones.
 *
 * The suspension itself is the database's (billing_standing): it takes effect 30 days after the failure
 * whether or not this job runs, and lifts the moment the invoice is paid. This job tells the
 * organization's administrators (links only, never PHI) and records each notice once, in its own
 * transaction, with a system audit event: a failed send rolls it back for the next run.
 */

export interface DunningOptions {
  /** A login that may SET ROLE tp_billing (the operator's). */
  readonly pool: BillingPool;
  readonly mail: MailSender;
  /** The application's origin, for the link to the organization's billing settings. */
  readonly origin: string;
  readonly requestId: string;
  readonly now: Date;
}

export interface DunningResult {
  readonly notices: number;
  /** Notices recorded for an organization with no administrator to send them to. */
  readonly undeliverable: number;
}

interface DueRow {
  readonly id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly number: string | null;
  readonly amount_remaining_cents: string;
  readonly first_failed_at: Date;
  readonly paid_at: Date | null;
  readonly dunning_stage: DunningStageCode | null;
  readonly standing: 'good' | 'past_due' | 'suspended';
}

/** How many invoices one run looks at; the next run takes the rest. */
const AT_MOST = 500;

/** The notices before the suspension's: an unpaid invoice at one of them may still be due another. */
const NOTICES_BEFORE_SUSPENSION = DUNNING_SCHEDULE.filter((step) => step.notice !== 'suspended')
  .map((step) => `'${step.notice}'`)
  .join(', ');

export function billingLink(origin: string, organizationId: string): string {
  return `${new URL(origin).origin}/settings/billing/${organizationId}`;
}

/** The moment new runs stop, as a notice states it: the day and the time, in UTC. */
export function suspensionText(firstFailedAt: Date): string {
  const at = suspensionAt(firstFailedAt).toISOString();
  return `${at.slice(0, 10)} at ${at.slice(11, 16)} UTC`;
}

/** The notice's fixed sentences: the invoice's number and amount, dates and one link. */
export function dunningMessage(step: Exclude<DunningStageCode, 'resolved'>, to: readonly string[], row: Pick<DueRow, 'number' | 'amount_remaining_cents' | 'first_failed_at'>, link: string): MailMessage {
  const invoice = row.number === null ? 'an invoice' : `invoice ${row.number}`;
  const Invoice = row.number === null ? 'An invoice' : `Invoice ${row.number}`;
  const owed = formatUsd(parseCents(row.amount_remaining_cents));
  const suspends = suspensionText(row.first_failed_at);
  const lines: Record<typeof step, readonly string[]> = {
    payment_failed: [`The payment for ${invoice} (${owed}) failed.`, `Update the payment method or pay the invoice before ${suspends}; from then new runs stop until it is paid.`],
    second_notice: [`${Invoice} (${owed}) is still unpaid.`, `New runs stop on ${suspends} unless it is paid.`],
    third_notice: [`${Invoice} (${owed}) is still unpaid.`, `New runs stop on ${suspends} unless it is paid.`],
    final_notice: [`Final notice: ${invoice} (${owed}) is unpaid.`, `New runs stop on ${suspends}: pricing, monitoring, packet exports and reports. Your data stays readable.`],
    suspended: [`${Invoice} (${owed}) has been unpaid for 30 days since its payment failed, so new runs have stopped.`, 'Your data stays readable. Runs start again as soon as the invoice is paid.'],
    reinstated: [`${Invoice} is paid. New runs have started again.`],
  };
  const subjects: Record<typeof step, string> = {
    payment_failed: 'A payment failed',
    second_notice: 'An invoice is still unpaid',
    third_notice: 'An invoice is still unpaid',
    final_notice: 'Final notice before new runs stop',
    suspended: 'New runs have stopped until an invoice is paid',
    reinstated: 'New runs have started again',
  };
  return { to, subject: subjects[step], lines: lines[step], links: [link] };
}

const AUDIT = "SELECT billing_record_audit($1, $2, $3, $4, $5)";

export async function runDunning(options: DunningOptions): Promise<DunningResult> {
  const due = await withBilling(options.pool, (client) =>
    billingRows<DueRow>(
      client,
      `SELECT i.id, i.organization_id, i.status, i.number, i.amount_remaining_cents::text AS amount_remaining_cents, i.first_failed_at, i.paid_at, i.dunning_stage, s.standing
         FROM invoice i JOIN billing_standing s ON s.organization_id = i.organization_id
        WHERE i.first_failed_at IS NOT NULL
          AND ((i.status IN ('open', 'uncollectible') AND (i.dunning_stage IS NULL OR i.dunning_stage IN (${NOTICES_BEFORE_SUSPENSION})))
               OR (i.status = 'paid' AND (i.dunning_stage IN (${NOTICES_BEFORE_SUSPENSION}, 'suspended')
                                          OR (i.dunning_stage IS NULL AND i.paid_at >= i.first_failed_at + interval '${String(SUSPENSION_DAYS)} days'))))
        ORDER BY i.dunning_stage IS NOT NULL, i.first_failed_at, i.id
        LIMIT ${String(AT_MOST)}`,
    ),
  );
  let notices = 0;
  let undeliverable = 0;
  for (const row of due) {
    let step = nextDunningStep(
      { unpaid: row.status === 'open' || row.status === 'uncollectible', paid: row.status === 'paid', firstFailedAt: row.first_failed_at, paidAt: row.paid_at, stage: row.dunning_stage },
      options.now,
    );
    if (step === null) {
      continue;
    }
    if (step === 'reinstated' && row.standing === 'suspended') {
      // Another unpaid invoice still holds the organization suspended: this one is settled, quietly.
      step = 'resolved';
    }
    const recorded = step;
    const sent = await withBilling(options.pool, async (client) => {
      const claimed = await billingRows<{ id: string }>(
        client,
        'UPDATE invoice SET dunning_stage = $2, dunning_notified_at = now() WHERE id = $1 AND dunning_stage IS NOT DISTINCT FROM $3 RETURNING id',
        [row.id, recorded, row.dunning_stage],
      );
      if (claimed.length === 0) {
        return 'skipped' as const;
      }
      await client.query(AUDIT, ['billing_dunning_notice', 'invoice', row.id, recorded, options.requestId]);
      if (recorded === 'suspended') {
        await client.query(AUDIT, ['billing_suspended', 'organization', row.organization_id, 'nonpayment', options.requestId]);
      } else if (recorded === 'reinstated') {
        await client.query(AUDIT, ['billing_reinstated', 'organization', row.organization_id, 'paid', options.requestId]);
      }
      if (recorded === 'resolved') {
        return 'recorded' as const;
      }
      const emails = (await billingRows<{ email: string }>(client, 'SELECT email FROM billing_owner_emails($1)', [row.organization_id])).map((owner) => owner.email);
      if (emails.length === 0) {
        return 'undeliverable' as const;
      }
      await options.mail.send(dunningMessage(recorded, emails, row, billingLink(options.origin, row.organization_id)));
      return 'sent' as const;
    });
    notices += sent === 'sent' ? 1 : 0;
    undeliverable += sent === 'undeliverable' ? 1 : 0;
  }
  return { notices, undeliverable };
}
