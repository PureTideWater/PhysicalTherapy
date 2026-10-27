import { randomBytes, randomUUID } from 'node:crypto';

import { PracticeCipher, ScopeError, type ScopeClient, type ScopePool, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { MOD12_PRACTICE, mod12Identifiers } from '@tp/synth';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONTRACT_SCREEN_PURPOSE, type PatientRecordsCheck, SCREEN_MAX_IDENTIFIERS, practiceRecordsCheck, recordContractScreenRequested, screenAuditRequestId } from './patient-records';
import { type SeededRecords, seedScreenRecords } from './test-support/screen-world';

/**
 * The contract PHI check's records on Postgres (combined audit item 120; docs/adr/0070, Part 3; test matrix MOD-12):
 * the reads run in the check's own job scope as the service screen actor, each row audited with purpose
 * contract_screen and joined by request ID to the person's one contract_screen_requested event (the design review's
 * M8); row-level security holds them to the one practice, so another practice's identical identifiers never match
 * (the cross-tenant case); a check for one practice cannot be built with a scope for another (M7); any load error
 * answers screen_failed and a practice above the bound answers screen_unavailable having read nothing. A value that
 * does not decrypt leaves every read audited (the reads commit before any decrypt); rows committed after the bound's
 * count are never read past the bound by more than one row; a patient control number held only in a posting export
 * is read and found, and a posting line matched to a claim is not read again. On the web's login and the worker's,
 * which both build the check. MOD-12's identifiers and values of the tests' own, all SYNTHETIC.
 */

let database: MigratedDatabase;
let owner: pg.Client;
let web: pg.Pool;
let worker: pg.Pool;
let north: TenantWorld;
let south: TenantWorld;
let crowded: TenantWorld;
let broken: TenantWorld;
let edge: TenantWorld;
let paper: TenantWorld;
let paperRows: SeededRecords;
let specialist: string;
let manager: string;
const keys = new Map<string, Buffer>();
const ciphers = new Map<string, PracticeCipher>();

const keyOf = (practiceId: string) => {
  let key = keys.get(practiceId);
  if (key === undefined) {
    key = randomBytes(32);
    keys.set(practiceId, key);
  }
  return key;
};

const cipherOf = (practiceId: string) => {
  let cipher = ciphers.get(practiceId);
  if (cipher === undefined) {
    cipher = new PracticeCipher(practiceId, keyOf(practiceId));
    ciphers.set(practiceId, cipher);
  }
  return cipher;
};

/** The practice's cipher, counting the values it decrypts. */
class CountingCipher extends PracticeCipher {
  decrypted = 0;

  override decrypt(...args: Parameters<PracticeCipher['decrypt']>): string {
    const plain = super.decrypt(...args);
    this.decrypted += 1;
    return plain;
  }
}

/** Broken holds a claim whose patient control number no longer decrypts, after two that do; paper is paid by paper check. */
const BROKEN = { memberIds: ['ZZ7710001', 'ZZ7710002'], patientControlNumbers: ['SYNPCN77100001', 'SYNPCN77100002', 'SYNPCN77100003'], payerClaimNumbers: ['7771000000001', '7771000000002', '7771000000003'], postingReferences: ['SYNPOST7710001'], undecryptableClaims: 1 };
const PAPER = { memberIds: ['ZZ7770001'], patientControlNumbers: ['SYNCLAIM5550011'], payerClaimNumbers: ['7700000777001'], postingReferences: ['SYNPOST4007100'], postedClaims: 1 };

