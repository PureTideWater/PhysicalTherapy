import { randomBytes, randomUUID } from 'node:crypto';

import { PracticeCipher, type PracticeScope, type ScopeClient, type ScopePool } from '@tp/db/runtime';
import type { LogFields, LogLevel, Logger } from '@tp/observability';
import { assemblePacket, draftNarrative } from '@tp/packets';
import { assemblyInput } from '@tp/packets/testing';

import type { FlagRow } from './flags';
import type { ContractPagesInput, ContractTermsOutput } from './functions/contract-terms';
import type { DenialLetterInput, DenialLetterOutput, OtherPatientCheck } from './functions/denial-letter';
import type { EvidenceRequestsInput, EvidenceRequestsOutput } from './functions/evidence-requests';
import type { NarrativeInput, NarrativeOutput } from './functions/narrative';
import { ModelGateway } from './gateway';
import type { CallLimiter } from './limiter';
import { sha256Hex } from './hash';
import type { ModelProvider } from './provider';
import { type PatientRecordsCheck, type ScreenIdentifiers, practiceRecordsCheck, syntheticRecordsCheck } from './patient-records';
import { LocalDeterministicProvider } from './providers/local';
import type { ModelPurpose } from './purposes';
import { compactIdentifier } from './redact';
import { type RequestInputs, requestFor } from './specs';
import { type CallActor, MemoryModelCallStore } from './store';

/**
 * SYNTHETIC test support for @tp/model-gateway and its callers: invented documents, letters and facts,
 * the answers a model would give for them, a logger that keeps its lines, and a gateway on the local
 * deterministic provider and the memory store. Nothing here is real data or a real model.
 */

export const SYNTHETIC_IDS = {
  practice: '00000000-0000-4000-8000-0000000000a1',
  otherPractice: '00000000-0000-4000-8000-0000000000a2',
  organization: '00000000-0000-4000-8000-0000000000b1',
  user: '00000000-0000-4000-8000-0000000000c1',
  job: '00000000-0000-4000-8000-0000000000c2',
  contract: '00000000-0000-4000-8000-0000000000d1',
  letter: '00000000-0000-4000-8000-0000000000d2',
  claimOne: '00000000-0000-4000-8000-0000000000e1',
  claimTwo: '00000000-0000-4000-8000-0000000000e2',
  /** The service actor a synthetic practice check's reads are attributed to. */
  screen: '00000000-0000-4000-8000-0000000000c3',
} as const;

// ---------------------------------------------------------------------------------------------------
// proposeContractTerms

export const SYNTHETIC_CONTRACT_PAGES: readonly string[] = [
  [
    'SYNTHETIC PAYER Q PROVIDER AGREEMENT',
    'This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.',
    'Section 4. Compensation. Payer pays Provider the rates in Exhibit A for each unit of service.',
    'Section 5. Rounding. Amounts are rounded half up to the nearest cent.',
  ].join('\n'),
  ['EXHIBIT A - FEE SCHEDULE', 'CPT 97110 Therapeutic exercise, each 15 minutes   $32.50 per unit', 'CPT 97140 Manual therapy, each 15 minutes   $30.25 per unit'].join('\n'),
];

/**
 * The synthetic contract as the gateway takes it. Its records check, unless the test gives another, is a practice
 * check (patient-records.ts practiceRecordsCheck, issued as production's is) over the synthetic practice's
 * in-memory records, which hold no identifier: a call for SYNTHETIC_IDS.practice passes the screen. An evaluation
 * call (no practice) gives `patientRecords: syntheticRecordsCheck(...)`.
 */
export function syntheticContractInput(overrides: Partial<ContractPagesInput> = {}): ContractPagesInput {
  return { documentId: SYNTHETIC_IDS.contract, documentSha256: sha256Hex('SYNTHETIC CONTRACT DOCUMENT'), kind: 'contract', pages: SYNTHETIC_CONTRACT_PAGES, patientRecords: syntheticPracticeCheck(), ...overrides };
}

