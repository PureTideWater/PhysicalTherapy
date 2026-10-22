import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import {
  type MigratedDatabase,
  type TenantWorld,
  addMembership,
  asOwner,
  createMigratedDatabase,
  createOrganization,
  createPracticeWithLocation,
  createTenantWorld,
  createUser,
  endPool,
} from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPlatformHandlers } from '../jobs/platform';
import { MemoryMailSender } from '../mail/mail';
import { noticeLink, sendSupportGrantNotices } from './support-notices';

/**
 * The support-grant notices (PRD 5, J15) against a real database: the practice's administrators are
 * told when a grant opens and when it ends, with the number of records read and a link to the list;
 * each notice once, even when two runs race; a practice with nobody to tell is recorded.
 */

const ORIGIN = 'http://localhost:3000';
let database: MigratedDatabase;
let owner: DatabaseClient;
let operator: DatabasePool;
let app: DatabasePool;
let world: TenantWorld;
let engineer: string;
let platformAdmin: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 3);
  app = openPool(database.appUrl, 2);
  world = await createTenantWorld(owner, 'notices');
  const internal = await createOrganization(owner, 'internal');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
  platformAdmin = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, platformAdmin, 'platform_admin');
});

afterAll(async () => {
  await endPool(app);
  await endPool(operator);
  await owner.end();
  await database.drop();
});

