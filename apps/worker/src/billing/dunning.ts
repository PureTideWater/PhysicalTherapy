import { DUNNING_SCHEDULE, type DunningStageCode, SUSPENSION_DAYS, nextDunningStep, suspensionAt } from '@tp/billing';
import { formatUsd, parseCents } from '@tp/money';

import type { Logger } from '@tp/observability';

import type { MailMessage, MailSender } from '../mail/mail';
import { MAIL_LOG_CODES, PERMANENT_SEND_ERRORS, sendErrorName } from '../mail/streams';
import { type BillingClient, type BillingPool, billingRows, withBilling } from './scope';

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
 * whether or not this job runs, and lifts the moment the invoice is paid. This job records each stage once, in its own
 * transaction, with a system audit event, and with it the stage's notice in a recorded outbox (audit #76, D10;
 * billing_open_dunning_notice()): one pending recipient a billing owner, or, with none, notice_undelivered on the
 * invoice (NOTICE_UNDELIVERABLE). Then each pending owner is sent one message (links only, never PHI) through the
 * notices stream, in its own transaction (billing_dunning_notice_claim(), then _sent with SES's message ID); a send
 * that throws is recorded in a new one (_failed) and tried again after 1, 5, 15 and 60 minutes, by this job or the
 * minute's dunning_notices job (sendDunningNotices), and fails after the fifth or at once on a permanent SES error. An
 * owner not delivered reports the stage's notice once: notice_undelivered on the invoice and NOTICE_UNDELIVERED with
 * its ID. When an organization is suspended is unchanged (the billing PR decides whether a delivered notice is waited
 * for). Each message's words are chosen when it is sent, from the organization's kind and status and billing's standing
 * (dunningEffect; SS-08, docs/adr/0080): it never says new runs started again while PaidWhole's suspension, a closure or
 * another unpaid invoice holds them, and never promises a firm anything about runs.
 */

export interface DunningOptions {
  /** A login that may SET ROLE tp_billing (the operator's). */
  readonly pool: BillingPool;
  readonly mail: MailSender;
  /** The application's origin, for the link to the organization's billing settings. */
  readonly origin: string;
  readonly requestId: string;
  readonly now: Date;
  /** Where NOTICE_UNDELIVERABLE and NOTICE_UNDELIVERED are logged, by the invoice's ID. */
  readonly logger?: Logger;
}

export interface DunningResult {
  /** Stage notices opened in this run, each with at least one owner to send it to. */
  readonly notices: number;
  /** Notices recorded for an organization with no billing owner to send them to. */
  readonly undeliverable: number;
  /** Messages SES accepted, one an owner. */
  readonly sent: number;
  /** Sends that threw (each tried again later, or failed). */
  readonly failed: number;
  /** Stage notices this run found not delivered to every owner, each reported once. */
  readonly undelivered: number;
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

/** The invoice as a notice names it. */
export type DunningInvoice = Pick<DueRow, 'id' | 'number' | 'amount_remaining_cents' | 'first_failed_at'>;

/**
 * What holds the organization's runs when a notice is sent (SS-08; docs/adr/0080, D13), first match wins: nothing to
 * promise for every firm and a closed group (a firm's nonpayment refuses nothing before milestone 12, docs/adr/0050;
 * a closure ends runs), PaidWhole's suspension of a group, billing's own hold (this invoice at its suspended stage, or
 * another that has reached its 30 days), or runs that follow this invoice alone.
 */
export type DunningEffect = 'runs' | 'billing_held' | 'held' | 'none';

/** The organization as a notice is decided by, read when it is sent: its kind and status, and billing's standing. */
export interface DunningOrganization {
  readonly kind: 'group' | 'firm' | 'internal';
  readonly status: 'active' | 'suspended' | 'closed';
  readonly standing: 'good' | 'past_due' | 'suspended';
}

export function dunningEffect(organization: DunningOrganization): DunningEffect {
  if (organization.kind !== 'group' || organization.status === 'closed') {
    return 'none';
  }
  if (organization.status === 'suspended') {
    return 'held';
  }
  return organization.standing === 'suspended' ? 'billing_held' : 'runs';
}

type NoticeStep = Exclude<DunningStageCode, 'resolved'>;

/**
 * The notice's fixed sentences, to one billing owner: the invoice's number and amount, dates and one link. `effect` is
 * what holds runs when it is sent (dunningEffect): only `runs` keeps the schedule's promises, and only `runs` says new
 * runs started again.
 */
export function dunningMessage(step: NoticeStep, to: string, recipientUserId: string, row: DunningInvoice, link: string, effect: DunningEffect): MailMessage {
  const invoice = row.number === null ? 'an invoice' : `invoice ${row.number}`;
  const Invoice = row.number === null ? 'An invoice' : `Invoice ${row.number}`;
  const owed = formatUsd(parseCents(row.amount_remaining_cents));
  const failed = `The payment for ${invoice} (${owed}) failed.`;
  const unpaid = `${Invoice} (${owed}) is still unpaid.`;
  const thirtyDays = `${Invoice} (${owed}) has been unpaid for 30 days since its payment failed.`;
  const paid = `${Invoice} is paid.`;
  const payFailed = 'Update the payment method or pay the invoice from the billing page.';
  const payUnpaid = 'Pay it, or update the payment method, from the billing page.';
  const already: Partial<Record<DunningEffect, string>> = {
    billing_held: 'New runs are already stopped until another unpaid invoice is paid.',
    held: "New runs are already stopped while PaidWhole's suspension of the organization lasts.",
  };
  const stillUnpaid = (hold: string | undefined) => [unpaid, payUnpaid, ...(hold === undefined ? [] : [hold])];
  let lines: readonly string[];
  if (effect === 'runs' || (effect === 'billing_held' && step === 'suspended')) {
    // Today's words: true while runs follow this invoice, and at its own suspension while billing holds runs for it.
    const suspends = suspensionText(row.first_failed_at);
    const schedule: Record<NoticeStep, readonly string[]> = {
      payment_failed: [failed, `Update the payment method or pay the invoice before ${suspends}; from then new runs stop until it is paid.`],
      second_notice: [unpaid, `New runs stop on ${suspends} unless it is paid.`],
      third_notice: [unpaid, `New runs stop on ${suspends} unless it is paid.`],
      final_notice: [`Final notice: ${invoice} (${owed}) is unpaid.`, `New runs stop on ${suspends}: pricing, monitoring, packet exports and reports. Your data stays readable.`],
      suspended: [`${Invoice} (${owed}) has been unpaid for 30 days since its payment failed, so new runs have stopped.`, 'Your data stays readable. Runs start again as soon as the invoice is paid.'],
      reinstated: [`${paid} New runs have started again.`],
    };
    lines = schedule[step];
  } else if (step === 'payment_failed') {
    lines = [failed, payFailed, ...(already[effect] === undefined ? [] : [already[effect]])];
  } else if (step === 'suspended') {
    lines = [thirtyDays, effect === 'held' ? 'New runs stay stopped until it is paid and PaidWhole reinstates the organization.' : 'Pay it from the billing page.'];
  } else if (step === 'reinstated') {
    const still: Partial<Record<DunningEffect, string>> = {
      billing_held: 'Another invoice is still unpaid, so new runs stay stopped until it is paid.',
      held: 'PaidWhole has also suspended the organization, so new runs stay stopped until PaidWhole reinstates it. The billing page says why and what to do next.',
    };
    lines = [paid, ...(still[effect] === undefined ? [] : [still[effect]])];
  } else {
    lines = stillUnpaid(already[effect]);
  }
  const subjects: Record<NoticeStep, string> = {
    payment_failed: 'A payment failed',
    second_notice: 'An invoice is still unpaid',
    third_notice: 'An invoice is still unpaid',
    final_notice: effect === 'runs' ? 'Final notice before new runs stop' : 'An invoice is still unpaid',
    suspended: effect === 'runs' || effect === 'billing_held' ? 'New runs have stopped until an invoice is paid' : 'An invoice has been unpaid for 30 days',
    reinstated: effect === 'runs' ? 'New runs have started again' : `${Invoice} is paid`,
  };
  return { to: [to], subject: subjects[step], lines, links: [link], identity: { stream: 'notices', kind: 'dunning', subjectId: row.id, recipientUserId } };
}

const AUDIT = "SELECT billing_record_audit($1, $2, $3, $4, $5)";

/** How many pending owners one run sends to; the next run takes the rest. */
const SEND_AT_MOST = 500;

interface PendingOwner {
  readonly invoice_id: string;
  readonly stage: NoticeStep;
  readonly organization_id: string;
  readonly user_id: string;
}

/** A send the mail service refused, carried out of the transaction it rolls back. */
class DunningSendFailed extends Error {
  override readonly name = 'DunningSendFailed';

  constructor(readonly sendError: unknown) {
    super('the mail service refused a dunning notice');
  }
}

type SendOutcome = 'sent' | 'skipped' | 'failed' | 'sent_undelivered' | 'failed_undelivered';

/** One owner's message, in its own transaction: claimed, sent, its message ID kept; a refused send recorded in a new one. */
async function sendOne(options: Pick<DunningOptions, 'pool' | 'mail' | 'origin' | 'requestId'>, owner: PendingOwner): Promise<SendOutcome> {
  try {
    return await withBilling(options.pool, async (client: BillingClient): Promise<SendOutcome> => {
      const [claimed] = await billingRows<{ email: string }>(client, 'SELECT email FROM billing_dunning_notice_claim($1, $2, $3)', [owner.invoice_id, owner.stage, owner.user_id]);
      if (claimed === undefined) {
        return 'skipped';
      }
      const [invoice] = await billingRows<DunningInvoice>(client, 'SELECT id, number, amount_remaining_cents::text AS amount_remaining_cents, first_failed_at FROM invoice WHERE id = $1', [owner.invoice_id]);
      if (invoice === undefined) {
        return 'skipped';
      }
      // What holds runs now, not when the stage was recorded: a retry comes 1 to 60 minutes later, and in between
      // PaidWhole may suspend or reinstate the organization, or another invoice reach its 30 days (D13).
      const [organization] = await billingRows<DunningOrganization>(
        client,
        'SELECT o.kind, o.status, s.standing FROM organization o JOIN billing_standing s ON s.organization_id = o.id WHERE o.id = $1',
        [owner.organization_id],
      );
      if (organization === undefined) {
        return 'skipped';
      }
      let messageId: string;
      try {
        ({ messageId } = await options.mail.send(dunningMessage(owner.stage, claimed.email, owner.user_id, invoice, billingLink(options.origin, owner.organization_id), dunningEffect(organization))));
      } catch (error) {
        throw new DunningSendFailed(error);
      }
      const [reported] = await billingRows<{ undelivered: boolean }>(client, 'SELECT billing_dunning_notice_sent($1, $2, $3, $4, $5) AS undelivered', [
        owner.invoice_id,
        owner.stage,
        owner.user_id,
        messageId,
        options.requestId,
      ]);
      return reported?.undelivered === true ? 'sent_undelivered' : 'sent';
    });
  } catch (error) {
    // Anything but a refused send (SES accepted the message and its record failed, say) leaves the owner pending.
    if (!(error instanceof DunningSendFailed)) {
      throw error;
    }
    const name = sendErrorName(error.sendError);
    const [reported] = await withBilling(options.pool, (client) =>
      billingRows<{ undelivered: boolean }>(client, 'SELECT billing_dunning_notice_failed($1, $2, $3, $4, $5, $6) AS undelivered', [
        owner.invoice_id,
        owner.stage,
        owner.user_id,
        name,
        PERMANENT_SEND_ERRORS.includes(name),
        options.requestId,
      ]),
    );
    return reported?.undelivered === true ? 'failed_undelivered' : 'failed';
  }
}

/**
 * Sends each billing owner whose stage notice is pending and due one message (billing_dunning_notices_pending()): the
 * daily job after it records the day's stages, and the minute's dunning_notices job for the retries.
 */
export async function sendDunningNotices(options: Pick<DunningOptions, 'pool' | 'mail' | 'origin' | 'requestId' | 'logger'>): Promise<{ readonly sent: number; readonly failed: number; readonly undelivered: number }> {
  const pending = await withBilling(options.pool, (client) =>
    billingRows<PendingOwner>(client, 'SELECT invoice_id, stage, organization_id, user_id FROM billing_dunning_notices_pending($1)', [SEND_AT_MOST]),
  );
  let sent = 0;
  let failed = 0;
  let undelivered = 0;
  for (const owner of pending) {
    const outcome = await sendOne(options, owner);
    sent += outcome === 'sent' || outcome === 'sent_undelivered' ? 1 : 0;
    failed += outcome === 'failed' || outcome === 'failed_undelivered' ? 1 : 0;
    if (outcome === 'sent_undelivered' || outcome === 'failed_undelivered') {
      undelivered += 1;
      options.logger?.error('dunning notice not delivered to every billing owner', { invoice_id: owner.invoice_id, error_code: MAIL_LOG_CODES.noticeUndelivered });
    }
  }
  return { sent, failed, undelivered };
}

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
    const opened = await withBilling(options.pool, async (client) => {
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
      // The stage's notice, in its outbox, in the stage's own transaction: recorded once with its owners, or undeliverable.
      const [notice] = await billingRows<{ recipients: number; opened: boolean }>(client, 'SELECT recipients, opened FROM billing_open_dunning_notice($1, $2, $3)', [row.id, recorded, options.requestId]);
      if (notice?.opened !== true) {
        return 'recorded' as const;
      }
      return notice.recipients === 0 ? ('undeliverable' as const) : ('opened' as const);
    });
    notices += opened === 'opened' ? 1 : 0;
    if (opened === 'undeliverable') {
      undeliverable += 1;
      options.logger?.error('dunning notice had no billing owner to send to', { invoice_id: row.id, error_code: MAIL_LOG_CODES.noticeUndeliverable });
    }
  }
  const sent = await sendDunningNotices(options);
  return { notices, undeliverable, ...sent };
}
