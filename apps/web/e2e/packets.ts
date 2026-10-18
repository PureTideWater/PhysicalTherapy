import { createHash, randomUUID } from 'node:crypto';

import {
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  amendVersion,
  approveRateRecordField,
  approveVersion,
  citeDisputeWindow,
  createContract,
  createDraftVersion,
  mapPlan,
  signOffVersion,
  verifyDisputeWindow,
} from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { appDevLoginUrl, openPool, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';

import { e2eDatabaseUrl } from './env';
import { withDatabase } from './helpers';
import { journeyPractice, pricedAndTriaged, signedOffSchedule, until, userId } from './journeys';

/**
 * The packet journeys' setup on the e2e database (synthetic data only): practices of their own in the
 * other group (so no other spec's counts move), with their BAA and a case materiality of 10.00; and, once
 * their SYNTHETIC remittances are loaded through the Uploads screen, the cases they open: the payer's
 * 50.00-per-unit 97110 schedule abstracted by the contract specialist (under a support grant) and signed
 * off by a billing manager through @tp/contracts, the plan mapped, the month priced and triaged by the
 * worker's own jobs (e2e/journeys.ts). The browser does the rest. The first journey's practice also
 * grants the reimbursement reviewer a support grant: the reviewer attests its export (D16; docs/adr/0061).
 */

export const PACKET_PRACTICE = 'SYNTHETIC OTHER PRACTICE PACKETS';
/** The deadline journey's practice (CO-05, D17). */
export const DEADLINE_PRACTICE = 'SYNTHETIC OTHER PRACTICE PACKET DEADLINES';
const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT', case_materiality_cents: '1000' };

/** The journey's practice (created once per database): its ID. */
export function packetPractice(): Promise<string> {
  return journeyPractice({ name: PACKET_PRACTICE, settings: SETTINGS, supportFor: ['packet-reviewer'] });
}

/** The deadline journey's practice (created once per database): its ID. */
export function deadlinePractice(): Promise<string> {
  return journeyPractice({ name: DEADLINE_PRACTICE, settings: SETTINGS });
}

/** A case of the practice holding a line, once triage has opened it (one of the cases named is not it). */
async function caseOfPractice(practiceId: string, notIn: readonly string[] = []): Promise<string> {
  let caseId = '';
  await until(async () => {
    caseId = await withDatabase(
      async (client) =>
        (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 AND NOT (case_id = ANY ($2::uuid[])) LIMIT 1', [practiceId, notIn])).rows[0]?.case_id ?? '',
    );
    return caseId !== '';
  }, 'the triage job');
  return caseId;
}

/**
 * The case of the journey: the schedule signed off (its window cited and verified), the plan mapped, March
 * priced and triaged by the worker (which the caller keeps running). Returns the case's ID.
 */
export async function openPacketCase(practiceId: string): Promise<string> {
  await signedOffSchedule({ practiceId, managerKey: 'packet-approver', planKey: 'CE:SYNPLAN-FIX-ONE' });
  await pricedAndTriaged({ practiceId, managerKey: 'packet-approver', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  return caseOfPractice(practiceId);
}

const PLAN = 'CE:SYNPLAN-FIX-ONE';
const QUOTE = '97110 is paid $50.00 per unit';
const WINDOW_DAYS = 3650;
const WINDOW_QUOTE = `Disputes are raised within ${String(WINDOW_DAYS)} days of the remittance.`;
const PAGES = [
  ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.', WINDOW_QUOTE],
  ['SYNTHETIC EXHIBIT A FEE SCHEDULE', QUOTE],
];

type As = <T>(actorKey: string, run: (context: WorkflowContext) => Promise<T>) => Promise<T>;

/** The deadline journey's contract steps, each in its person's own scope, over the schedule's document (stored once per practice). */
async function withContracts<T>(practiceId: string, run: (as: As, documentId: string) => Promise<T>): Promise<T> {
  const pool = openPool(appDevLoginUrl(e2eDatabaseUrl()), 2);
  try {
    const pdf = syntheticPdf(PAGES);
    const as: As = async (actorKey, work) =>
      withPracticeScope(pool, { actorId: await userId(actorKey), practiceIds: [practiceId] }, (scope) =>
        work({ scope, requestId: `e2e-${randomUUID()}`, evidence: new EvidenceResolver({ pages: documentPages({ read: () => Promise.resolve({ bytes: pdf, contentType: 'application/pdf' }) }) }) }),
      );
    const hex = createHash('sha256').update(`SYNTHETIC deadline schedule ${practiceId}`).digest('hex');
    const documentId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    const manager = await userId('packet-deadline-approver');
    await withDatabase((client) =>
      asOwner(client, [practiceId], () =>
        client.query(
          `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
           VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored') ON CONFLICT DO NOTHING`,
          [documentId, practiceId, createHash('sha256').update(documentId).digest('hex'), manager],
        ),
      ),
    );
    return await run(as, documentId);
  } finally {
    await pool.end();
  }
}

/**
 * The deadline journey's first case (CO-05, D17). The payer's schedule is abstracted as it was before a
 * contract's window carried evidence: its 3,650-day dispute window is on the version and on page 1 of its
 * document, but cited on no page, so its lines' deadlines are not verified. Signed off and mapped, March is
 * priced and triaged, and its lines wait with DEADLINE_UNVERIFIED: triage opens no case for them. The case
 * the previous image's triage opened for them, during the rollout (it knew no DEADLINE_UNVERIFIED;
 * docs/adr/0061, deploy order), is recorded as that triage recorded it, so the export's guard meets one.
 * Returns the case and the signed-off version. On a retry, only the steps not done before.
 */
export async function uncitedWindowCase(practiceId: string): Promise<{ readonly caseId: string; readonly versionId: string }> {
  const versionId = await withContracts(practiceId, async (as, documentId) => {
    const found = (
      await withDatabase(async (client) =>
        asOwner(client, [practiceId], () =>
          client.query<{ id: string; status: string }>("SELECT id, status FROM contract_version WHERE practice_id = $1 AND $2::uuid = ANY (source_document_ids) AND effective_from = '2026-01-01' LIMIT 1", [
            practiceId,
            documentId,
          ]),
        ),
      )
    ).rows[0];
    if (found?.status === 'signed_off') {
      return found.id;
    }
    const { payerId, planId } = await withDatabase(async (client) =>
      asOwner(client, [practiceId], async () => ({
        payerId: (await client.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [practiceId])).rows[0]?.id ?? '',
        planId: (await client.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, PLAN])).rows[0]?.id ?? '',
      })),
    );
    const id =
      found?.id ??
      (await as('packet-deadline-approver', async (context) => {
        const contract = await createContract(context, { practiceId, payerId, title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' });
        return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: '2026-01-01', effectiveTo: null, sourceDocumentIds: [documentId], disputeWindowDays: WINDOW_DAYS })).versionId;
      }));
    await as('contract-specialist', async (context) => {
      const { rateRecordId } = await addRateRecord(context, {
        practiceId,
        versionId: id,
        terms: { scope: { codes: ['97110'] }, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } },
        citation: { documentId, page: 2, quote: QUOTE },
      });
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId, rateRecordId, field });
      }
      // The window is left uncited, as a version was abstracted before CO-05.
      await approveVersion(context, { practiceId, versionId: id });
    });
    await as('packet-deadline-approver', async (context) => {
      await signOffVersion(context, { practiceId, versionId: id });
      await mapPlan(context, { practiceId, planId, kind: 'contract', contractVersionId: id, effectiveFrom: '2026-01-01' });
    });
    return id;
  });
  const runId = await pricedAndTriaged({ practiceId, managerKey: 'packet-deadline-approver', periodFrom: '2026-03-01', periodTo: '2026-03-31' });
  const caseId = await withDatabase((client) =>
    asOwner(client, [practiceId], async () => {
      const existing = (await client.query<{ case_id: string }>('SELECT case_id FROM case_line WHERE practice_id = $1 LIMIT 1', [practiceId])).rows[0]?.case_id;
      if (existing !== undefined) {
        return existing;
      }
      const { rows: lines } = await client.query<{ id: string; service_line_id: string; rate_record_id: string; payer_id: string; plan_id: string }>(
        `SELECT p.id, p.service_line_id, p.rate_record_id, pl.payer_id, pl.id AS plan_id
           FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN plan pl ON pl.id = l.payer_plan_key
          WHERE p.pricing_run_id = $1 AND p.variance_cents > 0 ORDER BY p.service_line_id`,
        [runId],
      );
      const first = lines[0];
      if (first === undefined) {
        throw new Error('March priced no underpaid line');
      }
      const pattern = { payer_id: first.payer_id, plan_id: first.plan_id, mapping_kind: 'contract', contract_version_id: versionId, rate_record_id: first.rate_record_id, behavior: 'BELOW_CONTRACT_RATE' };
      const opened = await client.query<{ id: string }>('INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents) VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id', [
        practiceId,
        JSON.stringify(pattern),
        first.payer_id,
        first.plan_id,
        first.rate_record_id,
      ]);
      const id = opened.rows[0]?.id ?? '';
      for (const line of lines) {
        await client.query(
          "INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id) SELECT $1, $2, 'actionable', $3 WHERE NOT EXISTS (SELECT 1 FROM line_status WHERE service_line_id = $2 AND stage = 'actionable')",
          [practiceId, line.service_line_id, line.id],
        );
        await client.query('INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id) VALUES ($1, $2, $3, $4)', [practiceId, id, line.service_line_id, line.id]);
      }
      return id;
    }),
  );
  return { caseId, versionId };
}

