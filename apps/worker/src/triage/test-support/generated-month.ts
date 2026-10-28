import { createHash, randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, withJobScope, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { centsToString } from '@tp/money';
import { type CandidateLine, type PatternKey, judgeLine, planCases, pursuitCost, triageSettings } from '@tp/triage';

import { acceptRun, createRerun } from '../../price/rerun';
import { CONTENT_GAP_RELEASE, type Practice } from '../../price/test-support/pricing-world';
import { candidateLines, candidateRows } from '../execute';
import type { TriageWorld } from './triage-world';

/**
 * For the tests (CAS-41, SUITE-CAP-1a; docs/adr/0083): a generated month of SYNTHETIC lines in one practice, priced by
 * the price job and left as a triage leaves it, with every kind of line the triage and the audit report treat apart, so
 * the batched and streamed readers can be compared with the whole reads on more than the CAS fixtures. No fixture
 * file: the claims and lines are bulk-inserted as the owner (as price.large.db.test.ts does), their claim numbers
 * sealed with the practice's key, then priced under SYNTHETIC release 900007 (CONTENT_GAP_RELEASE).
 *
 * October 2026 (`lines` lines, 10,000 by default, the segments scaled to it) and a small September:
 * - payer ALPHA: plan A1 under a fixed schedule (97110 short, overpaid or short by less than the line materiality;
 *   97140 short on a few lines only, a pattern held below the case materiality; 97530 short; 97161 unpriced), with
 *   claim numbers repeated within the plan; plan A2 under a one-day window, half its claims paid on 2026-10-22 (their
 *   windows passed by the triage date) and half on 2026-10-25;
 * - payer BETA: plan B1's window uncited, B2's cited in business days, B3's contract silent (no window), B4 with the
 *   coding edits on (the MUE, which 900007 does not load after September);
 * - payer ÉTÉ: G1 Medicare Advantage non-contracted (the MPPR and the MUE not loaded; Medicare windows below L2), G2
 *   per visit (short visits, and overpaid ones), G3 with no agreement (unpriced; an anomaly flags five of them);
 * - two payers both named DELTA, each with a plan named SYNTHETIC SHARED PLAN, Medicare Advantage non-contracted, with
 *   the same claim numbers: their patterns share every key the report groups by. Every other priced line of D2 then
 *   names a contract version (rewritten with triggers off; no pricing writes it so), so two patterns tie on payer,
 *   plan, behavior and rate record and differ only in their version.
 *
 * October is priced, then priced again by an accepted re-run (the run the readers read); September is its own run.
 * The stages, cases and case lines are those triage plans (planCases on the whole read's candidates), written by the
 * test as the owner in transactions of at most 1,000 lines, so today's per-line trigger never holds more than 1,000
 * advisory locks while CI's other files share the cluster. Beside triage's plan: the first lines of the 97530 case name
 * the first run's priced lines (in a case through another run), ten 97110 case lines are written off as duplicates and
 * ten as not worth pursuit by the billing manager, September's 97140 lines are a case of their own (a case of another
 * run) and its 97110 lines join October's 97110 case (a case holding another run's lines).
 */

/** The date the generated month is triaged and reported on (after A2's early windows, before any real date the tests run on). */
export const GENERATED_AS_OF = '2026-10-26';

export const GENERATED_SETTINGS = { staff_rate_cents_per_hour: '6000', minutes_per_packet: 30, minutes_per_follow_up: 15 };

export interface GeneratedMonth {
  readonly practice: Practice;
  /** October's run in effect (the accepted re-run): the run the readers read. */
  readonly runId: string;
  /** October's first run, which the re-run replaced. */
  readonly replacedRunId: string;
  readonly septemberRunId: string;
  readonly lines: number;
  readonly caseIds: readonly string[];
}

interface Segment {
  readonly key: string;
  readonly lines: number;
  readonly codes: readonly string[];
  /** The observed allowed amount of a claim's line, in cents, by the claim's index in its plan and the line's code. */
  readonly allowed: (claim: number, code: string) => number;
  /** Which of the payer's remittances paid the claim. */
  readonly remittance: (claim: number) => string;
  /** How many distinct claim numbers the plan's claims take (fewer than its claims: numbers repeat). */
  readonly claimNumbers?: (claims: number) => number;
  readonly claimNumberPrefix: string;
  readonly medicareAdvantage?: boolean;
  /** Claim-level CAS on every tenth claim (PR-1 and CO-45): the patient's share of a claim's lines by the cash's rule. */
  readonly claimLevel?: boolean;
}

interface PayerSpec {
  readonly raw: string;
  readonly name: string;
  readonly plans: readonly { readonly key: string; readonly name: string | null }[];
  readonly remittances: readonly { readonly label: string; readonly paidOn: string }[];
}

const PAYERS: readonly PayerSpec[] = [
  {
    raw: '2U:SYNGENA',
    name: 'SYNTHETIC PAYER ALPHA',
    plans: [
      { key: 'CE:SYNGEN-A1', name: null },
      { key: 'CE:SYNGEN-A2', name: null },
    ],
    remittances: [
      { label: 'A-EARLY', paidOn: '2026-10-22' },
      { label: 'A-LATE', paidOn: '2026-10-25' },
      { label: 'A-SEP', paidOn: '2026-10-05' },
    ],
  },
  {
    raw: '2U:SYNGENB',
    name: 'SYNTHETIC PAYER BETA',
    plans: ['B1', 'B2', 'B3', 'B4'].map((plan) => ({ key: `CE:SYNGEN-${plan}`, name: null })),
    remittances: [{ label: 'B', paidOn: '2026-10-22' }],
  },
  {
    raw: '2U:SYNGENG',
    name: 'SYNTHETIC PAYER ÉTÉ',
    plans: ['G1', 'G2', 'G3'].map((plan) => ({ key: `CE:SYNGEN-${plan}`, name: null })),
    remittances: [{ label: 'G', paidOn: '2026-10-22' }],
  },
  { raw: '2U:SYNGEND1', name: 'SYNTHETIC PAYER DELTA', plans: [{ key: 'CE:SYNGEN-D1', name: 'SYNTHETIC SHARED PLAN' }], remittances: [{ label: 'D1', paidOn: '2026-10-22' }] },
  { raw: '2U:SYNGEND2', name: 'SYNTHETIC PAYER DELTA', plans: [{ key: 'CE:SYNGEN-D2', name: 'SYNTHETIC SHARED PLAN' }], remittances: [{ label: 'D2', paidOn: '2026-10-22' }] },
];

const OCTOBER: readonly Segment[] = [
  {
    key: 'CE:SYNGEN-A1',
    lines: 3200,
    codes: ['97110', '97140', '97530', '97161'],
    allowed: (claim, code) => (code === '97110' ? (claim % 10 === 0 ? 6000 : claim % 10 === 1 ? 4800 : 4000) : code === '97140' ? (claim < 10 ? 3800 : 4500) : 4000),
    remittance: () => 'A-EARLY',
    claimNumbers: (claims) => claims - Math.min(20, Math.floor(claims / 10)),
    claimNumberPrefix: 'SYNGA1',
    claimLevel: true,
  },
  { key: 'CE:SYNGEN-A2', lines: 600, codes: ['97110', '97110'], allowed: () => 4000, remittance: (claim) => (claim % 2 === 0 ? 'A-EARLY' : 'A-LATE'), claimNumberPrefix: 'SYNGA2' },
  { key: 'CE:SYNGEN-B1', lines: 800, codes: ['97110', '97530'], allowed: () => 4000, remittance: () => 'B', claimNumberPrefix: 'SYNGB1' },
  { key: 'CE:SYNGEN-B2', lines: 800, codes: ['97110', '97530'], allowed: () => 4000, remittance: () => 'B', claimNumberPrefix: 'SYNGB2' },
  { key: 'CE:SYNGEN-B3', lines: 600, codes: ['97110', '97530'], allowed: () => 4000, remittance: () => 'B', claimNumberPrefix: 'SYNGB3' },
  { key: 'CE:SYNGEN-B4', lines: 600, codes: ['97110', '97530'], allowed: () => 4000, remittance: () => 'B', claimNumberPrefix: 'SYNGB4' },
  { key: 'CE:SYNGEN-G1', lines: 1200, codes: ['97110', '97112', '97140', '97530'], allowed: (claim) => (claim % 7 === 0 ? 9000 : 1500), remittance: () => 'G', claimNumberPrefix: 'SYNGG1', medicareAdvantage: true },
  { key: 'CE:SYNGEN-G2', lines: 900, codes: ['97110', '97140', '97530'], allowed: (claim) => (claim % 5 === 0 ? 6000 : 4000), remittance: () => 'G', claimNumberPrefix: 'SYNGG2' },
  { key: 'CE:SYNGEN-G3', lines: 300, codes: ['97110'], allowed: (claim) => (claim % 10 === 0 ? 2000 : 4000), remittance: () => 'G', claimNumberPrefix: 'SYNGG3' },
  { key: 'CE:SYNGEN-D1', lines: 500, codes: ['97110', '97530'], allowed: () => 1500, remittance: () => 'D1', claimNumberPrefix: 'SYNGD', medicareAdvantage: true },
  { key: 'CE:SYNGEN-D2', lines: 500, codes: ['97110', '97530'], allowed: () => 1500, remittance: () => 'D2', claimNumberPrefix: 'SYNGD', medicareAdvantage: true },
];

const SEPTEMBER: Segment = { key: 'CE:SYNGEN-A1', lines: 40, codes: ['97110', '97140', '97530', '97161'], allowed: () => 4000, remittance: () => 'A-SEP', claimNumberPrefix: 'SYNGA1S' };

/** How many lines the segments above hold: the month at full size. */
export const GENERATED_FULL_LINES = OCTOBER.reduce((total, segment) => total + segment.lines, 0);

const pad = (value: number) => String(value).padStart(5, '0');

/** Splits `items` into runs of at most `size`. */
export function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** Statements the test writes as the owner, each transaction holding at most 1,000 lines (today's trigger locks each). */
export const OWNER_BATCH_LINES = 1000;

interface Rows {
  readonly claims: { readonly planId: string; readonly remittanceId: string; readonly number: string; readonly serviceDate: string; readonly ma: boolean; readonly claimLevel: boolean; readonly lines: readonly { readonly code: string; readonly allowed: number }[] }[];
}

function segmentRows(segment: Segment, scale: number, planOf: ReadonlyMap<string, string>, remittanceOf: ReadonlyMap<string, string>, month: 'october' | 'september', claims: Rows['claims'][number][]): void {
  const count = Math.max(1, Math.round((segment.lines * scale) / segment.codes.length));
  const numbers = segment.claimNumbers?.(count) ?? count;
  for (let claim = 0; claim < count; claim += 1) {
    claims.push({
      planId: planOf.get(segment.key) as string,
      remittanceId: remittanceOf.get(segment.remittance(claim)) as string,
      number: `${segment.claimNumberPrefix}${pad(claim % numbers)}`,
      serviceDate: month === 'october' ? `2026-10-${String(1 + (claim % 20)).padStart(2, '0')}` : `2026-09-${String(1 + (claim % 28)).padStart(2, '0')}`,
      ma: segment.medicareAdvantage === true,
      claimLevel: segment.claimLevel === true && claim % 10 === 0,
      lines: segment.codes.map((code) => ({ code, allowed: segment.allowed(claim, code) })),
    });
  }
}

async function insertClaims(world: TriageWorld, target: Practice, claims: Rows['claims']): Promise<void> {
  const { owner } = world;
  await asOwner(owner, [target.practiceId], async () => {
    const patient = (await owner.query<{ id: string }>('INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id', [target.practiceId, randomUUID().replaceAll('-', '').padEnd(64, '0')])).rows[0]?.id;
    let claimNo = 0;
    for (const part of batches(claims, 500)) {
      const { rows: inserted } = await owner.query<{ id: string }>(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)
         SELECT $1, t.remittance_id, t.n, 'enc:v1:SYNPCN' || t.n, t.number, t.hash, '1', t.charge, t.paid, t.resp, t.filing, $2, t.service_date, t.service_date
           FROM unnest($3::uuid[], $4::int[], $5::text[], $6::text[], $7::bigint[], $8::bigint[], $9::bigint[], $10::text[], $11::date[])
                AS t (remittance_id, n, number, hash, charge, paid, resp, filing, service_date)
         RETURNING id`,
        [
          target.practiceId,
          patient,
          part.map((claim) => claim.remittanceId),
          part.map(() => (claimNo += 1)),
          part.map((claim) => target.cipher.encrypt('claim.payer_claim_control_number', claim.number)),
          part.map((claim) => target.cipher.lookupHash('claim.payer_claim_control_number', claim.number)),
          part.map((claim) => String(claim.lines.length * 10000)),
          part.map((claim) => String(claim.lines.reduce((total, line) => total + line.allowed - 1000, 0))),
          part.map((claim) => String(claim.lines.length * 1000)),
          part.map((claim) => (claim.ma ? '16' : '12')),
          part.map((claim) => claim.serviceDate),
        ],
      );
      const lines = part.flatMap((claim, index) => claim.lines.map((line, position) => ({ claimId: (inserted[index] as { id: string }).id, lineNo: position + 1, claim, line })));
      await owner.query(
        `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date, place_of_service,
           observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
         SELECT $1, t.claim_id, t.line_no, 'HC', t.code, '{GP}'::text[], 10000, t.allowed - 1000, 1, t.service_date, '11', t.allowed, 'paid_plus_pr', 1000, t.plan_id
           FROM unnest($2::uuid[], $3::int[], $4::text[], $5::bigint[], $6::date[], $7::uuid[]) AS t (claim_id, line_no, code, allowed, service_date, plan_id)`,
        [
          target.practiceId,
          lines.map((line) => line.claimId),
          lines.map((line) => line.lineNo),
          lines.map((line) => line.line.code),
          lines.map((line) => String(line.line.allowed)),
          lines.map((line) => line.claim.serviceDate),
          lines.map((line) => line.claim.planId),
        ],
      );
      // Each line's own patient share (PR-2), and on the claims that carry it the claim's own CAS (PR-1, then CO-45).
      await owner.query(
        `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position)
         SELECT l.practice_id, l.claim_id, l.id, 'PR', '2', 1000, l.line_no FROM service_line l WHERE l.claim_id = ANY ($1::uuid[])`,
        [inserted.map((row) => row.id)],
      );
      const claimLevel = part.flatMap((claim, index) => (claim.claimLevel ? [(inserted[index] as { id: string }).id] : []));
      if (claimLevel.length > 0) {
        await owner.query(
          `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position)
           SELECT $1, c.id, NULL, x.group_code, x.reason_code, x.amount, x.position
             FROM unnest($2::uuid[]) AS c (id) CROSS JOIN (VALUES ('PR', '1', 500, 100), ('CO', '45', 300, 101)) AS x (group_code, reason_code, amount, position)`,
          [target.practiceId, claimLevel],
        );
      }
    }
  });
}

/** Runs `write` as the owner in the practice's scope with no person as its actor (as triage writes), once per batch of at most OWNER_BATCH_LINES items. */
async function ownerBatches<T>(world: TriageWorld, target: Practice, items: readonly T[], write: (batch: readonly T[]) => Promise<unknown>): Promise<void> {
  for (const batch of batches(items, OWNER_BATCH_LINES)) {
    await asOwner(world.owner, [target.practiceId], () => write(batch));
  }
}

async function advance(world: TriageWorld, target: Practice, stage: 'flagged' | 'validated' | 'actionable', lines: readonly { readonly serviceLineId: string; readonly pricedLineId: string | null }[]): Promise<void> {
  await ownerBatches(world, target, lines, (batch) =>
    world.owner.query(
      `INSERT INTO line_status (practice_id, service_line_id, stage, priced_line_id)
       SELECT $1, t.service_line_id, $4, t.priced_line_id FROM unnest($2::uuid[], $3::uuid[]) AS t (service_line_id, priced_line_id) ORDER BY t.service_line_id`,
      [target.practiceId, batch.map((line) => line.serviceLineId), batch.map((line) => line.pricedLineId), stage],
    ),
  );
}

async function openCaseAsOwner(world: TriageWorld, target: Practice, pattern: PatternKey, materialityCents: string, pursuit: string | null): Promise<string> {
  return asOwner(world.owner, [target.practiceId], async () => {
    const { rows } = await world.owner.query<{ id: string }>(
      'INSERT INTO "case" (practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents, pursuit_cost_cents) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [target.practiceId, JSON.stringify(pattern), pattern.payer_id, pattern.plan_id, pattern.rate_record_id, materialityCents, pursuit],
    );
    return (rows[0] as { id: string }).id;
  });
}

async function addCaseLines(world: TriageWorld, target: Practice, caseId: string, lines: readonly { readonly serviceLineId: string; readonly pricedLineId: string; readonly windowPassed: boolean }[]): Promise<void> {
  await ownerBatches(world, target, lines, (batch) =>
    world.owner.query(
      `INSERT INTO case_line (practice_id, case_id, service_line_id, priced_line_id, written_off_reason)
       SELECT $1, $2, t.service_line_id, t.priced_line_id, CASE WHEN t.window_passed THEN 'window_passed' END
         FROM unnest($3::uuid[], $4::uuid[], $5::boolean[]) AS t (service_line_id, priced_line_id, window_passed) ORDER BY t.service_line_id`,
      [target.practiceId, caseId, batch.map((line) => line.serviceLineId), batch.map((line) => line.pricedLineId), batch.map((line) => line.windowPassed)],
    ),
  );
}

/** The whole read's candidates of a run (or of no run: the validated lines in no case), in a billing manager's scope. */
export async function wholeCandidates(world: TriageWorld, target: Practice, pricingRunId: string | null): Promise<CandidateLine[]> {
  return withPracticeScope(world.app, { actorId: target.manager, practiceIds: [target.practiceId] }, async (scope) =>
    candidateLines(scope.client, await candidateRows(scope, target.practiceId, pricingRunId, `test-${randomUUID()}`)),
  );
}

/** Runs `read` in the practice's job scope, as the triage and report jobs read. */
export function inJobScope<T>(world: TriageWorld, target: Practice, read: (scope: PracticeScope<ScopeClient>) => Promise<T>): Promise<T> {
  return withJobScope(world.pricing.worker, { jobId: randomUUID(), practiceId: target.practiceId }, read);
}

/**
 * Builds the generated month (see above) in a practice of its own. `contentLoaded` runs the price job as it ran before
 * the content refusal (the test file's mock of releaseContentSpans), so lines whose traces read content 900007 does
 * not load for their dates are priced, and the readers find the gap (audit #7).
 */
export async function generatedMonth(world: TriageWorld, options: { readonly label: string; readonly lines?: number; readonly contentLoaded: <T>(run: () => Promise<T>) => Promise<T> }): Promise<GeneratedMonth> {
  const scale = (options.lines ?? GENERATED_FULL_LINES) / GENERATED_FULL_LINES;
  const { owner, pricing } = world;
  await pricing.loadContentGapRelease();
  const target = await world.practice(options.label, GENERATED_SETTINGS);
  const settings = triageSettings((await pricing.one<{ settings: unknown }>('SELECT settings FROM practice WHERE id = $1', [target.practiceId])).settings);

  // Payers, plans and remittances.
  const planOf = new Map<string, string>();
  const payerOf = new Map<string, string>();
  const remittanceOf = new Map<string, string>();
  await asOwner(owner, [target.practiceId], async () => {
    const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
    for (const [index, payer] of PAYERS.entries()) {
      const payerId = await one('INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, $2, $3) RETURNING id', [target.practiceId, payer.raw, payer.name]);
      for (const plan of payer.plans) {
        planOf.set(plan.key, await one('INSERT INTO plan (practice_id, payer_id, plan_key, name) VALUES ($1, $2, $3, $4) RETURNING id', [target.practiceId, payerId, plan.key, plan.name]));
        payerOf.set(plan.key, payerId);
      }
      for (const [position, remittance] of payer.remittances.entries()) {
        const label = `${String(index)}${String(position)}`;
        const document = await one(
          "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
          [target.practiceId, target.manager, createHash('sha256').update(`${target.practiceId}:${remittance.label}`).digest('hex')],
        );
        remittanceOf.set(
          remittance.label,
          await one(
            `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
               payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
             VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', $3, '1', '0001', $4, '1SYN00000G', 0, 'C', 'ACH', $5, $6, $7, '9900000001', 'XX', 0, 0)
             RETURNING id`,
            [target.practiceId, document, `0000000${label}`.slice(-9), `SYNEFTGEN${label}`, remittance.paidOn, payer.name, payerId],
          ),
        );
      }
    }
  });
  const claims: Rows['claims'][number][] = [];
  for (const segment of OCTOBER) {
    segmentRows(segment, scale, planOf, remittanceOf, 'october', claims);
  }
  segmentRows(SEPTEMBER, 1, planOf, remittanceOf, 'september', claims);
  await insertClaims(world, target, claims);
  await owner.query('ANALYZE claim, service_line, adjustment, plan, payer');

  // The agreements: one per plan that has one, each with its payer, and the plans mapped from January.
  const fixed = (codes: readonly (readonly [string, string])[]) => codes.map(([code, amountCents]) => ({ code, amountCents }));
  const a1 = await world.fixedContract(target, { schedule: fixed([['97110', '5000'], ['97140', '4500'], ['97530', '5200']]), effectiveFrom: '2026-01-01', disputeWindowDays: 3650, payerId: payerOf.get('CE:SYNGEN-A1') });
  const a2 = await world.fixedContract(target, { schedule: fixed([['97110', '5000']]), effectiveFrom: '2026-01-01', disputeWindowDays: 1, payerId: payerOf.get('CE:SYNGEN-A2') });
  const beta = payerOf.get('CE:SYNGEN-B1');
  const schedule = fixed([['97110', '5000'], ['97530', '5200']]);
  const b1 = await world.fixedContract(target, { schedule, effectiveFrom: '2026-01-01', disputeWindowDays: 3650, windowCited: false, payerId: beta });
  const b2 = await world.fixedContract(target, { schedule, effectiveFrom: '2026-01-01', disputeWindowDays: 60, windowRule: { unit: 'business_days', measuredFrom: 'payment_date' }, payerId: beta });
  const b3 = await pricing.signedContract(target, '2026-01-01', { payerId: beta, terms: { scope: {}, method: 'FIXED_SCHEDULE', parameters: { amount_cents: '5000' }, flags: { timed_units_rule: 'PER_CODE' } } });
  const b4 = await world.fixedContract(target, { schedule, effectiveFrom: '2026-01-01', disputeWindowDays: 3650, payerId: beta, flags: { apply_ncci: true } });
  const g2 = await world.perVisitContract(target, { codes: ['97110', '97140', '97530'], amountCents: '16000', effectiveFrom: '2026-01-01', disputeWindowDays: 3650, payerId: payerOf.get('CE:SYNGEN-G2') });
  const contracts: readonly (readonly [string, 'contract' | 'no_agreement' | 'ma_noncontracted', string | null])[] = [
    ['CE:SYNGEN-A1', 'contract', a1.versionId],
    ['CE:SYNGEN-A2', 'contract', a2.versionId],
    ['CE:SYNGEN-B1', 'contract', b1.versionId],
    ['CE:SYNGEN-B2', 'contract', b2.versionId],
    ['CE:SYNGEN-B3', 'contract', b3.versionId],
    ['CE:SYNGEN-B4', 'contract', b4.versionId],
    ['CE:SYNGEN-G1', 'ma_noncontracted', null],
    ['CE:SYNGEN-G2', 'contract', g2.versionId],
    ['CE:SYNGEN-G3', 'no_agreement', null],
    ['CE:SYNGEN-D1', 'ma_noncontracted', null],
    ['CE:SYNGEN-D2', 'ma_noncontracted', null],
  ];
  for (const [key, kind, versionId] of contracts) {
    await pricing.mapped(target, planOf.get(key) as string, kind, '2026-01-01', versionId);
  }

  // September, then October, then October again by a re-run a person accepts: the run the readers read.
  const priced = async (from: string, to: string) => {
    const runId = await pricing.createRun(target, from, to, CONTENT_GAP_RELEASE);
    await options.contentLoaded(() => pricing.execute(target, runId));
    return runId;
  };
  const septemberRunId = await priced('2026-09-01', '2026-09-30');
  const replacedRunId = await priced('2026-10-01', '2026-10-31');
  const manager = <T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(world.app, { actorId: target.manager, practiceIds: [target.practiceId] }, run);
  const rerun = await manager((scope) => createRerun(scope, { practiceId: target.practiceId, pricingRunId: replacedRunId, releaseNo: CONTENT_GAP_RELEASE, requestId: `test-${randomUUID()}` }));
  await options.contentLoaded(() => pricing.execute(target, rerun.pricingRunId));
  await manager((scope) => acceptRun(scope, { practiceId: target.practiceId, pricingRunId: rerun.pricingRunId, replacesId: replacedRunId, heldByIds: [] }));
  const runId = rerun.pricingRunId;
  const complete = await owner.query<{ status: string }>('SELECT status FROM pricing_run WHERE id = ANY ($1::uuid[])', [[septemberRunId, replacedRunId, runId]]);
  if (complete.rows.length !== 3 || complete.rows.some((row) => row.status !== 'complete')) {
    throw new Error('the generated month’s runs did not complete');
  }

  // Two patterns that tie on payer, plan, behavior and rate record: every other of D2's priced lines names a contract
  // version, as no pricing writes it, rewritten as a superuser with triggers off for the one statement.
  await owner.query('BEGIN');
  try {
    await owner.query("SET LOCAL session_replication_role = 'replica'");
    await owner.query(
      `UPDATE priced_line p SET contract_version_id = $3
         FROM (SELECT x.id, row_number() OVER (ORDER BY x.service_line_id) AS n FROM priced_line x JOIN service_line l ON l.id = x.service_line_id
                WHERE x.pricing_run_id = $1 AND l.payer_plan_key = $2) d
        WHERE p.id = d.id AND d.n % 2 = 0`,
      [runId, planOf.get('CE:SYNGEN-D2'), b1.versionId],
    );
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }

  // Triage's plan, from the whole read: September's run and October's in effect.
  const september = await wholeCandidates(world, target, septemberRunId);
  const october = await wholeCandidates(world, target, runId);
  const validated = (lines: readonly CandidateLine[]) => lines.filter((line) => judgeLine(line, settings.lineMaterialityCents, GENERATED_AS_OF).validated);
  await advance(world, target, 'validated', [...validated(september), ...validated(october)]);
  const plan = planCases(october, new Map(), settings, GENERATED_AS_OF);
  const pursuit = pursuitCost(settings.pursuit);
  const materiality = centsToString(settings.caseMaterialityCents);
  const replaced = new Map(
    (await owner.query<{ id: string; service_line_id: string }>('SELECT id, service_line_id FROM priced_line WHERE pricing_run_id = $1', [replacedRunId])).rows.map((row) => [row.service_line_id, row.id]),
  );
  const a1Pattern = (code: string) => (pattern: PatternKey) => pattern.plan_id === planOf.get('CE:SYNGEN-A1') && pattern.rate_record_id === a1.rateRecordIds[['97110', '97140', '97530'].indexOf(code)];
  const caseIds: string[] = [];
  let case97110: string | undefined;
  let case97530: string | undefined;
  for (const planned of plan.created) {
    const caseId = await openCaseAsOwner(world, target, planned.pattern, materiality, pursuit === null ? null : centsToString(pursuit));
    caseIds.push(caseId);
    // The first lines of the 97530 case are in it through the replaced run's pricing of them.
    const other = a1Pattern('97530')(planned.pattern) ? new Set(planned.lines.slice(0, 20).map((line) => line.serviceLineId)) : new Set<string>();
    const lines = planned.lines.map((line) => (other.has(line.serviceLineId) ? { ...line, pricedLineId: replaced.get(line.serviceLineId) as string } : line));
    await addCaseLines(world, target, caseId, lines);
    await advance(
      world,
      target,
      'actionable',
      lines.filter((line) => !line.windowPassed),
    );
    case97110 = a1Pattern('97110')(planned.pattern) ? caseId : case97110;
    case97530 = a1Pattern('97530')(planned.pattern) ? caseId : case97530;
  }
  if (case97110 === undefined || case97530 === undefined || !plan.created.some((planned) => planned.lines.some((line) => line.windowPassed)) || plan.held.length === 0) {
    throw new Error('the generated month lacks a case it is built to hold');
  }

  // September: its 97140 lines a case of their own (October's 97140 pattern is held, so no case of it is open), its
  // 97110 lines in October's 97110 case.
  const septemberValidated = validated(september);
  const of = (code: string) => septemberValidated.filter((line) => a1Pattern(code)(line.pattern));
  const septemberCase = await openCaseAsOwner(world, target, (of('97140')[0] as CandidateLine).pattern, materiality, null);
  caseIds.push(septemberCase);
  for (const [caseId, lines] of [
    [septemberCase, of('97140')],
    [case97110, of('97110')],
  ] as const) {
    const joining = lines.map((line) => ({ serviceLineId: line.serviceLineId, pricedLineId: line.pricedLineId, windowPassed: false }));
    await addCaseLines(world, target, caseId, joining);
    await advance(world, target, 'actionable', joining);
  }

  // Twenty of October's 97110 case lines written off by the billing manager: ten duplicates, ten not worth pursuit.
  const open = (await owner.query<{ id: string }>('SELECT cl.id FROM case_line cl JOIN priced_line p ON p.id = cl.priced_line_id WHERE cl.case_id = $1 AND p.pricing_run_id = $2 ORDER BY cl.service_line_id LIMIT 20', [case97110, runId])).rows;
  await asOwner(
    owner,
    [target.practiceId],
    () =>
      owner.query(
        `UPDATE case_line SET written_off_reason = CASE WHEN id = ANY ($2::uuid[]) THEN 'duplicate' ELSE 'not_worth_pursuit' END, written_off_by = $3
          WHERE id = ANY ($1::uuid[])`,
        [open.map((row) => row.id), open.slice(0, 10).map((row) => row.id), target.manager],
      ),
    target.manager,
  );

  // An anomaly of the run: five of G3's unpriced lines, flagged.
  const flagged = (
    await owner.query<{ service_line_id: string; payer_id: string; plan_id: string }>(
      `SELECT p.service_line_id, pl.payer_id, pl.id AS plan_id FROM priced_line p JOIN service_line l ON l.id = p.service_line_id JOIN plan pl ON pl.id = l.payer_plan_key
        WHERE p.pricing_run_id = $1 AND pl.plan_key = 'CE:SYNGEN-G3' AND p.unpriced_reason IS NOT NULL ORDER BY p.service_line_id LIMIT 5`,
      [runId],
    )
  ).rows;
  const cohort = flagged[0];
  if (cohort === undefined) {
    throw new Error('the generated month priced no line of G3 unpriced');
  }
  await asOwner(owner, [target.practiceId], () =>
    owner.query(
      `INSERT INTO anomaly (practice_id, pricing_run_id, cohort_key, cohort_size, modal_allowed_cents, stats, line_ids) VALUES ($1, $2, $3, $4, 4000, $5, $6)`,
      [
        target.practiceId,
        runId,
        JSON.stringify({ payer_id: cohort.payer_id, plan_id: cohort.plan_id, procedure_code: '97110', modifiers: ['GP'], place_of_service: '11', quarter: '2026-Q4' }),
        Math.max(flagged.length, Math.round(300 * scale)),
        JSON.stringify({ label: 'investigatory', flagged_lines: flagged.length, below_mode_lines: flagged.length, range_low_cents: '2000', range_high_cents: '2000' }),
        flagged.map((row) => row.service_line_id),
      ],
    ),
  );
  await advance(
    world,
    target,
    'flagged',
    flagged.map((row) => ({ serviceLineId: row.service_line_id, pricedLineId: null })),
  );
  await owner.query('ANALYZE line_status, case_line, "case", priced_line');
  return { practice: target, runId, replacedRunId, septemberRunId, lines: claims.filter((claim) => claim.serviceDate.startsWith('2026-10')).reduce((total, claim) => total + claim.lines.length, 0), caseIds };
}
