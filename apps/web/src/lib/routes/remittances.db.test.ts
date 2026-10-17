import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser, endPool } from '@tp/db/testing';
import { assertNoPhi, createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type JobContext, databaseJobRuns, intakeHandler, intakeServices, parseHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Outcome, Route, UploadBody } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import type { Receipt } from '../uploads/receipt-labels';
import { LocalUploadTargets } from '../uploads/targets';
import { practiceHome } from './practice';
import { addLineNote, claimsPage, findClaim, linePage, remittancePage, remittancesPage } from './remittances';
import { completeUpload, requestUploads, uploadContent, uploadDocumentPage, uploadReport } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * Every PAR case of the test matrix end to end (PRD 10, Pipeline steps 1 to 10; test matrix PAR-01 to
 * PAR-30; PRD 6: "reversal followed by correction nets to one adjudicated claim in the view"): each
 * case's SYNTHETIC fixture files, as packages/synth generates them into fixtures/synthetic (CI's
 * `pnpm synth --all` keeps them byte-identical to the generator), are uploaded through the upload
 * routes, taken in by the intake job, parsed and loaded by the parse_835 job, and the database, the
 * receipts and the screens are checked against the case's expected.json. Each case gets its own
 * practice. The SYNTHETIC rule release 900001 is loaded, as the fixtures' code checks assume.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-par-test-'));

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 8);
  await loadRelease(owner, path.join(FIXTURES, 'rules/release-synth-900001'), { release: 900001, allowSyntheticFixtureForTests: true });
  const sealer = new Sealer(randomBytes(32));
  queue = new MemoryQueue();
  services = createServices({
    origin: 'http://localhost:3100',
    pool: app,
    provider: new DevAuthProvider({
      store: new MemoryDevStore(),
      sealer: sealer.derive('dev-provider'),
      webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' },
      deliverInvitation: () => Promise.resolve(),
      scryptCost: { n: 1024, r: 8, p: 1 },
    }),
    keys,
    sealer,
    logger: createLogger({ sink: () => undefined }),
    uploads: new LocalUploadTargets('http://localhost:3100', new DocumentStore(new LocalSealedBytes(documentsDir)), sealer),
    queue,
  });
}, 60_000);

