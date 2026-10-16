import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { documentObjectKey, loadPracticeCipher, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { type Cents, parseCents } from '@tp/money';

import type { JobContext } from '../../jobs/handlers';
import { FIXTURES, type Practice } from '../../price/test-support/pricing-world';
import { TriageWorld } from '../../triage/test-support/triage-world';
import { type ManualContext } from '../manual';
import { NO_SUBMISSIONS, type ReconcileServices, type ReconcileSummary, reconcilePractice } from '../pass';
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
    return { ...this.triage.pricing.parseServices, ...NO_SUBMISSIONS };
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
  reconcile(target: Practice, options: { readonly documentId?: string; readonly services?: Partial<ReconcileServices> } = {}): Promise<ReconcileSummary> {
    return reconcilePractice(this.jobContext(target), { ...this.services, ...options.services }, target.practiceId, options.documentId === undefined ? {} : { documentId: options.documentId });
  }

  /** Runs `run` as `actorId` (the billing manager unless named) with a manual context: the request scope and the practice's cipher. */
  async manual<T>(target: Practice, run: (context: ManualContext) => Promise<T>, actorId = target.manager): Promise<T> {
    return withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, async (scope) =>
      run({ scope: scope as Scope, cipher: await loadPracticeCipher(scope, this.triage.keys, target.practiceId), requestId: `test-${randomUUID()}` }),
    );
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
