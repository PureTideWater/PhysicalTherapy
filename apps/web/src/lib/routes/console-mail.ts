import { MAIL_PAUSE_REASONS, MAIL_RESUME_REASONS, MAIL_STREAMS, type MailPauseReason, type MailResumeReason, type MailStream } from '@tp/db/runtime';
import { z } from 'zod';

import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult } from '../http/route';

/**
 * The console's mail streams (audit #76; docs/adr/0065, D6 to D10; the founder's Q9 of 2026-10-21; PRD 6, Admin
 * console), for a platform administrator (feature_flag.manage, checked again in each function):
 *
 * - /console/mail: each stream's state (sending, paused with its reason and the counts that paused it, or resumed and
 *   waiting for the reconcile to confirm SES is sending), the window's sends, bounces and complaints, the last probes
 *   and whether the screening is ready to open (console_mail_streams()); the screening's live bounce marks by kind,
 *   counts only (Q10 (a)); and the last 7 days' undelivered customer messages, one row each (support notices, dunning,
 *   invitations, digests), with the screening's counted by kind and state and never listed (console_mail_undelivered()).
 *   No screening address is read or shown, and SES's own record of a recipient is never read: a customer's row names its
 *   user by the sign-in email the console's other screens show.
 * - Pause: the screening stream alone, by hand (reason `operator`); the platform's mail_events job disables its SES set.
 * - Resume: with a reason, the cause fixed or a false alarm; the stream waits for the reconcile to confirm SES is
 *   sending, and the probes go at once.
 * The database writes mail_stream_paused and mail_stream_resumed, which the application role cannot write itself.
 */

export interface MailStreamView {
  readonly stream: MailStream;
  readonly pausedAt: Date | null;
  readonly pausedReason: MailPauseReason | null;
  readonly pauseCounts: { readonly sends: number; readonly bounces: number; readonly complaints: number } | null;
  /** Where the window's counts start: the later of 7 days ago and the last resume (console_mail_streams()). */
  readonly windowStartsAt: Date | null;
  readonly window: { readonly sends: number; readonly bounces: number; readonly complaints: number };
  readonly resumedAt: Date | null;
  /** When the reconcile last read SES sending while the database was open; null while paused or unconfirmed. */
  readonly confirmedAt: Date | null;
  readonly sending: boolean;
  readonly ready: boolean;
  readonly probes: { readonly sentAt: Date | null; readonly deliveredAt: Date | null; readonly bouncedAt: Date | null };
  /** The screening's live bounce marks (7 days) by kind; zero on the customer streams. */
  readonly marks: { readonly client: number; readonly account: number };
}

export interface UndeliveredView {
  readonly stream: MailStream;
  readonly kind: string;
  readonly state: string;
  /** The customer's user and practice (customer streams only); null on the screening's counts. */
  readonly recipient: string | null;
  readonly practice: string | null;
  readonly subjectId: string | null;
  readonly undeliveredAt: Date;
  readonly messages: number;
}

/** What the console calls each pause reason. */
export const PAUSE_REASON_LABELS: Readonly<Record<MailPauseReason, string>> = {
  bounce_rate: 'Its bounce rate passed the cut-off',
  complaint_rate: 'Its complaint rate passed the cut-off',
  account_rate: 'The SES account’s bounce or complaint rate reached its warning',
  account_review: 'SES put the account under review',
  operator: 'Paused by a platform administrator',
};

/** What the console calls each resume reason. */
export const RESUME_REASON_LABELS: Readonly<Record<MailResumeReason, string>> = {
  cause_fixed: 'The cause is fixed',
  false_alarm: 'It was a false alarm',
};

function pauseReason(value: string | null): MailPauseReason | null {
  return (MAIL_PAUSE_REASONS as readonly string[]).includes(value ?? '') ? (value as MailPauseReason) : null;
}

