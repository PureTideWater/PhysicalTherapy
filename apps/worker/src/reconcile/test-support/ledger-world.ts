import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { documentObjectKey, loadPracticeCipher, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createUser } from '@tp/db/testing';
import { type Cents, cents, parseCents } from '@tp/money';

import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import type { JobContext } from '../../jobs/handlers';
import { exportPacketVersion } from '../../packets/export';
import { approvePacketVersion, logSubmission, recordPayerResponse, writePacketVersion } from '../../packets/public';
import { DocumentStore } from '../../storage/documents';
import { FIXTURES, type Practice } from '../../price/test-support/pricing-world';
import { TriageWorld } from '../../triage/test-support/triage-world';
import { type ManualContext } from '../manual';
import { type ReconcileServices, type ReconcileSummary, reconcilePractice } from '../pass';
import type { Scope } from '../ledger';

/**
 * Test support for the recovery ledger against a scratch database (synthetic data only): the triage
 * world (SYNTHETIC release 900001, practices with a billing manager, 835s loaded by the parse_835 job,
 * fixed-schedule contracts signed off, runs priced and triaged into cases), plus posting and EFT exports
 * staged as intake leaves a clean one (stored, sealed with the practice's key in the same document
 * store the parse job reads), and the reconcile step run in the practice's job scope.
 */

export const LED_PLAN = 'CE:SYNPLAN-FIX-LED';

/** The ledger scenarios' practice settings: a case for a single 30.00 line, the proof level the scenario names. */
export function ledSettings(proofLevel: 'posted' | 'deposited' = 'deposited'): object {
  return { case_materiality_cents: '1000', proof_level: proofLevel, posting_export_template: { template: 'synthetic_pm_export_v1' } };
}

export interface Entry {
  readonly id: string;
  readonly stage: string;
  readonly amount_cents: string;
  readonly evidence_kind: string;
  readonly evidence_id: string;
  readonly allocated: boolean;
  readonly created_by: string | null;
  readonly service_line_id: string | null;
  readonly case_id: string;
  readonly match_id: string | null;
  readonly effective_on: string;
}

export class LedgerWorld {
  /** Where the packet export job stores the packets the scenarios submit. */
  private readonly packets = new DocumentStore(new MemorySealedBytes());

  private constructor(readonly triage: TriageWorld) {}

  static async open(adminUrl: string): Promise<LedgerWorld> {
    return new LedgerWorld(await TriageWorld.open(adminUrl));
  }

  close(): Promise<void> {
    return this.triage.close();
  }

  get owner() {
    return this.triage.owner;
  }

  get app() {
    return this.triage.app;
  }

  get services(): ReconcileServices {
    const { documents, keys } = this.triage.pricing.parseServices;
    return { documents, keys };
  }

  get keys() {
    return this.triage.keys;
  }

  /** The contract specialist, who reaches every practice of the world under a support grant (and alone adjusts an entry). */
  get specialist(): string {
    return this.triage.pricing.specialist;
  }

  practice(label: string, settings: object = ledSettings()): Promise<Practice> {
    return this.triage.practice(label, settings);
  }

  /** Loads a SYNTHETIC 835 into the practice (a path under fixtures/synthetic). */
  load(target: Practice, fixture: string): Promise<void> {
    return this.triage.load(target, fixture);
  }