/** North holds MOD-12's practice; south holds other identifiers of its own and none of north's. */
const NORTH = mod12Identifiers();
const SOUTH = { memberIds: ['ZZ9990001'], patientControlNumbers: ['SYNPCN99001'], payerClaimNumbers: ['7799900000001'] };
const EOB = ['SYNTHETIC EXPLANATION OF BENEFITS', `Patient: SYNTHLASTMODTWELVE   ${MOD12_PRACTICE.memberIdWritten}`];

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = new pg.Client({ connectionString: database.url });
  await owner.connect();
  web = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  worker = new pg.Pool({ connectionString: database.workerUrl, max: 4 });
  north = await createTenantWorld(owner, 'north');
  south = await createTenantWorld(owner, 'south');
  crowded = await createTenantWorld(owner, 'crowded');
  broken = await createTenantWorld(owner, 'broken');
  edge = await createTenantWorld(owner, 'edge');
  paper = await createTenantWorld(owner, 'paper');
  manager = await createUser(owner);
  await addMembership(owner, north.organizationId, manager, 'billing_manager');
  const internal = await createOrganization(owner, 'internal', 'screen');
  specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  await asOwner(owner, [north.practiceId], () =>
    owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SQ-12', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [north.practiceId, specialist]),
  );
  await seedScreenRecords(owner, { practiceId: north.practiceId, uploaderId: north.adminUserId }, cipherOf(north.practiceId), NORTH);
  await seedScreenRecords(owner, { practiceId: south.practiceId, uploaderId: south.adminUserId }, cipherOf(south.practiceId), SOUTH);
  // Over the bound: 25,001 claims are 50,002 identifiers.
  await seedScreenRecords(owner, { practiceId: crowded.practiceId, uploaderId: crowded.adminUserId }, cipherOf(crowded.practiceId), { memberIds: MOD12_PRACTICE.otherMemberIds, bulkClaims: SCREEN_MAX_IDENTIFIERS / 2 + 1 });
  await seedScreenRecords(owner, { practiceId: broken.practiceId, uploaderId: broken.adminUserId }, cipherOf(broken.practiceId), BROKEN);
  // Exactly at the bound: 25,000 claims are 50,000 identifiers (the claims' patient holds no member ID).
  await seedScreenRecords(owner, { practiceId: edge.practiceId, uploaderId: edge.adminUserId }, cipherOf(edge.practiceId), { bulkClaims: SCREEN_MAX_IDENTIFIERS / 2 });
  paperRows = await seedScreenRecords(owner, { practiceId: paper.practiceId, uploaderId: paper.adminUserId }, cipherOf(paper.practiceId), PAPER);
}, 180_000);

afterAll(async () => {
  await endPool(web);
  await endPool(worker);
  await owner.end();
  await database.drop();
});

/** A check built as the web builds it: the specialist's request scope as proof, the web's pool to read on. */
async function webCheck(practiceId: string, options: { readonly pool?: ScopePool<ScopeClient>; readonly cipher?: PracticeCipher; readonly screenId?: string; readonly requestId?: string; readonly actorId?: string } = {}) {
  const screenId = options.screenId ?? randomUUID();
  const requestId = options.requestId ?? `request-${randomUUID()}`;
  const check = await withPracticeScope(web, { actorId: options.actorId ?? specialist, practiceIds: [practiceId] }, (scope) =>
    Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: options.pool ?? web, cipher: options.cipher ?? cipherOf(practiceId), practiceId, screenId, requestId })),
  );
  return { check, screenId, requestId };
}

/** The screen's reads under its request ID, counted by the table read. */
const readsByTable = async (requestId: string) =>
  Object.fromEntries(
    (await owner.query<{ object_type: string; n: string }>("SELECT object_type, count(*) AS n FROM audit_event WHERE request_id = $1 AND action = 'read' GROUP BY object_type", [requestId])).rows.map((row) => [row.object_type, Number.parseInt(row.n, 10)]),
  );

const audited = async (requestId: string) =>
  (await owner.query<{ actor_id: string; actor_kind: string; action: string; object_type: string; purpose: string; practice_id: string }>(
    'SELECT actor_id, actor_kind, action, object_type, purpose, practice_id FROM audit_event WHERE request_id = $1 ORDER BY object_type, action',
    [requestId],
  )).rows;