/** The synthetic contract as an evaluation call (no practice) takes it: its records check is a synthetic one over no identifiers. */
export function syntheticEvaluationContractInput(overrides: Partial<ContractPagesInput> = {}): ContractPagesInput {
  return syntheticContractInput({ patientRecords: syntheticRecordsCheck(NO_IDENTIFIERS), ...overrides });
}

export const NO_IDENTIFIERS: ScreenIdentifiers = { memberIds: [], patientControlNumbers: [], payerClaimNumbers: [] };

// ---------------------------------------------------------------------------------------------------
// The contract screen's records, in memory

/** A synthetic practice's stored identifiers, as plain text (the memory pool encrypts them as the database holds them). */
export interface MemoryRecords {
  readonly memberIds?: readonly string[];
  readonly patientControlNumbers?: readonly string[];
  readonly payerClaimNumbers?: readonly string[];
}

/** What a memory pool's client does wrong, for the screen's fail-closed tests. */
export type MemoryRecordsFault = 'query' | 'decrypt' | 'person' | 'connect';

export interface MemoryAuditRow {
  readonly actorId: string;
  readonly actorKind: string;
  readonly objectType: string;
  readonly purpose: string;
  readonly requestId: string;
  readonly practiceIds: readonly string[];
}

export interface MemoryPracticeRecords {
  /** A pool whose clients answer the job scope's and the screen's statements, with each practice's rows visible only when app.practice_ids holds it (as row-level security makes them). */
  readonly pool: ScopePool<ScopeClient>;
  readonly cipher: PracticeCipher;
  /** A person's request scope that reaches the practice: the check's proof of access. */
  readonly scope: PracticeScope<ScopeClient>;
  /** Each audited read the screen made, one per readWithAudit call with the rows' practices. */
  readonly audited: MemoryAuditRow[];
  /** How many connections were taken, and how many statements of each kind ran (count, patient_ref, claim). */
  readonly reads: { connects: number; count: number; patients: number; claims: number };
}

const NO_RESULT = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };

/** A person's scope over the given practices (only its access() is read: the check's proof). */
export function memoryRequestScope(practiceIds: readonly string[], actorId: string = SYNTHETIC_IDS.user): PracticeScope<ScopeClient> {
  return {
    kind: 'practice',
    client: { query: () => Promise.reject(new Error('the screen never reads through the caller’s scope')), release: () => undefined },
    actorId,
    actorKind: 'user',
    practiceIds: [...practiceIds].sort(),
    access: (id) => (practiceIds.includes(id) ? { practiceId: id, via: 'grant', grantId: null, roles: ['contract_specialist'] } : undefined),
  };
}

/**
 * SYNTHETIC records for the contract screen without a database: the practice's (and, optionally, other practices')
 * identifiers encrypted with a fresh cipher per practice, served by a pool whose clients emulate the job scope's
 * statements and row-level security. For unit tests; patient-records.db.test.ts runs the same check on Postgres.
 */
