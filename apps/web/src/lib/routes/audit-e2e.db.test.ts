import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { EvidenceResolver, RATE_RECORD_FIELDS, type WorkflowContext, addRateRecord, approveRateRecordField, approveVersion, createContract, createDraftVersion, signOffVersion } from '@tp/contracts';
import { documentPages, readDocumentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { formatCents, parseCents } from '@tp/money';
import { createLogger } from '@tp/observability';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { type AuditReportContent, CSV_COLUMNS } from '@tp/worker/reports';
import { ChromiumPdfRenderer, type JobContext, auditReportHandler, intakeHandler, intakeServices, monitorHandler, parseHandler, priceHandler, reconcileHandler, triageHandler } from '@tp/worker/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DevAuthProvider } from '../auth/dev-provider';
import { MemoryDevStore } from '../auth/dev-store';
import { Sealer } from '../auth/seal';
import { SESSION_COOKIE, openSession } from '../auth/sessions';
import type { CookieJar, Download, MutationResult, Outcome, Route } from '../http/route';
import { type Services, createServices } from '../server/services';
import { MemoryQueue } from '../uploads/queue';
import { LocalUploadTargets } from '../uploads/targets';
import { mapPlanAction } from './mapping';
import { createPricingRunAction } from './pricing';
import { attestReportAction, generateReportAction, releaseReportAction, reportCsv, reportPage, reportPdf, reviewChecklistPage, reviewCsv } from './reports';
import { loadRouteRelease } from './test-support/pricing-world';
import { claimsPage } from './remittances';
import { anomaliesPage, casePage, casesPage, reopenLineAction, triageRunAction, writeOffLineAction } from './triage';
import { completeUpload, requestUploads, uploadContent } from './uploads';
import { csrfTokenFor } from '../http/csrf';

/**
 * The synthetic end-to-end audit (milestone 6): fixtures/synthetic/audit/AUDIT-01 is uploaded through
 * the upload routes and loaded by the intake and parse_835 jobs; its plans are mapped through the
 * mapping action to fixed-schedule contracts signed off through @tp/contracts' services (the
 * specialist abstracts, the billing manager signs off) or to "no agreement"; a run is created through
 * the Pricing runs action and priced by the price job; the run is triaged through the Cases action and
 * the triage job; the audit report is generated through the Reports action and the report job
 * (Playwright's Chromium prints the PDF where it is installed); a reimbursement reviewer signs the
 * checklist under a support grant and the billing manager releases it. The report is then compared,
 * figure by figure and line for line, with expected-report.json and expected-lines.csv, which the
 * independent worksheet (tools/audit-worksheet, Python) computed from inputs.json alone.
 *
 * Still open, and not claimed here: "the three hand-run audits reproduce from the app line for line"
 * (PRD 17, milestone 6). That needs the three real audits and the reimbursement specialist; this test is
 * the synthetic rehearsal of the same path.
 */

const AUDIT = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/audit/AUDIT-01');

interface Inputs {
  readonly practice: { readonly settings: Record<string, unknown> };
  readonly stable: { readonly from: string; readonly to: string };
  readonly run: { readonly from_month: string; readonly to_month: string };
  readonly plans: readonly {
    readonly key: string;
    readonly mapping: 'contract' | 'no_agreement';
    readonly contract?: { readonly effective_from: string; readonly dispute_window_days: number; readonly schedule: readonly { readonly code: string; readonly amount_cents: string }[] };
  }[];
}

type ExpectedReport = Pick<AuditReportContent, 'headline' | 'anomalies' | 'overpaid' | 'pursuit'> & {
  readonly coverage: { readonly lines: number; readonly charge_cents: string; readonly priced_lines: number; readonly priced_charge_cents: string; readonly reasons: readonly { reason: string; lines: number; charge_cents: string }[] };
  readonly validated: {
    readonly lines: number;
    readonly variance_cents: string;
    readonly patterns: readonly { plan: string; behavior: string; lines: number; variance_cents: string }[];
    readonly not_actionable: readonly { reason: string; lines: number; variance_cents: string }[];
  };
  readonly cases: readonly Record<string, unknown>[];
  readonly evidence_gaps: readonly { kind: string; reason: string | null; lines: number; charge_cents: string | null }[];
};

const inputs = JSON.parse(readFileSync(path.join(AUDIT, 'inputs.json'), 'utf8')) as Inputs;
const expectedReport = JSON.parse(readFileSync(path.join(AUDIT, 'expected-report.json'), 'utf8')) as ExpectedReport;
const expectedLines = readFileSync(path.join(AUDIT, 'expected-lines.csv'), 'utf8');

const masterKey = randomBytes(32);
const keys = new LocalKeyProvider(masterKey);
const documentsDir = mkdtempSync(path.join(tmpdir(), 'tp-audit-e2e-'));
const documents = new DocumentStore(new LocalSealedBytes(documentsDir));
const contractPdfs = new Map<string, Uint8Array>();

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let services: Services;
let queue: MemoryQueue;
let world: TenantWorld;
let practiceId: string;
let manager: string;
let viewer: string;
let specialist: string;
let reviewer: string;

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  await loadRouteRelease(owner);
  app = openPool(database.appUrl, 6);
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
    uploads: new LocalUploadTargets('http://localhost:3100', documents, sealer),
    queue,
    documents,
  });
  world = await createTenantWorld(owner, 'synthetic audit');
  practiceId = world.practiceId;
  const key = await provisionPracticeKey(keys, practiceId);
  await owner.query("UPDATE practice SET data_key_ref = $1, zip = '00011', settings = $3 WHERE id = $2", [
    key.dataKeyRef,
    practiceId,
    JSON.stringify({ place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', ...inputs.practice.settings }),
  ]);
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  viewer = await createUser(owner);
  await addMembership(owner, world.organizationId, viewer, 'viewer');
  const internal = await createOrganization(owner, 'internal', 'audit staff');
  specialist = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, specialist, 'contract_specialist');
  reviewer = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, reviewer, 'reviewer');
  await asOwner(owner, [practiceId], async () => {
    await owner.query(
      `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256) VALUES ($1, $2, 'baa', '1', now(), 'SYNTHETIC SIGNER', 'esign:synthetic-baa', $3)`,
      [world.organizationId, practiceId, randomBytes(32).toString('hex')],
    );
    for (const [person, ticket] of [
      [specialist, 'AUD-1'],
      [reviewer, 'AUD-2'],
    ] as const) {
      await owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, $3, 'SYNTHETIC AUDIT', now() + interval '4 hours')`, [practiceId, person, ticket]);
    }
  });
}, 120_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
  rmSync(documentsDir, { recursive: true, force: true });
});

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
    const internalRole = userId === specialist || userId === reviewer;
    token = (await openSession(app, { userId, method: internalRole ? 'webauthn' : 'totp', deviceToken: undefined, userAgent: null, requestId: 'test' })).sessionToken;
    tokens.set(userId, token);
  }
  return token;
}

async function call<R>(route: Route<R>, userId: string, params: Record<string, unknown>, input?: Record<string, unknown>): Promise<Outcome<R>> {
  return route.invoke(
    { cookies: new Jar(await sessionOf(userId)), params, input: route.mutation ? { csrfToken: csrfTokenFor(services.sealer, await sessionOf(userId)), requestKey: randomUUID(), ...input } : input, requestId: `test-${randomUUID()}`, userAgent: null },
    services,
  );
}

function ok<R>(outcome: Outcome<R>): R {
  if (outcome.status !== 'ok') {
    throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  }
  return outcome.data;
}

const P = () => ({ practiceId });
const idIn = (outcome: Outcome<MutationResult>, segment: string) => new RegExp(`${segment}/([0-9a-f-]{36})$`).exec(ok(outcome).redirect ?? '')?.[1] ?? '';

function jobContext(lastAttempt = false): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: (type, next) => queue.enqueue(type, next),
    lastAttempt,
  };
}

/**
 * Runs the queued jobs as the worker would, in order: intake, parse_835, the monitoring chain's planning
 * step the parse queues (the plans are not mapped yet when the file loads, so it prices nothing: MAP-01)
 * and the reconcile it queues for the document (docs/adr/0043; the ledger has nothing to do here),
 * price, triage, audit_report.
 */
async function runQueue(): Promise<string[]> {
  const ran: string[] = [];
  const jobs = intakeServices({ documents: { kind: 'local', dir: documentsDir }, keys: { kind: 'local', masterKey }, scanWaitMs: 1000 });
  const pdf = new ChromiumPdfRenderer();
  const stillPdf = { render: () => Promise.resolve(new TextEncoder().encode('%PDF-1.7\n% SYNTHETIC stand-in: Chromium is not installed here\n')) };
  const printer = await (async () => {
    try {
      await pdf.render('<!doctype html><title>probe</title>');
      return pdf;
    } catch {
      return stillPdf;
    }
  })();
  for (let batch = queue.jobs.splice(0); batch.length > 0; batch = queue.jobs.splice(0)) {
    for (const job of batch) {
      ran.push(job.type);
      if (job.type === 'intake') {
        await intakeHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'parse_835') {
        await parseHandler(jobs)(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'monitor') {
        await monitorHandler()(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'price') {
        await priceHandler()(job.payload as { practice_id: string; pricing_run_id: string }, jobContext());
      } else if (job.type === 'triage') {
        await triageHandler()(job.payload as { practice_id: string; pricing_run_id: string }, jobContext());
      } else if (job.type === 'reconcile') {
        await reconcileHandler({ documents, keys })(job.payload as { practice_id: string; document_id: string }, jobContext());
      } else if (job.type === 'audit_report') {
        await auditReportHandler({ documents, keys, pdf: printer })(job.payload as { practice_id: string; audit_report_id: string }, jobContext());
      } else {
        throw new Error(`no handler for ${job.type} in this test`);
      }
    }
  }
  return ran;
}

/** Uploads the audit's 835 through the upload routes, and lets the worker load it. */
async function send(file: string): Promise<void> {
  const bytes = readFileSync(file);
  const [document] = ok(await call(requestUploads, manager, P(), { files: [{ kind: 'x12_835', contentType: 'application/octet-stream', sizeBytes: bytes.length }] })).documents;
  if (document === undefined) {
    throw new Error('no upload URL');
  }
  const token = new URL(document.upload.url).searchParams.get('token') ?? '';
  ok(
    await uploadContent.invoke(
      {
        cookies: new Jar(await sessionOf(manager)),
        params: { ...P(), documentId: document.documentId },
        input: { requestKey: randomUUID(), csrfToken: csrfTokenFor(services.sealer, await sessionOf(manager)), token },
        upload: { contentType: 'application/octet-stream', contentLength: bytes.length, body: Readable.from([bytes]) },
        requestId: `test-${randomUUID()}`,
        userAgent: null,
      },
      services,
    ),
  );
  ok(await call(completeUpload, manager, P(), { documentId: document.documentId }));
  expect(await runQueue()).toEqual(['intake', 'parse_835', 'monitor', 'reconcile']);
}

function as<T>(actorId: string, run: (context: WorkflowContext) => Promise<T>): Promise<T> {
  return withPracticeScope(app, { actorId, practiceIds: [practiceId] }, (scope) =>
    run({
      scope,
      requestId: `test-${randomUUID()}`,
      evidence: new EvidenceResolver({
        pages: documentPages({
          read: (documentId) => {
            const pdf = contractPdfs.get(documentId);
            return pdf === undefined ? Promise.reject(new Error('no such synthetic document')) : Promise.resolve({ bytes: pdf, contentType: 'application/pdf' });
          },
        }),
      }),
    }),
  );
}

const quoteFor = (code: string, amountCents: string) => `${code} is paid ${formatCents(parseCents(amountCents))} per unit`;

/** A plan's contract as inputs.json states it: abstracted by the specialist, signed off by the billing manager. */
async function signedOffContract(contract: NonNullable<Inputs['plans'][number]['contract']>, payerId: string): Promise<string> {
  const documentId = randomUUID();
  await asOwner(owner, [practiceId], () =>
    owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored')`,
      [documentId, practiceId, createHash('sha256').update(documentId).digest('hex'), manager],
    ),
  );
  contractPdfs.set(
    documentId,
    syntheticPdf([
      ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', `Disputes are raised within ${String(contract.dispute_window_days)} days of the remittance.`],
      ['SYNTHETIC EXHIBIT A FEE SCHEDULE', ...contract.schedule.map((rate) => quoteFor(rate.code, rate.amount_cents))],
    ]),
  );
  const versionId = await as(manager, async (context) => {
    const created = await createContract(context, { practiceId, payerId, title: 'SYNTHETIC AUDIT AGREEMENT' });
    const version = await createDraftVersion(context, {
      practiceId,
      contractId: created.contractId,
      effectiveFrom: contract.effective_from,
      effectiveTo: null,
      sourceDocumentIds: [documentId],
      disputeWindowDays: contract.dispute_window_days,
    });
    return version.versionId;
  });
  await as(specialist, async (context) => {
    for (const rate of contract.schedule) {
      const terms = { scope: { codes: [rate.code] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: rate.amount_cents }, flags: { timed_units_rule: 'PER_CODE' } };
      const { rateRecordId } = await addRateRecord(context, { practiceId, versionId, terms, citation: { documentId, page: 2, quote: quoteFor(rate.code, rate.amount_cents) } });
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId, rateRecordId, field });
      }
    }
    await approveVersion(context, { practiceId, versionId });
  });
  await as(manager, (context) => signOffVersion(context, { practiceId, versionId }));
  return versionId;
}