describe('the reads: as the screen, audited, joined to the person who caused them (the design review’s M8)', () => {
  it('reads every member ID and claim of the practice in a job scope as the service screen actor, one audit row per row, purpose contract_screen; the person’s one event joins them', async () => {
    const { check, screenId, requestId } = await webCheck(north.practiceId);
    const documentId = randomUUID();
    await withPracticeScope(web, { actorId: specialist, practiceIds: [north.practiceId] }, (scope) => recordContractScreenRequested(scope, { practiceId: north.practiceId, documentId, requestId, screenId }));
    await expect(check.namesPatient(EOB)).resolves.toBe('names_patient');
    const rows = await audited(screenAuditRequestId(requestId, screenId));
    const reads = rows.filter((row) => row.action === 'read');
    expect(reads.filter((row) => row.object_type === 'patient_ref')).toHaveLength(NORTH.memberIds.length);
    expect(reads.filter((row) => row.object_type === 'claim')).toHaveLength(NORTH.patientControlNumbers.length);
    expect(reads.every((row) => row.actor_id === screenId && row.actor_kind === 'service' && row.purpose === CONTRACT_SCREEN_PURPOSE && row.practice_id === north.practiceId)).toBe(true);
    // The person is named once, by the event that says they caused the screen; never as the reader of a patient.
    expect(rows.filter((row) => row.actor_id === specialist)).toEqual([
      { actor_id: specialist, actor_kind: 'user', action: 'contract_screen_requested', object_type: 'source_document', purpose: CONTRACT_SCREEN_PURPOSE, practice_id: north.practiceId },
    ]);
  });

  it('reads once per check, and runs on the worker’s login with the run’s ID as the screen', async () => {
    const runId = randomUUID();
    const check = await withJobScope(worker, { jobId: runId, practiceId: north.practiceId }, (scope) =>
      Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: worker, cipher: cipherOf(north.practiceId), practiceId: north.practiceId, screenId: runId, requestId: runId })),
    );
    await expect(check.namesPatient(['SYNTHETIC Payer G Exhibit B', `from claim ${MOD12_PRACTICE.payerClaimNumberWritten} onward`])).resolves.toBe('names_patient');
    await expect(check.namesPatient(['CPT 97110 $43.10 per unit'])).resolves.toBe('clear');
    const reads = (await audited(screenAuditRequestId(runId, runId))).filter((row) => row.action === 'read');
    expect(reads).toHaveLength(NORTH.memberIds.length + NORTH.patientControlNumbers.length);
    expect(reads.every((row) => row.actor_id === runId && row.actor_kind === 'service')).toBe(true);
  });
});

describe('the practice: bound to a scope that reaches it, and to its rows alone (the design review’s M7; CLAUDE.md rule 4)', () => {
  it('refuses at construction a check for practice A built with a scope for practice B', async () => {
    await expect(
      withPracticeScope(web, { actorId: specialist, practiceIds: [south.practiceId] }, (scope) =>
        Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: web, cipher: cipherOf(north.practiceId), practiceId: north.practiceId, screenId: randomUUID(), requestId: 'request-ab' })),
      ),
    ).rejects.toBeInstanceOf(ScopeError);
    // A person with no reach to south gets no scope for it either: the specialist's support grant is north's alone.
    await expect(webCheck(south.practiceId)).rejects.toBeInstanceOf(ScopeError);
    await expect(
      withJobScope(worker, { jobId: randomUUID(), practiceId: south.practiceId }, (scope) =>
        Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: worker, cipher: cipherOf(north.practiceId), practiceId: north.practiceId, screenId: randomUUID(), requestId: 'request-ab' })),
      ),
    ).rejects.toBeInstanceOf(ScopeError);
  });

  it('never matches another practice’s identifiers: south’s check is clear on north’s EOB, and north’s on south’s identifiers', async () => {
    const southCheck = await withJobScope(worker, { jobId: randomUUID(), practiceId: south.practiceId }, (scope) =>
      Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: worker, cipher: cipherOf(south.practiceId), practiceId: south.practiceId, screenId: randomUUID(), requestId: 'request-south' })),
    );
    await expect(southCheck.namesPatient(EOB)).resolves.toBe('clear');
    await expect(southCheck.namesPatient(['Member ID: ZZ 999 0001'])).resolves.toBe('names_patient');
    const { check } = await webCheck(north.practiceId);
    await expect(check.namesPatient(['Member ID: ZZ 999 0001', 'Claim 7799900000001', 'Account SYNPCN99001'])).resolves.toBe('clear');
  });

  it('applies the floors and stored-side rules to the stored values: MOD-12’s short, date-shaped and letter-only PCNs never refuse its fee schedule', async () => {
    const { check } = await webCheck(north.practiceId);
    const twin = ['CPT 97110 $40.00 per unit; CPT 97530 $60.00 per unit', 'Effective 2026-01-01 (20260101). This SCHEDULE is part of the AGREEMENT.', 'Payer claim 7712000000349 is not written here: 7712000000350 is not held.'];
    await expect(check.namesPatient(twin.slice(0, 2))).resolves.toBe('clear');
    await expect(check.namesPatient(twin)).resolves.toBe('names_patient');
    await expect(check.namesPatient([`Account ${MOD12_PRACTICE.patientControlNumber}`])).resolves.toBe('names_patient');
  });
});

