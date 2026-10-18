import { performance } from 'node:perf_hooks';

import { readDatabaseUrl } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCoverage } from './coverage';
import { type Practice, PricingWorld } from './test-support/pricing-world';

/**
 * PRD 11, Properties: "100,000 lines price in under two minutes on one worker vCPU" (test matrix
 * PRC-20), here end to end: the run created in the billing manager's scope (the guard over every plan
 * included), then executed by the price job in the practice's job scope: every line read with its PR
 * adjustments (each claim an audited read), resolved by @tp/contracts' resolver, priced by the engine
 * with its trace, and written to priced_line with the trace, then the coverage totalled and the run
 * completed, all in one transaction. TP_LARGE_PRICING_LINES sizes it (100,000 by default, in claims of
 * four lines). SYNTHETIC rows, bulk-inserted as the owner: half the claims under a plan mapped as
 * Medicare Advantage non-contracted (every Medicare flag on), half under a SYNTHETIC contract at 110%.
 */

const LINES = Number.parseInt(process.env.TP_LARGE_PRICING_LINES ?? '100000', 10);
const PER_CLAIM = 4;
const CLAIMS = Math.ceil(LINES / PER_CLAIM);
const CODES = ['97110', '97112', '97140', '97530', '97116', '97161'];

let w: PricingWorld;
let target: Practice;

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl(), 4);
  target = await w.practice('large');
  const { owner } = w;
  const practiceId = target.practiceId;
  await asOwner(owner, [practiceId], async () => {
    const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
    const document = await one(
      "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
      [practiceId, target.manager, 'a'.repeat(64)],
    );
    const payer = await one("INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, '2U:SYNLARGE', 'SYNTHETIC PAYER LARGE') RETURNING id", [practiceId]);
    const ma = await one("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-LARGE-MA') RETURNING id", [practiceId, payer]);
    const commercial = await one("INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, 'CE:SYNPLAN-LARGE-COMM') RETURNING id", [practiceId, payer]);
    const patient = await one("INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id", [practiceId, 'b'.repeat(64)]);
    const remittance = await one(
      `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
         payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
       VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000001', '1', '0001', 'SYNEFTLARGE0001', '1SYN00000L', 0, 'C', 'ACH', '2026-04-15', 'SYNTHETIC PAYER LARGE', $3, '9900000001', 'XX', $4, 0)
       RETURNING id`,
      [practiceId, document, payer, CLAIMS],
    );
    await owner.query(
      `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
         charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)
       SELECT $1, $2, g, 'enc:v1:SYNPCN' || g, 'enc:v1:SYNCCN' || g, encode(sha256(convert_to('SYNCCN' || g, 'UTF8')), 'hex'), '1', 40000, 20000, 4000,
              CASE WHEN g % 2 = 0 THEN '16' ELSE '12' END, $3, '2026-03-01'::date + (g % 28), '2026-03-01'::date + (g % 28)
         FROM generate_series(1, $4::int) g`,
      [practiceId, remittance, patient, CLAIMS],
    );
    await owner.query(
      `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date, place_of_service,
         observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
       SELECT $1, c.id, n, 'HC', ($4::text[])[1 + ((c.claim_no + n) % cardinality($4::text[]))], CASE WHEN n = 3 THEN '{GP,CQ}'::text[] ELSE '{GP}'::text[] END,
              10000, 4000, 1 + ((c.claim_no + n) % 3), c.service_from, '11', 5000, 'paid_plus_pr', 1000, CASE WHEN c.claim_no % 2 = 0 THEN $2::uuid ELSE $3::uuid END
         FROM claim c CROSS JOIN generate_series(1, $5::int) n
        WHERE c.practice_id = $1 AND (c.claim_no - 1) * $5::int + n <= $6::int`,
      [practiceId, ma, commercial, CODES, PER_CLAIM, LINES],
    );
    await owner.query(
      `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position)
       SELECT l.practice_id, l.claim_id, l.id, 'PR', '2', 1000, l.line_no FROM service_line l WHERE l.practice_id = $1`,
      [practiceId],
    );
  });
  // Statistics as autovacuum leaves them after a load of this size, so the planner sees the rows.
  await owner.query('ANALYZE claim, service_line, adjustment, plan, payer');
  const signed = await w.signedContract(target, '2026-01-01', { payerId: await w.payerOf(target) });
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-LARGE-MA'), 'ma_noncontracted', '2026-01-01');
  await w.mapped(target, await w.planOf(target, 'CE:SYNPLAN-LARGE-COMM'), 'contract', '2026-01-01', signed.versionId);
}, 600_000);

afterAll(async () => {
  await w.close();
});

describe(`a pricing run over ${String(LINES)} lines (PRD 11; PRC-20 end to end)`, () => {
  it('creates, prices, stores every line with its trace and completes in under two minutes', async () => {
    const started = performance.now();
    const runId = await w.createRun(target, '2026-03-01', '2026-03-31');
    const created = performance.now();
    await w.execute(target, runId);
    const finished = performance.now();
    const seconds = (finished - started) / 1000;
    const run = await w.one<{ status: string; coverage: unknown }>('SELECT status, coverage FROM pricing_run WHERE id = $1', [runId]);
    expect(run.status).toBe('complete');
    const coverage = parseCoverage(run.coverage);
    expect(coverage.lines).toBe(LINES);
    // Every line is priced or carries its reason (phase two's MUE stops some MA units, for review).
    expect(coverage.priced.lines + coverage.reasons.reduce((sum, entry) => sum + entry.lines, 0)).toBe(LINES);
    expect(coverage.priced.lines).toBeGreaterThan(LINES / 2);
    const stored = await w.one<{ n: number; traces: number }>('SELECT count(*)::int AS n, count(*) FILTER (WHERE trace ? $2)::int AS traces FROM priced_line WHERE pricing_run_id = $1', [runId, 'outcome']);
    expect(stored).toEqual({ n: LINES, traces: LINES });
    process.stdout.write(
      `pricing run over ${String(LINES)} lines (${String(coverage.priced.lines)} priced): created in ${((created - started) / 1000).toFixed(1)} s, executed in ${((finished - created) / 1000).toFixed(1)} s, ${seconds.toFixed(1)} s end to end\n`,
    );
    expect(seconds, `priced ${String(LINES)} lines end to end in ${seconds.toFixed(1)} s`).toBeLessThan(120);
  }, 600_000);
});
