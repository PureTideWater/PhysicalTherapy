import type { PracticeScope, ScopeClient } from '@tp/db/runtime';

import type { JobHandler } from '../jobs/handlers';
import type { MailMessage, MailSender } from '../mail/mail';
import { notify, recipients } from '../monitor/chain';
import { todayUtc } from '../triage/execute';
import { digestFigures } from './figures';
import { type DigestFigures, digestSentences, monthName, parseDigestFigures, periodEnded } from './view';

/**
 * The digest job (PRD 5, J11; PRD 6, Monitoring jobs and notifications: "digests without PHI; in-app
 * notifications"; PRD 15, Stack: "SES; links only, never PHI in a body"; test matrix JOB-01 to JOB-03;
 * docs/adr/0039): a practice's digest of a month that has ended, keyed by the month
 * (digest:<practice>:<YYYY-MM>), one practice per job, three attempts with the operator's alert on the
 * third. The operator's daily schedule queues it for the month before; a digest already sent is left
 * as it is, so the days after the first are replays with no effect (JOB-01).
 *
 * 1. In one transaction (one digest of a practice at a time): the month's digest is recorded once, with
 *    its figures fixed (counts and totals only), and each of the practice's people who keeps in-app
 *    notifications on is told in the app, once.
 * 2. Then each of them who keeps the digest email on is sent it: fixed sentences with counts and dollar
 *    totals, and a link to the digest's page (opaque IDs only; the mail module's PHI guard checks it).
 * 3. The digest is marked sent. A failure before that leaves it unsent with its figures, and the next
 *    attempt sends the same figures again: delivery is at least once; a digest is never sent twice
 *    once marked.
 */

export interface DigestServices {
  readonly mail: MailSender;
  /** The application's origin, for the link. */
  readonly appOrigin: string;
  /** The clock (tests name a day). */
  readonly now?: () => Date;
}

export function digestLink(origin: string, practiceId: string, digestId: string): string {
  return `${new URL(origin).origin}/p/${practiceId}/digests/${digestId}`;
}

/** Who a digest is emailed to: the person's address and their user's ID (its tp_recipient tag). */
export interface DigestRecipient {
  readonly userId: string;
  readonly email: string;
}

/**
 * The email: the digest's sentences (payers by rank, never by name) and the link, on the transactional stream, tagged
 * with the digest's and the person's IDs (docs/adr/0039 and 0065).
 */
export function digestMessage(to: DigestRecipient, digestId: string, period: string, figures: DigestFigures, link: string): MailMessage {
  return {
    to: [to.email],
    subject: `Monitoring digest for ${monthName(period)}`,
    lines: [...digestSentences(period, figures), 'Open the digest in the application for the detail:'],
    links: [link],
    identity: { stream: 'transactional', kind: 'digest', subjectId: digestId, recipientUserId: to.userId },
  };
}

interface Prepared {
  readonly digestId: string;
  readonly sent: boolean;
  readonly figures: DigestFigures;
  readonly emails: readonly DigestRecipient[];
}

/** Records the month's digest (once) and its in-app notifications; returns who is to be emailed. */
export async function prepareDigest(scope: PracticeScope<ScopeClient>, practiceId: string, period: string, asOf: string): Promise<Prepared> {
  const { client } = scope;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('digest:' || $1::text, 0))", [practiceId]);
  const existing = (await client.query<{ id: string; sent: boolean; counts: unknown; totals_cents: unknown }>('SELECT id, sent_at IS NOT NULL AS sent, counts, totals_cents FROM digest WHERE practice_id = $1 AND period = $2', [practiceId, period])).rows[0];
  let digestId: string;
  let figures: DigestFigures;
  if (existing === undefined) {
    figures = await digestFigures(client, practiceId, period, asOf);
    const inserted = await client.query<{ id: string }>('INSERT INTO digest (practice_id, period, counts, totals_cents) VALUES ($1, $2, $3, $4) RETURNING id', [
      practiceId,
      period,
      JSON.stringify(figures.counts),
      JSON.stringify(figures.totals),
    ]);
    digestId = (inserted.rows[0] as { id: string }).id;
  } else {
    if (existing.sent) {
      return { digestId: existing.id, sent: true, figures: parseDigestFigures(existing.counts, existing.totals_cents), emails: [] };
    }
    digestId = existing.id;
    figures = parseDigestFigures(existing.counts, existing.totals_cents);
  }
  const people = await recipients(client);
  await notify(client, practiceId, 'digest', digestId, figures, people);
  return { digestId, sent: false, figures, emails: people.filter((person) => person.digestEmail).map((person) => ({ userId: person.userId, email: person.email })) };
}

export function digestHandler(services: DigestServices): JobHandler<'digest'> {
  return async (payload, context) => {
    const today = todayUtc(services.now?.() ?? new Date());
    if (!periodEnded(payload.period, today)) {
      // A digest reports on a whole month; its figures are fixed once recorded.
      context.logger.warn('digest refused for a month that has not ended', { error_code: 'DIGEST_MONTH_OPEN' });
      return;
    }
    const prepared = await context.transaction((scope) => prepareDigest(scope, payload.practice_id, payload.period, today));
    if (prepared.sent) {
      context.logger.info('digest already sent', { digest_id: prepared.digestId });
      return;
    }
    const link = digestLink(services.appOrigin, payload.practice_id, prepared.digestId);
    for (const to of prepared.emails) {
      await services.mail.send(digestMessage(to, prepared.digestId, payload.period, prepared.figures, link));
    }
    await context.transaction((scope) => scope.client.query('UPDATE digest SET sent_at = now() WHERE id = $1 AND practice_id = $2 AND sent_at IS NULL', [prepared.digestId, payload.practice_id]));
    context.logger.info('digest sent', { digest_id: prepared.digestId });
  };
}
