import { PracticeCipher, ScopeError } from '@tp/db/runtime';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { CONTRACT_SCREEN_PURPOSE, SCREEN_MAX_IDENTIFIERS, type PracticeRecordsOptions, issuedCheck, practiceRecordsCheck, screenSet, syntheticRecordsCheck } from './patient-records';
import { NO_IDENTIFIERS, SYNTHETIC_IDS, type MemoryRecords, memoryPracticeRecords, memoryRequestScope } from './testing';

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

const HELD: MemoryRecords = { memberIds: ['ZZ1234567'], patientControlNumbers: ['SYNPCN00012345'], payerClaimNumbers: ['7712345678901'] };

describe('practiceRecordsCheck: bound to a scope that reaches the practice (the design review’s M7)', () => {
  it('refuses at construction, before anything is read, a caller’s scope that does not reach the practice', () => {
    const memory = memoryPracticeRecords(PRACTICE, HELD);
    const options = { pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST };
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: memoryRequestScope([OTHER]) })).toThrow(ScopeError);
    expect(() => practiceRecordsCheck({ ...options, authorizedBy: memoryRequestScope([]) })).toThrow(ScopeError);
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
      { actorId: SCREEN, actorKind: 'service', objectType: 'patient_ref', purpose: CONTRACT_SCREEN_PURPOSE, requestId: `${REQUEST}:screen:${SCREEN}`, practiceIds: [PRACTICE] },
      { actorId: SCREEN, actorKind: 'service', objectType: 'claim', purpose: CONTRACT_SCREEN_PURPOSE, requestId: `${REQUEST}:screen:${SCREEN}`, practiceIds: [PRACTICE] },
    ]);
  });

  it('reads once per check: a second question compares against what it read', async () => {
    const { memory, check } = build(HELD);
    await check.namesPatient(['page one']);
    await check.namesPatient(['page two']);
    expect(memory.reads).toEqual({ connects: 1, count: 1, patients: 1, claims: 1 });
  });

  it('never matches another practice’s identical identifiers: the cross-tenant case', async () => {
    const memory = memoryPracticeRecords(PRACTICE, {}, { others: { [OTHER]: HELD } });
    const check = practiceRecordsCheck({ authorizedBy: memory.scope, pool: memory.pool, cipher: memory.cipher, practiceId: PRACTICE, screenId: SCREEN, requestId: REQUEST });
    await expect(check.namesPatient(['Member ID: ZZ1234567', 'Claim 7712345678901', 'Account SYNPCN00012345'])).resolves.toBe('clear');
    expect(memory.audited).toEqual([]);
  });
});

describe('practiceRecordsCheck: what it finds', () => {
  it('finds a member ID, a payer claim number and a patient control number however the page spaces or hyphenates them', async () => {
    for (const page of ['Member ID:ZZ 123 4567', 'Payer claim 77-1234-5678901', 'Patient account (SYNPCN-00012345)', 'zz1234567']) {
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

  it('above the bound, answers screen_unavailable and reads nothing (the session’s Q1 ruling: 50,000)', async () => {
    expect(SCREEN_MAX_IDENTIFIERS).toBe(50_000);
    const over = build(HELD, { identifierCount: SCREEN_MAX_IDENTIFIERS + 1 });
    await expect(over.check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('screen_unavailable');
    expect(over.memory.reads).toEqual({ connects: 1, count: 1, patients: 0, claims: 0 });
    expect(over.memory.audited).toEqual([]);
    const at = build(HELD, { identifierCount: SCREEN_MAX_IDENTIFIERS });
    await expect(at.check.namesPatient(['Member ID: ZZ1234567'])).resolves.toBe('names_patient');
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
