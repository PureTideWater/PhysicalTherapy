import type * as DbRuntime from '@tp/db/runtime';
import { PracticeCipher, type PracticeScope, type ScopeClient, ScopeError } from '@tp/db/runtime';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { InputRefusedError } from './errors';
import { contractTermsSpec, screenContractPages } from './functions/contract-terms';
import { CONTRACT_SCREEN_PURPOSE, SCREEN_MAX_IDENTIFIERS, type PracticeRecordsOptions, type ScreenOutcome, issuedCheck, practiceRecordsCheck, screenSet, syntheticRecordsCheck } from './patient-records';
import { NO_IDENTIFIERS, SYNTHETIC_IDS, type MemoryRecords, memoryPracticeRecords, memoryRequestScope, syntheticContractInput } from './testing';

/**
 * withJobScope as packages/db builds it, unless a test tampers with the scope it hands the check: the one way to reach
 * the check's defensive assertion on the scope it opened.
 */
const jobScope = vi.hoisted(() => ({ tamper: undefined as ((scope: PracticeScope<ScopeClient>) => PracticeScope<ScopeClient>) | undefined }));
vi.mock('@tp/db/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof DbRuntime>();
  const withJobScope: typeof actual.withJobScope = (pool, request, run) => actual.withJobScope(pool, request, (scope) => run(jobScope.tamper === undefined ? scope : (jobScope.tamper(scope) as typeof scope)));
  return { ...actual, withJobScope };
});

/**
 * The contract PHI check's records (combined audit item 120; docs/adr/0070, Part 3), without a database: the memory
 * pool (./testing.ts) answers the job scope's statements and holds each practice's rows apart as row-level security
 * does. patient-records.db.test.ts runs the same on Postgres. SYNTHETIC identifiers only.
 */

const PRACTICE = SYNTHETIC_IDS.practice;
const OTHER = SYNTHETIC_IDS.otherPractice;
const SCREEN = SYNTHETIC_IDS.screen;
const REQUEST = 'request-7';

function build(records: MemoryRecords = {}, options: Parameters<typeof memoryPracticeRecords>[2] = {}, overrides: Partial<PracticeRecordsOptions> = {}) {
  const memory = memoryPracticeRecords(PRACTICE, records, options);
  const check = practiceRecordsCheck({ authorizedBy: memory.scope, pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST, ...overrides });
  return { memory, check };
}

const HELD: MemoryRecords = { memberIds: ['ZZ1234567'], patientControlNumbers: ['SYNPCN00012345'], payerClaimNumbers: ['7712345678901'], postingReferences: ['SYNPOST4007100'] };

describe('practiceRecordsCheck: bound to a scope that reaches the practice (the design review’s M7)', () => {
  it('refuses at construction, before anything is read, a caller’s scope that does not reach the practice', () => {
    const memory = memoryPracticeRecords(PRACTICE, HELD);
    const options = { pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST };
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: memoryRequestScope([OTHER]) })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: memoryRequestScope([]) })).toThrow(ScopeError);
    // access() answers for the practice, but the scope's practices (app.practice_ids) do not hold it: refused too.
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: { ...memoryRequestScope([PRACTICE]), practiceIds: [] } })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: { ...memoryRequestScope([PRACTICE]), practiceIds: [OTHER] } })).toThrow(ScopeError);
    expect(memory.reads.connects).toBe(0);
  });

  it('refuses another practice’s cipher, a screen ID that is not a UUID and a request ID with no room for the screen’s', () => {
    const memory = memoryPracticeRecords(PRACTICE, HELD);
    const options = { authorizedBy: memory.scope, pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST };
    expect(() => practiceRecordsCheck({ ...options, cipher: new PracticeCipher(OTHER, randomBytes(32)) })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, screenId: 'screen-1' })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, requestId: 'r'.repeat(90) })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, requestId: 'has spaces' })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, practiceId: 'not-a-practice' })).toThrow(ScopeError);
  });

  it('is issued, bound to its practice and frozen: its practice cannot be changed after it is built', () => {
    const { check } = build(HELD);
    expect(issuedCheck(check)).toBe(true);
    expect(check.practiceId).toBe(PRACTICE);
    expect(Object.isFrozen(check)).toBe(true);
    expect(() => {
      (check as { practiceId: string | null }).practiceId = OTHER;
    }).toThrow(TypeError);
    expect(issuedCheck({ ...check })).toBe(false);
    expect(issuedCheck({ practiceId: PRACTICE, namesPatient: () => Promise.resolve('clear') })).toBe(false);
    expect(issuedCheck(null)).toBe(false);
  });
});