describe('a patient control number held only in a posting export (a paper check’s claim; F7)', () => {
  it('is read, audited and found, on the web’s login and the worker’s; a posting line matched to a claim is not read again', async () => {
    for (const pool of [web, worker]) {
      const runId = randomUUID();
      const check = await withJobScope(worker, { jobId: runId, practiceId: paper.practiceId }, (scope) =>
        Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool, cipher: cipherOf(paper.practiceId), practiceId: paper.practiceId, screenId: runId, requestId: 'request-paper' })),
      );
      await expect(check.namesPatient(['SYNTHETIC EXPLANATION OF BENEFITS', 'Patient account: SYNPOST4007100   Check SYNPAPERCHK0001'])).resolves.toBe('names_patient');
      // The claim's own number (the control), which its matched posting line also carries, is found from claim.
      await expect(check.namesPatient(['Patient account: SYNCLAIM5550011'])).resolves.toBe('names_patient');
      const reads = await owner.query<{ object_type: string; object_id: string }>("SELECT object_type, object_id FROM audit_event WHERE request_id = $1 AND action = 'read' ORDER BY object_type", [
        screenAuditRequestId('request-paper', runId),
      ]);
      // The unmatched line is read; the line matched to the claim is not (its number is the claim's).
      expect(reads.rows.filter((row) => row.object_type === 'posting_row').map((row) => row.object_id)).toEqual([paperRows.postingRowIds[0]]);
      expect(paperRows.postingRowIds).toHaveLength(2);
      expect(reads.rows.map((row) => row.object_type)).toEqual(['claim', 'patient_ref', 'posting_row']);
    }
  });
});

