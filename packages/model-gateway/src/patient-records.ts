import { type AnyScope, type PracticeCipher, type PracticeScope, type ScopeClient, type ScopePool, ScopeError, isUuid, readWithAudit, recordAuditEvent, withJobScope } from '@tp/db/runtime';

import { SCREEN_FLOORS, SCREEN_MAX_RUN, SCREEN_MIN_RUN, type ScreenIdentifierKind, identifierRuns, screenIdentifier } from './redact';

/**
 * The contract PHI check (combined audit item 120; docs/adr/0070, Part 3): before a contract's or exhibit's pages are
 * framed for a model, the gateway asks the practice's own records whether any run of the pages is a member ID, a
 * payer claim control number or a patient control number the practice holds. A contract carries no patient's
 * details (PRD 14: contracts and exhibits "are sent as stored"), so a document that names one is a misfiled payer
 * letter or EOB, and is refused, never sent.
 *
 * Why no caller can skip it, or hand the gateway a check that answers "clear" for anything:
 * - ContractPagesInput.patientRecords is required, so no caller's code compiles without a check;
 * - the gateway's screen (functions/contract-terms.ts) accepts only a check one of the two factories below issued
 *   (issuedCheck: a module-private WeakSet, which code elsewhere can neither add to nor forge), bound to the
 *   call's own practice; a synthetic check (practiceId null) is accepted only on a synthetic evaluation call, which
 *   carries no practice's material;
 * - a practice check is bound at construction to a scope of the caller's that reaches the practice (the caller's
 *   proof of access; the design review's M7), and reads through a job scope it opens itself on the pool for exactly
 *   that practice, so no runner scoped to another practice can be supplied. The scope and the pool are taken by
 *   their shape (packages/db brands neither), so this module cannot tell a stub pool that returns nothing from a
 *   real one: no production caller supplies one, because lint.test.ts holds practiceRecordsCheck to the web's
 *   proposal and the worker's permitted run, each on its services' pool, to ./testing.ts and to tests;
 * - every issued check is frozen, so its practice cannot be changed after the gateway's binding was made;
 * - any error while loading (the scope, a query, a decrypt) answers screen_failed, and a practice holding more
 *   identifiers than the bound answers screen_unavailable: both refuse the call (fail closed), never "clear".
 *
 * Read as the screen, not as the person (the design review's M8): a contract specialist holds no phi.read, so the
 * records are read in a job scope whose actor is the service screen ID (withJobScope: actor kind service, refused
 * if the ID names a person), each returned row audited (readWithAudit) with purpose contract_screen and the request
 * ID `<requestId>:screen:<screenId>`. The caller records one event in the person's own name that joins to those
 * reads by that request ID (the web's contract_screen_requested), so the trail says who caused the screen without
 * saying that the person read every patient. The job scope returns the rows as stored (ciphertext) and commits, its
 * audit rows with it, before any value is decrypted: no value is decrypted whose read is not audited, so a value
 * that does not decrypt answers screen_failed with every read kept (combined audit item 120's review, F3).
 *
 * Bounded until the lookup-hash migration (the design's F3, Lane A's): before reading, the check counts, unaudited,
 * the identifiers it would read (a count, not PHI); above SCREEN_MAX_IDENTIFIERS it reads nothing and answers
 * screen_unavailable. Each read is itself capped at what the bound leaves, plus one row to tell "at the bound" from
 * "past it", so rows committed between the count and a read (an 835 load, a posting export) are never read past the
 * bound by more than that one row, and a read that passes it answers screen_unavailable having decrypted nothing.
 * So the audit rows, the decrypts and the plaintext held in one process per check are bounded whatever commits
 * meanwhile, and the bound fails closed (the person enters the terms by hand).
 *
 * What leaves a check: one of four codes. Never which identifier matched, its kind, its row or how many; the
 * decrypted values live in one Set inside the check and go with it.
 */

/**
 * The most identifiers a practice check reads (each member ID, the two numbers of each claim, and each posting row's
 * claim reference that no claim is known to carry: POSTED_ONLY); above it the check refuses (the design's Q1, as the
 * session ruled it).
 */
export const SCREEN_MAX_IDENTIFIERS = 50_000;

/** The audit purpose of the screen's reads, and of the event the caller records in the person's name. */
export const CONTRACT_SCREEN_PURPOSE = 'contract_screen';

export type ScreenOutcome = 'clear' | 'names_patient' | 'screen_unavailable' | 'screen_failed';

export interface PatientRecordsCheck {
  /** The practice whose records the check reads; null for a synthetic check (an evaluation call's). */
  readonly practiceId: string | null;
  /** Page texts in; an outcome out; nothing else leaves. */
  namesPatient(texts: readonly string[]): Promise<ScreenOutcome>;
}