/**
 * The window's evidence signed off (D17 a): the contract specialist amends the version from May 1, cites
 * its window on page 1 and verifies it, verifies the copied rate record again and approves; the billing
 * manager signs it off. May's lines (the SYNTHETIC CAS-04 remittance, which the browser uploaded first) are
 * priced under it and triaged, and open a case of their own. Returns that case's ID.
 */
export async function citedAmendmentCase(practiceId: string, priorVersionId: string, notIn: readonly string[]): Promise<string> {
  await withContracts(practiceId, async (as, documentId) => {
    const found = (
      await withDatabase(async (client) =>
        asOwner(client, [practiceId], () => client.query<{ id: string; status: string }>("SELECT id, status FROM contract_version WHERE practice_id = $1 AND effective_from = '2026-05-01' LIMIT 1", [practiceId])),
      )
    ).rows[0];
    if (found?.status === 'signed_off') {
      return;
    }
    const amendment = found?.id ?? (await as('contract-specialist', (context) => amendVersion(context, { practiceId, versionId: priorVersionId, effectiveFrom: '2026-05-01' }))).versionId;
    await as('contract-specialist', async (context) => {
      const { rows } = await context.scope.client.query<{ id: string }>('SELECT id FROM rate_record WHERE contract_version_id = $1 AND verified_by IS NULL', [amendment]);
      for (const record of rows) {
        for (const field of RATE_RECORD_FIELDS) {
          await approveRateRecordField(context, { practiceId, rateRecordId: record.id, field });
        }
      }
      await citeDisputeWindow(context, { practiceId, versionId: amendment, citation: { documentId, page: 1, quote: WINDOW_QUOTE } });
      await verifyDisputeWindow(context, { practiceId, versionId: amendment });
      await approveVersion(context, { practiceId, versionId: amendment });
    });
    await as('packet-deadline-approver', (context) => signOffVersion(context, { practiceId, versionId: amendment }));
  });
  await pricedAndTriaged({ practiceId, managerKey: 'packet-deadline-approver', periodFrom: '2026-05-01', periodTo: '2026-05-31' });
  return caseOfPractice(practiceId, notIn);
}
