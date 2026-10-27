import { createHash, randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withActor, withPracticeScope } from './authz';
import { catalogProblems } from './catalog';
import { readDatabaseUrl } from './config';
import { APP_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, OPERATOR_ROLE, OWNER_ROLE, SCREENING_ROLE } from './roles';
import {
  DUNNING_NOTICE_STAGES,
  INVITATION_UNDELIVERED_REASONS,
  MAIL_BOUNCE_KINDS,
  MAIL_BOUNCE_SUBTYPES,
  MAIL_COMPLAINT_TYPES,
  MAIL_CUTOFF,
  MAIL_KINDS,
  MAIL_PAUSE_REASONS,
  MAIL_PROBE_MISSED_HOURS,
  MAIL_PROBE_READY_HOURS,
  MAIL_REFUSAL_REASONS,
  MAIL_SEND_DAYS,
  MAIL_STATES,
  MAIL_STREAMS,
  MAIL_STREAM_KINDS,
  MAIL_SUPPRESSION_SUBTYPES,
  NOTICE_RECIPIENT_STATES,
  NOTICE_RETRY_MINUTES,
  NOTIFICATION_KINDS,
  SCREENING_BOUNCE_MARK_KINDS,
  SUPPORT_GRANT_NOTICES,
} from './schema';
import { canonicalMailbox } from './mail-address';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from './testing';
import { MAILBOX_SPELLINGS } from './test-support/mailbox-spellings';

/**
 * The mail streams, delivery recorded by message, the notices' outboxes and the screening's cut-off (audit #76; migration
 * 20261107090000; docs/adr/0065; test matrix SCR-21, SEC-18, SEC-19, JOB-05). What the database proves: the mail tables
 * are the owner's alone and the notice tables are registered tenant tables the application reads; every function is
 * granted to exactly its role; the keyed hash of a refused address is keyed (unlike a plain SHA-256) and is the only
 * address-derived value kept; an event is recorded once per message, in any order; the cut-off pauses the screening
 * stream alone, at its edges, on its own rates or the account's signals, and a resume sends nothing until SES is
 * confirmed; a break-glass notice goes one message per administrator from a recorded outbox, is flagged undelivered in
 * the audit log and the app, and never reads as sent to nobody; dunning the same way; an invitation is flagged only by
 * its own message; and the expiry job deletes by the rules. The screening's own refusals (their order, the refusal list,
 * the bounce budget and the run's gate) are in screening.db.test.ts. Synthetic data only.
 */

const MIGRATION_TABLES = ['dunning_notice_recipient', 'mail_recipient_key', 'mail_send', 'mail_stream', 'screening_bounce_mark', 'screening_mail_refusal'] as const;
const NOTICE_TABLES = ['support_grant_notice', 'support_grant_notice_recipient'] as const;

let database: MigratedDatabase;
/** The superuser on the scratch database: seeds and reads past every policy. */
let owner: pg.Client;
let admin: pg.Pool;
let app: pg.Pool;
let world: TenantWorld;
let secondAdmin: string;
let engineer: string;
let platformAdmin: string;
/** Every address the tests mail, so the last test can look for any trace of one. */
const addresses: string[] = [];
const refusedScreeningAddresses: string[] = [];

interface Scope {
  readonly actor?: string;
  readonly practices?: readonly string[];
}

/** One transaction as `role` (app.actor_id and app.practice_ids as `scope` says), committed, or rolled back on error. */
async function inTransaction<T>(role: string, scope: Scope, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [scope.actor ?? '', `{${(scope.practices ?? []).join(',')}}`]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function as<T extends pg.QueryResultRow = pg.QueryResultRow>(role: string, sql: string, values: unknown[] = [], scope: Scope = {}): Promise<T[]> {
  return inTransaction(role, scope, async (client) => (await client.query<T>(sql, values)).rows);
}

const code = (attempt: Promise<unknown>) => attempt.then(() => 'accepted', (error: unknown) => (error as { code?: string }).code ?? 'error');
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** A message ID in SES's shape. */
const messageId = () => `0100019a${randomUUID().replace(/-/g, '')}-000000`;
const address = (label: string) => {
  const made = `${label}.${randomUUID().slice(0, 8)}@synthetic.test`;
  addresses.push(made);
  return made;
};
const request = () => `test-${randomUUID()}`;

interface MailEvent {
  readonly message: string;
  readonly stream: string;
  readonly event: string;
  readonly kind: string;
  readonly subject?: string | null;
  readonly recipient?: string | null;
  readonly recipientUser?: string | null;
  readonly practice?: string | null;
  readonly bounceKind?: string | null;
  readonly bounceSubtype?: string | null;
  readonly complaintType?: string | null;
  readonly mailAt?: Date;
  readonly eventAt?: Date;
}

interface Recorded {
  readonly recorded: boolean;
  readonly state: string;
  readonly notice_undelivered: string | null;
  readonly invoice_undelivered: string | null;
  readonly invitation_undelivered: string | null;
  readonly stream_paused: string | null;
}

const RECORD = 'SELECT * FROM operator_record_mail_event($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)';

function recordValues(event: MailEvent): unknown[] {
  return [
    event.message,
    event.stream,
    event.event,
    event.mailAt ?? new Date(),
    event.eventAt ?? new Date(),
    event.recipient ?? null,
    event.kind,
    event.subject ?? null,
    event.recipientUser ?? null,
    event.practice ?? null,
    event.bounceKind ?? null,
    event.bounceSubtype ?? null,
    event.complaintType ?? null,
    request(),
  ];
}

/** One SES event, as the platform's mail_events job records it: as tp_operator, a notice's in its practice's scope. */
async function record(event: MailEvent): Promise<Recorded> {
  const [row] = await as<Recorded & pg.QueryResultRow>(OPERATOR_ROLE, RECORD, recordValues(event), { practices: event.practice ? [event.practice] : [] });
  if (row === undefined) {
    throw new Error('operator_record_mail_event returned no row');
  }
  return row;
}

/** A screening message's event (no run behind it unless `subject` names one). */
const screeningEvent = (event: string, extra: Partial<MailEvent> = {}): MailEvent => ({
  message: messageId(),
  stream: 'screening',
  event,
  kind: 'screening_result',
  subject: randomUUID(),
  ...extra,
});

/** The screening stream as this migration seeds it, its window open since long ago, and no screening message kept. */
async function resetScreening(): Promise<void> {
  await owner.query('DELETE FROM screening_bounce_mark');
  await owner.query("DELETE FROM mail_send WHERE stream = 'screening'");
  await owner.query(
    `UPDATE mail_stream SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL,
            window_starts_at = now() - interval '30 days', resumed_at = NULL, ses_enabled_confirmed_at = now(), probe_sent_at = NULL, probe_delivered_at = NULL,
            probe_bounced_at = NULL
      WHERE stream = 'screening'`,
  );
}

/** Screening messages already recorded within the window: delivered ones, permanent bounces and complaints. */
async function seedScreening(delivered: number, bounced: number, complained: number): Promise<void> {
  await owner.query(
    `INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, bounce_kind, bounce_subtype, complaint_type, sent_at)
     SELECT 'seed' || replace(gen_random_uuid()::text, '-', ''), 'screening', 'screening_result', gen_random_uuid(), s.state,
            CASE WHEN s.state = 'bounced' THEN 'permanent' END, CASE WHEN s.state = 'bounced' THEN 'general' END, CASE WHEN s.state = 'complained' THEN 'abuse' END,
            now() - interval '1 hour'
       FROM (SELECT 'delivered' AS state FROM generate_series(1, $1::integer)
             UNION ALL SELECT 'bounced' FROM generate_series(1, $2::integer)
             UNION ALL SELECT 'complained' FROM generate_series(1, $3::integer)) s`,
    [delivered, bounced, complained],
  );
}

async function streamRow(stream: string): Promise<Record<string, unknown>> {
  const { rows } = await owner.query<Record<string, unknown>>('SELECT * FROM mail_stream WHERE stream = $1', [stream]);
  return rows[0] ?? {};
}

async function windowCounts(): Promise<{ sends: number; bounces: number; complaints: number }> {
  const { rows } = await owner.query<{ sends: number; bounces: number; complaints: number }>("SELECT sends, bounces, complaints FROM mail_window_counts('screening')");
  return rows[0] ?? { sends: -1, bounces: -1, complaints: -1 };
}

async function auditCount(action: string, objectId: string | null = null, purpose: string | null = null): Promise<number> {
  const { rows } = await owner.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM audit_event WHERE action = $1 AND ($2::uuid IS NULL OR object_id = $2) AND ($3::text IS NULL OR purpose = $3)',
    [action, objectId, purpose],
  );
  return rows[0]?.n ?? -1;
}

async function constraintLiterals(table: string, name: string): Promise<string[]> {
  const { rows } = await owner.query<{ definition: string }>('SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.conname = $2', [table, name]);
  return [...(rows[0]?.definition ?? '').matchAll(/'((?:[^']|'')*)'::text/g)].map((match) => (match[1] ?? '').replace(/''/g, "'"));
}

/** A break-glass grant to the support engineer, open now, or one that ended an hour ago. */
async function supportGrant(practiceId: string, ended = false): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at)
       VALUES ($1, $2, $3, 'T-76', 'SYNTHETIC', now() - $4::interval, now() - $4::interval + interval '4 hours')`,
      [id, practiceId, engineer, ended ? '5 hours' : '1 minute'],
    ),
  );
  return id;
}

interface Opened {
  readonly notice_id: string | null;
  readonly recipients: number;
  readonly opened: boolean;
}

async function openNotice(practiceId: string, grant: string, notice: string): Promise<Opened> {
  const [row] = await as<Opened & pg.QueryResultRow>(OPERATOR_ROLE, 'SELECT * FROM operator_open_support_notice($1, $2, $3)', [grant, notice, request()], { practices: [practiceId] });
  return row ?? { notice_id: null, recipients: -1, opened: false };
}

async function noticeRecipients(notice: string): Promise<{ user_id: string; state: string; attempts: number; ses_message_id: string | null; failure_code: string | null }[]> {
  return (
    await owner.query<{ user_id: string; state: string; attempts: number; ses_message_id: string | null; failure_code: string | null }>(
      'SELECT user_id, state, attempts, ses_message_id, failure_code FROM support_grant_notice_recipient WHERE notice_id = $1 ORDER BY user_id',
      [notice],
    )
  ).rows;
}

/** Claims one recipient and records its message SES accepted, in one transaction, as the job does. */
async function sendNotice(practiceId: string, notice: string, user: string, message: string): Promise<{ email: string | undefined; undelivered: boolean }> {
  return inTransaction(OPERATOR_ROLE, { practices: [practiceId] }, async (client) => {
    const claimed = (await client.query<{ email: string; reads: string }>('SELECT email, reads::text AS reads FROM operator_support_notice_claim($1, $2)', [notice, user])).rows[0];
    const sent = (await client.query<{ undelivered: boolean }>('SELECT operator_support_notice_sent($1, $2, $3, $4) AS undelivered', [notice, user, message, request()])).rows[0];
    return { email: claimed?.email, undelivered: sent?.undelivered ?? false };
  });
}

async function notifications(subject: string): Promise<{ user_id: string; practice_id: string; counts: unknown; totals_cents: unknown }[]> {
  return (
    await owner.query<{ user_id: string; practice_id: string; counts: unknown; totals_cents: unknown }>(
      "SELECT user_id, practice_id, counts, totals_cents FROM notification WHERE kind = 'support_notice_undelivered' AND subject_id = $1 ORDER BY user_id",
      [subject],
    )
  ).rows;
}

async function invoiceFor(organizationId: string): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO invoice (organization_id, stripe_invoice_id, stripe_customer_id, kind, status, currency, amount_due_cents, amount_paid_cents, amount_remaining_cents,
                          first_failed_at, stripe_event_at)
     VALUES ($1, 'in_' || replace(gen_random_uuid()::text, '-', ''), 'cus_synthetic', 'audit', 'open', 'usd', 100, 0, 100, now() - interval '1 day', now())
     RETURNING id`,
    [organizationId],
  );
  return rows[0]?.id ?? '';
}

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
  world = await createTenantWorld(owner, 'mail');
  secondAdmin = await createUser(owner);
  await addMembership(owner, world.organizationId, secondAdmin, 'practice_admin');
  const internal = await createOrganization(owner, 'internal', 'mail');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await endPool(admin);
  await owner.end();
  await database.drop();
});