export function memoryPracticeRecords(
  practiceId: string,
  records: MemoryRecords = {},
  options: { readonly others?: Readonly<Record<string, MemoryRecords>>; readonly fault?: MemoryRecordsFault; readonly identifierCount?: number } = {},
): MemoryPracticeRecords {
  const ciphers = new Map<string, PracticeCipher>();
  const cipherOf = (id: string) => {
    let cipher = ciphers.get(id);
    if (cipher === undefined) {
      cipher = new PracticeCipher(id, randomBytes(32));
      ciphers.set(id, cipher);
    }
    return cipher;
  };
  const seal = (id: string, column: 'patient_ref.member_id' | 'claim.patient_control_number' | 'claim.payer_claim_control_number', value: string) =>
    options.fault === 'decrypt' ? 'enc:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' : cipherOf(id).encrypt(column, value);
  const all = { ...options.others, [practiceId]: records };
  const patients = Object.entries(all).flatMap(([id, held]) => (held.memberIds ?? []).map((value) => ({ id: randomUUID(), practice_id: id, member_id: seal(id, 'patient_ref.member_id', value) })));
  const claims = Object.entries(all).flatMap(([id, held]) => {
    const pcns = held.patientControlNumbers ?? [];
    const ccns = held.payerClaimNumbers ?? [];
    // Every claim row holds both numbers; a short filler (below every floor) stands for the one a test leaves out.
    return Array.from({ length: Math.max(pcns.length, ccns.length) }, (_, index) => ({
      id: randomUUID(),
      practice_id: id,
      patient_control_number: seal(id, 'claim.patient_control_number', pcns[index] ?? 'P1'),
      payer_claim_control_number: seal(id, 'claim.payer_claim_control_number', ccns[index] ?? 'C1'),
    }));
  });
  const audited: MemoryAuditRow[] = [];
  const reads = { connects: 0, count: 0, patients: 0, claims: 0 };
  const pool: ScopePool<ScopeClient> = {
    connect: () => {
      reads.connects += 1;
      if (options.fault === 'connect') {
        return Promise.reject(new Error('SYNTHETIC connection refused'));
      }
      let actor = '';
      let inScope: readonly string[] = [];
      const client: ScopeClient = {
        release: () => undefined,
        query: (text: string, values: unknown[] = []) => {
          const result = <R>(rows: R[]) => Promise.resolve({ ...NO_RESULT, rows, rowCount: rows.length } as never);
          if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
            return result([]);
          }
          if (text.startsWith("SELECT set_config('app.actor_id'")) {
            actor = String(values[0]);
            inScope = [String(values[1])];
            return result([]);
          }
          if (text === 'SELECT app_actor_is_person() AS person') {
            return result([{ person: options.fault === 'person' }]);
          }
          if (options.fault === 'query') {
            return Promise.reject(new Error('SYNTHETIC statement failed'));
          }
          const visible = <T extends { readonly practice_id: string }>(rows: readonly T[]) => rows.filter((row) => inScope.includes(row.practice_id) && row.practice_id === values[0]);
          if (text.includes('AS identifiers')) {
            reads.count += 1;
            return result([{ identifiers: String(options.identifierCount ?? visible(patients).length + 2 * visible(claims).length) }]);
          }
          if (text.startsWith('SELECT id, practice_id, member_id FROM patient_ref')) {
            reads.patients += 1;
            return result(visible(patients));
          }
          if (text.startsWith('SELECT id, practice_id, patient_control_number, payer_claim_control_number FROM claim')) {
            reads.claims += 1;
            return result(visible(claims));
          }
          if (text.startsWith('INSERT INTO audit_event')) {
            audited.push({ actorId: String(values[0]), actorKind: String(values[1]), objectType: String(values[3]), purpose: String(values[4]), requestId: String(values[5]), practiceIds: values[7] as string[] });
            return result([]);
          }
          return Promise.reject(new Error(`SYNTHETIC memory pool: unexpected statement for actor ${actor === '' ? 'none' : 'set'}`));
        },
      };
      return Promise.resolve(client);
    },
  };
  return { pool, cipher: cipherOf(practiceId), scope: memoryRequestScope([practiceId]), audited, reads };
}

/** A practice check (issued by patient-records.ts practiceRecordsCheck, as production's is) over SYNTHETIC in-memory records. */
export function syntheticPracticeCheck(practiceId: string = SYNTHETIC_IDS.practice, records: MemoryRecords = {}): PatientRecordsCheck {
  const memory = memoryPracticeRecords(practiceId, records);
  return practiceRecordsCheck({ authorizedBy: memory.scope, pool: memory.pool, cipher: memory.cipher, practiceId, screenId: SYNTHETIC_IDS.screen, requestId: 'synthetic-screen' });
}

