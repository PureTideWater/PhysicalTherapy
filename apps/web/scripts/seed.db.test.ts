import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openPool, readDatabaseUrl, withActor } from '@tp/db';
import { type MigratedDatabase, createMigratedDatabase } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../src/lib/auth/dev-provider';
import { FileDevStore } from '../src/lib/auth/dev-store';
import { Sealer } from '../src/lib/auth/seal';
import { SignInFlow } from '../src/lib/auth/sign-in';
import { developmentMasterKey } from '../src/lib/server/config';
import { seed } from './seed';
import { SYNTHETIC_PERSONAS, personaEmail, personaPassword, personaTotpCode } from './synthetic-personas';

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
    } finally {
      await pool.end();
    }
  });
});