export const consoleMailPage = platformRoute({
  id: 'console.mail',
  kind: 'page',
  path: '/console/mail',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({ notice: z.enum(['paused', 'resumed', 'unchanged']).optional().catch(undefined) }),
  handle: async ({ scope, params }) => {
    const streams = await scope.client.query<{
      stream: MailStream;
      paused_at: Date | null;
      paused_reason: string | null;
      pause_sends: number | null;
      pause_bounces: number | null;
      pause_complaints: number | null;
      window_starts_at: Date | null;
      window_sends: number;
      window_bounces: number;
      window_complaints: number;
      resumed_at: Date | null;
      confirmed_at: Date | null;
      sending: boolean;
      ready: boolean;
      probe_sent_at: Date | null;
      probe_delivered_at: Date | null;
      probe_bounced_at: Date | null;
      client_marks: number;
      account_marks: number;
    }>(
      `SELECT stream, paused_at, paused_reason, pause_sends, pause_bounces, pause_complaints, window_starts_at, window_sends, window_bounces,
              window_complaints, resumed_at, confirmed_at, sending, ready, probe_sent_at, probe_delivered_at, probe_bounced_at, client_marks, account_marks
         FROM console_mail_streams()`,
    );
    const undelivered = await scope.client.query<{
      stream: MailStream;
      kind: string;
      state: string;
      recipient_user_id: string | null;
      practice_id: string | null;
      subject_id: string | null;
      undelivered_at: Date;
      messages: number;
    }>('SELECT stream, kind, state, recipient_user_id, practice_id, subject_id, undelivered_at, messages FROM console_mail_undelivered(NULL)');
    // The customer's sign-in email and the practice's name, as the console's other screens show them.
    const users = await scope.client.query<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ANY ($1::uuid[])', [
      undelivered.rows.flatMap((row) => (row.recipient_user_id === null ? [] : [row.recipient_user_id])),
    ]);
    const practices = await scope.client.query<{ practice_id: string; name: string }>('SELECT practice_id, name FROM console_practices(NULL)');
    const emailOf = new Map(users.rows.map((row) => [row.id, row.email]));
    const practiceOf = new Map(practices.rows.map((row) => [row.practice_id, row.name]));
    const order = new Map(MAIL_STREAMS.map((stream, index) => [stream, index]));
    return {
      notice: params.notice ?? null,
      streams: streams.rows
        .map(
          (row): MailStreamView => ({
            stream: row.stream,
            pausedAt: row.paused_at,
            pausedReason: pauseReason(row.paused_reason),
            pauseCounts: row.paused_at === null ? null : { sends: row.pause_sends ?? 0, bounces: row.pause_bounces ?? 0, complaints: row.pause_complaints ?? 0 },
            windowStartsAt: row.window_starts_at,
            window: { sends: row.window_sends, bounces: row.window_bounces, complaints: row.window_complaints },
            resumedAt: row.resumed_at,
            confirmedAt: row.confirmed_at,
            sending: row.sending,
            ready: row.ready,
            probes: { sentAt: row.probe_sent_at, deliveredAt: row.probe_delivered_at, bouncedAt: row.probe_bounced_at },
            marks: { client: row.client_marks, account: row.account_marks },
          }),
        )
        .sort((a, b) => (order.get(a.stream) ?? 0) - (order.get(b.stream) ?? 0)),
      undelivered: undelivered.rows.map(
        (row): UndeliveredView => ({
          stream: row.stream,
          kind: row.kind,
          state: row.state,
          recipient: row.recipient_user_id === null ? null : (emailOf.get(row.recipient_user_id) ?? row.recipient_user_id),
          practice: row.practice_id === null ? null : (practiceOf.get(row.practice_id) ?? row.practice_id),
          subjectId: row.subject_id,
          undeliveredAt: row.undelivered_at,
          messages: row.messages,
        }),
      ),
      resumeReasons: MAIL_RESUME_REASONS.map((reason) => ({ value: reason, label: RESUME_REASON_LABELS[reason] })),
    };
  },
  sample: { params: () => ({}) },
});

/** A database refusal's constraint, for a sentence. */
function constraintOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23514' && 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
}

export const pauseMailStream = platformRoute({
  id: 'console.mail.pause',
  kind: 'action',
  path: '/console/mail',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({}),
  // Only the screening stream pauses (a CHECK forbids the others); a stream paused by hand is the operator's.
  input: z.object({ stream: z.literal('screening', { message: 'only the screening stream pauses' }) }),
  audit: { action: 'mail_stream_pause_requested', objectType: 'mail_stream' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    try {
      const { rows } = await scope.client.query<{ paused: boolean }>("SELECT console_pause_mail_stream($1, 'operator') AS paused", [input.stream]);
      return { redirect: `/console/mail?notice=${rows[0]?.paused === true ? 'paused' : 'unchanged'}` };
    } catch (error) {
      if (constraintOf(error) === 'mail_stream_only_screening_pauses') {
        throw new InputError([{ field: 'stream', message: 'only the screening stream pauses' }]);
      }
      throw error;
    }
  },
  sample: { params: () => ({}), input: () => ({ stream: 'screening' }) },
});

export const resumeMailStream = platformRoute({
  id: 'console.mail.resume',
  kind: 'action',
  path: '/console/mail',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({}),
  input: z.object({
    stream: z.literal('screening', { message: 'only the screening stream pauses' }),
    reason: z.enum(MAIL_RESUME_REASONS, { message: 'say why: the cause is fixed, or it was a false alarm' }),
  }),
  audit: { action: 'mail_stream_resume_requested', objectType: 'mail_stream' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    const { rows } = await scope.client.query<{ resumed: boolean }>('SELECT console_resume_mail_stream($1, $2) AS resumed', [input.stream, input.reason]);
    return { redirect: `/console/mail?notice=${rows[0]?.resumed === true ? 'resumed' : 'unchanged'}` };
  },
  sample: { params: () => ({}), input: () => ({ stream: 'screening', reason: 'false_alarm' }) },
});

export const CONSOLE_MAIL_ROUTES = [consoleMailPage, pauseMailStream, resumeMailStream] as const;
