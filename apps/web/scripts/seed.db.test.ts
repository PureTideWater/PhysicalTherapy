import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { databaseClient, openPool, readDatabaseUrl, withActor, withPracticeScope } from '@tp/db';
import { SYNTHETIC_CORRESPONDENCE_CONTACT } from '@tp/packets';
import { type MigratedDatabase, createMigratedDatabase, endPool } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../src/lib/auth/dev-provider';
import { FileDevStore } from '../src/lib/auth/dev-store';
import { Sealer } from '../src/lib/auth/seal';
import { SignInFlow } from '../src/lib/auth/sign-in';
import { developmentMasterKey } from '../src/lib/server/config';
import { SYNTHETIC_TERMS_VERSION, seed } from './seed';
import {
  SYNTHETIC_CONSOLE_SUSPENSION_FIRM,
  SYNTHETIC_FIRM_CLIENT_GROUP,
  SYNTHETIC_FIRM_CLIENT_PRACTICE,
  SYNTHETIC_PERSONAS,
  SYNTHETIC_SUSPENDED_FIRM,
  SYNTHETIC_SUSPENDED_GROUP,
  personaEmail,
  personaPassword,
  personaTotpCode,
} from './synthetic-personas';

/** `pnpm db:seed`: every synthetic persona can sign in with its derived credentials. */

let database: MigratedDatabase;
let dir: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  dir = mkdtempSync(path.join(tmpdir(), 'tp-seed-'));
});

afterAll(async () => {
  await database.drop();
  rmSync(dir, { recursive: true, force: true });
});