/** The application's line CSV with its opaque references as the worksheet writes them: markers, no IDs. */
function normalized(csv: string): { rows: string[]; cases: Set<string>; anomalies: Set<string> } {
  const rows = csv.split('\r\n');
  const caseColumn = CSV_COLUMNS.indexOf('case_ref');
  const anomalyColumn = CSV_COLUMNS.indexOf('anomaly_ref');
  const lineColumn = CSV_COLUMNS.indexOf('line_ref');
  const cases = new Set<string>();
  const anomalies = new Set<string>();
  const out = rows.map((row, index) => {
    if (index === 0 || row === '') {
      return row;
    }
    const fields = row.split(',');
    expect(fields).toHaveLength(CSV_COLUMNS.length);
    if (fields[caseColumn] !== '') {
      cases.add(fields[caseColumn] ?? '');
      fields[caseColumn] = 'case';
    }
    if (fields[anomalyColumn] !== '') {
      anomalies.add(fields[anomalyColumn] ?? '');
      fields[anomalyColumn] = 'anomaly';
    }
    expect(fields[lineColumn]).toMatch(/^[0-9a-f-]{36}$/);
    fields[lineColumn] = '';
    return fields.join(',');
  });
  return { rows: out, cases, anomalies };
}

const pick = <T extends object, K extends keyof T>(value: T, keysOf: readonly K[]) => Object.fromEntries(keysOf.map((name) => [name, value[name]]));
const bodyText = (download: Download<string | Uint8Array<ArrayBuffer>>) => (typeof download.download.body === 'string' ? download.download.body : Buffer.from(download.download.body).toString('utf8'));