const WINDOW_QUOTE = 'This Agreement is effective January 1, 2026 and remains in effect through December 31, 2026.';

/** What a model would answer for the synthetic contract: two fixed-schedule rows, every quote on its page. */
export function syntheticContractOutput(): ContractTermsOutput {
  const row = (code: string, amount: string, quote: string) => ({
    label: `Exhibit A, ${code}`,
    method: { value: 'FIXED_SCHEDULE' as const, page: 2, quote },
    codes: { written: [code], page: 2, quote },
    modifiers: null,
    places_of_service: null,
    amount: { written: amount, page: 2, quote },
    percentage: null,
    fee_schedule_year: null,
    lesser_of_schedule: null,
    flags: null,
    rounding: { value: 'HALF_UP_CENT' as const, page: 1, quote: 'Amounts are rounded half up to the nearest cent.' },
    effective_from: { written: 'January 1, 2026', page: 1, quote: WINDOW_QUOTE },
    effective_to: { written: 'December 31, 2026', page: 1, quote: WINDOW_QUOTE },
  });
  return {
    candidates: [
      row('97110', '$32.50', 'CPT 97110 Therapeutic exercise, each 15 minutes $32.50 per unit'),
      row('97140', '$30.25', 'CPT 97140 Manual therapy, each 15 minutes $30.25 per unit'),
    ],
  };
}

// ---------------------------------------------------------------------------------------------------
// readDenialLetter

export const SYNTHETIC_LETTER = [
  'SYNTHETIC PAYER Q',
  'Claims Review Department',
  'RE: Patient JANE Q ZEPHYRA, DOB 03/14/1980, Member ID SYNMEMBER0042',
  'Claim number SYNCLAIM0001',
  'We reviewed the claim for services on 2026-03-05. The claim was denied because prior authorization was not obtained. Our reference number is REF-SYN-77.',
  'To appeal, submit a written request by May 30, 2026 with the authorization approval letter and the plan of care.',
].join('\n');

/**
 * A stand-in for the practice's records check (OtherPatientCheck): the SYNTHETIC member IDs and claim
 * numbers of the practice's other patients, compared as the gateway compacts them. It keeps what it was
 * asked, so a test can see the candidates.
 */
export function syntheticRecords(otherPatientsIdentifiers: readonly string[] = ['SYNMEMBER0099', 'SYNCLAIM0099']): OtherPatientCheck & { readonly asked: (readonly string[])[] } {
  const others = new Set(otherPatientsIdentifiers.map(compactIdentifier));
  const asked: (readonly string[])[] = [];
  return {
    asked,
    holdsOtherPatient: (candidates) => {
      asked.push(candidates);
      return Promise.resolve(candidates.some((candidate) => others.has(compactIdentifier(candidate))));
    },
  };
}

export function syntheticLetterInput(overrides: Partial<DenialLetterInput> = {}): DenialLetterInput {
  return {
    documentId: SYNTHETIC_IDS.letter,
    documentSha256: sha256Hex(SYNTHETIC_LETTER),
    text: SYNTHETIC_LETTER,
    patient: { pseudonym: 'synthetic-patient-1', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] },
    claims: [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYNCLAIM0001'] }],
    otherPatients: syntheticRecords(),
    ...overrides,
  };
}