describe('pnpm db:seed', () => {
  it('seeds every persona, each signing in as its role requires', async () => {
    const result = await seed({ databaseUrl: database.url, devAuthDirectory: dir, masterKey: developmentMasterKey(), scryptCost: { n: 1024, r: 8, p: 1 } });
    expect(Object.keys(result.users).sort()).toEqual(SYNTHETIC_PERSONAS.map((persona) => persona.key).sort());
    const pool = openPool(database.appUrl, 2);
    let clock = new Date();
    const provider = new DevAuthProvider({
      store: new FileDevStore(path.join(dir, 'store.json')),
      sealer: new Sealer(Buffer.alloc(32, 5)),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      now: () => clock,
    });
    const flow = new SignInFlow({ pool, provider, logger: createLogger({ sink: () => undefined }) });
    try {
      for (const persona of SYNTHETIC_PERSONAS) {
        const context = { deviceToken: undefined, userAgent: null, requestId: `seed-${persona.key}` };
        const first = await flow.start(personaEmail(persona.key), personaPassword(persona.key), context);
        if (persona.invited === true) {
          expect(first, persona.key).toMatchObject({ kind: 'pending', pending: { step: 'new_password' } });
          continue;
        }
        expect(first, persona.key).toMatchObject({ kind: 'pending', pending: { step: 'mfa' } });
        clock = new Date(clock.getTime() + 30_000);
        const done = await flow.answerTotp(first.kind === 'pending' ? first.pending : (undefined as never), personaTotpCode(persona.key, clock), context);
        expect(done.kind, persona.key).toBe(persona.organization === 'internal' ? 'pending' : 'signed_in');
      }
      const admin = result.users['practice-admin'] ?? '';
      expect((await withActor(pool, admin, (scope) => scope.allowedPracticeIds())).sort()).toEqual([result.practices.north, result.practices.south].sort());
      // Every persona accepted the synthetic terms of use in force, so none is stopped at them (docs/adr/0053).
      const required = await Promise.all(
        Object.values(result.users).map((userId) => withActor(pool, userId, async (scope) => (await scope.client.query<{ required: boolean }>('SELECT app_actor_terms_required() AS required')).rows[0]?.required)),
      );
      expect(new Set(required)).toEqual(new Set([false]));
      const terms = await withActor(pool, admin, async (scope) => (await scope.client.query<{ version: string }>('SELECT version FROM terms_version WHERE id = current_terms_version()')).rows);
      expect(terms).toEqual([{ version: SYNTHETIC_TERMS_VERSION }]);
      // The group's practices print the SYNTHETIC correspondence contact, so their packets export (audit item #37 part 1).
      const contacts = await withPracticeScope(pool, { actorId: admin, practiceIds: [result.practices.north, result.practices.south] }, async (scope) =>
        (await scope.client.query<{ id: string; contact: unknown }>(`SELECT id, settings -> 'correspondence_contact' AS contact FROM practice WHERE id = ANY($1::uuid[]) ORDER BY id`, [[result.practices.north, result.practices.south]])).rows,
      );
      expect(contacts.map((row) => row.contact)).toEqual([SYNTHETIC_CORRESPONDENCE_CONTACT, SYNTHETIC_CORRESPONDENCE_CONTACT]);
      expect(contacts).toHaveLength(2);
      // SYNTHETIC SUSPENDED GROUP is held suspended by PaidWhole, owns no practice, and its administrator reaches none (BIL-06).
      const suspendedAdmin = result.users['suspended-admin'] ?? '';
      const held = await withActor(pool, suspendedAdmin, async (scope) => ({
        practices: await scope.allowedPracticeIds(),
        organizations: (await scope.client.query<{ name: string; status: string; role: string }>('SELECT o.name, o.status, m.role FROM app_actor_memberships() m JOIN organization o ON o.id = m.organization_id')).rows,
      }));
      expect(held).toEqual({ practices: [], organizations: [{ name: SYNTHETIC_SUSPENDED_GROUP, status: 'suspended', role: 'practice_admin' }] });
      expect(result.organizations.suspended_group).toEqual(expect.any(String));
      // PaidWhole's suspensions carry their stored reasons and times; the firm's grant is in force on the client
      // practice, which its principal reaches only through it; the console's firm is active (BIL-09; docs/adr/0080).
      const owner = databaseClient(database.url);
      await owner.connect();
      try {
        const organizations = (
          await owner.query<{ name: string; kind: string; status: string; status_reason: string | null; dated: boolean }>(
            'SELECT name, kind, status, status_reason, status_since IS NOT NULL AS dated FROM organization WHERE name = ANY($1::text[]) ORDER BY name',
            [[SYNTHETIC_SUSPENDED_GROUP, SYNTHETIC_SUSPENDED_FIRM, SYNTHETIC_FIRM_CLIENT_GROUP, SYNTHETIC_CONSOLE_SUSPENSION_FIRM]],
          )
        ).rows;
        expect(organizations).toEqual([
          { name: SYNTHETIC_CONSOLE_SUSPENSION_FIRM, kind: 'firm', status: 'active', status_reason: null, dated: false },
          { name: SYNTHETIC_FIRM_CLIENT_GROUP, kind: 'group', status: 'active', status_reason: null, dated: false },
          { name: SYNTHETIC_SUSPENDED_FIRM, kind: 'firm', status: 'suspended', status_reason: 'security_hold', dated: true },
          { name: SYNTHETIC_SUSPENDED_GROUP, kind: 'group', status: 'suspended', status_reason: 'customer_request', dated: true },
        ]);
        const grants = (
          await owner.query<{ grantee: string; practice: string; in_force: boolean }>(
            `SELECT o.name AS grantee, p.name AS practice, (g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at) AS in_force
               FROM "grant" g JOIN organization o ON o.id = g.organization_id JOIN practice p ON p.id = g.practice_id WHERE p.id = $1`,
            [result.practices.firm_client],
          )
        ).rows;
        expect(grants).toEqual([{ grantee: SYNTHETIC_SUSPENDED_FIRM, practice: SYNTHETIC_FIRM_CLIENT_PRACTICE, in_force: true }]);
      } finally {
        await owner.end();
      }
      const principal = result.users['suspended-firm-principal'] ?? '';
      const clientAdmin = result.users['firm-client-admin'] ?? '';
      expect(await withActor(pool, principal, (scope) => scope.allowedPracticeIds())).toEqual([result.practices.firm_client]);
      expect(await withActor(pool, clientAdmin, (scope) => scope.allowedPracticeIds())).toEqual([result.practices.firm_client]);
    } finally {
      await endPool(pool);
    }
  });
});