  /** The LED scenarios' case: the original payment loaded, its plan mapped to a 50.00-per-unit 97110 schedule, priced and triaged. */
  async caseFor(target: Practice, fixture: string): Promise<{ readonly caseId: string; readonly serviceLineId: string }> {
    await this.load(target, fixture);
    const contract = await this.triage.fixedContract(target, { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
    const runId = await this.triage.pricedRun(target, { plans: [{ key: LED_PLAN, versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' });
    await this.triage.triage(target, runId);
    const [line] = await this.rows<{ case_id: string; service_line_id: string }>(target, 'SELECT case_id, service_line_id FROM case_line ORDER BY created_at LIMIT 1');
    if (line === undefined) {
      throw new Error('triage opened no case for the scenario');
    }
    return { caseId: line.case_id, serviceLineId: line.service_line_id };
  }

  /** Stages a posting or EFT export as intake leaves a clean one: stored, sealed under the practice's key. Returns its document ID. */
  async stageExport(target: Practice, fixture: string, kind: 'posting_export' | 'eft_export', bytes?: Buffer): Promise<string> {
    const { owner } = this;
    const content = bytes ?? readFileSync(path.join(FIXTURES, fixture));
    const id = randomUUID();
    await withPracticeScope(this.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
      scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, $3, $4, 'text/csv', $5)", [
        id,
        target.practiceId,
        kind,
        content.length,
        target.manager,
      ]),
    );
    await this.triage.pricing.parseServices.documents.write(target.cipher, documentObjectKey(target.practiceId, id), Readable.from([content]));
    await asOwner(owner, [target.practiceId], () =>
      owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'stored' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
    );
    return id;
  }

  jobContext(target: Practice, logs: Record<string, unknown>[] = []): JobContext {
    return this.triage.pricing.jobContext(target.practiceId, logs);
  }

  /** One reconcile of the practice, in its job scope. */
  reconcile(target: Practice, options: { readonly documentId?: string } = {}): Promise<ReconcileSummary> {
    return reconcilePractice(this.jobContext(target), this.services, target.practiceId, options.documentId === undefined ? {} : { documentId: options.documentId });
  }

  /** Runs `run` as `actorId` (the billing manager unless named) with a manual context: the request scope and the practice's cipher. */
  async manual<T>(target: Practice, run: (context: ManualContext) => Promise<T>, actorId = target.manager): Promise<T> {
    return withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, async (scope) =>
      run({ scope, cipher: await loadPracticeCipher(scope, this.triage.keys, target.practiceId), keys: this.triage.keys, requestId: `test-${randomUUID()}` }),
    );
  }

  /**
   * The case's packet as milestone 8 sends it: the code-built draft written by the billing manager,
   * approved by a second one, exported by the export job and logged as submitted on `submittedOn`. The
   * export is dated before that day as a superuser with triggers off (the database dates it now), so
   * the SYNTHETIC remittances of the past answer it.
   */
  async submit(target: Practice, caseId: string, submittedOn: string): Promise<{ readonly versionId: string; readonly submissionId: string }> {
    const as = <T>(actorId: string, run: (scope: Scope) => Promise<T>) => withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, (scope) => run(scope as Scope));
    const version = await as(target.manager, (scope) => writePacketVersion(scope, this.keys, { practiceId: target.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: 'test-write' }));
    const second = await createUser(this.owner);
    await addMembership(this.owner, target.world.organizationId, second, 'billing_manager');
    await as(second, (scope) => approvePacketVersion(scope, { practiceId: target.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: 'test-approve' }));
    const exported = await exportPacketVersion(this.triage.pricing.jobContext(target.practiceId), { documents: this.packets, keys: this.keys, pdf: this.triage.pdf }, target.practiceId, version.versionId);
    if (exported.outcome !== 'exported') {
      throw new Error(`the packet was not exported: ${exported.outcome}`);
    }
    await this.superuser('UPDATE packet_version SET exported_at = $2::date - 1 WHERE id = $1', [version.versionId, submittedOn]);
    const logged = await as(target.manager, (scope) =>
      logSubmission(scope, this.keys, { practiceId: target.practiceId, versionId: version.versionId, submittedOn, channel: 'payer_portal', reference: 'SYNTHETIC-PORTAL-REF', requestId: 'test-submit' }),
    );
    return { versionId: version.versionId, submissionId: logged.submissionId };
  }

  /** A payer response the billing manager records, with a SYNTHETIC payer letter as its document. */
  async respond(target: Practice, submissionId: string, response: { readonly kind: 'accepted' | 'partial' | 'denied' | 'info_requested'; readonly amountCents?: bigint; readonly receivedOn: string }): Promise<string> {
    const { owner } = this;
    const { rows } = await asOwner(owner, [target.practiceId], () =>
      owner.query<{ id: string }>(
        `INSERT INTO source_document (practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
         VALUES ($1, 'payer_letter', $2, 100, 'application/pdf', $3, 'clean', now(), 'stored') RETURNING id`,
        [target.practiceId, createHash('sha256').update(randomUUID()).digest('hex'), target.manager],
      ),
    );
    const recorded = await withPracticeScope(this.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
      recordPayerResponse(scope, this.keys, {
        practiceId: target.practiceId,
        submissionId,
        kind: response.kind,
        amountCents: response.amountCents === undefined ? null : cents(response.amountCents),
        documentId: (rows[0] as { id: string }).id,
        receivedOn: response.receivedOn,
        requestId: 'test-respond',
      }),
    );
    return recorded.responseId;
  }

  /** Runs SQL as a superuser with triggers off: setups only time could make (an export dated in the past). */
  async superuser(sql: string, values: unknown[] = []): Promise<void> {
    const { owner } = this;
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      await owner.query(sql, values);
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
  }

  /** A case's state. */
  async caseState(target: Practice, caseId: string): Promise<string | null> {
    const [row] = await this.rows<{ state: string }>(target, 'SELECT state FROM "case" WHERE id = $1', [caseId]);
    return row?.state ?? null;
  }

  /** Rows read in the billing manager's request scope. */
  async rows<T>(target: Practice, sql: string, values: unknown[] = []): Promise<T[]> {
    return withPracticeScope(this.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) => (await scope.client.query<T & object>(sql, values)).rows);
  }

  entries(target: Practice): Promise<Entry[]> {
    return this.rows<Entry>(
      target,
      'SELECT id, stage, amount_cents::text, evidence_kind, evidence_id, allocated, created_by, service_line_id, case_id, match_id, effective_on::text FROM ledger_entry ORDER BY seq',
    );
  }

  /** The entries as (stage, amount) pairs, in ledger order. */
  async stages(target: Practice): Promise<{ readonly stage: string; readonly amountCents: string }[]> {
    return (await this.entries(target)).map((entry) => ({ stage: entry.stage, amountCents: entry.amount_cents }));
  }

  /** A line's current stage. */
  async lineStage(target: Practice, serviceLineId: string): Promise<string | null> {
    const [row] = await this.rows<{ stage: string }>(target, 'SELECT stage FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1', [serviceLineId]);
    return row?.stage ?? null;
  }

  async sum(target: Practice, sql: string, values: unknown[] = []): Promise<Cents> {
    const [row] = await this.rows<{ total: string | null }>(target, sql, values);
    return parseCents(row?.total ?? '0');
  }
}
