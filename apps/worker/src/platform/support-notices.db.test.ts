import { randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, placeholderDataKeyRef } from '@tp/db/testing';
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
let world: TenantWorld;
let engineer: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  operator = openPool(database.url, 3);
  world = await createTenantWorld(owner, 'notices');
  const internal = await createOrganization(owner, 'internal');
  engineer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, engineer, 'support');
});

afterAll(async () => {
  await operator.end();
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

/** A practice whose group has no administrator yet (PRD 5, J1: the practice exists before its administrator accepts). */
async function practiceWithoutAdministrator(): Promise<string> {
  const organizationId = await createOrganization(owner, 'group', 'no administrator');
  const practiceId = randomUUID();
  await asOwner(owner, [practiceId], () =>
    owner.query('INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, $3, $4)', [practiceId, organizationId, 'SYNTHETIC PRACTICE WITHOUT ADMINISTRATOR', placeholderDataKeyRef()]),
  );
  return practiceId;
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
