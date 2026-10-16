import { createHash, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, type KeyProvider, type PracticeScope, type ScopeClient, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import type { DocumentStore } from '@tp/worker/documents';
import { approvePacketVersion, logSubmission, writePacketVersion } from '@tp/worker/packets';
import { packetExportHandler } from '@tp/worker/runtime';

/**
 * Test support: a route-test world's packets (docs/adr/0041 and 0044), for the packet builder and the
 * submissions routes. Synthetic data only. Before the run is priced, a third line on the world's claim
 * paid below the signed-off schedule (97110 x 1 allowed 19.00 against 32.00: 13.00 short); after
 * triage's case, a second case of that line (its own pattern, so both are open at once). The first
 * case's packet has one version, the code-built draft written by the practice's analyst (passing the
 * verifier, unapproved); the second's version is written by the analyst, approved by the billing
 * manager, exported by the export job's code with a stand-in printer and submitted by the billing
 * manager today. And a payer letter, clean and stored, that a response carries.
 */

export interface PacketLineOptions {
  readonly owner: DatabaseClient;
  readonly practiceId: string;
  readonly claimId: string;
  readonly planId: string;
}

/** The second case's underpaid line, on the world's claim; returns its ID. */
export async function seedPacketLine(options: PacketLineOptions): Promise<string> {
  const { owner, practiceId } = options;
  return asOwner(owner, [practiceId], async () => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date,
         observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
       VALUES ($1, $2, 3, 'HC', '97110', '{GP}', 8000, 1500, 1, '2026-03-17', 1900, 'paid_plus_pr', 400, $3) RETURNING id`,
      [practiceId, options.claimId, options.planId],
    );
    return (rows[0] as { id: string }).id;
  });
}

export interface PacketWorldOptions {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  readonly keys: KeyProvider;
  readonly documents: DocumentStore;
  readonly practiceId: string;
  readonly pricingRunId: string;
  /** Triage's case (the first) and the second case's line. */
  readonly caseId: string;
  readonly packetLineServiceLineId: string;
  readonly payerId: string;
  readonly planId: string;
  readonly signedOffVersionId: string;
  /** The practice's analyst (drafts) and billing manager (approves and submits). */
  readonly analystId: string;
  readonly managerId: string;
  readonly uploaderId: string;
}

export interface SeededPackets {
  readonly caseRateRecordId: string;
  readonly packetVersionId: string;
  readonly packetVersionSha256: string;
  readonly submittedCaseId: string;
  readonly exportedVersionId: string;
  readonly submissionId: string;
  readonly responseDocumentId: string;
}

const standInPdf = () => new TextEncoder().encode(`%PDF-1.7\n% SYNTHETIC stand-in packet for the route tests ${randomUUID()}\n`);

export async function seedPackets(options: PacketWorldOptions): Promise<SeededPackets> {
  const { owner, app, keys, practiceId } = options;
  const seeded = await asOwner(owner, [practiceId], async () => {
    const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
    const caseRateRecordId = await one('SELECT rate_record_id AS id FROM "case" WHERE id = $1', [options.caseId]);
    const pricedLineId = await one('SELECT id FROM priced_line WHERE pricing_run_id = $1 AND service_line_id = $2', [options.pricingRunId, options.packetLineServiceLineId]);
    const patternKey = {
      payer_id: options.payerId,
      plan_id: options.planId,
      mapping_kind: 'contract',
      contract_version_id: options.signedOffVersionId,
      rate_record_id: caseRateRecordId,
      behavior: 'MPPR_NOT_IN_CONTRACT',
    };
    const submittedCaseId = await one('INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents) VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id', [
      practiceId,
      JSON.stringify(patternKey),
      options.payerId,
      options.planId,
      caseRateRecordId,
    ]);
    // The audit report's triage may have validated the line already (it is below the case materiality).
    for (const stage of ['validated', 'actionable']) {
      await owner.query(
        'INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id) SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM line_status WHERE service_line_id = $2 AND stage = $3)',
        [practiceId, options.packetLineServiceLineId, stage, pricedLineId],
      );
    }
    await owner.query('INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)', [practiceId, submittedCaseId, options.packetLineServiceLineId, pricedLineId]);
    const responseDocumentId = await one(
      `INSERT INTO source_document (practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, 'payer_letter', $2, 100, 'application/pdf', $3, 'clean', now(), 'stored') RETURNING id`,
      [practiceId, createHash('sha256').update(`SYNTHETIC payer letter ${practiceId}`).digest('hex'), options.uploaderId],
    );
    return { caseRateRecordId, submittedCaseId, responseDocumentId };
  });
  const as = <T>(actorId: string, run: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(app, { actorId, practiceIds: [practiceId] }, run);
  const draft = (caseId: string) => as(options.analystId, (scope) => writePacketVersion(scope, keys, { practiceId, caseId, basedOnVersionId: null, requestId: `seed-${randomUUID()}` }));
  const first = await draft(options.caseId);
  const second = await draft(seeded.submittedCaseId);
  if (!first.verifier.passed || !second.verifier.passed) {
    throw new Error('the seeded packet drafts did not pass the verifier');
  }
  await as(options.managerId, (scope) => approvePacketVersion(scope, { practiceId, versionId: second.versionId, versionSha256: second.contentSha256, requestId: `seed-${randomUUID()}` }));
  const jobId = randomUUID();
  await packetExportHandler({ documents: options.documents, keys, pdf: { render: () => Promise.resolve(standInPdf()) } })(
    { practice_id: practiceId, packet_version_id: second.versionId },
    { jobId, logger: createLogger({ sink: () => undefined }), transaction: (work) => withJobScope(app, { jobId, practiceId }, work), enqueue: () => Promise.resolve(null), lastAttempt: false },
  );
  const submitted = await as(options.managerId, (scope) =>
    logSubmission(scope, keys, {
      practiceId,
      versionId: second.versionId,
      submittedOn: new Date().toISOString().slice(0, 10),
      channel: 'payer_portal',
      reference: 'SYNTHETIC-PORTAL-REF-ROUTE',
      requestId: `seed-${randomUUID()}`,
    }),
  );
  return {
    caseRateRecordId: seeded.caseRateRecordId,
    packetVersionId: first.versionId,
    packetVersionSha256: first.contentSha256,
    submittedCaseId: seeded.submittedCaseId,
    exportedVersionId: second.versionId,
    submissionId: submitted.submissionId,
    responseDocumentId: seeded.responseDocumentId,
  };
}