async function supportGrant(practiceId: string, startedHoursAgo: number): Promise<string> {
  const id = randomUUID();
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO support_grant (id, practice_id, user_id, ticket, reason, created_at, expires_at)
       VALUES ($1, $2, $3, 'SYN-9', 'SYNTHETIC', now() - make_interval(hours => $4), now() - make_interval(hours => $4) + interval '4 hours')`,
      [id, practiceId, engineer, startedHoursAgo],
    ),
  );
  return id;
}

async function read(practiceId: string, grantId: string): Promise<void> {
  await asOwner(owner, [practiceId], () =>
    owner.query("INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'read', 'practice', $2, $2, $3, 'support')", [
      engineer,
      practiceId,
      grantId,
    ]),
  );
}

/**
 * A practice with nobody to tell. The database keeps an administrator for every practice from its
 * creation (migration 20261015180000), so this state is built past that rule, as the superuser, to
 * test the job's defence for it.
 */
async function practiceWithoutAdministrator(): Promise<string> {
  const organizationId = await createOrganization(owner, 'group', 'no administrator');
  const practiceId = randomUUID();
  await owner.query('BEGIN');
  try {
    await owner.query('ALTER TABLE practice DISABLE TRIGGER practice_has_administrator');
    // With its pricing location, which every practice is created with (practice_has_site, audit #33), checked now so no
    // deferred event is pending when the trigger is enabled again.
    await createPracticeWithLocation(owner, { id: practiceId, organizationId, name: 'SYNTHETIC PRACTICE WITHOUT ADMINISTRATOR' });
    await owner.query('SET CONSTRAINTS practice_has_site IMMEDIATE');
    await owner.query('ALTER TABLE practice ENABLE TRIGGER practice_has_administrator');
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
  return practiceId;
}

/** Runs `sql` as the application role for `actorId`, with `practiceIds` in scope; rolled back. */
async function asApp(actorId: string, practiceIds: readonly string[], sql: string, values: unknown[] = []): Promise<unknown> {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', $2, true)", [actorId, `{${practiceIds.join(',')}}`]);
    return await client.query(sql, values);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function run(mail: MemoryMailSender) {
  const client = await operator.connect();
  try {
    return await sendSupportGrantNotices({ client, mail, origin: ORIGIN, requestId: `job-${randomUUID()}` });
  } finally {
    client.release();
  }
}

async function notices(grantId: string): Promise<string[]> {
  const { rows } = await owner.query<{ purpose: string }>("SELECT purpose FROM audit_event WHERE action = 'notice_sent' AND object_id = $1 ORDER BY at, purpose", [grantId]);
  return rows.map((row) => row.purpose);
}

describe('support-grant notices', () => {
  it('tells the practice administrators when a grant opens, once, with a link and no PHI', async () => {
    const invited = await createUser(owner, { status: 'invited', mfaEnrolled: false });
    await addMembership(owner, world.organizationId, invited, 'practice_admin');
    const disabledAdmin = await createUser(owner);
    await addMembership(owner, world.organizationId, disabledAdmin, 'practice_admin');
    await asOwner(owner, [], () => owner.query("UPDATE \"user\" SET status = 'disabled' WHERE id = $1", [disabledAdmin]));
    const grant = await supportGrant(world.practiceId, 0);
    const mail = new MemoryMailSender();
    expect(await run(mail)).toEqual({ opened: 1, closed: 0, undeliverable: 0 });
    expect(mail.sent).toHaveLength(1);
    const [message] = mail.sent;
    expect(message?.to).toEqual([`${invited}@synthetic.test`, `${world.adminUserId}@synthetic.test`].sort());
    expect(message?.subject).toBe('Support access opened for your practice');
    expect(message?.links).toEqual([noticeLink(ORIGIN, world.practiceId, grant)]);
    expect(message?.body).not.toMatch(/SYN-9|SYNTHETIC/);
    expect(await notices(grant)).toEqual(['support_grant_opened']);
    expect(await run(new MemoryMailSender())).toEqual({ opened: 0, closed: 0, undeliverable: 0 });
    expect((await owner.query('SELECT notified_at FROM support_grant WHERE id = $1', [grant])).rows).toEqual([{ notified_at: null }]);
  });

  it('tells them when it ends, with how many records were read, and marks the grant notified', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    await read(world.practiceId, grant);
    await read(world.practiceId, grant);
    const mail = new MemoryMailSender();
    expect(await run(mail)).toEqual({ opened: 1, closed: 1, undeliverable: 0 });
    const closed = mail.sent.find((message) => message.subject === 'Support access to your practice has ended');
    expect(closed?.lines).toContain('Records read under it: 2.');
    expect(closed?.links).toEqual([`${ORIGIN}/p/${world.practiceId}/support-access/${grant}`]);
    expect(await notices(grant)).toEqual(['support_grant_opened', 'support_grant_closed']);
    const { rows } = await owner.query<{ notified: boolean }>('SELECT notified_at IS NOT NULL AS notified FROM support_grant WHERE id = $1', [grant]);
    expect(rows).toEqual([{ notified: true }]);
    expect(await run(new MemoryMailSender())).toEqual({ opened: 0, closed: 0, undeliverable: 0 });
  });

  it('sends each notice once when two runs race', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    const mail = new MemoryMailSender();
    await Promise.all([run(mail), run(mail), run(mail)]);
    expect(mail.sent.map((message) => message.subject).sort()).toEqual(['Support access opened for your practice', 'Support access to your practice has ended']);
    expect(await notices(grant)).toHaveLength(2);
  });

  it('records a notice for a practice with nobody to tell, and does not retry it forever', async () => {
    await supportGrant(await practiceWithoutAdministrator(), 0);
    const mail = new MemoryMailSender();
    expect(await run(mail)).toMatchObject({ undeliverable: 1 });
    expect(mail.sent).toEqual([]);
    expect(await run(mail)).toMatchObject({ undeliverable: 0 });
  });

  it('cannot be suppressed by the application role: no one marks a grant notified or forges a notice (SEC-05)', async () => {
    const grant = await supportGrant(world.practiceId, 5);
    const firm = await createOrganization(owner, 'firm', 'notices firm');
    const analyst = await createUser(owner);
    await addMembership(owner, firm, analyst, 'firm_analyst');
    for (const actor of [engineer, analyst, platformAdmin, world.adminUserId]) {
      await expect(asApp(actor, [world.practiceId], 'UPDATE support_grant SET notified_at = now() WHERE id = $1', [grant])).rejects.toMatchObject({ code: '42501' });
      for (const kind of ['user', 'system']) {
        await expect(
          asApp(
            actor,
            [world.practiceId],
            "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, $2, 'notice_sent', 'support_grant', $3, $4, $3, 'support_grant_opened')",
            [actor, kind, grant, world.practiceId],
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        asApp(actor, [], "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, purpose) VALUES ($1, 'system', 'security_event', 'user', $1, 'synthetic')", [actor]),
      ).rejects.toMatchObject({ code: '42501' });
    }
    // A notice_sent event the system did not write does not count: the job still sends both notices.
    await asOwner(owner, [world.practiceId], () =>
      owner.query(
        "INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, practice_id, grant_id, purpose) VALUES ($1, 'user', 'notice_sent', 'support_grant', $2, $3, $2, 'support_grant_opened')",
        [engineer, grant, world.practiceId],
      ),
    );
    const mail = new MemoryMailSender();
    await run(mail);
    expect(mail.sent.filter((message) => message.links[0]?.endsWith(grant) === true).map((message) => message.subject).sort()).toEqual([
      'Support access opened for your practice',
      'Support access to your practice has ended',
    ]);
  });

  it('handles each notice in a transaction scoped to exactly its practice, as an operator role that reads nothing else', async () => {
    const grant = await supportGrant(world.practiceId, 0);
    const client = await operator.connect();
    try {
      for (const scope of ['{}', `{${world.practiceId},${randomUUID()}}`]) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE tp_operator');
        await client.query("SELECT set_config('app.practice_ids', $1, true)", [scope]);
        await expect(client.query("SELECT * FROM operator_record_support_notice($1, 'support_grant_opened', 'job')", [grant])).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK');
      }
      for (const table of ['practice', 'support_grant', 'user', 'membership', 'grant', 'agreement']) {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE tp_operator');
        await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${world.practiceId}}`]);
        await expect(client.query(`SELECT 1 FROM "${table}" LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
        await client.query('ROLLBACK');
      }
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE tp_operator');
      await client.query("SELECT set_config('app.practice_ids', '{}', true)");
      await expect(client.query('UPDATE audit_event SET purpose = purpose')).rejects.toMatchObject({ code: '42501' });
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    await run(new MemoryMailSender());
  });

  it('runs as the support_grant_notices job, logging IDs only', async () => {
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) });
    const mail = new MemoryMailSender();
    const handlers = createPlatformHandlers({
      operator,
      store: { putImmutable: () => Promise.reject(new Error('unused')), head: () => Promise.resolve(null) },
      restorer: { restoreLatest: () => Promise.reject(new Error('unused')) },
      mail,
      appOrigin: ORIGIN,
    });
    const jobId = randomUUID();
    await supportGrant(world.practiceId, 0);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines).toEqual([expect.objectContaining({ msg: 'support grant notices sent', job_id: jobId })]);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines).toHaveLength(1);
    await supportGrant(await practiceWithoutAdministrator(), 0);
    await handlers.support_grant_notices({}, { jobId, logger });
    expect(lines.at(-1)).toMatchObject({ level: 'error', error_code: 'NOTICE_UNDELIVERABLE', job_id: jobId });
  });
});