afterAll(async () => {
  await endPool(app);
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------------
// The expected.json shapes this test reads (packages/synth/src/expected/types.ts)
// ---------------------------------------------------------------------------------------------------

interface ErrorExpectation {
  readonly code: string;
  readonly segmentIndex: number;
  readonly segmentId: string;
  readonly elementPosition: number;
  readonly scope?: string;
  readonly differenceCents?: string;
}

interface AdjustmentExpectation {
  readonly group: string;
  readonly reason: string;
  readonly amountCents: string;
  readonly quantity: string | null;
  readonly position: number;
}

interface LineExpectation {
  readonly lineNo: number;
  readonly procedureQualifier: string;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly revenueCode: string | null;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly units: string | null;
  readonly originalUnits: string | null;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  readonly lineAllowedCents: string | null;
  readonly observedAllowed: { readonly cents: string; readonly basis: string; readonly allocatedFromClaim: boolean };
  readonly patientShareCents: string;
  readonly adjustments: readonly AdjustmentExpectation[];
}

interface ClaimRef {
  readonly file: string;
  readonly transaction: number;
  readonly claim: number;
}

interface ClaimExpectation {
  readonly index: number;
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly status: string;
  readonly chargeCents: string;
  readonly paidCents: string;
  readonly patientResponsibilityCents: string | null;
  readonly filingIndicator: string;
  readonly facilityCode: string | null;
  readonly frequencyCode: string | null;
  readonly planRef: string | null;
  readonly serviceFrom: string | null;
  readonly serviceTo: string | null;
  readonly allowedCents: string | null;
  readonly adjustments: readonly AdjustmentExpectation[];
  readonly lines: readonly LineExpectation[];
  readonly reversalOf?: ClaimRef;
  readonly supersedes?: ClaimRef;
}

interface TransactionExpectation {
  readonly interchange: number;
  readonly group: number;
  readonly transaction: number;
  readonly isa13: string;
  readonly gs06: string;
  readonly st02: string;
  readonly status: 'loaded' | 'held';
  readonly heldReasons: readonly ErrorExpectation[];
  readonly dedupKey: { readonly senderId: string; readonly payeeId: string; readonly isa13: string; readonly trn02: string; readonly bpr02Cents: string } | null;
  readonly bprMethod: string | null;
  readonly bpr16Date: string | null;
  readonly payerName: string | null;
  readonly payerIds: readonly (readonly [string, string])[];
  readonly claims: readonly ClaimExpectation[];
  readonly plb: readonly { readonly code: string; readonly reference: string | null; readonly amountCents: string; readonly fiscalPeriodDate: string; readonly category: string; readonly counted: boolean }[];
  readonly unknownCodes: readonly { readonly list: string; readonly code: string; readonly segmentIndex: number; readonly elementPosition: number }[];
}

interface ParseExpectation {
  readonly outcome: 'loaded' | 'held' | 'partially_held';
  readonly documentErrors: readonly ErrorExpectation[];
  readonly transactions: readonly TransactionExpectation[];
  readonly receipt: {
    readonly transactions: number;
    readonly claims: number;
    readonly lines: number;
    readonly reversals: number;
    readonly plbTotalCents: string;
    readonly held: readonly { readonly st02: string; readonly reasons: readonly string[] }[];
    readonly unknownCodes: readonly string[];
    readonly loaded: { readonly transactions: number; readonly claims: number; readonly lines: number };
  };
}

interface FileExpectation {
  readonly path: string;
  readonly kind: string;
  readonly x12?: { readonly parse: ParseExpectation };
  readonly zip?: {
    readonly entries: readonly { readonly name: string; readonly outcome: 'parsed' | 'held' | 'quarantined'; readonly x12?: { readonly parse: ParseExpectation } }[];
    readonly batch: { readonly entries: number; readonly parsed: number; readonly held: number; readonly quarantined: number; readonly zipQuarantined: boolean };
  };
}

interface UploadExpectation {
  readonly step: number;
  readonly file: string;
  readonly concurrentWith?: number;
  readonly outcome: 'loaded' | 'duplicate_document' | 'duplicate_remittance' | 'loaded_for_review' | 'held';
  readonly remittancesLoaded: number;
  readonly claimsLoaded: number;
  readonly linkedTo?: number;
}

interface CaseExpectation {
  readonly case: string;
  readonly files: readonly FileExpectation[];
  readonly uploads: readonly UploadExpectation[];
  readonly outcome: { readonly netView?: { readonly claims: readonly ClaimRef[]; readonly paidCents: string } } | null;
}

const expectationOf = (id: string): CaseExpectation => JSON.parse(readFileSync(path.join(FIXTURES, id, 'expected.json'), 'utf8')) as CaseExpectation;

// ---------------------------------------------------------------------------------------------------
// A practice per case, the upload routes and the worker's jobs
// ---------------------------------------------------------------------------------------------------

interface Practice {
  readonly world: TenantWorld;
  readonly manager: string;
  readonly viewer: string;
  readonly cipher: PracticeCipher;
}

async function practiceFor(label: string): Promise<Practice> {
  const world = await createTenantWorld(owner, label);
  const key = await provisionPracticeKey(keys, world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  const manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  const viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  return { world, manager, viewer, cipher: key.cipher };
}

class Jar implements CookieJar {
  private readonly values = new Map<string, string>();
  constructor(token: string) {
    this.values.set(SESSION_COOKIE, token);
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

const tokens = new Map<string, string>();
async function sessionOf(userId: string): Promise<string> {
  let token = tokens.get(userId);
  if (token === undefined) {
    token = (await openSession(app, { userId, method: 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>, upload?: UploadBody): Promise<Outcome<R>> {
  return route.invoke(
    { cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, ...(upload === undefined ? {} : { upload }), requestId: `test-${randomUUID()}`, userAgent: null },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

/** The browser's part of an upload: ask for the URL, PUT the bytes, report it complete. */
async function upload(practice: Practice, bytes: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  const params = { practiceId: practice.world.practiceId };
  const [document] = ok(await call(requestUploads, practice.manager, params, { files: [{ kind: 'x12_835', contentType, sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(await call(uploadContent, practice.manager, { ...params, documentId: document.documentId }, { token }, { contentType, contentLength: bytes.length, body: Readable.from([bytes]) }));
  ok(await call(completeUpload, practice.manager, params, { documentId: document.documentId }));
  return document.documentId;
}

const worker = () => intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });

function jobContext(practiceId: string): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: (type, next) => queue.enqueue(type, next),
    lastAttempt: false,
  };
}

/** How many jobs run at once, as several workers would run them. */
const WORKERS = 4;

/** Runs the queued jobs as the worker would: the jobs queued now, several at a time, then the ones they queue. */
async function runQueue(): Promise<void> {
  const jobs = worker();
  for (let batch = queue.jobs.splice(0); batch.length > 0; batch = queue.jobs.splice(0)) {
    const pending = [...batch];
    await Promise.all(
      Array.from({ length: WORKERS }, async () => {
        for (let job = pending.shift(); job !== undefined; job = pending.shift()) {
          const payload = job.payload as { practice_id: string; document_id: string };
          if (job.type === 'intake') {
            await intakeHandler(jobs)(payload, jobContext(payload.practice_id));
          } else if (job.type === 'parse_835') {
            await parseHandler(jobs)(payload, jobContext(payload.practice_id));
          }
        }
      }),
    );
  }
}

async function receipt(practice: Practice, documentId: string): Promise<Receipt> {
  return ok(await call(uploadDocumentPage, practice.manager, { practiceId: practice.world.practiceId, documentId })).receipt;
}

// ---------------------------------------------------------------------------------------------------
// What the database holds, checked against the expectations
// ---------------------------------------------------------------------------------------------------

/** Decimal text in one canonical form: '2.000' and '2' are the same quantity. */
function decimal(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  const negative = text.startsWith('-');
  const [whole = '', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const trimmedFraction = fraction.replace(/0+$/, '');
  const trimmedWhole = whole.replace(/^0+/, '') || '0';
  return `${negative ? '-' : ''}${trimmedWhole}${trimmedFraction === '' ? '' : `.${trimmedFraction}`}`;
}

const REF_QUALIFIERS = new Set(['2U', 'EO', 'HI', 'NF']);

/** The payer identifier the mapping queue holds, from the payer identifiers the parser reported. */
function payerIdRaw(ids: readonly (readonly [string, string])[]): string {
  const [first] = ids;
  if (first !== undefined && !REF_QUALIFIERS.has(first[0]) && first[0] !== 'TRN03') {
    return `${first[0]}:${first[1]}`;
  }
  const payerRef = ids.find(([qualifier]) => qualifier === '2U');
  const trace = ids.find(([qualifier]) => qualifier === 'TRN03');
  return payerRef === undefined ? `TRN03:${trace?.[1] ?? ''}` : `2U:${payerRef[1]}`;
}

interface Loaded {
  readonly claimIds: Map<string, string>;
}

/** Every loaded transaction set of the file matches its expectation, row by row; returns claim IDs by ref. */
async function checkLoaded(practice: Practice, file: string, documentId: string, parse: ParseExpectation, loaded: Loaded, filePath: string): Promise<void> {
  const { cipher } = practice;
  for (const transaction of parse.transactions) {
    const remittances = (
      await owner.query<Record<string, string | number | null>>(
        `SELECT r.*, r.bpr02_cents::text AS bpr02, r.bpr16_date::text AS bpr16, p.payer_id_raw FROM remittance r JOIN payer p ON p.id = r.payer_id
          WHERE r.source_document_id = $1 AND r.st02 = $2 AND r.isa13 = $3 AND r.gs06 = $4`,
        [documentId, transaction.st02, transaction.isa13, transaction.gs06],
      )
    ).rows;
    if (transaction.status === 'held') {
      expect(remittances, `${file} ${transaction.st02} is held and never loads`).toEqual([]);
      continue;
    }
    expect(remittances, `${file} ${transaction.st02}`).toHaveLength(1);
    const [remittance] = remittances as [Record<string, string | number | null>];
    const key = transaction.dedupKey;
    expect(remittance, `${file} ${transaction.st02}`).toMatchObject({
      practice_id: practice.world.practiceId,
      sender_id: key?.senderId,
      payee_npi: key?.payeeId,
      trn02: key?.trn02,
      bpr02: key?.bpr02Cents,
      bpr_method: transaction.bprMethod,
      bpr16: transaction.bpr16Date,
      payer_name: transaction.payerName,
      payer_id_raw: payerIdRaw(transaction.payerIds),
      claim_count: transaction.claims.length,
      balanced: true,
      status: 'loaded',
    });
    const plb = (
      await owner.query('SELECT reason_code AS code, reference, amount_cents::text AS "amountCents", fiscal_period_date::text AS "fiscalPeriodDate", category, counted FROM provider_adjustment WHERE remittance_id = $1 ORDER BY position', [remittance.id])
    ).rows;
    expect(plb, `${file} PLB`).toEqual(transaction.plb.map((item) => ({ code: item.code, reference: item.reference, amountCents: item.amountCents, fiscalPeriodDate: item.fiscalPeriodDate, category: item.category, counted: item.counted })));
    const claims = (await owner.query<Record<string, string | number | null>>(
      `SELECT c.*, c.charge_cents::text AS charge, c.paid_cents::text AS paid, c.patient_resp_cents::text AS patient_resp, c.allowed_cents::text AS allowed,
              c.service_from::text AS from_date, c.service_to::text AS to_date
         FROM claim c WHERE c.remittance_id = $1 ORDER BY c.claim_no`,
      [remittance.id],
    )).rows;
    expect(claims, `${file} ${transaction.st02} claims`).toHaveLength(transaction.claims.length);
    for (const [index, expected] of transaction.claims.entries()) {
      const claim = claims[index] as Record<string, string | number | null>;
      const where = `${file} ${transaction.st02} claim ${String(index)}`;
      loaded.claimIds.set(`${filePath}:${String(transaction.transaction)}:${String(expected.index)}`, String(claim.id));
      expect(cipher.decrypt('claim.patient_control_number', String(claim.patient_control_number)), where).toBe(expected.patientControlNumber);
      expect(cipher.decrypt('claim.payer_claim_control_number', String(claim.payer_claim_control_number)), where).toBe(expected.payerClaimControlNumber);
      expect(claim.payer_claim_control_number_hash, where).toBe(cipher.lookupHash('claim.payer_claim_control_number', expected.payerClaimControlNumber));
      expect(
        { status: claim.claim_status_code, charge: claim.charge, paid: claim.paid, patientResp: claim.patient_resp, filing: claim.filing_indicator, facility: claim.facility_type, frequency: claim.frequency_code, from: claim.from_date, to: claim.to_date, allowed: claim.allowed },
        where,
      ).toEqual({
        status: expected.status,
        charge: expected.chargeCents,
        paid: expected.paidCents,
        patientResp: expected.patientResponsibilityCents,
        filing: expected.filingIndicator,
        facility: expected.facilityCode,
        frequency: expected.frequencyCode,
        from: expected.serviceFrom,
        to: expected.serviceTo,
        allowed: expected.allowedCents,
      });
      const adjustmentRows = async (lineId: string | null) =>
        (
          await owner.query<{ group: string; reason: string; amountCents: string; quantity: string | null; position: number; unknown: boolean }>(
            `SELECT group_code AS "group", reason_code AS reason, amount_cents::text AS "amountCents", quantity::text AS quantity, position, unknown_code AS unknown
               FROM adjustment WHERE claim_id = $1 AND service_line_id IS NOT DISTINCT FROM $2 ORDER BY position`,
            [claim.id, lineId],
          )
        ).rows;
      const asExpected = (rows: Awaited<ReturnType<typeof adjustmentRows>>) => rows.map(({ group, reason, amountCents, quantity, position }) => ({ group, reason, amountCents, quantity: decimal(quantity), position }));
      const claimAdjustments = await adjustmentRows(null);
      expect(asExpected(claimAdjustments), `${where} claim CAS`).toEqual(expected.adjustments.map(({ group, reason, amountCents, quantity, position }) => ({ group, reason, amountCents, quantity: decimal(quantity), position })));
      const lines = (
        await owner.query<Record<string, string | number | boolean | string[] | null>>(
          `SELECT l.*, l.units::text AS units_text, l.original_units::text AS original_text, l.charge_cents::text AS charge, l.paid_cents::text AS paid,
                  l.line_allowed_cents::text AS b6, l.observed_allowed_cents::text AS observed, l.patient_share_cents::text AS share,
                  l.service_date::text AS date_from, l.service_date_to::text AS date_to, p.plan_key
             FROM service_line l JOIN plan p ON p.id = l.payer_plan_key WHERE l.claim_id = $1 ORDER BY l.line_no`,
          [claim.id],
        )
      ).rows;
      expect(lines, `${where} lines`).toHaveLength(expected.lines.length);
      for (const [lineIndex, line] of expected.lines.entries()) {
        const row = lines[lineIndex] as Record<string, string | number | boolean | string[] | null>;
        const at = `${where} line ${String(line.lineNo)}`;
        const allocated = line.observedAllowed.allocatedFromClaim;
        expect(
          {
            lineNo: row.line_no,
            qualifier: row.procedure_qualifier,
            code: row.procedure_code,
            modifiers: row.modifiers,
            revenue: row.revenue_code,
            charge: row.charge,
            paid: row.paid,
            units: decimal(row.units_text as string | null),
            originalUnits: decimal(row.original_text as string | null),
            from: row.date_from,
            to: row.date_to ?? row.date_from,
            b6: row.b6,
            observed: row.observed,
            basis: row.observed_allowed_basis,
            allocated: row.observed_allowed_allocated,
            share: row.share,
            plan: row.plan_key,
          },
          at,
        ).toEqual({
          lineNo: line.lineNo,
          qualifier: line.procedureQualifier,
          code: line.procedureCode,
          modifiers: line.modifiers,
          revenue: line.revenueCode,
          charge: line.chargeCents,
          paid: line.paidCents,
          units: decimal(line.units),
          originalUnits: decimal(line.originalUnits),
          from: line.serviceFrom,
          to: line.serviceTo,
          b6: line.lineAllowedCents,
          observed: line.observedAllowed.cents,
          basis: line.observedAllowed.basis,
          allocated,
          // Observed allowed is paid plus the patient share: the line's own PR, or its allocated part of the claim's.
          share: allocated ? (BigInt(line.observedAllowed.cents) - BigInt(line.paidCents)).toString() : line.patientShareCents,
          plan: expected.planRef === null ? `CLP06:${expected.filingIndicator}` : `CE:${expected.planRef}`,
        });
        const lineAdjustments = await adjustmentRows(String(row.id));
        expect(asExpected(lineAdjustments), `${at} CAS`).toEqual(line.adjustments.map(({ group, reason, amountCents, quantity, position }) => ({ group, reason, amountCents, quantity: decimal(quantity), position })));
      }
    }
    // Unknown codes load with their flag, never dropped (PAR-21).
    const flagged = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM adjustment a JOIN claim c ON c.id = a.claim_id WHERE c.remittance_id = $1 AND a.unknown_code', [remittance.id]);
    expect(flagged.rows[0]?.n, `${file} flagged adjustments`).toBe(new Set(transaction.unknownCodes.filter((code) => code.list === 'carc' || code.list === 'adjustment_group').map((code) => `${String(code.segmentIndex)}:${String(code.elementPosition)}`)).size);
  }
}

interface ReportRow {
  readonly outcome: string;
  readonly transactions: number;
  readonly claims: number;
  readonly lines: number;
  readonly reversals: number;
  readonly held: number;
  readonly plb_total_cents: string;
  readonly loaded_transactions: number;
  readonly loaded_claims: number;
  readonly loaded_lines: number;
  readonly unknown_codes: string[];
  readonly errors: Record<string, unknown>[];
  readonly transaction_outcomes: { st02: string; outcome: string; reasons: string[] }[];
}

/** The parse report and the receipt say what the expectation's receipt says, with every error's position. */
async function checkReport(file: string, documentId: string, parse: ParseExpectation): Promise<ReportRow> {
  const { rows } = await owner.query<ReportRow>('SELECT *, plb_total_cents::text AS plb_total_cents FROM parse_report WHERE source_document_id = $1', [documentId]);
  expect(rows, `${file} has one parse report`).toHaveLength(1);
  const report = rows[0] as ReportRow;
  const { receipt: expected } = parse;
  expect(
    { outcome: report.outcome, transactions: report.transactions, claims: report.claims, lines: report.lines, reversals: report.reversals, held: report.held, plb: report.plb_total_cents, unknown: report.unknown_codes },
    file,
  ).toEqual({
    outcome: parse.outcome,
    transactions: expected.transactions,
    claims: expected.claims,
    lines: expected.lines,
    reversals: expected.reversals,
    held: expected.held.length,
    plb: expected.plbTotalCents,
    unknown: [...expected.unknownCodes],
  });
  expect({ transactions: report.loaded_transactions, claims: report.loaded_claims, lines: report.loaded_lines }, file).toEqual(expected.loaded);
  for (const held of expected.held) {
    expect(report.transaction_outcomes.find((item) => item.st02 === held.st02 && item.outcome === 'held')?.reasons.sort(), `${file} ${held.st02} reasons`).toEqual([...new Set(held.reasons)].sort());
  }
  const errors = [...parse.documentErrors, ...parse.transactions.flatMap((transaction) => transaction.heldReasons)];
  for (const error of errors) {
    expect(report.errors, `${file} reports ${error.code} at segment ${String(error.segmentIndex)}`).toContainEqual(
      expect.objectContaining({
        code: error.code,
        segmentIndex: error.segmentIndex,
        segmentId: error.segmentId,
        elementPosition: error.elementPosition,
        ...(error.scope === undefined ? {} : { scope: error.scope }),
        ...(error.differenceCents === undefined ? {} : { differenceCents: error.differenceCents }),
      }),
    );
  }
  // Codes and positions only: none of the file's field values (PRD 10; Data dictionary, parse_report).
  for (const error of report.errors) {
    expect(Object.keys(error).filter((field) => !['code', 'reason', 'scope', 'list', 'segmentIndex', 'segmentId', 'elementPosition', 'componentPosition', 'differenceCents', 'transaction'].includes(field)), file).toEqual([]);
  }
  return report;
}

async function remittancesOf(documentId: string): Promise<number> {
  return ((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM remittance WHERE source_document_id = $1', [documentId])).rows[0] as { n: number }).n;
}

async function claimsOf(documentId: string): Promise<number> {
  return ((await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM claim c JOIN remittance r ON r.id = c.remittance_id WHERE r.source_document_id = $1', [documentId])).rows[0] as { n: number }).n;
}

// ---------------------------------------------------------------------------------------------------
// The cases
// ---------------------------------------------------------------------------------------------------

const PAR_CASES = readdirSync(FIXTURES)
  .filter((name) => /^PAR-\d\d$/.test(name))
  .sort();

/**
 * The cases whose files load or hold on their own, each in its own practice: all but the duplicate
 * sequences (PAR-06, PAR-07, PAR-30) and the zips (PAR-27, PAR-28) below, and PAR-29, whose
 * 10,000-claim file packages/synth generates at test time (apps/worker/src/parse/parse.db.test.ts
 * parses and loads one of the same size in under a minute).
 */
const SINGLE_FILE_CASES = PAR_CASES.filter((id) => !['PAR-06', 'PAR-07', 'PAR-27', 'PAR-28', 'PAR-29', 'PAR-30'].includes(id));

it('covers every PAR case of the test matrix', () => {
  expect(PAR_CASES).toHaveLength(30);
  expect(SINGLE_FILE_CASES).toHaveLength(24);
});

describe.each(SINGLE_FILE_CASES)('%s', (id) => {
  it('loads, or holds, exactly as its expected.json says, through upload, intake, parse and load', async () => {
    const expected = expectationOf(id);
    const practice = await practiceFor(id);
    const loaded: Loaded = { claimIds: new Map() };
    const documents = new Map<string, string>();
    // In the order the case uploads them (PAR-08: the original, then the reversal and correction), else by name.
    const order = expected.uploads.map((step) => step.file);
    const files = [...expected.files]
      .filter((file) => file.x12 !== undefined)
      .sort((a, b) => (order.length === 0 ? a.path.localeCompare(b.path) : order.indexOf(a.path) - order.indexOf(b.path)));
    for (const file of files) {
      const documentId = await upload(practice, readFileSync(path.join(FIXTURES, id, file.path)));
      documents.set(file.path, documentId);
      await runQueue();
      const step = expected.uploads.find((item) => item.file === file.path);
      if (step !== undefined) {
        expect([await remittancesOf(documentId), await claimsOf(documentId)], `${id} step ${String(step.step)}`).toEqual([step.remittancesLoaded, step.claimsLoaded]);
      }
    }
    for (const file of files) {
      const parse = (file.x12 as { parse: ParseExpectation }).parse;
      const documentId = documents.get(file.path) as string;
      const shown = await receipt(practice, documentId);
      expect(shown.status, `${id} ${file.path}`).toBe(parse.outcome === 'loaded' ? 'loaded' : 'held');
      expect(shown.parse?.outcome, `${id} ${file.path}`).toBe(parse.outcome);
      await checkReport(`${id} ${file.path}`, documentId, parse);
      await checkLoaded(practice, `${id} ${file.path}`, documentId, parse, loaded, file.path);
    }
    // Reversals link to the claims they reverse; corrections supersede the originals (PAR-08).
    for (const file of files) {
      for (const transaction of (file.x12 as { parse: ParseExpectation }).parse.transactions) {
        for (const claim of transaction.claims) {
          const own = loaded.claimIds.get(`${file.path}:${String(transaction.transaction)}:${String(claim.index)}`);
          if (claim.reversalOf !== undefined) {
            const original = loaded.claimIds.get(`${claim.reversalOf.file}:${String(claim.reversalOf.transaction)}:${String(claim.reversalOf.claim)}`);
            expect((await owner.query('SELECT reversal_of_claim_id AS id FROM claim WHERE id = $1', [own])).rows, `${id} reversal`).toEqual([{ id: original }]);
          }
          if (claim.supersedes !== undefined) {
            const original = loaded.claimIds.get(`${claim.supersedes.file}:${String(claim.supersedes.transaction)}:${String(claim.supersedes.claim)}`);
            expect((await owner.query('SELECT superseded_by_claim_id AS id FROM claim WHERE id = $1', [original])).rows, `${id} correction`).toEqual([{ id: own }]);
          }
        }
      }
    }
    // The net view shows each adjudicated claim once (PRD 6, Canonical model and matching).
    const net = expected.outcome?.netView;
    if (net !== undefined) {
      const view = ok(await call(claimsPage, practice.manager, { practiceId: practice.world.practiceId, view: 'net' }));
      const claimIds = [...new Set(view.list.rows.map((row) => row.claimId))];
      expect(claimIds, `${id} net view`).toEqual(net.claims.map((ref) => loaded.claimIds.get(`${ref.file}:${String(ref.transaction)}:${String(ref.claim)}`)));
      expect(view.list.rows.reduce((sum, row) => sum + BigInt(row.paidCents), 0n).toString()).toBe(net.paidCents);
      const all = ok(await call(claimsPage, practice.manager, { practiceId: practice.world.practiceId, view: 'all' }));
      expect(new Set(all.list.rows.map((row) => row.claimId)).size).toBe(3);
    }
  });
});

describe('the upload sequences', () => {
  it('records a second upload of the same bytes as a duplicate document, loading nothing, linked to the first (PAR-06)', async () => {
    const expected = expectationOf('PAR-06');
    const practice = await practiceFor('PAR-06');
    const ids: string[] = [];
    for (const step of expected.uploads) {
      ids.push(await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-06', step.file))));
      await runQueue();
      const id = ids.at(-1) as string;
      expect(await remittancesOf(id)).toBe(step.remittancesLoaded);
      expect(await claimsOf(id)).toBe(step.claimsLoaded);
      const shown = await receipt(practice, id);
      if (step.outcome === 'duplicate_document') {
        expect(shown).toMatchObject({ status: 'duplicate', duplicateOf: { documentId: ids[(step.linkedTo ?? 1) - 1] } });
      } else {
        expect(shown.status).toBe('loaded');
      }
    }
  });

  it('loads the same remittance from a second download as zero rows, linked to the original (PAR-07)', async () => {
    const expected = expectationOf('PAR-07');
    const practice = await practiceFor('PAR-07');
    const ids: string[] = [];
    for (const step of expected.uploads) {
      ids.push(await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-07', step.file))));
      await runQueue();
      const id = ids.at(-1) as string;
      expect(await remittancesOf(id)).toBe(step.remittancesLoaded);
      expect(await claimsOf(id)).toBe(step.claimsLoaded);
    }
    const [original, resent] = ids as [string, string];
    const shown = await receipt(practice, resent);
    expect(shown.status).toBe('duplicate');
    expect(shown.parse?.transactionOutcomes).toEqual([expect.objectContaining({ outcome: 'duplicate_remittance', linkedDocumentId: original })]);
    const [remittance] = (await owner.query<{ id: string }>('SELECT id FROM remittance WHERE source_document_id = $1', [original])).rows;
    expect(shown.parse?.transactionOutcomes[0]?.linkedRemittanceId).toBe(remittance?.id);
  });

  it('makes exactly one remittance row when the same file is uploaded twice at once (PAR-30)', async () => {
    const practice = await practiceFor('PAR-30');
    const bytes = readFileSync(path.join(FIXTURES, 'PAR-30/remit.835'));
    // Both uploads complete before either is taken in; their intake jobs then run at once.
    const ids = await Promise.all([upload(practice, bytes), upload(practice, bytes)]);
    await runQueue();
    const { rows } = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM remittance WHERE practice_id = $1', [practice.world.practiceId]);
    expect(rows[0]?.n).toBe((expectationOf('PAR-30').outcome as unknown as { remittanceRows: number }).remittanceRows);
    const statuses = await Promise.all(ids.map(async (documentId) => (await receipt(practice, documentId)).status));
    expect(statuses.sort()).toEqual(['duplicate', 'loaded']);
  });
});

describe('zips', () => {
  it('loads 499 of the 500 files in a zip and holds the bad one, with a batch receipt (PAR-27)', async () => {
    const expected = expectationOf('PAR-27');
    const zip = expected.files[0]?.zip;
    const practice = await practiceFor('PAR-27');
    const id = await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-27/batch.zip')), 'application/zip');
    await runQueue();
    const batch = await receipt(practice, id);
    expect(batch).toMatchObject({ status: 'expanded', entries: { total: zip?.batch.entries, byStatus: { loaded: zip?.batch.parsed, held: zip?.batch.held } } });
    const { rows } = await owner.query<{ n: number }>('SELECT count(*)::int AS n FROM remittance WHERE practice_id = $1', [practice.world.practiceId]);
    expect(rows[0]?.n).toBe(499);
    // The held entry's receipt and the batch report show its error with its position.
    const entries = (await owner.query<{ id: string }>("SELECT id FROM source_document WHERE parent_document_id = $1 AND status = 'held'", [id])).rows;
    expect(entries).toHaveLength(1);
    const held = zip?.entries.find((entry) => entry.outcome === 'held')?.x12?.parse as ParseExpectation;
    await checkReport('PAR-27 remit-137.835', (entries[0] as { id: string }).id, held);
    const report = ok(await call(uploadReport, practice.manager, { practiceId: practice.world.practiceId, documentId: id }));
    const [syntax] = held.documentErrors;
    expect(report.download.body).toContain(`,EDI_SYNTAX,`);
    expect(report.download.body).toContain(`,${String(syntax?.segmentIndex)},${String(syntax?.segmentId)},${String(syntax?.elementPosition)},`);
  }, 120_000);

  it('quarantines a zip holding a renamed executable and parses nothing in it (PAR-28)', async () => {
    const practice = await practiceFor('PAR-28');
    const id = await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-28/upload.zip')), 'application/zip');
    await runQueue();
    expect((await receipt(practice, id)).status).toBe('quarantined');
    const counts = await owner.query<{ reports: number; remittances: number }>(
      'SELECT (SELECT count(*)::int FROM parse_report WHERE practice_id = $1) AS reports, (SELECT count(*)::int FROM remittance WHERE practice_id = $1) AS remittances',
      [practice.world.practiceId],
    );
    expect(counts.rows[0]).toEqual({ reports: 0, remittances: 0 });
  });
});

describe('the screens', () => {
  let practice: Practice;
  let original: string;
  let correction: string;

  beforeAll(async () => {
    practice = await practiceFor('screens');
    original = await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-08/original.835')));
    await runQueue();
    correction = await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-08/correction.835')));
    await runQueue();
  }, 60_000);

  const params = () => ({ practiceId: practice.world.practiceId });

  it('lists the loaded remittances with payer, date, trace, amount, claims, balance and source file, filtered by payer and period', async () => {
    const list = ok(await call(remittancesPage, practice.viewer, params()));
    expect(list.list.total).toBe(2);
    expect(list.list.remittances.map((item) => [item.payerName, item.paymentDate, item.trace, item.amountCents, item.claimCount, item.reversals, item.balanced])).toEqual([
      ['SYNTHETIC PAYER A', '2026-06-08', 'SYNEFTPAR08002', '2400', 2, 1, true],
      ['SYNTHETIC PAYER A', '2026-05-04', 'SYNEFTPAR08001', '10800', 1, 0, true],
    ]);
    expect(list.list.remittances.map((item) => item.sourceDocumentId)).toEqual([correction, original]);
    const [payer] = list.payers;
    expect(ok(await call(remittancesPage, practice.viewer, { ...params(), payer: payer?.id, from: '2026-06', to: '2026-06' })).list.remittances.map((item) => item.trace)).toEqual(['SYNEFTPAR08002']);
    expect(ok(await call(remittancesPage, practice.viewer, { ...params(), from: '2026-01', to: '2026-01' })).list.total).toBe(0);
    expect(ok(await call(remittancesPage, practice.viewer, { ...params(), payer: '', from: '' })).list.total).toBe(2);
    expect(await call(remittancesPage, practice.viewer, { ...params(), from: '2026-04-08' })).toEqual({ status: 'not_found' });
  });

  it('opens a remittance with its reversal linked to the original, identifiers for PHI roles only', async () => {
    const [newest] = ok(await call(remittancesPage, practice.manager, params())).list.remittances;
    const detail = ok(await call(remittancePage, practice.manager, { ...params(), remittanceId: newest?.id }));
    const [reversal, corrected] = detail.detail.claims;
    const [earlier] = (await owner.query<{ id: string }>('SELECT id FROM remittance WHERE source_document_id = $1', [original])).rows;
    expect(reversal).toMatchObject({ statusCode: '22', reversalOf: { remittanceId: earlier?.id }, identifiers: { patientControlNumber: 'SYNPCNPAR08001', payerClaimControlNumber: 'SYNCCNPAR080001' } });
    expect(corrected).toMatchObject({ statusCode: '1', reversalOf: null, identifiers: { payerClaimControlNumber: 'SYNCCNPAR080002' } });
    const older = ok(await call(remittancePage, practice.manager, { ...params(), remittanceId: earlier?.id })).detail.claims[0];
    expect(older).toMatchObject({ reversedBy: { claimId: reversal?.id }, supersededBy: { claimId: corrected?.id } });
    const forViewer = ok(await call(remittancePage, practice.viewer, { ...params(), remittanceId: newest?.id }));
    expect(forViewer.canReadPhi).toBe(false);
    expect(forViewer.detail.claims.every((claim) => claim.identifiers === null)).toBe(true);
    expect(JSON.stringify(forViewer)).not.toMatch(/SYNPCN|SYNCCN|SYNTHLAST/);
    expect(await call(remittancePage, practice.manager, { ...params(), remittanceId: randomUUID() })).toEqual({ status: 'not_found' });
  });

  it('nets a reversal and its correction to one adjudicated claim, paginated, filtered and searchable, with PHI columns for PHI roles only', async () => {
    const net = ok(await call(claimsPage, practice.manager, params()));
    expect(net.filters.view).toBe('net');
    expect(net.list.rows.map((row) => [row.procedureCode, row.paidCents, row.observedAllowedCents, row.patientShareCents, row.expectedAllowedCents, row.status])).toEqual([
      ['97110', '8800', '11000', '2200', null, null],
      ['97140', '4400', '5500', '1100', null, null],
    ]);
    expect(net.list.rows[0]?.identifiers).toMatchObject({ patientControlNumber: 'SYNPCNPAR08001', payerClaimControlNumber: 'SYNCCNPAR080002', serviceDate: '2026-04-07' });
    const all = ok(await call(claimsPage, practice.manager, { ...params(), view: 'all' }));
    expect(all.list.total).toBe(6);
    expect(all.list.rows.filter((row) => row.reversal)).toHaveLength(2);
    expect(all.list.rows.filter((row) => row.reversed && row.superseded)).toHaveLength(2);
    expect(ok(await call(claimsPage, practice.manager, { ...params(), view: 'all', code: '97140' })).list.total).toBe(3);
    expect(ok(await call(claimsPage, practice.manager, { ...params(), from: '2026-05' })).list.total).toBe(0);
    const viewer = ok(await call(claimsPage, practice.viewer, params()));
    expect(viewer.canReadPhi).toBe(false);
    expect(viewer.list.rows.every((row) => row.identifiers === null)).toBe(true);
    expect(JSON.stringify(viewer)).not.toMatch(/SYNPCN|SYNCCN|SYNTHLAST/);
    // Search by a payer claim control number: posted, answered with the claim's opaque ID in the URL.
    const found = ok(await call(findClaim, practice.manager, params(), { payerClaimControlNumber: 'SYNCCNPAR080001' }));
    expect(() => {
      assertNoPhi('url', found.redirect ?? '', { known: ['SYNCCNPAR080001', 'SYNPCNPAR08001'] });
    }).not.toThrow();
    const claimId = new URL(found.redirect ?? '', 'http://localhost').searchParams.get('claim');
    const one = ok(await call(claimsPage, practice.manager, { ...params(), view: 'all', claim: claimId }));
    expect(new Set(one.list.rows.map((row) => row.claimId))).toEqual(new Set([claimId]));
    // The reversal repeats the number; the search lands on the adjudicated claim it reversed.
    expect(one.list.rows.every((row) => !row.reversal && row.reversed && row.superseded)).toBe(true);
    expect(await call(findClaim, practice.manager, params(), { payerClaimControlNumber: 'SYNCCNNOSUCH' })).toMatchObject({ status: 'invalid', issues: [{ field: 'payerClaimControlNumber' }] });
    expect(await call(findClaim, practice.viewer, params(), { payerClaimControlNumber: 'SYNCCNPAR080001' })).toMatchObject({ status: 'forbidden', permission: 'phi.read' });
    // Every row returned is an audited read of its claim.
    const audited = await owner.query<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE actor_id = $1 AND action = 'read' AND object_type = 'claim' AND purpose = 'claims_and_lines'", [practice.viewer]);
    expect(audited.rows[0]?.n).toBe(viewer.list.rows.length);
  });

  it('opens a line’s trace placeholder, and takes a note from a role that works cases', async () => {
    const [row] = ok(await call(claimsPage, practice.manager, params())).list.rows;
    const lineId = row?.lineId ?? '';
    const before = ok(await call(linePage, practice.manager, { ...params(), lineId }));
    expect(before.detail.line).toMatchObject({ procedureCode: '97110', observedAllowedBasis: 'paid_plus_pr', planKey: 'CE:SYNPLAN-COMM-01', expectedAllowedCents: null });
    expect(before.detail.adjustments.map((item) => [item.level, item.groupCode, item.reasonCode, item.amountCents])).toEqual([
      ['line', 'CO', '45', '5000'],
      ['line', 'PR', '2', '2200'],
    ]);
    expect(before.detail.notes).toEqual([]);
    expect(before.canNote).toBe(true);
    const added = ok(await call(addLineNote, practice.manager, { ...params(), lineId }, { note: 'SYNTHETIC NOTE: ask for the fee schedule' }));
    expect(added.redirect).toBe(`/p/${practice.world.practiceId}/lines/${lineId}`);
    const after = ok(await call(linePage, practice.manager, { ...params(), lineId }));
    expect(after.detail.notes?.map((note) => note.note)).toEqual(['SYNTHETIC NOTE: ask for the fee schedule']);
    const [stored] = (await owner.query<{ note: string }>('SELECT note FROM line_note WHERE service_line_id = $1', [lineId])).rows;
    expect(stored?.note).toMatch(/^enc:v1:/);
    const forViewer = ok(await call(linePage, practice.viewer, { ...params(), lineId }));
    expect(forViewer).toMatchObject({ canReadPhi: false, canNote: false, detail: { notes: null } });
    expect(await call(addLineNote, practice.viewer, { ...params(), lineId }, { note: 'x' })).toMatchObject({ status: 'forbidden', permission: 'case.work' });
    expect(await call(addLineNote, practice.manager, { ...params(), lineId: randomUUID() }, { note: 'x' })).toEqual({ status: 'not_found' });
  });
});

describe('the dashboard', () => {
  it('shows the last run, and that it failed with its job reference after three failed attempts (JOB-02)', async () => {
    const practice = await practiceFor('JOB-02');
    const runs = databaseJobRuns(app);
    const ok1 = randomUUID();
    const failed = randomUUID();
    const base = { practiceId: practice.world.practiceId, type: 'parse_835' as const, subject: randomUUID() };
    await runs.started({ ...base, jobId: ok1, singletonKey: `parse_835:${practice.world.practiceId}:${randomUUID()}`, attempt: 1 });
    await runs.finished({ jobId: ok1, practiceId: practice.world.practiceId, outcome: 'succeeded', errorCode: null });
    const failingKey = `parse_835:${practice.world.practiceId}:${base.subject}`;
    for (const attempt of [1, 2, 3]) {
      await runs.started({ ...base, jobId: failed, singletonKey: failingKey, attempt });
      await runs.finished({ jobId: failed, practiceId: practice.world.practiceId, outcome: attempt === 3 ? 'failed' : 'retrying', errorCode: 'JOB_FAILED' });
    }
    await upload(practice, readFileSync(path.join(FIXTURES, 'PAR-01/remit.835')));
    const home = ok(await call(practiceHome, practice.viewer, { practiceId: practice.world.practiceId }));
    expect(home.freshness).toMatchObject({ lastRun: { jobId: failed, outcome: 'failed', attempts: 3 }, failedRun: { jobId: failed, jobType: 'parse_835', outcome: 'failed' }, lastFileAt: expect.any(Date) });
    // A later successful run of the same job key clears the banner.
    const retried = randomUUID();
    await runs.started({ ...base, jobId: retried, singletonKey: failingKey, attempt: 1 });
    await runs.finished({ jobId: retried, practiceId: practice.world.practiceId, outcome: 'succeeded', errorCode: null });
    expect(ok(await call(practiceHome, practice.viewer, { practiceId: practice.world.practiceId })).freshness).toMatchObject({ lastRun: { jobId: retried, outcome: 'succeeded' }, failedRun: null });
    queue.jobs.splice(0);
  });
});