describe('the mail tables and their grants (SEC-18)', () => {
  it('keeps the six mail tables the owner’s alone: forced row-level security, the owner’s policy only, no practice, no other role’s privilege', async () => {
    const { rows } = await owner.query<{ relname: string; forced: boolean; rls: boolean; owner: string; acl: string[] | null; practice_id: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced, pg_get_userbyid(c.relowner) AS owner, c.relacl::text[] AS acl,
              EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'practice_id' AND NOT a.attisdropped) AS practice_id
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY ($1) ORDER BY 1`,
      [[...MIGRATION_TABLES]],
    );
    expect(rows.map((row) => row.relname)).toEqual([...MIGRATION_TABLES]);
    for (const table of rows) {
      expect(table, table.relname).toMatchObject({ rls: true, forced: true, owner: OWNER_ROLE, practice_id: false });
      expect((table.acl ?? []).filter((entry) => !entry.startsWith(`${OWNER_ROLE}=`)), table.relname).toEqual([]);
      for (const role of [APP_ROLE, OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, JOB_ROLE, SCREENING_ROLE]) {
        const held = await owner.query<{ any: boolean }>(
          `SELECT has_table_privilege($1, $2::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1, $2::regclass, 'SELECT,INSERT,UPDATE') AS any`,
          [role, table.relname],
        );
        expect(held.rows[0]?.any, `${role} on ${table.relname}`).toBe(false);
      }
    }
    const policies = await owner.query<{ table_name: string; name: string; command: string; roles: string[]; using_expression: string; check_expression: string; permissive: boolean }>(
      `SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS command, pol.polpermissive AS permissive,
              ARRAY(SELECT pg_get_userbyid(r)::text FROM unnest(pol.polroles) r) AS roles,
              pg_get_expr(pol.polqual, pol.polrelid) AS using_expression, pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
         FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid WHERE c.relname = ANY ($1) ORDER BY 1, 2`,
      [[...MIGRATION_TABLES]],
    );
    expect(policies.rows).toEqual(
      MIGRATION_TABLES.map((table) => ({ table_name: table, name: `${table}_owner`, command: '*', permissive: true, roles: [OWNER_ROLE], using_expression: 'true', check_expression: 'true' })),
    );
    expect((await owner.query('SELECT table_name FROM phi_table_registry WHERE table_name = ANY ($1)', [[...MIGRATION_TABLES]])).rows).toEqual([]);
    // The application role cannot read or write any of them, the dev login every request uses included.
    for (const table of MIGRATION_TABLES) {
      expect(await code(app.query(`SELECT count(*) FROM ${table}`)), table).toBe('42501');
    }
    expect(await catalogProblems(owner)).toEqual([]);
  });

  it('registers the two notice tables as tenant tables the application role reads, and no role writes but through the functions', async () => {
    const registered = await owner.query<{ table_name: string; policy_name: string }>('SELECT table_name, policy_name FROM phi_table_registry WHERE table_name = ANY ($1) ORDER BY 1', [[...NOTICE_TABLES]]);
    expect(registered.rows).toEqual(NOTICE_TABLES.map((table) => ({ table_name: table, policy_name: `${table}_tenant` })));
    const tenant = "(practice_id = ANY ((current_setting('app.practice_ids'::text, true))::uuid[]))";
    const policies = await owner.query<{ table_name: string; name: string; command: string; permissive: boolean; roles: string[]; using_expression: string | null; check_expression: string | null }>(
      `SELECT c.relname AS table_name, pol.polname AS name, pol.polcmd::text AS command, pol.polpermissive AS permissive,
              ARRAY(SELECT CASE WHEN r = 0 THEN 'public' ELSE pg_get_userbyid(r)::text END FROM unnest(pol.polroles) r) AS roles,
              pg_get_expr(pol.polqual, pol.polrelid) AS using_expression, pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expression
         FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid WHERE c.relname = ANY ($1) ORDER BY 1, 2`,
      [[...NOTICE_TABLES]],
    );
    const restrictive =
      '((practice_id = ANY (( SELECT app_actor_group_practice_ids() AS app_actor_group_practice_ids)::uuid[])) OR ( SELECT app_actor_is_platform_admin() AS app_actor_is_platform_admin))';
    expect(policies.rows).toEqual(
      NOTICE_TABLES.flatMap((table) => [
        { table_name: table, name: `${table}_owner`, command: '*', permissive: true, roles: [OWNER_ROLE], using_expression: 'true', check_expression: 'true' },
        { table_name: table, name: `${table}_read_by_practice_and_platform`, command: 'r', permissive: false, roles: [APP_ROLE], using_expression: restrictive, check_expression: null },
        { table_name: table, name: `${table}_tenant`, command: '*', permissive: true, roles: ['public'], using_expression: tenant, check_expression: tenant },
      ]),
    );
    for (const table of NOTICE_TABLES) {
      const { rows } = await owner.query<{ acl: string[] }>('SELECT relacl::text[] AS acl FROM pg_class WHERE relname = $1', [table]);
      expect((rows[0]?.acl ?? []).filter((entry) => !entry.startsWith(`${OWNER_ROLE}=`)).sort(), table).toEqual([`${APP_ROLE}=r/${OWNER_ROLE}`]);
      for (const role of [OPERATOR_ROLE, BILLING_ROLE, ESIGN_ROLE, SCREENING_ROLE]) {
        const held = await owner.query<{ any: boolean }>("SELECT has_table_privilege($1, $2::regclass, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS any", [role, table]);
        expect(held.rows[0]?.any, `${role} on ${table}`).toBe(false);
      }
    }
  });

  it('grants every function of the migration to exactly its role, sets each one’s search path, and drops the three the outboxes replace', async () => {
    const expected: Readonly<Record<string, { readonly definer: boolean; readonly grantees: readonly string[] }>> = {
      'mail_recipient_canonical(text)': { definer: false, grantees: [] },
      'mail_recipient_sha256(text)': { definer: false, grantees: [] },
      'mail_send_expiry()': { definer: false, grantees: [] },
      'mail_state_rank(text)': { definer: false, grantees: [] },
      'mail_window_counts(text)': { definer: false, grantees: [] },
      'mail_stream_pause(text,uuid,text)': { definer: false, grantees: [] },
      'screening_mail_sending()': { definer: false, grantees: [] },
      'screening_mail_gate()': { definer: true, grantees: [SCREENING_ROLE] },
      'screening_mail_status()': { definer: true, grantees: [APP_ROLE] },
      'screening_submit_mail_refusal(text,text,text)': { definer: true, grantees: [APP_ROLE] },
      'screening_upload_mail_gate()': { definer: false, grantees: [] },
      'screening_bounce_budget_spent(text,text)': { definer: false, grantees: [] },
      'screening_contact_refused(text)': { definer: false, grantees: [] },
      'screening_run_mail_refusal()': { definer: false, grantees: [] },
      'screening_run_mail_gate()': { definer: false, grantees: [] },
      'support_notice_administrators(uuid)': { definer: false, grantees: [] },
      'support_notice_report_undelivered(uuid,text)': { definer: false, grantees: [] },
      'support_notice_counts(uuid,text)': { definer: false, grantees: [] },
      'dunning_notice_report_undelivered(uuid,text,text)': { definer: false, grantees: [] },
      'operator_open_support_notice(uuid,text,text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_support_notices_pending(integer)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_support_notice_claim(uuid,uuid)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_support_notice_sent(uuid,uuid,text,text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_support_notice_failed(uuid,uuid,text,boolean,text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_due_support_notices(integer)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text)': {
        definer: true,
        grantees: [OPERATOR_ROLE],
      },
      'operator_mail_account_signal(text,text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_mail_cutoff(text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'mail_stream_cutoff(text)': { definer: false, grantees: [] },
      'operator_mail_streams()': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_mail_stream_confirmed(text,boolean)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_mail_probe_sent(text)': { definer: true, grantees: [OPERATOR_ROLE] },
      'operator_mail_expire(integer)': { definer: true, grantees: [OPERATOR_ROLE] },
      'billing_open_dunning_notice(uuid,text,text)': { definer: true, grantees: [BILLING_ROLE] },
      'billing_dunning_notices_pending(integer)': { definer: true, grantees: [BILLING_ROLE] },
      'billing_dunning_notice_claim(uuid,text,uuid)': { definer: true, grantees: [BILLING_ROLE] },
      'billing_dunning_notice_sent(uuid,text,uuid,text,text)': { definer: true, grantees: [BILLING_ROLE] },
      'billing_dunning_notice_failed(uuid,text,uuid,text,boolean,text)': { definer: true, grantees: [BILLING_ROLE] },
      'console_mail_streams()': { definer: true, grantees: [APP_ROLE] },
      'console_pause_mail_stream(text,text)': { definer: true, grantees: [APP_ROLE] },
      'console_resume_mail_stream(text,text)': { definer: true, grantees: [APP_ROLE] },
      'console_mail_undelivered(timestamp with time zone)': { definer: true, grantees: [APP_ROLE] },
      'console_support_grants()': { definer: true, grantees: [APP_ROLE] },
      'submit_screening(text,text,text,text,text,text[],text[],integer[],text[],text[],text[],bigint[],integer[],integer,integer,bigint,integer,bigint,bigint,text,text,text,text,text,text,text,text,timestamp with time zone,text,text,text)':
        { definer: true, grantees: [APP_ROLE] },
    };
    const { rows } = await owner.query<{ name: string; definer: boolean; config: string[] | null; grantees: string[]; public: boolean }>(
      `SELECT p.oid::regprocedure::text AS name, p.prosecdef AS definer, p.proconfig AS config,
              ARRAY(SELECT DISTINCT pg_get_userbyid(x.grantee)::text FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                     WHERE x.privilege_type = 'EXECUTE' AND x.grantee <> 0 AND x.grantee <> p.proowner ORDER BY 1) AS grantees,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS public
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.oid::regprocedure::text = ANY ($1) ORDER BY 1`,
      [Object.keys(expected)],
    );
    expect(rows.map((row) => row.name).sort()).toEqual(Object.keys(expected).sort());
    for (const row of rows) {
      const wanted = expected[row.name];
      expect({ definer: row.definer, grantees: row.grantees, public: row.public, config: row.config }, row.name).toEqual({
        definer: wanted?.definer,
        grantees: [...(wanted?.grantees ?? [])].sort(),
        public: false,
        config: ['search_path=pg_catalog, public, pg_temp'],
      });
    }
    // The keyed hash is executable by no login and no role but its owner.
    const logins = await owner.query<{ rolname: string; may: boolean }>(
      "SELECT rolname, has_function_privilege(oid, 'mail_recipient_sha256(text)', 'EXECUTE') AS may FROM pg_roles WHERE rolname LIKE 'tp\\_%' AND rolname <> $1 ORDER BY 1",
      [OWNER_ROLE],
    );
    expect(logins.rows.filter((row) => row.may)).toEqual([]);
    const gone = await owner.query<{ name: string }>(
      "SELECT proname AS name FROM pg_proc WHERE proname IN ('operator_record_support_notice', 'operator_practice_administrator_emails', 'billing_owner_emails')",
    );
    expect(gone.rows).toEqual([]);
  });

  it('holds every closed list inline in its CHECK, equal to the TypeScript lists', async () => {
    expect(await constraintLiterals('mail_stream', 'mail_stream_name')).toEqual([...MAIL_STREAMS]);
    expect(await constraintLiterals('mail_stream', 'mail_stream_paused_reason')).toEqual([...MAIL_PAUSE_REASONS]);
    expect(await constraintLiterals('mail_send', 'mail_send_kind')).toEqual([...MAIL_KINDS]);
    expect(await constraintLiterals('mail_send', 'mail_send_state')).toEqual([...MAIL_STATES]);
    expect(await constraintLiterals('mail_send', 'mail_send_bounce_kind')).toEqual([...MAIL_BOUNCE_KINDS]);
    expect(await constraintLiterals('mail_send', 'mail_send_bounce_subtype')).toEqual([...MAIL_BOUNCE_SUBTYPES]);
    expect(await constraintLiterals('mail_send', 'mail_send_complaint_type')).toEqual([...MAIL_COMPLAINT_TYPES]);
    expect(await constraintLiterals('mail_send', 'mail_send_stream_kind')).toEqual(
      MAIL_STREAMS.flatMap((stream) => [stream, ...MAIL_STREAM_KINDS[stream]]),
    );
    expect(await constraintLiterals('screening_mail_refusal', 'screening_mail_refusal_reason')).toEqual([...MAIL_REFUSAL_REASONS]);
    expect(await constraintLiterals('screening_bounce_mark', 'screening_bounce_mark_subject_kind')).toEqual([...SCREENING_BOUNCE_MARK_KINDS]);
    expect(await constraintLiterals('support_grant_notice', 'support_grant_notice_kind')).toEqual([...SUPPORT_GRANT_NOTICES]);
    expect(await constraintLiterals('support_grant_notice_recipient', 'support_grant_notice_recipient_state')).toEqual([...NOTICE_RECIPIENT_STATES]);
    expect(await constraintLiterals('dunning_notice_recipient', 'dunning_notice_recipient_state')).toEqual([...NOTICE_RECIPIENT_STATES]);
    expect(await constraintLiterals('dunning_notice_recipient', 'dunning_notice_recipient_stage')).toEqual([...DUNNING_NOTICE_STAGES]);
    expect(await constraintLiterals('invitation', 'invitation_undelivered_reason')).toEqual([...INVITATION_UNDELIVERED_REASONS]);
    // The notification kinds, follow_up (migration 20261027090000) and support_notice_undelivered with them.
    expect(await constraintLiterals('notification', 'notification_kind_check')).toEqual([...NOTIFICATION_KINDS]);
  });

  it('seeds three streams, none paused and each confirmed, and one pepper of 32 bytes', async () => {
    const streams = await owner.query<{ stream: string; paused: boolean; confirmed: boolean }>(
      'SELECT stream, paused_at IS NOT NULL AS paused, ses_enabled_confirmed_at IS NOT NULL AS confirmed FROM mail_stream ORDER BY stream',
    );
    expect(streams.rows).toEqual(MAIL_STREAMS.map((stream) => ({ stream, paused: false, confirmed: true })).sort((a, b) => a.stream.localeCompare(b.stream)));
    const key = await owner.query<{ pepper: string }>('SELECT pepper FROM mail_recipient_key');
    expect(key.rows).toHaveLength(1);
    expect(key.rows[0]?.pepper).toMatch(/^[0-9a-f]{64}$/);
    // It never changes: no update, delete or truncate, even the owner's.
    expect(await code(asOwner(owner, [], () => owner.query("UPDATE mail_recipient_key SET pepper = repeat('0', 64)")))).toBe('P0001');
    expect(await code(asOwner(owner, [], () => owner.query('DELETE FROM mail_recipient_key')))).toBe('P0001');
  });
});

describe('the keyed hash of a screening address (Q11 (b); SEC-18)', () => {
  it('is keyed: not a plain SHA-256 of the address, the same for any case and spacing, and another with another pepper', async () => {
    const given = address('Keyed.Hash');
    const hash = async (value: string) => (await owner.query<{ h: string }>('SELECT mail_recipient_sha256($1) AS h', [value])).rows[0]?.h;
    const keyed = await hash(given);
    expect(keyed).toMatch(/^[0-9a-f]{64}$/);
    expect(await hash(`  ${given.toUpperCase()} `)).toBe(keyed);
    expect(keyed).not.toBe(sha256(given.toLowerCase()));
    expect(keyed).not.toBe(sha256(given));
    // Another pepper, another hash (the pepper is fixed for good, so the trigger is set aside for this one rolled-back look).
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query("UPDATE mail_recipient_key SET pepper = repeat('ab', 32)");
      expect(await hash(given)).not.toBe(keyed);
      expect(await hash(given)).toBe(createHash('sha256').update(Buffer.concat([Buffer.from('ab'.repeat(32), 'hex'), Buffer.from(given.toLowerCase(), 'utf8')])).digest('hex'));
    } finally {
      await owner.query('ROLLBACK');
    }
    expect(await hash(given)).toBe(keyed);
  });

  it('keys the mailbox an address reaches, not its spelling, by the TypeScript rule exactly (S2)', async () => {
    const { rows } = await owner.query<{ given: string; canonical: string }>('SELECT g AS given, mail_recipient_canonical(g) AS canonical FROM unnest($1::text[]) g', [
      MAILBOX_SPELLINGS.map(([given]) => given),
    ]);
    expect(rows.map((row) => [row.given, row.canonical])).toEqual(MAILBOX_SPELLINGS.map(([given, mailbox]) => [given, mailbox]));
    for (const row of rows) {
      expect(row.canonical, JSON.stringify(row.given)).toBe(canonicalMailbox(row.given));
    }
    // The keyed hash is of the mailbox: one hash for its every spelling, and the pepper and the canonical mailbox are
    // all it hashes.
    const hash = async (value: string) => (await owner.query<{ h: string }>('SELECT mail_recipient_sha256($1) AS h', [value])).rows[0]?.h;
    const pepper = (await owner.query<{ pepper: string }>('SELECT pepper FROM mail_recipient_key')).rows[0]?.pepper ?? '';
    const mailbox = await hash('synthetic.keyed@gmail.com');
    for (const spelling of ['SyntheticKeyed@gmail.com', ' synthetic.keyed+screening@GoogleMail.com. ', 's.y.n.t.h.e.t.i.c.k.e.y.e.d@gmail.com']) {
      expect(await hash(spelling), spelling).toBe(mailbox);
    }
    expect(mailbox).toBe(createHash('sha256').update(Buffer.concat([Buffer.from(pepper, 'hex'), Buffer.from('synthetickeyed@gmail.com', 'utf8')])).digest('hex'));
    // Dots name another mailbox off gmail.com.
    expect(await hash('synthetic.keyed@workspace.synthetic.test')).not.toBe(await hash('synthetickeyed@workspace.synthetic.test'));
    expect(await hash('synthetic.keyed+x@workspace.synthetic.test')).toBe(await hash('synthetic.keyed@workspace.synthetic.test'));
  });

  it('names no address in any error a mail function raises', async () => {
    const given = address('error.text');
    const failures: unknown[] = [];
    for (const event of [
      screeningEvent('bounce', { recipient: given, stream: 'nowhere' }),
      screeningEvent('bounce', { recipient: given, kind: 'digest' }),
      screeningEvent('bounce', { recipient: given, message: 'short' }),
      screeningEvent('opened', { recipient: given }),
      screeningEvent('bounce', { recipient: given, bounceKind: 'permanent', mailAt: undefined, kind: 'support_grant_opened', stream: 'notices' }),
    ]) {
      failures.push(await record(event).then(() => null, (error: unknown) => error));
    }
    for (const failure of failures) {
      expect(failure).toBeInstanceOf(Error);
      const { message, detail } = failure as { message: string; detail?: string };
      expect(`${message} ${detail ?? ''}`).not.toContain('@');
    }
  });
});

describe('an event, recorded once per message, in any order (JOB-05)', () => {
  it('keeps one row per message: the same event twice records once; a bounce before its send is a bounce, sent when SES says', async () => {
    await resetScreening();
    const message = messageId();
    const sentAt = new Date(Date.now() - 60_000);
    const delivered = { message, stream: 'transactional', event: 'delivery', kind: 'digest', subject: randomUUID(), recipientUser: world.adminUserId, mailAt: sentAt } as const;
    expect(await record(delivered)).toMatchObject({ recorded: true, state: 'delivered' });
    expect(await record(delivered)).toMatchObject({ recorded: false, state: 'delivered' });
    // A delay and a send after its delivery change nothing; a complaint after it does, and keeps the delivery's time.
    expect(await record({ ...delivered, event: 'delivery_delay' })).toMatchObject({ recorded: false, state: 'delivered' });
    expect(await record({ ...delivered, event: 'send' })).toMatchObject({ recorded: false, state: 'delivered' });
    expect(await record({ ...delivered, event: 'complaint', complaintType: 'abuse' })).toMatchObject({ recorded: true, state: 'complained' });
    expect(await record({ ...delivered, event: 'delivery' })).toMatchObject({ recorded: false, state: 'complained' });
    expect(await record({ ...delivered, event: 'bounce', bounceKind: 'permanent', bounceSubtype: 'general' })).toMatchObject({ recorded: false, state: 'complained' });
    const row = (
      await owner.query(
        'SELECT state, sent_at, delivered_at IS NOT NULL AS delivered, complaint_type, recipient_user_id, extract(day FROM expires_at - sent_at)::int AS kept FROM mail_send WHERE ses_message_id = $1',
        [message],
      )
    ).rows;
    expect(row).toEqual([{ state: 'complained', sent_at: sentAt, delivered: true, complaint_type: 'abuse', recipient_user_id: world.adminUserId, kept: MAIL_SEND_DAYS.transactional }]);
    // A bounce that arrives before its Send event: bounced, sent when SES's mail.timestamp says, and the send changes nothing.
    const early = screeningEvent('bounce', { recipient: address('early.bounce'), bounceKind: 'transient', bounceSubtype: 'mailbox_full', mailAt: sentAt });
    expect(await record(early)).toMatchObject({ recorded: true, state: 'bounced' });
    expect(await record({ ...early, event: 'send' })).toMatchObject({ recorded: false, state: 'bounced' });
    const bounced = (
      await owner.query('SELECT state, bounce_kind, bounce_subtype, sent_at, extract(day FROM expires_at - sent_at)::int AS kept FROM mail_send WHERE ses_message_id = $1', [early.message])
    ).rows;
    expect(bounced).toEqual([{ state: 'bounced', bounce_kind: 'transient', bounce_subtype: 'mailbox_full', sent_at: sentAt, kept: MAIL_SEND_DAYS.screening }]);
    // An unknown subtype is other; the account's or a set's suppression is suppressed, every other subtype (the global
    // suppression list's included) bounced; a rejection and a rendering failure are rejected.
    expect(await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: 'new_in_ses' }))).toMatchObject({ state: 'bounced' });
    for (const subtype of MAIL_BOUNCE_SUBTYPES) {
      expect((await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: subtype }))).state, subtype).toBe(
        MAIL_SUPPRESSION_SUBTYPES.includes(subtype) ? 'suppressed' : 'bounced',
      );
    }
    expect(MAIL_SUPPRESSION_SUBTYPES).toEqual(['on_account_suppression_list', 'on_configuration_set_suppression_list']);
    expect(await record(screeningEvent('reject'))).toMatchObject({ state: 'rejected' });
    expect(await record(screeningEvent('rendering_failure'))).toMatchObject({ state: 'rejected' });
    expect((await owner.query("SELECT count(*)::int AS n FROM mail_send WHERE bounce_subtype = 'other'")).rows).toEqual([{ n: 2 }]);
  });

  it('refuses an event its stream does not carry, a screening message naming a user, and an unknown event', async () => {
    expect(await code(record(screeningEvent('delivery', { kind: 'digest' })))).toBe('23514');
    expect(await code(record(screeningEvent('delivery', { recipientUser: world.adminUserId })))).toBe('accepted');
    // The user a screening event names is never kept: the screening stream names no customer.
    expect((await owner.query("SELECT count(*)::int AS n FROM mail_send WHERE stream = 'screening' AND recipient_user_id IS NOT NULL")).rows).toEqual([{ n: 0 }]);
    expect(await code(record(screeningEvent('open')))).toBe('23514');
    expect(await code(record({ message: messageId(), stream: 'transactional', event: 'delivery', kind: 'digest' }))).toBe('23514');
    // A notice's event runs in its practice's scope, or not at all.
    expect(await code(as(OPERATOR_ROLE, RECORD, recordValues({ message: messageId(), stream: 'notices', event: 'delivery', kind: 'support_grant_opened', subject: randomUUID(), practice: world.practiceId })))).toBe('42501');
    expect(await code(record({ message: messageId(), stream: 'notices', event: 'delivery', kind: 'support_grant_opened', subject: randomUUID() }))).toBe('42501');
  });
});

describe('the screening stream’s cut-off (SCR-21; the founder’s Q9)', () => {
  /** sends messages in the window, the last one's outcome arriving as an event: the reason it paused, or null. */
  async function cutOff(sends: number, bounces: number, complaints: number): Promise<string | null> {
    await resetScreening();
    const bounceLast = complaints === 0;
    await seedScreening(sends - bounces - complaints, bounceLast ? bounces - 1 : bounces, bounceLast ? complaints : complaints - 1);
    const given = address('cut.off');
    refusedScreeningAddresses.push(given);
    const result = await record(
      screeningEvent(bounceLast ? 'bounce' : 'complaint', { recipient: given, bounceKind: 'permanent', bounceSubtype: 'general', complaintType: 'abuse' }),
    );
    return result.stream_paused;
  }

  it('pauses at its edges, in integer arithmetic, as MAIL_CUTOFF says', async () => {
    expect(MAIL_CUTOFF).toEqual({ windowDays: 7, bounceBasisPoints: 300, bounceFloor: 200, complaintPer100k: 80, complaintFloor: 2500 });
    expect(await cutOff(150, 6, 0)).toBeNull();
    expect(await cutOff(150, 7, 0)).toBe('bounce_rate');
    expect(await cutOff(1000, 30, 0)).toBeNull();
    expect(await cutOff(1000, 31, 0)).toBe('bounce_rate');
    expect(await cutOff(100, 0, 2)).toBeNull();
    expect(await cutOff(100, 0, 3)).toBe('complaint_rate');
    expect(await cutOff(10_000, 0, 8)).toBeNull();
    expect(await cutOff(10_000, 0, 9)).toBe('complaint_rate');
    // The last pause: its counts, no SES confirmation, the system's audit event, and nothing claimed (screening_mail_gate()).
    expect(await streamRow('screening')).toMatchObject({ paused_reason: 'complaint_rate', paused_by: null, pause_sends: 10_000, pause_bounces: 0, pause_complaints: 9, ses_enabled_confirmed_at: null });
    const audit = await owner.query("SELECT actor_kind, actor_id, object_type, purpose FROM audit_event WHERE action = 'mail_stream_paused' ORDER BY at DESC LIMIT 1");
    expect(audit.rows).toEqual([{ actor_kind: 'system', actor_id: null, object_type: 'mail_stream', purpose: 'complaint_rate' }]);
    expect(await as(SCREENING_ROLE, 'SELECT sending FROM screening_mail_gate()')).toEqual([{ sending: false }]);
    // A further bounce while paused pauses nothing again.
    const before = await auditCount('mail_stream_paused');
    expect((await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: 'general' }))).stream_paused).toBeNull();
    expect(await auditCount('mail_stream_paused')).toBe(before);
  });

  it('counts a permanent bounce of every subtype SES counts toward the account’s bounce rate, the global suppression list’s among them, never the account’s or the set’s suppression, a transient or undetermined bounce, a not_spam complaint, a probe or a send before the window', async () => {
    await resetScreening();
    const expectCounts = async (sends: number, bounces: number, complaints: number) => expect(await windowCounts()).toEqual({ sends, bounces, complaints });
    for (const subtype of ['general', 'no_email', 'other']) {
      await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: subtype }));
    }
    await expectCounts(3, 3, 0);
    // SES's global suppression list (Permanent/Suppressed: the address bounced recently for any sender) counts toward the
    // account's bounce rate as any hard bounce does, so it is a bounce here too (M2).
    expect(await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: 'suppressed' }))).toMatchObject({ state: 'bounced' });
    await expectCounts(4, 4, 0);
    // The account's own list, and a set's override of it: SES did not send, and counts it toward no rate.
    for (const subtype of ['on_account_suppression_list', 'on_configuration_set_suppression_list']) {
      expect(await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: subtype }))).toMatchObject({ state: 'suppressed' });
    }
    await expectCounts(4, 4, 0);
    for (const [kind, subtype] of [
      ['transient', 'mailbox_full'],
      ['transient', 'message_too_large'],
      ['transient', 'content_rejected'],
      ['transient', 'attachment_rejected'],
      ['undetermined', 'undetermined'],
      ['undetermined', 'mailbox_full'],
    ]) {
      await record(screeningEvent('bounce', { bounceKind: kind, bounceSubtype: subtype }));
    }
    await expectCounts(10, 4, 0);
    // SES's Undetermined/Undetermined is kept as SES names it.
    expect((await owner.query("SELECT count(*)::int AS n FROM mail_send WHERE stream = 'screening' AND bounce_kind = 'undetermined' AND bounce_subtype = 'undetermined'")).rows).toEqual([{ n: 1 }]);
    await record(screeningEvent('complaint', { complaintType: 'not_spam' }));
    await expectCounts(11, 4, 0);
    await record(screeningEvent('complaint', { complaintType: 'abuse' }));
    await expectCounts(12, 4, 1);
    await record({ ...screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: 'general' }), kind: 'probe', subject: null });
    await expectCounts(12, 4, 1);
    // A send before the window starts (the last resume) is outside it.
    await record(screeningEvent('bounce', { bounceKind: 'permanent', bounceSubtype: 'general', mailAt: new Date(Date.now() - 40 * 24 * 3600_000) }));
    await expectCounts(12, 4, 1);
    await owner.query("UPDATE mail_stream SET window_starts_at = now() WHERE stream = 'screening'");
    await expectCounts(0, 0, 0);
  });

  it('pauses on the window alone when the platform’s mail_events run asks, so a window that shrinks past the line is seen without a new bounce (M9)', async () => {
    const cutoff = async () => (await as<{ paused: string | null }>(OPERATOR_ROLE, 'SELECT operator_mail_cutoff($1) AS paused', [request()]))[0]?.paused;
    // Under the line: nothing.
    await resetScreening();
    await seedScreening(144, 6, 0);
    expect(await cutoff()).toBeNull();
    expect(await streamRow('screening')).toMatchObject({ paused_at: null });
    // A window that shrank: 600 sends of 8 days ago leave it, and 29 bounces of 400 sends stay (7.25%).
    await resetScreening();
    await owner.query(
      `INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, sent_at)
       SELECT 'old' || replace(gen_random_uuid()::text, '-', ''), 'screening', 'screening_result', gen_random_uuid(), 'delivered', now() - interval '8 days'
         FROM generate_series(1, 600)`,
    );
    await seedScreening(371, 29, 0);
    const before = await auditCount('mail_stream_paused', null, 'bounce_rate');
    expect(await cutoff()).toBe('bounce_rate');
    expect(await streamRow('screening')).toMatchObject({ paused_reason: 'bounce_rate', paused_by: null, pause_sends: 400, pause_bounces: 29, ses_enabled_confirmed_at: null });
    expect(await auditCount('mail_stream_paused', null, 'bounce_rate')).toBe(before + 1);
    // Once: paused already, a second run pauses nothing again.
    expect(await cutoff()).toBeNull();
    expect(await auditCount('mail_stream_paused', null, 'bounce_rate')).toBe(before + 1);
    // Complaints the same way, by the same rule as an event's.
    await resetScreening();
    await seedScreening(97, 0, 3);
    expect(await cutoff()).toBe('complaint_rate');
    // Only the platform's role may ask.
    expect(await code(as(APP_ROLE, 'SELECT operator_mail_cutoff($1)', [request()]))).toBe('42501');
  });

  it('pauses the screening alone on the account’s signals, once, and never pauses the other streams, whatever their bounces', async () => {
    const signal = async (name: string) => (await as<{ paused: boolean }>(OPERATOR_ROLE, 'SELECT operator_mail_account_signal($1, $2) AS paused', [name, request()]))[0]?.paused;
    for (const [name, reason] of [
      ['bounce_rate_alarm', 'account_rate'],
      ['complaint_rate_alarm', 'account_rate'],
      ['enforcement_not_healthy', 'account_review'],
    ] as const) {
      await resetScreening();
      const before = await auditCount('mail_stream_paused', null, reason);
      expect(await signal(name), name).toBe(true);
      expect(await signal(name), name).toBe(false);
      expect(await streamRow('screening')).toMatchObject({ paused_reason: reason, ses_enabled_confirmed_at: null });
      expect(await auditCount('mail_stream_paused', null, reason)).toBe(before + 1);
    }
    expect(await code(signal('something_else'))).toBe('23514');
    // Every message on the customer streams bouncing pauses neither.
    for (let index = 0; index < 10; index += 1) {
      await record({ message: messageId(), stream: 'transactional', event: 'bounce', kind: 'digest', subject: randomUUID(), bounceKind: 'permanent', bounceSubtype: 'general' });
      await record({ message: messageId(), stream: 'notices', event: 'bounce', kind: 'dunning', subject: randomUUID(), bounceKind: 'permanent', bounceSubtype: 'general' });
    }
    for (const stream of ['transactional', 'notices']) {
      expect(await streamRow(stream), stream).toMatchObject({ paused_at: null });
      expect(
        await code(owner.query("UPDATE mail_stream SET paused_at = now(), paused_reason = 'bounce_rate', pause_sends = 0, pause_bounces = 0, pause_complaints = 0, ses_enabled_confirmed_at = NULL WHERE stream = $1", [stream])),
        stream,
      ).toBe('23514');
    }
  });

  it('is paused and resumed by a platform administrator alone, with a reason; a resume sends nothing until the reconcile reads SES sending', async () => {
    await resetScreening();
    const consoleCall = (actor: string, sql: string, values: unknown[]) => withActor(app, actor, async (scope) => (await scope.client.query<Record<string, unknown>>(sql, values)).rows);
    expect(await code(consoleCall(world.adminUserId, 'SELECT console_pause_mail_stream($1, $2)', ['screening', 'operator']))).toBe('42501');
    expect(await code(consoleCall(platformAdmin, 'SELECT console_pause_mail_stream($1, $2)', ['transactional', 'operator']))).toBe('23514');
    expect(await code(consoleCall(platformAdmin, 'SELECT console_pause_mail_stream($1, $2)', ['screening', 'investigating']))).toBe('23514');
    expect(await consoleCall(platformAdmin, 'SELECT console_pause_mail_stream($1, $2) AS paused', ['screening', 'operator'])).toEqual([{ paused: true }]);
    expect(await streamRow('screening')).toMatchObject({ paused_reason: 'operator', paused_by: platformAdmin, ses_enabled_confirmed_at: null });
    expect((await owner.query("SELECT actor_kind, actor_id, purpose FROM audit_event WHERE action = 'mail_stream_paused' ORDER BY at DESC LIMIT 1")).rows).toEqual([
      { actor_kind: 'user', actor_id: platformAdmin, purpose: 'operator' },
    ]);
    // While paused, the reconcile confirms nothing.
    const confirm = async (enabled: boolean) => (await as<{ confirmed: boolean }>(OPERATOR_ROLE, "SELECT operator_mail_stream_confirmed('screening', $1) AS confirmed", [enabled]))[0]?.confirmed;
    expect(await confirm(true)).toBe(false);
    // The resume: a platform administrator's, for a cause fixed or a false alarm.
    expect(await code(consoleCall(world.adminUserId, 'SELECT console_resume_mail_stream($1, $2)', ['screening', 'cause_fixed']))).toBe('42501');
    expect(await code(consoleCall(platformAdmin, 'SELECT console_resume_mail_stream($1, $2)', ['screening', 'because']))).toBe('23514');
    expect(await consoleCall(platformAdmin, 'SELECT console_resume_mail_stream($1, $2) AS resumed', ['screening', 'cause_fixed'])).toEqual([{ resumed: true }]);
    expect(await consoleCall(platformAdmin, 'SELECT console_resume_mail_stream($1, $2) AS resumed', ['screening', 'cause_fixed'])).toEqual([{ resumed: false }]);
    const resumed = await owner.query<{ fresh_window: boolean; resumed: boolean; paused_at: null; probe_sent_at: null; confirmed: boolean }>(
      `SELECT window_starts_at > now() - interval '1 minute' AS fresh_window, resumed_at IS NOT NULL AS resumed, paused_at, probe_sent_at,
              ses_enabled_confirmed_at IS NOT NULL AS confirmed FROM mail_stream WHERE stream = 'screening'`,
    );
    expect(resumed.rows).toEqual([{ fresh_window: true, resumed: true, paused_at: null, probe_sent_at: null, confirmed: false }]);
    expect((await owner.query("SELECT actor_kind, actor_id, purpose FROM audit_event WHERE action = 'mail_stream_resumed'")).rows).toEqual([
      { actor_kind: 'user', actor_id: platformAdmin, purpose: 'cause_fixed' },
    ]);
    // Resumed but unconfirmed: not sending, and no probe due; then SES reads enabled, and both follow.
    const gate = async () => (await as<{ sending: boolean; resumed: boolean }>(SCREENING_ROLE, 'SELECT sending, resumed_at IS NOT NULL AS resumed FROM screening_mail_gate()'))[0];
    const streams = async () => (await as<{ stream: string; paused: boolean; confirmed: boolean; probe_due: boolean; probe_missed: boolean }>(OPERATOR_ROLE, 'SELECT * FROM operator_mail_streams()')).find((row) => row.stream === 'screening');
    expect(await gate()).toEqual({ sending: false, resumed: true });
    expect(await streams()).toEqual({ stream: 'screening', paused: false, confirmed: false, probe_due: false, probe_missed: false });
    expect(await confirm(true)).toBe(true);
    expect(await gate()).toEqual({ sending: true, resumed: true });
    expect(await streams()).toEqual({ stream: 'screening', paused: false, confirmed: true, probe_due: true, probe_missed: false });
    // A read of the set disabled clears the confirmation; enabled again confirms it.
    expect(await confirm(false)).toBe(false);
    expect(await gate()).toEqual({ sending: false, resumed: true });
    expect(await confirm(true)).toBe(true);
    expect(await code(as(OPERATOR_ROLE, "SELECT operator_mail_stream_confirmed('elsewhere', true)"))).toBe('23514');
  });

  it('is ready only with a delivered and a bounced probe come back within 48 hours and since the last resume, the probes go daily or after 26 hours unanswered, and a stream is missed 26 hours after its last proof', async () => {
    await resetScreening();
    const status = async () => (await as<{ paused: boolean; ready: boolean }>(APP_ROLE, 'SELECT * FROM screening_mail_status()'))[0];
    const probe = (event: string) =>
      record({ message: messageId(), stream: 'screening', event, kind: 'probe', recipient: `${event === 'delivery' ? 'success' : 'bounce'}@simulator.amazonses.com`, bounceKind: 'permanent', bounceSubtype: 'general' });
    expect(await status()).toEqual({ paused: false, ready: false });
    await as(OPERATOR_ROLE, "SELECT operator_mail_probe_sent('screening')");
    await probe('delivery');
    expect(await status()).toEqual({ paused: false, ready: false });
    await probe('bounce');
    expect(await status()).toEqual({ paused: false, ready: true });
    // A probe's bounce is on no refusal list and in no window.
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_mail_refusal WHERE recipient_sha256 = mail_recipient_sha256($1)', ['bounce@simulator.amazonses.com'])).rows).toEqual([{ n: 0 }]);
    expect(await windowCounts()).toEqual({ sends: 0, bounces: 0, complaints: 0 });
    // Probes from before the last resume, or older than 48 hours, do not make it ready; nor does a pause.
    await owner.query("UPDATE mail_stream SET resumed_at = now() + interval '1 second' WHERE stream = 'screening'");
    expect(await status()).toEqual({ paused: false, ready: false });
    await owner.query("UPDATE mail_stream SET resumed_at = NULL, probe_delivered_at = now() - interval '49 hours' WHERE stream = 'screening'");
    expect(await status()).toEqual({ paused: false, ready: false });
    await owner.query("UPDATE mail_stream SET probe_delivered_at = now() WHERE stream = 'screening'");
    expect(await status()).toEqual({ paused: false, ready: true });
    await as(OPERATOR_ROLE, 'SELECT operator_mail_account_signal($1, $2)', ['enforcement_not_healthy', request()]);
    expect(await status()).toEqual({ paused: true, ready: false });
    // The schedule: daily once the last came back; again 26 hours after one that did not. Missed (review M3) reads the
    // stream's last proof, the older of its delivered and bounced probe, 26 hours old, whether a probe went since or not:
    // the daily probe goes at 24 hours, so one sent and lost is missed 2 hours later, 22 before readiness lapses at 48.
    await resetScreening();
    const due = async () => (await as<{ stream: string; probe_due: boolean; probe_missed: boolean }>(OPERATOR_ROLE, 'SELECT stream, probe_due, probe_missed FROM operator_mail_streams()')).find((row) => row.stream === 'screening');
    expect(await due()).toEqual({ stream: 'screening', probe_due: true, probe_missed: false });
    expect(MAIL_PROBE_READY_HOURS - MAIL_PROBE_MISSED_HOURS).toBe(22);
    for (const [sent, returned, wanted] of [
      ['23 hours', '22 hours', { probe_due: false, probe_missed: false }],
      ['25 hours', '24 hours', { probe_due: true, probe_missed: false }],
      ['25 hours', null, { probe_due: false, probe_missed: false }],
      ['27 hours', null, { probe_due: true, probe_missed: true }],
      ['27 hours', '28 hours', { probe_due: true, probe_missed: true }],
      // Sent 24 hours after the last came back, and lost.
      ['2 hours', `${String(MAIL_PROBE_MISSED_HOURS)} hours 1 minute`, { probe_due: false, probe_missed: true }],
      ['2 hours', `${String(MAIL_PROBE_MISSED_HOURS - 1)} hours 59 minutes`, { probe_due: false, probe_missed: false }],
      ['3 hours', '27 hours', { probe_due: false, probe_missed: true }],
      // None sent since the last came back (every send refused).
      ['28 hours', '27 hours', { probe_due: true, probe_missed: true }],
      ['26 hours', '25 hours', { probe_due: true, probe_missed: false }],
    ] as const) {
      await owner.query(
        "UPDATE mail_stream SET probe_sent_at = now() - $1::interval, probe_delivered_at = now() - $2::interval, probe_bounced_at = now() - $2::interval WHERE stream = 'screening'",
        [sent, returned],
      );
      expect(await due(), `${sent} ${String(returned)}`).toEqual({ stream: 'screening', ...wanted });
    }
    // The older of the two proofs decides. A proof from before the last resume does not count: one not back since the
    // resume counts from the probe sent after it, and with none sent yet the stream is due and not missed.
    for (const [sent, delivered, bounced, resumed, wanted] of [
      ['2 hours', '1 hour', '27 hours', null, { probe_due: false, probe_missed: true }],
      ['2 hours', '27 hours', '1 hour', null, { probe_due: false, probe_missed: true }],
      [null, '30 hours', '30 hours', '1 minute', { probe_due: true, probe_missed: false }],
      ['1 minute', '30 hours', '30 hours', '2 minutes', { probe_due: false, probe_missed: false }],
      ['27 hours', '30 hours', '30 hours', '28 hours', { probe_due: true, probe_missed: true }],
      ['27 hours', '26 hours 59 minutes', '30 hours', '28 hours', { probe_due: true, probe_missed: true }],
      ['2 hours', '1 hour', '30 hours', '28 hours', { probe_due: false, probe_missed: false }],
    ] as const) {
      await owner.query(
        `UPDATE mail_stream SET probe_sent_at = now() - $1::interval, probe_delivered_at = now() - $2::interval, probe_bounced_at = now() - $3::interval,
                                resumed_at = now() - $4::interval WHERE stream = 'screening'`,
        [sent, delivered, bounced, resumed],
      );
      expect(await due(), `${String(sent)} ${delivered} ${bounced} ${String(resumed)}`).toEqual({ stream: 'screening', ...wanted });
    }
    // Never while unconfirmed (a paused stream always is): a stream not meant to be sending is not missed.
    await owner.query("UPDATE mail_stream SET resumed_at = NULL, probe_sent_at = now() - interval '28 hours', probe_delivered_at = now() - interval '27 hours', probe_bounced_at = now() - interval '27 hours' WHERE stream = 'screening'");
    expect(await due()).toEqual({ stream: 'screening', probe_due: true, probe_missed: true });
    await owner.query("UPDATE mail_stream SET ses_enabled_confirmed_at = NULL WHERE stream = 'screening'");
    expect(await due()).toEqual({ stream: 'screening', probe_due: false, probe_missed: false });
  });
});

describe('break-glass notices from a recorded outbox (SEC-19; D10)', () => {
  it('goes one row per administrator, notice_sent at the first accepted send, and reports the first undelivered recipient once, in the audit log and the app', async () => {
    const grant = await supportGrant(world.practiceId);
    const opened = await openNotice(world.practiceId, grant, 'support_grant_opened');
    expect(opened).toMatchObject({ recipients: 2, opened: true });
    const notice = opened.notice_id ?? '';
    expect(await openNotice(world.practiceId, grant, 'support_grant_opened')).toEqual({ notice_id: notice, recipients: 2, opened: false });
    expect((await noticeRecipients(notice)).map((row) => [row.user_id, row.state])).toEqual([world.adminUserId, secondAdmin].sort().map((user) => [user, 'pending']));
    expect(await auditCount('notice_sent', grant)).toBe(0);
    // Due no more as an opening; pending as two recipients, IDs only.
    expect((await owner.query("SELECT notice FROM operator_due_support_notices(100) WHERE support_grant_id = $1", [grant])).rows).toEqual([]);
    const pending = await as<{ notice_id: string; user_id: string; notice: string }>(OPERATOR_ROLE, 'SELECT notice_id, user_id, notice FROM operator_support_notices_pending(100) WHERE support_grant_id = $1', [grant]);
    expect(pending.map((row) => row.user_id).sort()).toEqual([world.adminUserId, secondAdmin].sort());
    const messages = new Map<string, string>();
    for (const user of [world.adminUserId, secondAdmin]) {
      const message = messageId();
      messages.set(user, message);
      const sent = await sendNotice(world.practiceId, notice, user, message);
      expect(sent).toEqual({ email: `${user}@synthetic.test`, undelivered: false });
    }
    expect(await auditCount('notice_sent', grant, 'support_grant_opened')).toBe(1);
    // A second send to a recipient already sent is refused: no administrator gets the notice twice.
    expect(await code(sendNotice(world.practiceId, notice, world.adminUserId, messageId()))).toBe('23514');
    const event = (user: string, eventName: string, subtype: string | null = null) => ({
      message: messages.get(user) ?? '',
      stream: 'notices',
      event: eventName,
      kind: 'support_grant_opened',
      subject: notice,
      recipientUser: user,
      practice: world.practiceId,
      bounceKind: 'permanent',
      bounceSubtype: subtype,
    });
    expect(await record(event(world.adminUserId, 'delivery'))).toMatchObject({ recorded: true, state: 'delivered', notice_undelivered: null });
    expect(await record(event(secondAdmin, 'bounce', 'on_account_suppression_list'))).toMatchObject({ recorded: true, state: 'suppressed', notice_undelivered: grant });
    expect(await record(event(secondAdmin, 'bounce', 'on_account_suppression_list'))).toMatchObject({ recorded: false, notice_undelivered: null });
    expect(await auditCount('notice_undelivered', grant, 'support_grant_opened')).toBe(1);
    expect(await notifications(notice)).toEqual(
      [world.adminUserId, secondAdmin].sort().map((user) => ({ user_id: user, practice_id: world.practiceId, counts: {}, totals_cents: {} })),
    );
    // The console reads the counts from the rows; the practice's administrators read the rows in its scope.
    const support = await withActor(app, platformAdmin, async (scope) => (await scope.client.query<Record<string, unknown>>('SELECT * FROM console_support_grants() WHERE support_grant_id = $1', [grant])).rows);
    expect(support).toEqual([
      expect.objectContaining({
        opened_recipients: 2,
        opened_delivered: 1,
        opened_undelivered: 1,
        opened_pending: 0,
        opened_sent_at: expect.any(Date) as unknown,
        closed_recipients: null,
        closed_delivered: null,
      }),
    ]);
    const read = await withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, async (scope) =>
      (await scope.client.query<{ state: string }>('SELECT r.state FROM support_grant_notice_recipient r JOIN support_grant_notice n ON n.id = r.notice_id WHERE n.support_grant_id = $1 ORDER BY r.state', [grant])).rows,
    );
    expect(read).toEqual([{ state: 'delivered' }, { state: 'suppressed' }]);
    expect(await code(withPracticeScope(app, { actorId: world.adminUserId, practiceIds: [world.practiceId] }, (scope) => scope.client.query('DELETE FROM support_grant_notice_recipient')))).toBe('42501');
  });

  it('copies a state that arrived before the send was recorded, and the claim holds a recipient against a second run', async () => {
    const grant = await supportGrant(world.practiceId);
    const notice = (await openNotice(world.practiceId, grant, 'support_grant_opened')).notice_id ?? '';
    // A second run cannot claim the recipient the first holds; it may claim the other.
    const first = await admin.connect();
    try {
      await first.query('BEGIN');
      await first.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
      await first.query("SELECT set_config('app.practice_ids', $1, true)", [`{${world.practiceId}}`]);
      expect((await first.query('SELECT email FROM operator_support_notice_claim($1, $2)', [notice, world.adminUserId])).rows).toHaveLength(1);
      expect(await as(OPERATOR_ROLE, 'SELECT email FROM operator_support_notice_claim($1, $2)', [notice, world.adminUserId], { practices: [world.practiceId] })).toEqual([]);
      expect(await as(OPERATOR_ROLE, 'SELECT email FROM operator_support_notice_claim($1, $2)', [notice, secondAdmin], { practices: [world.practiceId] })).toHaveLength(1);
      // SES's bounce arrives before the run records the message's ID.
      const message = messageId();
      expect(
        await record({ message, stream: 'notices', event: 'bounce', kind: 'support_grant_opened', subject: notice, recipientUser: world.adminUserId, practice: world.practiceId, bounceKind: 'permanent', bounceSubtype: 'general' }),
      ).toMatchObject({ recorded: true, state: 'bounced', notice_undelivered: null });
      const sent = await first.query<{ undelivered: boolean }>('SELECT operator_support_notice_sent($1, $2, $3, $4) AS undelivered', [notice, world.adminUserId, message, request()]);
      expect(sent.rows).toEqual([{ undelivered: true }]);
      await first.query('COMMIT');
    } finally {
      first.release();
    }
    expect((await noticeRecipients(notice)).find((row) => row.user_id === world.adminUserId)).toMatchObject({ state: 'bounced' });
    expect(await auditCount('notice_undelivered', grant)).toBe(1);
    // The claim and every step refuse a transaction scoped to anything but the notice's practice.
    for (const practices of [[], [randomUUID()]]) {
      expect(await code(as(OPERATOR_ROLE, 'SELECT * FROM operator_support_notice_claim($1, $2)', [notice, secondAdmin], { practices }))).toBe('42501');
      expect(await code(as(OPERATOR_ROLE, 'SELECT * FROM operator_open_support_notice($1, $2, $3)', [grant, 'support_grant_closed', request()], { practices }))).toBe('42501');
    }
  });

  it('keeps a grant’s opening and closing notices apart, and retries a failed send only to its recipient until it fails for good', async () => {
    const grant = await supportGrant(world.practiceId, true);
    const opening = (await openNotice(world.practiceId, grant, 'support_grant_opened')).notice_id ?? '';
    const closing = await openNotice(world.practiceId, grant, 'support_grant_closed');
    expect(closing).toMatchObject({ recipients: 2, opened: true });
    expect((await owner.query('SELECT notified_at IS NOT NULL AS notified FROM support_grant WHERE id = $1', [grant])).rows).toEqual([{ notified: true }]);
    const failed = (notice: string, user: string, name: string, permanent: boolean) =>
      as<{ undelivered: boolean }>(OPERATOR_ROLE, 'SELECT operator_support_notice_failed($1, $2, $3, $4, $5) AS undelivered', [notice, user, name, permanent, request()], {
        practices: [world.practiceId],
      }).then((rows) => rows[0]?.undelivered);
    // A send that threw waits 1, 5, 15 and 60 minutes, and fails after the fifth.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      expect(await failed(opening, world.adminUserId, 'Throttling', false)).toBe(false);
      const [row] = (
        await owner.query<{ attempts: number; state: string; wait: number }>(
          "SELECT attempts, state, round(extract(epoch FROM next_attempt_at - now()) / 60)::int AS wait FROM support_grant_notice_recipient WHERE notice_id = $1 AND user_id = $2",
          [opening, world.adminUserId],
        )
      ).rows;
      expect(row).toEqual({ attempts: attempt, state: 'pending', wait: NOTICE_RETRY_MINUTES[attempt - 1] });
      // Not due again until then: the retry goes to no one sooner.
      expect(await as(OPERATOR_ROLE, 'SELECT 1 FROM operator_support_notices_pending(100) WHERE notice_id = $1 AND user_id = $2', [opening, world.adminUserId])).toEqual([]);
    }
    expect(await failed(opening, world.adminUserId, 'Throttling', false)).toBe(true);
    // The other administrator's, permanent at once; the notice was reported already.
    expect(await failed(opening, secondAdmin, 'Not a name!', true)).toBe(false);
    expect((await noticeRecipients(opening)).map((row) => [row.state, row.attempts, row.failure_code, row.ses_message_id])).toEqual([
      ['failed', world.adminUserId < secondAdmin ? 5 : 1, world.adminUserId < secondAdmin ? 'Throttling' : 'Unrecognized', null],
      ['failed', world.adminUserId < secondAdmin ? 1 : 5, world.adminUserId < secondAdmin ? 'Unrecognized' : 'Throttling', null],
    ]);
    // The closing notice undelivered too: a second notification each, its subject the closing notice's own row.
    expect(await failed(closing.notice_id ?? '', secondAdmin, 'MessageRejected', true)).toBe(true);
    expect(await notifications(opening)).toHaveLength(2);
    expect(await notifications(closing.notice_id ?? '')).toHaveLength(2);
    expect(await auditCount('notice_undelivered', grant)).toBe(2);
  });

  it('records a notice to a practice with no administrator as undelivered, and never as sent', async () => {
    const lonely = await createTenantWorld(owner, 'no administrator');
    // The practice's one administrator disabled, past the rule that keeps one (this test's state only).
    await owner.query('BEGIN');
    await owner.query('SET LOCAL session_replication_role = replica');
    await owner.query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [lonely.adminUserId]);
    await owner.query('COMMIT');
    const grant = await supportGrant(lonely.practiceId);
    expect(await openNotice(lonely.practiceId, grant, 'support_grant_opened')).toMatchObject({ recipients: 0, opened: true });
    expect(await auditCount('notice_sent', grant)).toBe(0);
    expect(await auditCount('notice_undelivered', grant, 'support_grant_opened')).toBe(1);
    expect((await owner.query("SELECT notice FROM operator_due_support_notices(100) WHERE support_grant_id = $1 AND notice = 'support_grant_opened'", [grant])).rows).toEqual([]);
    expect(await as(OPERATOR_ROLE, 'SELECT 1 FROM operator_support_notices_pending(100) WHERE support_grant_id = $1', [grant])).toEqual([]);
    expect(await openNotice(lonely.practiceId, grant, 'support_grant_opened')).toMatchObject({ recipients: 0, opened: false });
    expect(await auditCount('notice_undelivered', grant)).toBe(1);
  });

  it('leaves an opening the previous image recorded (its notice_sent) to it', async () => {
    const grant = await supportGrant(world.practiceId);
    await asOwner(owner, [world.practiceId], () =>
      owner.query("INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ('system', 'notice_sent', 'support_grant', $1, $2, $1, 'support_grant_opened')", [
        grant,
        world.practiceId,
      ]),
    );
    expect((await owner.query("SELECT notice FROM operator_due_support_notices(100) WHERE support_grant_id = $1", [grant])).rows).toEqual([]);
    expect(await openNotice(world.practiceId, grant, 'support_grant_opened')).toEqual({ notice_id: null, recipients: 0, opened: false });
  });
});

describe('dunning from the same outbox (D10), as tp_billing', () => {
  it('goes one row per billing owner, reports an undelivered stage once on the invoice, and with no owner records it undelivered', async () => {
    const invoice = await invoiceFor(world.organizationId);
    const open = (target: string, stage: string) =>
      as<{ recipients: number; opened: boolean }>(BILLING_ROLE, 'SELECT * FROM billing_open_dunning_notice($1, $2, $3)', [target, stage, request()]).then((rows) => rows[0]);
    expect(await open(invoice, 'payment_failed')).toEqual({ recipients: 2, opened: true });
    expect(await open(invoice, 'payment_failed')).toEqual({ recipients: 2, opened: false });
    expect(await code(open(invoice, 'resolved'))).toBe('23514');
    const pending = await as<{ user_id: string }>(BILLING_ROLE, 'SELECT user_id FROM billing_dunning_notices_pending(100) WHERE invoice_id = $1', [invoice]);
    expect(pending.map((row) => row.user_id).sort()).toEqual([world.adminUserId, secondAdmin].sort());
    const messages = new Map<string, string>();
    for (const user of [world.adminUserId, secondAdmin]) {
      const message = messageId();
      messages.set(user, message);
      const sent = await inTransaction(BILLING_ROLE, {}, async (client) => {
        const email = (await client.query<{ email: string }>('SELECT email FROM billing_dunning_notice_claim($1, $2, $3)', [invoice, 'payment_failed', user])).rows[0]?.email;
        const undelivered = (await client.query<{ undelivered: boolean }>('SELECT billing_dunning_notice_sent($1, $2, $3, $4, $5) AS undelivered', [invoice, 'payment_failed', user, message, request()])).rows[0]
          ?.undelivered;
        return { email, undelivered };
      });
      expect(sent).toEqual({ email: `${user}@synthetic.test`, undelivered: false });
    }
    const bounce = { stream: 'notices', event: 'bounce', kind: 'dunning', subject: invoice, bounceKind: 'permanent', bounceSubtype: 'no_email' } as const;
    expect(await record({ ...bounce, message: messages.get(world.adminUserId) ?? '', recipientUser: world.adminUserId })).toMatchObject({ invoice_undelivered: invoice });
    expect(await record({ ...bounce, message: messages.get(secondAdmin) ?? '', recipientUser: secondAdmin })).toMatchObject({ invoice_undelivered: null, state: 'bounced' });
    expect(await auditCount('notice_undelivered', invoice, 'payment_failed')).toBe(1);
    // A failed send: retried, then failed for good, on the next stage; its report is that stage's own.
    expect(await open(invoice, 'second_notice')).toEqual({ recipients: 2, opened: true });
    const failed = (user: string, permanent: boolean) =>
      as<{ undelivered: boolean }>(BILLING_ROLE, 'SELECT billing_dunning_notice_failed($1, $2, $3, $4, $5, $6) AS undelivered', [invoice, 'second_notice', user, 'Throttling', permanent, request()]).then(
        (rows) => rows[0]?.undelivered,
      );
    expect(await failed(world.adminUserId, false)).toBe(false);
    expect(await failed(world.adminUserId, true)).toBe(true);
    expect(await auditCount('notice_undelivered', invoice, 'second_notice')).toBe(1);
    // An organization with no billing owner: undelivered at once, once.
    const nobody = await createOrganization(owner, 'group', 'no owner');
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await addMembership(owner, nobody, invited, 'practice_admin');
    const orphan = await invoiceFor(nobody);
    expect(await open(orphan, 'payment_failed')).toEqual({ recipients: 0, opened: true });
    expect(await open(orphan, 'payment_failed')).toEqual({ recipients: 0, opened: false });
    expect(await auditCount('notice_undelivered', orphan, 'payment_failed')).toBe(1);
    // Billing reads and writes the rows through its functions alone.
    expect(await code(as(BILLING_ROLE, 'SELECT count(*) FROM dunning_notice_recipient'))).toBe('42501');
  });
});

describe('invitations flagged by their own message alone (D10)', () => {
  async function invite(sentAgo: string): Promise<{ user: string; invitation: string }> {
    const user = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const membership = await addMembership(owner, world.organizationId, user, 'viewer');
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
       VALUES ($1, $2, $3, $4, now() - $5::interval, now() - $5::interval + interval '7 days', $4) RETURNING id`,
      [world.organizationId, membership, user, world.adminUserId, sentAgo],
    );
    return { user, invitation: rows[0]?.id ?? '' };
  }
  const cognito = (user: string, event: string, mailAt: Date) =>
    record({ message: messageId(), stream: 'transactional', event, kind: 'cognito', recipient: ` ${user.toUpperCase()}@Synthetic.Test`, bounceKind: 'permanent', bounceSubtype: 'general', complaintType: 'abuse', mailAt });

  it('flags a pending invitation with its message’s time, never an accepted one, and never by the late bounce of a message a resend replaced', async () => {
    const pending = await invite('2 minutes');
    const bounced = await cognito(pending.user, 'bounce', new Date());
    expect(bounced.invitation_undelivered).toBe(pending.invitation);
    const flagged = await owner.query<{ undelivered_reason: string; same: boolean }>(
      'SELECT i.undelivered_reason, i.undelivered_at = m.sent_at AS same FROM invitation i, mail_send m WHERE i.id = $1 AND m.recipient_user_id = $2',
      [pending.invitation, pending.user],
    );
    expect(flagged.rows).toEqual([{ undelivered_reason: 'bounced', same: true }]);
    // An accepted invitation stays as it is.
    const accepted = await invite('2 minutes');
    await owner.query('UPDATE invitation SET accepted_at = now() WHERE id = $1', [accepted.invitation]);
    expect((await cognito(accepted.user, 'bounce', new Date())).invitation_undelivered).toBeNull();
    expect((await owner.query('SELECT undelivered_at FROM invitation WHERE id = $1', [accepted.invitation])).rows).toEqual([{ undelivered_at: null }]);
    // Sent again now: the old message's late bounce (sent 10 minutes ago) flags nothing; 3 seconds of skew still counts;
    // the new message's complaint flags it.
    const resent = await invite('0 seconds');
    expect((await cognito(resent.user, 'bounce', new Date(Date.now() - 600_000))).invitation_undelivered).toBeNull();
    expect((await owner.query('SELECT undelivered_at FROM invitation WHERE id = $1', [resent.invitation])).rows).toEqual([{ undelivered_at: null }]);
    const sentAt = (await owner.query<{ sent_at: Date }>('SELECT sent_at FROM invitation WHERE id = $1', [resent.invitation])).rows[0]?.sent_at ?? new Date();
    expect((await cognito(resent.user, 'complaint', new Date(sentAt.getTime() - 3_000))).invitation_undelivered).toBe(resent.invitation);
    expect((await owner.query('SELECT undelivered_reason FROM invitation WHERE id = $1', [resent.invitation])).rows).toEqual([{ undelivered_reason: 'complained' }]);
    // A delivered Cognito message flags nothing.
    const delivered = await invite('1 minute');
    expect((await cognito(delivered.user, 'delivery', new Date())).invitation_undelivered).toBeNull();
    // The application role writes neither column.
    expect(await code(withActor(app, world.adminUserId, (scope) => scope.client.query('UPDATE invitation SET undelivered_at = NULL WHERE id = $1', [pending.invitation])))).toBe('42501');
  });
});