describe('fails closed', () => {
  it('a decrypt failure (another key), a query failure and a failed scope each answer screen_failed, never clear', async () => {
    const wrongKey = (await webCheck(north.practiceId, { cipher: new PracticeCipher(north.practiceId, randomBytes(32)) })).check;
    await expect(wrongKey.namesPatient(EOB)).resolves.toBe('screen_failed');
    const failing: ScopePool<ScopeClient> = {
      connect: async () => {
        const client = await web.connect();
        return {
          release: (destroy) => {
            client.release(destroy);
          },
          query: (text: string, values?: unknown[]) => (text.includes('FROM claim WHERE') && !text.includes('count(') ? Promise.reject(new Error('SYNTHETIC failure')) : client.query(text, values)),
        };
      },
    };
    const queryFails = (await webCheck(north.practiceId, { pool: failing })).check;
    await expect(queryFails.namesPatient(EOB)).resolves.toBe('screen_failed');
    // A screen ID that names a person: withJobScope refuses to run the job as that person.
    const personAsScreen = (await webCheck(north.practiceId, { screenId: manager })).check;
    await expect(personAsScreen.namesPatient(EOB)).resolves.toBe('screen_failed');
    const unreachable = new pg.Pool({ connectionString: database.appUrl.replace(/\/[^/?]+(\?|$)/, '/tp_no_such_database$1'), max: 1 });
    try {
      await expect((await webCheck(north.practiceId, { pool: unreachable })).check.namesPatient(EOB)).resolves.toBe('screen_failed');
    } finally {
      await unreachable.end();
    }
  });

  it('a value that no longer decrypts answers screen_failed with every read the screen made audited: the reads commit before any decrypt (F3)', async () => {
    for (const pool of [web, worker]) {
      const cipher = new CountingCipher(broken.practiceId, keyOf(broken.practiceId));
      const runId = randomUUID();
      const check = await withJobScope(worker, { jobId: runId, practiceId: broken.practiceId }, (scope) =>
        Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool, cipher, practiceId: broken.practiceId, screenId: runId, requestId: 'request-broken' })),
      );
      await expect(check.namesPatient([`Member ID: ${BROKEN.memberIds[0] ?? ''}`])).resolves.toBe('screen_failed');
      // Plaintext was produced before the bad value (the member IDs and the first claims' numbers)...
      expect(cipher.decrypted).toBeGreaterThan(0);
      // ...and every row read is audited: two member IDs, three claims and the posting line.
      expect(await readsByTable(screenAuditRequestId('request-broken', runId))).toEqual({ patient_ref: 2, claim: 3, posting_row: 1 });
    }
  });

  it('rows an 835 load commits between the bound’s count and the read are never read past the bound by more than one row, and answer screen_unavailable (F4)', async () => {
    const late = new pg.Client({ connectionString: database.url });
    await late.connect();
    try {
      // Right after the count returns (50,000: at the bound), a load commits 1,000 claims, one of them naming LATE00000001.
      let raced = false;
      const racing: ScopePool<ScopeClient> = {
        connect: async () => {
          const client = await worker.connect();
          return {
            release: (destroy) => {
              client.release(destroy);
            },
            query: async (text: string, values?: unknown[]) => {
              const result = await client.query(text, values);
              if (!raced && text.includes('AS identifiers')) {
                raced = true;
                await seedScreenRecords(late, { practiceId: edge.practiceId, uploaderId: edge.adminUserId }, cipherOf(edge.practiceId), { patientControlNumbers: ['LATE00000001'], payerClaimNumbers: ['7711111111111'], bulkClaims: 999 });
              }
              return result;
            },
          };
        },
      };
      const runId = randomUUID();
      const check = await withJobScope(worker, { jobId: runId, practiceId: edge.practiceId }, (scope) =>
        Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: racing, cipher: cipherOf(edge.practiceId), practiceId: edge.practiceId, screenId: runId, requestId: 'request-edge' })),
      );
      await expect(check.namesPatient(['Claim: LATE00000001'])).resolves.toBe('screen_unavailable');
      expect(raced).toBe(true);
      // The claim read stopped at the bound's 25,000 claims plus the one that says it was passed.
      expect(await readsByTable(screenAuditRequestId('request-edge', runId))).toEqual({ claim: SCREEN_MAX_IDENTIFIERS / 2 + 1 });
    } finally {
      await late.end();
    }
  }, 180_000);

  it('a practice above the bound answers screen_unavailable and reads nothing: no audited read, whatever the pages', async () => {
    const runId = randomUUID();
    const check: PatientRecordsCheck = await withJobScope(worker, { jobId: runId, practiceId: crowded.practiceId }, (scope) =>
      Promise.resolve(practiceRecordsCheck({ authorizedBy: scope, pool: worker, cipher: cipherOf(crowded.practiceId), practiceId: crowded.practiceId, screenId: runId, requestId: 'request-crowded' })),
    );
    await expect(check.namesPatient([`Member ID: ${MOD12_PRACTICE.otherMemberIds[0] ?? ''}`])).resolves.toBe('screen_unavailable');
    expect(await audited(screenAuditRequestId('request-crowded', runId))).toEqual([]);
  });
});