/** What a model would answer for the synthetic letter, as redacted. */
export function syntheticLetterOutput(): DenialLetterOutput {
  return {
    payer: { written: 'SYNTHETIC PAYER Q', quote: 'SYNTHETIC PAYER Q' },
    claim_references: [
      { written: '[CLAIM_1]', quote: 'Claim number [CLAIM_1]' },
      { written: 'REF-SYN-77', quote: 'Our reference number is REF-SYN-77.' },
    ],
    reason_category: 'authorization',
    reason_quote: 'The claim was denied because prior authorization was not obtained.',
    deadline: { written: 'May 30, 2026', quote: 'To appeal, submit a written request by May 30, 2026' },
    requested_documents: [
      { written: 'the authorization approval letter', quote: 'with the authorization approval letter and the plan of care' },
      { written: 'the plan of care', quote: 'with the authorization approval letter and the plan of care' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------
// draftPacketNarrative

/** The case's identifiers the synthetic packet's schedule rows stand for (never in its content). */
export const SYNTHETIC_CASE_IDENTIFIERS: readonly string[] = ['ZEPHYRA, JANE Q', 'SYNMEMBER0042', 'SYNCLAIM0001', 'SYNCLAIM0002', 'SYNCLAIM0003'];

export function syntheticNarrativeInput(): NarrativeInput {
  return { content: assemblePacket(assemblyInput()), identifiers: SYNTHETIC_CASE_IDENTIFIERS };
}

/** A narrative that passes the verifier: the packets package's own code-built draft, as one paragraph. */
export function syntheticNarrativeOutput(input: NarrativeInput = syntheticNarrativeInput()): NarrativeOutput {
  return { paragraphs: [draftNarrative(input.content)] };
}

// ---------------------------------------------------------------------------------------------------
// suggestEvidenceRequests

export function syntheticEvidenceInput(): EvidenceRequestsInput {
  return {
    gaps: [
      { reason: 'NO_RATE_FOR_CODE', count: 3, payer: 'SYNTHETIC PAYER Q', codes: ['97530'] },
      { reason: 'contract_missing_pages', count: 1, payer: 'SYNTHETIC PAYER Q', codes: [] },
    ],
  };
}

export function syntheticEvidenceOutput(): EvidenceRequestsOutput {
  return {
    items: [
      { reason: 'NO_RATE_FOR_CODE', document: 'The fee-schedule exhibit page that lists 97530 for SYNTHETIC PAYER Q', why: 'It lets the practice check the three lines billed with 97530.' },
      { reason: 'contract_missing_pages', document: 'The complete signed agreement with SYNTHETIC PAYER Q, every page', why: 'The specialist could not abstract the contract with pages missing.' },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------
// A logger, and a gateway on the local provider

export interface LoggedLine {
  readonly level: LogLevel;
  readonly message: string;
  readonly fields: LogFields;
}

export interface CapturingLogger extends Logger {
  readonly lines: LoggedLine[];
}

export function capturingLogger(base: LogFields = {}, lines: LoggedLine[] = []): CapturingLogger {
  const log = (level: LogLevel) => (message: string, fields: LogFields = {}) => {
    lines.push({ level, message, fields: { ...base, ...fields } });
  };
  return { lines, debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error'), child: (fields) => capturingLogger({ ...base, ...fields }, lines) };
}

export interface LocalGatewayOptions {
  readonly actor?: CallActor;
  readonly flags?: readonly FlagRow[];
  readonly organizations?: Readonly<Record<string, string>>;
  readonly production?: boolean;
  readonly provider?: ModelProvider;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  readonly limiter?: CallLimiter;
}

export function localGateway(options: LocalGatewayOptions = {}) {
  const local = new LocalDeterministicProvider();
  const provider = options.provider ?? local;
  const store = new MemoryModelCallStore({
    actor: options.actor ?? { kind: 'user', userId: SYNTHETIC_IDS.user },
    flags: options.flags ?? [],
    organizations: options.organizations ?? { [SYNTHETIC_IDS.practice]: SYNTHETIC_IDS.organization },
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const logger = capturingLogger();
  const gateway = new ModelGateway({
    provider,
    store,
    logger,
    production: options.production ?? false,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.limiter === undefined ? {} : { limiter: options.limiter }),
  });
  return { gateway, provider, local, store, logger };
}

/** Registers the local provider's fixed output for a purpose's input. */
export function registerOutput<K extends ModelPurpose>(provider: LocalDeterministicProvider, purpose: K, input: RequestInputs[K], output: unknown): void {
  provider.register(requestFor(purpose, input), output);
}