describe('a message SES accepted and never sent: the address on the account’s suppression list (M1)', () => {
  // The mail_events job reads SES's Complaint of subtype OnAccountSuppressionList, and its Bounce of that subtype, as
  // this suppressed bounce (apps/worker/src/mail/events.ts): undelivered on every customer stream, counted on none.
  const suppressed = { event: 'bounce', bounceKind: 'permanent', bounceSubtype: 'on_account_suppression_list' } as const;

  it('reads undelivered for a dunning notice and an invitation, and for the screening counts toward nothing and refuses no address', async () => {
    const invoice = await invoiceFor(world.organizationId);
    expect((await as<{ recipients: number }>(BILLING_ROLE, 'SELECT recipients FROM billing_open_dunning_notice($1, $2, $3)', [invoice, 'payment_failed', request()]))[0]).toEqual({ recipients: 2 });
    const message = messageId();
    await inTransaction(BILLING_ROLE, {}, async (client) => {
      await client.query('SELECT email FROM billing_dunning_notice_claim($1, $2, $3)', [invoice, 'payment_failed', world.adminUserId]);
      await client.query('SELECT billing_dunning_notice_sent($1, $2, $3, $4, $5)', [invoice, 'payment_failed', world.adminUserId, message, request()]);
    });
    expect(await record({ ...suppressed, message, stream: 'notices', kind: 'dunning', subject: invoice, recipientUser: world.adminUserId })).toMatchObject({
      recorded: true,
      state: 'suppressed',
      invoice_undelivered: invoice,
    });
    expect((await owner.query('SELECT state FROM dunning_notice_recipient WHERE ses_message_id = $1', [message])).rows).toEqual([{ state: 'suppressed' }]);
    expect(await auditCount('notice_undelivered', invoice, 'payment_failed')).toBe(1);
    // An invitation's Cognito message.
    const user = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    const membership = await addMembership(owner, world.organizationId, user, 'viewer');
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO invitation (organization_id, membership_id, user_id, invited_by, sent_at, expires_at, last_sent_by)
       VALUES ($1, $2, $3, $4, now() - interval '1 minute', now() - interval '1 minute' + interval '7 days', $4) RETURNING id`,
      [world.organizationId, membership, user, world.adminUserId],
    );
    expect(await record({ ...suppressed, message: messageId(), stream: 'transactional', kind: 'cognito', recipient: `${user}@synthetic.test` })).toMatchObject({
      state: 'suppressed',
      invitation_undelivered: rows[0]?.id,
    });
    expect((await owner.query('SELECT undelivered_reason FROM invitation WHERE id = $1', [rows[0]?.id])).rows).toEqual([{ undelivered_reason: 'suppressed' }]);
    // The screening: no send, no bounce, no refusal and no mark (SES counts it toward neither rate).
    await resetScreening();
    const neverSent = address('never.sent');
    expect(await record(screeningEvent('bounce', { ...suppressed, recipient: neverSent }))).toMatchObject({ state: 'suppressed', stream_paused: null });
    expect(await windowCounts()).toEqual({ sends: 0, bounces: 0, complaints: 0 });
    expect((await owner.query('SELECT count(*)::int AS n FROM screening_mail_refusal WHERE recipient_sha256 = mail_recipient_sha256($1)', [neverSent])).rows).toEqual([{ n: 0 }]);
  });
});

describe('the console’s mail reads (feature_flag.manage)', () => {
  it('shows the streams and the recent undelivered customer messages to a platform administrator alone, the screening’s counted, never listed', async () => {
    await resetScreening();
    const screeningBounce = address('console.screening');
    refusedScreeningAddresses.push(screeningBounce);
    await record(screeningEvent('bounce', { recipient: screeningBounce, bounceKind: 'permanent', bounceSubtype: 'general' }));
    const digest = messageId();
    await record({ message: digest, stream: 'transactional', event: 'bounce', kind: 'digest', subject: randomUUID(), recipientUser: world.adminUserId, bounceKind: 'permanent', bounceSubtype: 'general' });
    const read = (actor: string, sql: string) => withActor(app, actor, async (scope) => (await scope.client.query<Record<string, unknown>>(sql)).rows);
    expect(await code(read(world.adminUserId, 'SELECT * FROM console_mail_streams()'))).toBe('42501');
    expect(await code(read(world.adminUserId, 'SELECT * FROM console_mail_undelivered(NULL)'))).toBe('42501');
    const streams = await read(platformAdmin, 'SELECT stream, sending, window_sends, window_bounces, client_marks, account_marks FROM console_mail_streams()');
    expect(streams).toEqual([
      { stream: 'notices', sending: true, window_sends: expect.any(Number) as unknown, window_bounces: expect.any(Number) as unknown, client_marks: 0, account_marks: 0 },
      { stream: 'screening', sending: true, window_sends: 1, window_bounces: 1, client_marks: 0, account_marks: 0 },
      { stream: 'transactional', sending: true, window_sends: expect.any(Number) as unknown, window_bounces: expect.any(Number) as unknown, client_marks: 0, account_marks: 0 },
    ]);
    // Where the window's counts start (M8): the later of 7 days ago and the last resume, never a resume older than that.
    const since = async () =>
      (await read(platformAdmin, "SELECT round(extract(epoch FROM now() - window_starts_at) / 60)::int AS minutes FROM console_mail_streams() WHERE stream = 'screening'"))[0]?.minutes;
    expect(await since()).toBe(7 * 24 * 60);
    await owner.query("UPDATE mail_stream SET window_starts_at = now() - interval '2 days' WHERE stream = 'screening'");
    expect(await since()).toBe(2 * 24 * 60);
    expect((await owner.query<{ starts: number }>("SELECT round(extract(epoch FROM now() - starts_at) / 60)::int AS starts FROM mail_window_counts('screening')")).rows).toEqual([{ starts: 2 * 24 * 60 }]);
    const undelivered = await read(platformAdmin, "SELECT stream, kind, state, recipient_user_id, subject_id, messages FROM console_mail_undelivered(now() - interval '1 hour')");
    expect(undelivered).toContainEqual({ stream: 'screening', kind: 'screening_result', state: 'bounced', recipient_user_id: null, subject_id: null, messages: 1 });
    expect(undelivered.filter((row) => row.stream === 'screening')).toHaveLength(1);
    expect(undelivered).toContainEqual(expect.objectContaining({ stream: 'transactional', kind: 'digest', recipient_user_id: world.adminUserId, messages: 1 }));
  });
});

describe('expiry (the nightly mail_expiry job)', () => {
  it('deletes the messages, the refusals and the marks past their time, and keeps the rest', async () => {
    await resetScreening();
    const old = (stream: string, days: number) =>
      owner.query<{ ses_message_id: string }>(
        `INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, state, sent_at) VALUES ('expiry' || replace(gen_random_uuid()::text, '-', ''), $1, $2, gen_random_uuid(), 'delivered', now() - $3::interval) RETURNING ses_message_id`,
        [stream, stream === 'screening' ? 'screening_result' : 'digest', `${String(days)} days`],
      );
    const screeningOld = (await old('screening', 31)).rows[0]?.ses_message_id ?? '';
    const screeningKept = (await old('screening', 29)).rows[0]?.ses_message_id ?? '';
    const customerOld = (await old('transactional', 91)).rows[0]?.ses_message_id ?? '';
    const customerKept = (await old('transactional', 31)).rows[0]?.ses_message_id ?? '';
    await owner.query(
      `INSERT INTO screening_bounce_mark (subject, subject_kind, ses_message_id, bounced_at, expires_at) VALUES
         ($1, 'account', $2, now() - interval '8 days', now() - interval '1 day'), ($1, 'client', $3, now() - interval '1 day', now() + interval '6 days')`,
      [sha256('expiry subject'), screeningKept, screeningKept],
    );
    await owner.query(
      `INSERT INTO screening_mail_refusal (recipient_sha256, reason, recorded_at, expires_at) VALUES
         ($1, 'bounced', now() - interval '366 days', now() - interval '1 day'), ($2, 'complained', now() - interval '364 days', now() + interval '1 day')`,
      [sha256('expired refusal'), sha256('kept refusal')],
    );
    expect(await code(as(OPERATOR_ROLE, 'SELECT operator_mail_expire(0)'))).toBe('23514');
    const [removed] = await as<{ removed: number }>(OPERATOR_ROLE, 'SELECT operator_mail_expire(1000) AS removed');
    expect(removed?.removed).toBeGreaterThanOrEqual(4);
    const left = async (sql: string, values: unknown[]) => (await owner.query<{ n: number }>(sql, values)).rows[0]?.n;
    expect(await left('SELECT count(*)::int AS n FROM mail_send WHERE ses_message_id = ANY ($1)', [[screeningOld, customerOld]])).toBe(0);
    expect(await left('SELECT count(*)::int AS n FROM mail_send WHERE ses_message_id = ANY ($1)', [[screeningKept, customerKept]])).toBe(2);
    expect(await left('SELECT count(*)::int AS n FROM screening_bounce_mark WHERE subject = $1', [sha256('expiry subject')])).toBe(1);
    expect(await left('SELECT count(*)::int AS n FROM screening_mail_refusal WHERE recipient_sha256 = ANY ($1)', [[sha256('expired refusal'), sha256('kept refusal')]])).toBe(1);
    expect(await left('SELECT count(*)::int AS n FROM mail_send WHERE expires_at <= now()', [])).toBe(0);
  });
});

describe('no trace of an address but the refusal list’s keyed hash (SEC-18)', () => {
  it('holds no address, plain hash or keyed hash of one in any table but the screening refusal list, which holds only the refused screening ones', async () => {
    expect(addresses.length).toBeGreaterThan(10);
    const keyed = (await owner.query<{ hash: string }>('SELECT mail_recipient_sha256(a) AS hash FROM unnest($1::text[]) a', [addresses])).rows.map((row) => row.hash);
    const plain = addresses.flatMap((given) => [sha256(given), sha256(given.toLowerCase())]);
    const columns = await owner.query<{ table_name: string; column_name: string }>(
      `SELECT c.relname AS table_name, a.attname AS column_name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND a.atttypid IN ('text'::regtype, 'jsonb'::regtype) ORDER BY 1, 2`,
    );
    const found: string[] = [];
    for (const column of columns.rows) {
      const { rows } = await owner.query<{ keyed: number; plain: number; address: number }>(
        `SELECT count(*) FILTER (WHERE v::text = ANY ($1))::int AS keyed, count(*) FILTER (WHERE v::text = ANY ($2))::int AS plain,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest($3::text[]) a WHERE strpos(lower(v::text), lower(a)) > 0))::int AS address
           FROM (SELECT "${column.column_name}" AS v FROM "${column.table_name}") t`,
        [keyed, plain, addresses],
      );
      const counted = rows[0];
      if (counted !== undefined && counted.keyed + counted.plain + counted.address > 0) {
        found.push(`${column.table_name}.${column.column_name}:${String(counted.keyed)}/${String(counted.plain)}/${String(counted.address)}`);
      }
    }
    const refused = (await owner.query<{ hash: string }>('SELECT mail_recipient_sha256(a) AS hash FROM unnest($1::text[]) a', [refusedScreeningAddresses])).rows.map((row) => row.hash);
    expect(found).toEqual([`screening_mail_refusal.recipient_sha256:${String(new Set(refused).size)}/0/0`]);
  });
});