/** A synthetic practice's identifiers, as packages/synth's screen twins hand them over: invented values only. */
export interface ScreenIdentifiers {
  readonly memberIds: readonly string[];
  readonly patientControlNumbers: readonly string[];
  readonly payerClaimNumbers: readonly string[];
}

export interface PracticeRecordsOptions {
  /** The caller's own scope: proof that it reaches the practice now (its access()), never read through. */
  readonly authorizedBy: PracticeScope<ScopeClient>;
  /** The pool the check opens its own job scope on. */
  readonly pool: ScopePool<ScopeClient>;
  /** The practice's cipher (the services'): the stored identifiers are encrypted with its data key. */
  readonly cipher: PracticeCipher;
  readonly practiceId: string;
  /** A fresh UUID (a web request's) or the job's own ID (a worker run's): the service actor the reads are attributed to. */
  readonly screenId: string;
  /** The request (or job) the screen belongs to; the reads' request ID is `<requestId>:screen:<screenId>`. */
  readonly requestId: string;
}

/** The identifiers a check compares, and the longest of them. */
export interface ScreenSet {
  readonly values: ReadonlySet<string>;
  readonly longest: number;
  readonly shortest: number;
}

const issued = new WeakSet<object>();

/** Whether the check is one this module issued (and so reads the records it says it reads). */
export function issuedCheck(check: unknown): check is PatientRecordsCheck {
  return typeof check === 'object' && check !== null && issued.has(check);
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Floors and stored-side rules other than the shipped ones: for the false-refusal measurement only (eval/gate.golden.test.ts); an issued check always uses the shipped ones. */
export interface ScreenRules {
  readonly floors: Readonly<Record<ScreenIdentifierKind, { readonly minLength: number; readonly digit: boolean }>>;
  readonly dropDates: boolean;
}

export const SHIPPED_SCREEN_RULES: ScreenRules = { floors: SCREEN_FLOORS, dropDates: true };

/** Builds the compared set from identifiers by kind, keeping each one that meets its kind's floor and the stored-side rules (redact.ts screenIdentifier). */
export function screenSet(identifiers: Iterable<readonly [ScreenIdentifierKind, string]>, rules: ScreenRules = SHIPPED_SCREEN_RULES): ScreenSet {
  const values = new Set<string>();
  let longest = 0;
  let shortest = Number.POSITIVE_INFINITY;
  for (const [kind, value] of identifiers) {
    const kept = screenIdentifier(kind, value, rules.floors, { dropDates: rules.dropDates });
    if (kept !== null) {
      values.add(kept);
      longest = Math.max(longest, kept.length);
      shortest = Math.min(shortest, kept.length);
    }
  }
  return { values, longest, shortest };
}

/** Whether any run of any page is one of the set's identifiers (exact, whole tokens: redact.ts identifierRuns). */
export function pagesName(texts: readonly string[], set: ScreenSet): boolean {
  if (set.values.size === 0) {
    return false;
  }
  const maxLength = Math.min(set.longest, SCREEN_MAX_RUN);
  const minLength = Math.min(SCREEN_MIN_RUN, set.shortest);
  return texts.some((text) => identifierRuns(text, { minLength, maxLength }).some((run) => set.values.has(run)));
}

function issue(check: PatientRecordsCheck): PatientRecordsCheck {
  const frozen = Object.freeze(check);
  issued.add(frozen);
  return frozen;
}

/**
 * The check for one practice's records, for a call that reads that practice's document (the web's proposal, the
 * worker's permitted run). Throws at construction, before anything is read, unless the caller's scope reaches the
 * practice, the cipher is the practice's, the screen ID is a UUID and the request ID leaves room for the screen's
 * suffix. The records are read once, at the first question, and kept for the check's life (one request, or one run);
 * a failed read is not kept, so asking again reads again.
 */
export function practiceRecordsCheck(options: PracticeRecordsOptions): PatientRecordsCheck {
  const { authorizedBy, pool, cipher, practiceId, screenId, requestId } = options;
  if (!isUuid(practiceId) || authorizedBy.access(practiceId) === undefined || !authorizedBy.practiceIds.includes(practiceId)) {
    throw new ScopeError('the caller’s scope does not reach the practice it would screen');
  }
  if (cipher.practiceId !== practiceId) {
    throw new ScopeError('the screen reads a practice’s records only with that practice’s cipher');
  }
  if (!isUuid(screenId)) {
    throw new ScopeError('a screen ID is a fresh UUID, or the job’s own');
  }
  const auditRequestId = screenAuditRequestId(requestId, screenId);
  if (!REQUEST_ID.test(requestId) || !REQUEST_ID.test(auditRequestId)) {
    throw new ScopeError('requestId must be an opaque request or job identifier short enough to carry the screen’s');
  }
  let known: Promise<ScreenSet | 'too_many'> | undefined;
  const load = async (): Promise<ScreenSet | 'too_many'> => {
    const read = await withJobScope(pool, { jobId: screenId, practiceId }, async (scope) => {
      // Defensive: withJobScope builds exactly this scope today. Should it ever hand back another practice's, or a
      // person's, nothing is read through it (patient-records.test.ts holds each condition).
      if (scope.practiceIds.length !== 1 || scope.practiceIds[0] !== practiceId || scope.actorKind !== 'service' || scope.actorId !== screenId) {
        throw new ScopeError('the screen’s scope is not its one practice’s');
      }
      if ((await countIdentifiers(scope, practiceId)) > SCREEN_MAX_IDENTIFIERS) {
        return 'too_many' as const;
      }
      return readContractScreenRecords(scope, { practiceId, requestId: auditRequestId });
    });
    // The reads, and their audit rows, have committed: only now is any value decrypted.
    return read === 'too_many' ? read : decryptContractScreenRecords(read, cipher);
  };
  return issue({
    practiceId,
    async namesPatient(texts) {
      try {
        const loaded = await (known ??= load());
        if (loaded === 'too_many') {
          return 'screen_unavailable';
        }
        return pagesName(texts, loaded) ? 'names_patient' : 'clear';
      } catch {
        // Nothing of the error leaves (a message could hold a value): the call is refused by its code, and a
        // second question reads again.
        known = undefined;
        return 'screen_failed';
      }
    },
  });
}

/** The request ID the screen's reads are audited under, and the person's contract_screen_requested event with them. */
export function screenAuditRequestId(requestId: string, screenId: string): string {
  return `${requestId}:screen:${screenId}`;
}

/**
 * The person's own audit event for a screen they cause (the design's 5.2): recorded in their request scope before
 * the gateway is called, under the same request ID as the screen's reads (screenAuditRequestId), so the trail says
 * who caused the screen and joins to its reads without saying the person read every patient.
 */
export async function recordContractScreenRequested(
  scope: AnyScope<ScopeClient>,
  event: { readonly practiceId: string; readonly documentId: string; readonly requestId: string; readonly screenId: string },
): Promise<void> {
  await recordAuditEvent(scope, {
    action: 'contract_screen_requested',
    objectType: 'source_document',
    objectId: event.documentId,
    practiceId: event.practiceId,
    purpose: CONTRACT_SCREEN_PURPOSE,
    requestId: screenAuditRequestId(event.requestId, event.screenId),
  });
}

/**
 * The check over a synthetic practice's identifiers (packages/synth's screen twins), for the evaluation harness and
 * tests: the same floors, stored-side rules and page runs as a practice check, over an in-memory list, with no
 * practice (so the gateway accepts it only on a synthetic evaluation call) and no bound.
 */
export function syntheticRecordsCheck(identifiers: ScreenIdentifiers): PatientRecordsCheck {
  const set = screenSet(identifierEntries(identifiers));
  return issue({
    practiceId: null,
    namesPatient: (texts) => Promise.resolve(pagesName(texts, set) ? 'names_patient' : 'clear'),
  });
}

/** The identifiers by kind, for screenSet. */
export function* identifierEntries(identifiers: ScreenIdentifiers): Generator<readonly [ScreenIdentifierKind, string]> {
  for (const value of identifiers.memberIds) {
    yield ['memberId', value];
  }
  for (const value of identifiers.patientControlNumbers) {
    yield ['patientControlNumber', value];
  }
  for (const value of identifiers.payerClaimNumbers) {
    yield ['payerClaimNumber', value];
  }
}

/**
 * The posting export's rows whose claim reference (posting_row.claim_reference, the practice's patient control number
 * as its PM system posted it) no claim is known to carry: every row with a reference and no claim-level posting
 * match. A row with one was matched by its reference's exact equality to that claim's own patient control number
 * (apps/worker/src/reconcile/postings.ts claimsWithReference, for the reconcile job and a person's match alike; the
 * claim cannot be deleted under the match), so its number is read from claim, reversed or not; leaving those rows
 * out keeps a line-level export (one row per service line) from spending the bound on numbers already read. What is
 * left is a paper check's claim, or a posting period whose 835s were never loaded: a number the practice holds
 * nowhere else.
 */
const POSTED_ONLY = `FROM posting_row p WHERE p.practice_id = $1 AND p.claim_reference IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.posting_row_id = p.id AND m.kind = 'posting' AND m.level = 'claim')`;

/** One statement, so its three counts read one snapshot. */
const COUNT = `SELECT (SELECT count(*) FROM patient_ref WHERE practice_id = $1 AND member_id IS NOT NULL)
  + 2 * (SELECT count(*) FROM claim WHERE practice_id = $1)
  + (SELECT count(*) ${POSTED_ONLY}) AS identifiers`;

/** How many identifiers the screen would read for the practice: a count, read unaudited (it is not PHI). */
async function countIdentifiers(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<number> {
  const { rows } = await scope.client.query<{ identifiers: string | number }>(COUNT, [practiceId]);
  const counted = Number.parseInt(String(rows[0]?.identifiers ?? ''), 10);
  if (!Number.isSafeInteger(counted) || counted < 0) {
    throw new ScopeError('the screen could not count the practice’s identifiers');
  }
  return counted;
}

interface PatientRow {
  readonly id: string;
  readonly practice_id: string;
  readonly member_id: string;
}

interface ClaimRow {
  readonly id: string;
  readonly practice_id: string;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
}

interface PostingRow {
  readonly id: string;
  readonly practice_id: string;
  readonly claim_reference: string;
}

/** What the screen read, as stored (ciphertext): decrypted only once the reads' audit rows have committed. */
interface ScreenRecords {
  readonly patients: readonly PatientRow[];
  readonly claims: readonly ClaimRow[];
  readonly postings: readonly PostingRow[];
}

/** Each read's second parameter is its cap: what the bound leaves of it, plus the one row that says it was passed. */
const PATIENTS = 'SELECT id, practice_id, member_id FROM patient_ref WHERE practice_id = $1 AND member_id IS NOT NULL LIMIT $2';
const CLAIMS = 'SELECT id, practice_id, patient_control_number, payer_claim_control_number FROM claim WHERE practice_id = $1 LIMIT $2';
const POSTINGS = `SELECT p.id, p.practice_id, p.claim_reference ${POSTED_ONLY} LIMIT $2`;

const audited = (row: { readonly id: string; readonly practice_id: string }) => ({ objectId: row.id, practiceId: row.practice_id });

/**
 * The practice's member IDs, patient control numbers and payer claim control numbers, and the claim references of its
 * posting rows that no claim is known to carry (POSTED_ONLY), read in the screen's own scope with one audit event per
 * row returned (purpose contract_screen; the letter screen's read pattern, apps/worker/src/packets/letter-records.ts,
 * written anew: that read is not moved, the design review's m9), and returned as stored: nothing is decrypted in the
 * scope. Each read is capped at what the bound leaves (one identifier per member ID and posting row, two per claim)
 * plus one row, so a practice whose rows passed the bound after the count is refused ('too_many') having read at most
 * that one row past it. No claim is left out for its age (a cap is a silent gap); ERA-export claims are claims. Group
 * numbers are not read: a contract carries them legitimately.
 */
async function readContractScreenRecords(scope: PracticeScope<ScopeClient>, read: { readonly practiceId: string; readonly requestId: string }): Promise<ScreenRecords | 'too_many'> {
  const audit = { purpose: CONTRACT_SCREEN_PURPOSE, requestId: read.requestId };
  let left = SCREEN_MAX_IDENTIFIERS;
  const patients = await readWithAudit(scope, { objectType: 'patient_ref', ...audit }, async (client) => (await client.query<PatientRow>(PATIENTS, [read.practiceId, left + 1])).rows, audited);
  if (patients.length > left) {
    return 'too_many';
  }
  left -= patients.length;
  const claims = await readWithAudit(scope, { objectType: 'claim', ...audit }, async (client) => (await client.query<ClaimRow>(CLAIMS, [read.practiceId, Math.floor(left / 2) + 1])).rows, audited);
  if (2 * claims.length > left) {
    return 'too_many';
  }
  left -= 2 * claims.length;
  const postings = await readWithAudit(scope, { objectType: 'posting_row', ...audit }, async (client) => (await client.query<PostingRow>(POSTINGS, [read.practiceId, left + 1])).rows, audited);
  if (postings.length > left) {
    return 'too_many';
  }
  return { patients, claims, postings };
}

/** The records decrypted, after their reads have committed, and kept by screenSet's floors and stored-side rules; a posting row's claim reference is a patient control number. */
function decryptContractScreenRecords(records: ScreenRecords, cipher: PracticeCipher): ScreenSet {
  return screenSet(
    (function* decrypted(): Generator<readonly [ScreenIdentifierKind, string]> {
      for (const patient of records.patients) {
        yield ['memberId', cipher.decrypt('patient_ref.member_id', patient.member_id)];
      }
      for (const claim of records.claims) {
        yield ['patientControlNumber', cipher.decrypt('claim.patient_control_number', claim.patient_control_number)];
        yield ['payerClaimNumber', cipher.decrypt('claim.payer_claim_control_number', claim.payer_claim_control_number)];
      }
      for (const posting of records.postings) {
        yield ['patientControlNumber', cipher.decrypt('posting_row.claim_reference', posting.claim_reference)];
      }
    })(),
  );
}