describe('practiceRecordsCheck: the read, as the screen and not as the person (the design review’s M8)', () => {
  it('reads through its own job scope as the service screen actor, purpose contract_screen, joined by request ID, never through the caller’s scope', async () => {
    const { memory, check } = build(HELD);
    // memoryRequestScope's client refuses every statement: a read through the caller's scope would fail the check.
    await expect(check.namesPatient(['nothing of a patient here'])).resolves.toBe('clear');
    expect(memory.audited).toEqual([
      { actorId: SCREEN, actorKind: 'service', objectType: 'patient_ref', purpose: CONTRACT_SCREEN_PURPOSE, requestId: `${REQUEST}:screen:${SCREEN}`, practiceIds: [PRACTICE], rows: 1 },
      { actorId: SCREEN, actorKind: 'service', objectType: 'claim', purpose: CONTRACT_SCREEN_PURPOSE, requestId: `${REQUEST}:screen:${SCREEN}`, practiceIds: [PRACTICE], rows: 1 },
      { actorId: SCREEN, actorKind: 'service', objectType: 'posting_row', purpose: CONTRACT_SCREEN_PURPOSE, requestId: `${REQUEST}:screen:${SCREEN}`, practiceIds: [PRACTICE], rows: 1 },
    ]);
  });

  it('reads once per check: a second question compares against what it read', async () => {
    const { memory, check } = build(HELD);
    await check.namesPatient(['page one']);
    await check.namesPatient(['page two']);
    expect(memory.reads).toEqual({ connects: 1, count: 1, patients: 1, claims: 1, postings: 1 });
  });

  it('decrypts nothing until its reads, and their audit rows, have committed (combined audit item 120’s review, F3)', async () => {
    const { memory, check } = build(HELD);
    await expect(check.namesPatient(['nothing of a patient here'])).resolves.toBe('clear');
    // One member ID, a claim's two numbers and a posting reference: four decrypts, every one after the COMMIT.
    expect(memory.steps).toEqual(['BEGIN', 'audit', 'audit', 'audit', 'COMMIT', 'decrypt', 'decrypt', 'decrypt', 'decrypt']);
  });

  it('never matches another practice’s identical identifiers: the cross-tenant case', async () => {
    const memory = memoryPracticeRecords(PRACTICE, {}, { others: { [OTHER]: HELD } });
    const check = practiceRecordsCheck({ authorizedBy: memory.scope, pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST });
    await expect(check.namesPatient(['Member ID: ZZ1234567', 'Claim 7712345678901', 'Account SYNPCN00012345', 'Account SYNPOST4007100'])).resolves.toBe('clear');
    expect(memory.audited).toEqual([]);
  });
});