describe('the synthetic audit, end to end (upload, parse, mapping, signed-off contracts, pricing run, triage, audit report)', () => {
  let runId = '';
  let reportId = '';
  let content: AuditReportContent;

  it('is judged inside the range its windows keep stable', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(today >= inputs.stable.from && today <= inputs.stable.to, `today (${today}) is outside ${inputs.stable.from} to ${inputs.stable.to}: choose new windows`).toBe(true);
  });

  it('loads the remittance, maps every plan, prices the month and triages it', async () => {
    await send(path.join(AUDIT, 'remit.835'));
    const payerId = await asOwner(owner, [practiceId], async () => (await owner.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1', [practiceId])).rows[0]?.id ?? '');
    for (const plan of inputs.plans) {
      const planId = await asOwner(owner, [practiceId], async () => (await owner.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, `CE:${plan.key}`])).rows[0]?.id ?? '');
      const versionId = plan.contract === undefined ? undefined : await signedOffContract(plan.contract, payerId);
      ok(await call(mapPlanAction, manager, P(), { planId, kind: plan.mapping, contractVersionId: versionId ?? '', effectiveFrom: '2026-01-01' }));
    }
    runId = idIn(await call(createPricingRunAction, manager, P(), { fromMonth: inputs.run.from_month, toMonth: inputs.run.to_month, releaseNo: '900001' }), 'pricing-runs');
    expect(await runQueue()).toEqual(['price']);
    // Triage is a person's action on a complete run (the Cases screen), done by the triage job.
    ok(await call(triageRunAction, manager, P(), { runId }));
    expect(await runQueue()).toEqual(['triage']);
    const cases = ok(await call(casesPage, manager, P()));
    expect(cases.cases.map((item) => [item.plan, item.state, item.openLines, item.actionableCents, item.deadlineOn])).toEqual(
      expectedReport.cases.map((item) => [item.plan, item.state, item.lines, item.actionable_cents, item.deadline_on]),
    );
    expect(cases.actionableCents).toBe(expectedReport.headline.actionable_cents);
    const detail = ok(await call(casePage, manager, { ...P(), caseId: cases.cases[0]?.id }));
    expect(detail.detail.lines.every((line) => line.actionable && line.payerClaimControlNumber?.startsWith('SYNCCNAUD01') === true)).toBe(true);
    // The viewer sees the case but no claim control number (PHI columns are for PHI roles).
    const seen = ok(await call(casePage, viewer, { ...P(), caseId: cases.cases[0]?.id }));
    expect(seen.detail.lines.every((line) => line.payerClaimControlNumber === null)).toBe(true);
    const anomalies = ok(await call(anomaliesPage, manager, P()));
    expect(anomalies.anomalies.map((item) => [item.plan, item.procedureCode, item.quarter, item.cohortSize, item.modalAllowedCents, item.stats.flagged_lines])).toEqual(
      expectedReport.anomalies.map((item) => [item.plan, item.procedure_code, item.quarter, item.cohort_size, item.modal_allowed_cents, item.flagged_lines]),
    );
    // The lists page and filter in SQL, the filters in the URL.
    expect(ok(await call(casesPage, manager, { ...P(), state: 'closed_written_off' }))).toMatchObject({ cases: [], total: 0, openCases: 0, actionableCents: '0' });
    expect(ok(await call(casesPage, manager, { ...P(), deadline: '14' }))).toMatchObject({ cases: [], total: 0 });
    expect(ok(await call(casesPage, manager, { ...P(), state: 'open', payer: payerId, page: '9' }))).toMatchObject({ total: 1, page: 1, pages: 1, actionableCents: expectedReport.headline.actionable_cents });
    expect(ok(await call(anomaliesPage, manager, { ...P(), run: runId })).total).toBe(expectedReport.anomalies.length);
    expect(ok(await call(anomaliesPage, manager, { ...P(), run: randomUUID() }))).toMatchObject({ anomalies: [], total: 0 });
    // Claims and lines shows each line's stage as triage left it (flagged, validated, actionable), else unpriced, line for line as the worksheet has them.
    const [header = '', ...expectedRows] = expectedLines.split('\r\n').filter((row) => row !== '');
    const at = (name: string) => header.split(',').indexOf(name);
    const expectedChips = expectedRows
      .map((row) => row.split(','))
      .map((fields) => [fields[at('payer_claim_control_number')], fields[at('stage')] !== '' ? fields[at('stage')] : fields[at('counted_as')] === 'unpriced' ? 'unpriced' : null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const first = ok(await call(claimsPage, manager, { ...P(), view: 'all', page: '1' })).list;
    const rest = first.pages > 1 ? ok(await call(claimsPage, manager, { ...P(), view: 'all', page: '2' })).list.rows : [];
    const chips = [...first.rows, ...rest].map((row) => [row.identifiers?.payerClaimControlNumber, row.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(chips).toEqual(expectedChips);
    expect(new Set(chips.map((chip) => chip[1]))).toEqual(new Set(['actionable', 'validated', 'flagged', 'unpriced', null]));
  }, 300_000);

  it('generates the audit report, its numbers by stage as the independent worksheet computed them', async () => {
    reportId = idIn(await call(generateReportAction, manager, P(), { runId }), 'reports');
    expect(await runQueue()).toEqual(['audit_report']);
    const page = ok(await call(reportPage, manager, { ...P(), reportId }));
    expect(page.report.status).toBe('ready');
    content = page.report.content as AuditReportContent;
    expect(content.run).toMatchObject({ pricing_run_id: runId, period_from: '2026-03-01', period_to: '2026-03-31', release_no: 900001 });
    const { labels: _labels, ...headline } = content.headline;
    expect(headline).toEqual(expectedReport.headline);
    expect({ ...pick(content.coverage, ['lines', 'charge_cents', 'priced_lines', 'priced_charge_cents']), reasons: content.coverage.reasons.map((reason) => pick(reason, ['reason', 'lines', 'charge_cents'])) }).toEqual(
      expectedReport.coverage,
    );
    expect(content.anomalies.map((item) => pick(item, ['label', 'payer', 'plan', 'procedure_code', 'modifiers', 'place_of_service', 'quarter', 'cohort_size', 'modal_allowed_cents', 'flagged_lines', 'range_low_cents', 'range_high_cents']))).toEqual(
      expectedReport.anomalies,
    );
    expect(pick(content.validated, ['lines', 'variance_cents'])).toEqual(pick(expectedReport.validated, ['lines', 'variance_cents']));
    const patterns = (list: readonly { plan: string; behavior: string; lines: number; variance_cents: string }[]) =>
      list.map((item) => `${item.plan} ${item.behavior} ${String(item.lines)} ${item.variance_cents}`).sort();
    expect(patterns(content.validated.patterns)).toEqual(patterns(expectedReport.validated.patterns));
    expect([...content.validated.not_actionable].sort((a, b) => a.reason.localeCompare(b.reason))).toEqual([...expectedReport.validated.not_actionable].sort((a, b) => a.reason.localeCompare(b.reason)));
    expect(content.overpaid).toEqual(expectedReport.overpaid);
    expect(content.cases.map((item) => pick(item, ['payer', 'plan', 'behavior', 'state', 'deadline_on', 'lines', 'actionable_cents', 'pursuit_cost_cents', 'net_expected_cents']))).toEqual(
      expectedReport.cases.map((item) => pick(item, ['payer', 'plan', 'behavior', 'state', 'deadline_on', 'lines', 'actionable_cents', 'pursuit_cost_cents', 'net_expected_cents'])),
    );
    expect(content.pursuit).toEqual(expectedReport.pursuit);
    expect(content.evidence_gaps.map((gap) => pick(gap, ['kind', 'reason', 'lines', 'charge_cents']))).toEqual(expectedReport.evidence_gaps);
  }, 300_000);

  it('exports the line CSV line for line as the worksheet wrote it, to a role that exports PHI, and logs every download', async () => {
    const csv = bodyText(ok(await call(reportCsv, manager, { ...P(), reportId })));
    const app = normalized(csv);
    expect(app.rows).toEqual(expectedLines.split('\r\n'));
    // One case and one anomaly hold the marked lines: the report's own.
    expect([...app.cases]).toEqual(content.cases.map((item) => item.case_id));
    expect([...app.anomalies]).toEqual(content.anomalies.map((item) => item.anomaly_id));
    // The stored files are the ones the report's SHA-256 name.
    const page = ok(await call(reportPage, manager, { ...P(), reportId }));
    expect(createHash('sha256').update(csv).digest('hex')).toBe(page.report.csvSha256);
    const pdf = ok(await call(reportPdf, viewer, { ...P(), reportId })).download;
    expect(pdf.contentType).toBe('application/pdf');
    const pdfBytes = pdf.body as Uint8Array;
    expect(createHash('sha256').update(pdfBytes).digest('hex')).toBe(page.report.pdfSha256);
    if (pdfBytes.length > 1000) {
      // Printed by Chromium: its text carries the headline and the stage labels.
      const read = await readDocumentPages({ bytes: pdfBytes, contentType: 'application/pdf' });
      const text = read.ok ? read.pages.join('\n') : '';
      expect(text).toContain(formatCents(parseCents(expectedReport.headline.actionable_cents)));
      expect(text).toContain('Flagged (investigatory)');
    }
    // A viewer reads the report but never exports its lines.
    expect((await call(reportCsv, viewer, { ...P(), reportId })).status).toBe('forbidden');
    const history = ok(await call(reportPage, manager, { ...P(), reportId })).history;
    expect(history.items.map((entry) => entry.file).sort()).toEqual(['csv', 'pdf']);
  }, 300_000);

  it('is released only once the reimbursement reviewer has signed the checklist over its files', async () => {
    expect((await call(releaseReportAction, manager, P(), { reportId })).status).toBe('invalid');
    // The reviewer, under a support grant, reads the checklist and signs; the billing manager cannot sign.
    const review = ok(await call(reviewChecklistPage, reviewer, { ...P(), reportId }));
    // The reviewer opens the line CSV they sign over (read-only, from the checklist), and the download is recorded;
    // the export route itself stays the PHI exporters'.
    expect((await call(reportCsv, reviewer, { ...P(), reportId })).status).toBe('forbidden');
    const reviewed = bodyText(ok(await call(reviewCsv, reviewer, { ...P(), reportId })));
    expect(createHash('sha256').update(reviewed).digest('hex')).toBe(review.report.csvSha256);
    expect((await call(reviewCsv, manager, { ...P(), reportId })).status).toBe('forbidden');
    const signed = { reportId, pdfSha256: review.report.pdfSha256, csvSha256: review.report.csvSha256, ...Object.fromEntries(review.checklist.map((item) => [`confirm_${item.id}`, 'on'])) };
    expect((await call(attestReportAction, manager, P(), signed)).status).toBe('forbidden');
    expect((await call(attestReportAction, reviewer, P(), { ...signed, confirm_independent: '' })).status).toBe('invalid');
    ok(await call(attestReportAction, reviewer, P(), signed));
    // The reviewer edits nothing else: releasing is not theirs.
    expect((await call(releaseReportAction, reviewer, P(), { reportId })).status).toBe('forbidden');
    ok(await call(releaseReportAction, manager, P(), { reportId }));
    const released = ok(await call(reportPage, manager, { ...P(), reportId })).report;
    // Who signed shows to those the user directory lets see the reviewer; when is on the report for everyone.
    expect(released).toMatchObject({ attestedAt: expect.any(String) as string, releasedAt: expect.any(String) as string, content });
    expect(ok(await call(reportPage, reviewer, { ...P(), reportId })).report.attestedAt).toBe(released.attestedAt);
    expect(released.attestation).toEqual({ format: 'tp-attestation/1', checklist: review.checklist.map((item) => item.id), pdf_sha256: released.pdfSha256, csv_sha256: released.csvSha256 });
    // The reviewer's read of the lines is in the export history.
    expect(ok(await call(reportPage, manager, { ...P(), reportId })).history.items.filter((entry) => entry.file === 'csv')).toHaveLength(2);
  }, 300_000);

  it('writes a case line off only once the person confirms what it does, and reopens it with a reason; the released report keeps its numbers', async () => {
    const [found] = ok(await call(casesPage, manager, P())).cases;
    const before = ok(await call(casePage, manager, { ...P(), caseId: found?.id }));
    const line = before.detail.lines[0];
    const writeOff = { caseLineId: line?.id, reason: 'not_worth_pursuit', text: '' };
    expect(await call(writeOffLineAction, manager, P(), writeOff)).toMatchObject({ status: 'invalid', issues: [{ field: 'confirm' }] });
    ok(await call(writeOffLineAction, manager, P(), { ...writeOff, confirm: 'on' }));
    const after = ok(await call(casePage, manager, { ...P(), caseId: found?.id }));
    expect(BigInt(after.case.actionableCents)).toBe(BigInt(before.case.actionableCents) - BigInt(line?.varianceCents ?? '0'));
    ok(await call(reopenLineAction, manager, P(), { caseLineId: line?.id, reason: 'SYNTHETIC: the payer asked for it again' }));
    expect(ok(await call(casePage, manager, { ...P(), caseId: found?.id })).case.actionableCents).toBe(before.case.actionableCents);
    expect(ok(await call(reportPage, manager, { ...P(), reportId })).report.content).toEqual(content);
  }, 300_000);
});