describe('practiceRecordsCheck: what it finds', () => {
  it('finds a member ID, a payer claim number and a patient control number however the page spaces or hyphenates them', async () => {
    for (const page of ['Member ID:ZZ 123 4567', 'Payer claim 77-1234-5678901', 'Patient account (SYNPCN-00012345)', 'zz1234567', 'Account SYNPOST 4007100']) {
      const { check } = build(HELD);
      await expect(check.namesPatient(['SYNTHETIC EXPLANATION OF BENEFITS', page]), page).resolves.toBe('names_patient');
    }
  });

  it('applies the floors and stored-side rules to the stored values, never to the page', async () => {
    const records: MemoryRecords = {
      memberIds: ['ZZ123', 'ZZ1234'],
      patientControlNumbers: ['97110', '1234567', 'REIMBURSEMENT', '20260101', '01012026', '13012026'],
      payerClaimNumbers: ['77123', 'AGREEMENT'],
    };
    const ask = async (page: string) => build(records).check.namesPatient([page]);
    await expect(ask('CPT 97110 $32.50; reference ZZ123; 77123')).resolves.toBe('clear');
    await expect(ask('number 1234567')).resolves.toBe('clear');
    await expect(ask('REIMBURSEMENT under this AGREEMENT')).resolves.toBe('clear');
    await expect(ask('Effective 2026-01-01, signed 01-01-2026')).resolves.toBe('clear');
    await expect(ask('member ZZ1234')).resolves.toBe('names_patient');
    await expect(ask('account 13-01-2026')).resolves.toBe('names_patient');
  });

  it('finds a patient control number held only in a posting export (a paper check’s claim), under the patient control number’s floor (combined audit item 120’s review, F7)', async () => {
    const paper = build({ postingReferences: ['SYNPOST4007100', '97110', '20260101'] });
    await expect(paper.check.namesPatient(['SYNTHETIC EXPLANATION OF BENEFITS', 'Patient account: SYNPOST4007100   Check PAPERCHK000123'])).resolves.toBe('names_patient');
    expect(paper.memory.audited.map(({ objectType, rows }) => ({ objectType, rows }))).toEqual([{ objectType: 'posting_row', rows: 3 }]);
    // A reference below the floor, or a date, is kept out as a claim's patient control number is.
    await expect(build({ postingReferences: ['97110', '20260101'] }).check.namesPatient(['CPT 97110, effective 2026-01-01'])).resolves.toBe('clear');
  });

  it('answers clear for a practice that holds no identifier', async () => {
    await expect(build({}).check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('clear');
  });
});

describe('practiceRecordsCheck: fails closed', () => {
  it.each(['query', 'decrypt', 'person', 'connect'] as const)('a %s failure answers screen_failed, never clear, and a second question reads again', async (fault) => {
    const { memory, check } = build(HELD, { fault });
    await expect(check.namesPatient(['nothing of a patient here'])).resolves.toBe('screen_failed');
    await expect(check.namesPatient(['nothing of a patient here'])).resolves.toBe('screen_failed');
    expect(memory.reads.connects).toBe(2);
  });

  it('a value that does not decrypt answers screen_failed with every read it made still audited (F3: a read never goes unaudited)', async () => {
    const { memory, check } = build(HELD, { fault: 'decrypt' });
    await expect(check.namesPatient(['nothing of a patient here'])).resolves.toBe('screen_failed');
    expect(memory.audited.map(({ objectType, rows }) => ({ objectType, rows }))).toEqual([
      { objectType: 'patient_ref', rows: 1 },
      { objectType: 'claim', rows: 1 },
      { objectType: 'posting_row', rows: 1 },
    ]);
    expect(memory.steps).toEqual(['BEGIN', 'audit', 'audit', 'audit', 'COMMIT', 'decrypt']);
  });

  it('above the bound, answers screen_unavailable and reads nothing (the session’s Q1 ruling: 50,000)', async () => {
    expect(SCREEN_MAX_IDENTIFIERS).toBe(50_000);
    const over = build(HELD, { identifierCount: SCREEN_MAX_IDENTIFIERS + 1 });
    await expect(over.check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('screen_unavailable');
    expect(over.memory.reads).toEqual({ connects: 1, count: 1, patients: 0, claims: 0, postings: 0 });
    expect(over.memory.audited).toEqual([]);
    const at = build(HELD, { identifierCount: SCREEN_MAX_IDENTIFIERS });
    await expect(at.check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('names_patient');
  });

  it('reads a practice of exactly the bound’s identifiers whole, member IDs, claims and posting references together', async () => {
    // 1 member ID + 24,999 claims (two numbers each) + 1 posting reference = 50,000.
    const { memory, check } = build({ memberIds: ['ZZ1234567'], bulkClaims: 24_999, postingReferences: ['SYNPOST4007100'] });
    await expect(check.namesPatient(['Account SYNPOST4007100'])).resolves.toBe('names_patient');
    expect(memory.audited.map(({ objectType, rows }) => ({ objectType, rows }))).toEqual([
      { objectType: 'patient_ref', rows: 1 },
      { objectType: 'claim', rows: 24_999 },
      { objectType: 'posting_row', rows: 1 },
    ]);
  });

  // The count said the practice was at the bound; rows committed before a read put it past (combined audit item 120’s
  // review, F4). The memory pool's count states the earlier figure; its reads see the rows now held.
  it.each([
    { past: 'member IDs', records: { bulkMemberIds: SCREEN_MAX_IDENTIFIERS + 1_000 }, read: { patient_ref: SCREEN_MAX_IDENTIFIERS + 1 }, statements: { patients: 1, claims: 0, postings: 0 } },
    { past: 'claims', records: { memberIds: ['ZZ1234567'], bulkClaims: SCREEN_MAX_IDENTIFIERS / 2 + 1_000 }, read: { patient_ref: 1, claim: SCREEN_MAX_IDENTIFIERS / 2 }, statements: { patients: 1, claims: 1, postings: 0 } },
    {
      past: 'posting references',
      records: { memberIds: ['ZZ1234567'], bulkClaims: SCREEN_MAX_IDENTIFIERS / 2 - 1, bulkPostingReferences: 1_000 },
      read: { patient_ref: 1, claim: SCREEN_MAX_IDENTIFIERS / 2 - 1, posting_row: 2 },
      statements: { patients: 1, claims: 1, postings: 1 },
    },
  ] as const)('rows committed past the bound after the count ($past) are never read past it by more than one row, and answer screen_unavailable with nothing decrypted', async ({ records, read, statements }) => {
    const { memory, check } = build(records, { identifierCount: SCREEN_MAX_IDENTIFIERS });
    await expect(check.namesPatient(['Member ID: ZZ1234567', 'Account SYNPOSTBULK0001', 'Member SYNBULK000001'])).resolves.toBe('screen_unavailable');
    expect(Object.fromEntries(memory.audited.map(({ objectType, rows }) => [objectType, rows]))).toEqual(read);
    // A read that passed the bound is the last: nothing after it is read.
    expect(memory.reads).toEqual({ connects: 1, count: 1, ...statements });
    const identifiers = (read.patient_ref ?? 0) + 2 * ((read as { claim?: number }).claim ?? 0) + ((read as { posting_row?: number }).posting_row ?? 0);
    expect(identifiers).toBeGreaterThan(SCREEN_MAX_IDENTIFIERS);
    expect(identifiers).toBeLessThanOrEqual(SCREEN_MAX_IDENTIFIERS + 2);
    expect(memory.steps).not.toContain('decrypt');
  });
});

describe('practiceRecordsCheck: the scope it opens is its one practice’s, as the screen (defensive)', () => {
  it.each([
    { wrong: 'two practices', tamper: (scope: PracticeScope<ScopeClient>) => ({ ...scope, practiceIds: [PRACTICE, OTHER] }) },
    { wrong: 'another practice', tamper: (scope: PracticeScope<ScopeClient>) => ({ ...scope, practiceIds: [OTHER] }) },
    { wrong: 'a person’s kind', tamper: (scope: PracticeScope<ScopeClient>) => ({ ...scope, actorKind: 'user' as const }) },
    { wrong: 'another actor', tamper: (scope: PracticeScope<ScopeClient>) => ({ ...scope, actorId: SYNTHETIC_IDS.user }) },
  ])('reads nothing through a scope of $wrong, and answers screen_failed', async ({ tamper }) => {
    const { memory, check } = build(HELD);
    jobScope.tamper = tamper;
    try {
      await expect(check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('screen_failed');
    } finally {
      jobScope.tamper = undefined;
    }
    expect(memory.reads).toEqual({ connects: 1, count: 0, patients: 0, claims: 0, postings: 0 });
    // Untampered, the same check reads and finds the member ID.
    await expect(check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('names_patient');
  });
});

describe('screenContractPages (functions/contract-terms.ts): an outcome outside the four (defensive)', () => {
  it('refuses as screen_failed, never sends, whatever an issued check answers that is not one of its four codes', async () => {
    // No issued check answers anything else; a check made to pass as issued (WeakSet.prototype.has rewritten, which
    // only code in this process can do) reaches the switch's default branch.
    const odd = { practiceId: PRACTICE, namesPatient: () => Promise.resolve('maybe' as ScreenOutcome) };
    const has: (this: WeakSet<WeakKey>, value: WeakKey) => boolean = Reflect.get(WeakSet.prototype, 'has');
    const spy = vi.spyOn(WeakSet.prototype, 'has').mockImplementation(function (this: WeakSet<WeakKey>, value: WeakKey) {
      return value === odd || has.call(this, value);
    });
    try {
      const input = syntheticContractInput({ patientRecords: odd });
      const refusal = screenContractPages(input, contractTermsSpec.prepare(input), { practiceId: PRACTICE, requestKey: 'request-1' });
      await expect(refusal).rejects.toBeInstanceOf(InputRefusedError);
      await expect(refusal).rejects.toMatchObject({ code: 'screen_failed' });
    } finally {
      spy.mockRestore();
    }
    expect(issuedCheck(odd)).toBe(false);
  });
});

describe('syntheticRecordsCheck', () => {
  it('is issued with no practice, and screens as a practice check does', async () => {
    const check = syntheticRecordsCheck({ memberIds: ['ZZ1234567'], patientControlNumbers: ['97110', '20260101'], payerClaimNumbers: [] });
    expect(issuedCheck(check)).toBe(true);
    expect(check.practiceId).toBeNull();
    expect(Object.isFrozen(check)).toBe(true);
    await expect(check.namesPatient(['Member ID:ZZ 123 4567'])).resolves.toBe('names_patient');
    await expect(check.namesPatient(['CPT 97110, effective 2026-01-01'])).resolves.toBe('clear');
    await expect(syntheticRecordsCheck(NO_IDENTIFIERS).namesPatient(['ZZ1234567'])).resolves.toBe('clear');
  });
});

describe('screenSet', () => {
  it('keeps each kept value once, with the longest and shortest lengths', () => {
    const set = screenSet([
      ['memberId', 'zz-1234567'],
      ['memberId', 'ZZ1234567'],
      ['patientControlNumber', '97110'],
      ['payerClaimNumber', '7712345678901'],
    ]);
    expect([...set.values].sort()).toEqual(['7712345678901', 'ZZ1234567']);
    expect(set.longest).toBe(13);
    expect(set.shortest).toBe(9);
  });
});
