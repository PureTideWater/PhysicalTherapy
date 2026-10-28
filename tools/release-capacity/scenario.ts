import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import {
  EvidenceResolver,
  RATE_RECORD_FIELDS,
  type WorkflowContext,
  addRateRecord,
  approveRateRecordField,
  approveVersion,
  createContract,
  createDraftVersion,
  mapPlan,
  signOffVersion,
} from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, developmentMasterKey, documentObjectKey, provisionPracticeKey, withActor, withPracticeScope } from '@tp/db';
import { addMembership, asOwner, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import {
  type Claim,
  Random,
  SCALE_RELEASE_SHAPE,
  SCALE_THERAPY_CODES,
  SynthWorld,
  addDays,
  assertSyntheticX12,
  calendarDate,
  claim,
  documentFor835,
  dollars,
  envelopeOf,
  line,
  parseCalendarDate,
  postingExport,
  remittance,
  renderDocument,
  reversalOf,
  scaleCodes,
  scaleZips,
  singleTransactionFile,
} from '@tp/synth';
import { type Cents, cents } from '@tp/money';
import { DocumentStore, LocalSealedBytes } from '@tp/worker/documents';
import { createPricingRun } from '@tp/worker/pricing';

/**
 * The weekly real-size test's practices (audit #31; docs/adr/0071; tools/release-capacity/run.ts), all SYNTHETIC: what
 * each holds (pure, unit-tested in scenario.test.ts) and how the harness seeds it into the scratch database.
 *
 * - A, the measured period: 100,000 lines in claims of 1 to 6 lines, codes drawn from the scale release's first 400
 *   (the therapy codes half the time), every claim's lines on one or two dates so the claims hold same-date pairs,
 *   dates spread over 2026-Q1 to Q4 so the keyed read fetches several quarters per code; half the claims under a plan
 *   mapped Medicare Advantage non-contracted (every Medicare flag on), half under a SYNTHETIC contract at 110% of
 *   Medicare; the practice's location a ZIP of the scale release.
 * - B, a 20,000-line period of the same shape, priced and triaged during setup, with an audit report requested as the
 *   report action requests one; its job runs in the concurrent phase.
 * - C, four SYNTHETIC 835s of 2,000 claims each, written by packages/synth's 835 writer and staged as intake leaves a
 *   clean upload (the document row, its sealed bytes in the worker's local document store, scanned); their parse_835
 *   jobs run in the concurrent phase, and a second set of four in the large jobs together.
 * - D and E, periods of A's shape (largeTogetherLines each; docs/adr/0083, D20): D's priced during setup and triaged in
 *   the large jobs together, E's priced there.
 * - A's reprocessing (step 7b; the ledger freeze exception granted 2026-10-27): once A is triaged, SYNTHETIC 835s that
 *   reverse each claim holding an actionable line and pay its correction, every actionable line at its expected amount
 *   (checks of REPROCESSING_CHECK_CLAIMS claims), and a SYNTHETIC posting export with one line-level row per
 *   actionable line, so A's reconcile approves and posts every one of them in one pass.
 *
 * A's and B's lines are bulk-inserted as the owner, in the shape of apps/worker/src/price/price.large.db.test.ts, with
 * the claim numbers sealed under the practice's own key as the parser seals them (the audit report opens them). Every
 * other row is written through the code the web writes it with: the practice's location through
 * practice_set_location() as the billing manager, the contract through @tp/contracts' services by the people the plan
 * names, the runs through createPricingRun() in the billing manager's scope, the report row with the report action's own
 * statement. Every identifier says SYNTHETIC or SYN; nothing comes from a customer file.
 */

/** The practices' shapes: the full test's, and a smoke run's (`--small`), which only proves the harness end to end. */
export interface ScenarioSize {
  /** Practice A's lines (the measured period). */
  readonly measuredLines: number;
  /** Practice B's lines (the report printed in the concurrent phase). */
  readonly reportLines: number;
  /** Practice C's 835s, and the claims each holds (each set: one in the concurrent phase, one in the large jobs together). */
  readonly remittances: number;
  readonly claimsPerRemittance: number;
  /** Practices D's and E's lines each (the large jobs together, D20). */
  readonly largeTogetherLines: number;
}

export const FULL_SIZE: ScenarioSize = { measuredLines: 100_000, reportLines: 20_000, remittances: 4, claimsPerRemittance: 2_000, largeTogetherLines: 100_000 };
export const SMALL_SIZE: ScenarioSize = { measuredLines: 2_000, reportLines: 500, remittances: 4, claimsPerRemittance: 50, largeTogetherLines: 2_000 };

/** The period A and B are priced for: every quarter of 2026. */
export const PERIOD = { from: '2026-01-01', to: '2026-12-31' } as const;

/** The codes A and B draw from: the scale release's first 400 (the twelve therapy codes, then 97000 up). */
export const CAPACITY_CODES: readonly string[] = scaleCodes(SCALE_RELEASE_SHAPE).slice(0, 400);

/** The practices' location: the scale release's first ZIP, which needs no ZIP+4 (its first split one is the sixth). */
export const CAPACITY_ZIP: string = (scaleZips(SCALE_RELEASE_SHAPE).find((zip) => !zip.plusFour) ?? { zip: '00100' }).zip;

/** The place-of-service settings every practice prices with, and the split the specialist approves. */
export const PLACE_OF_SERVICE = { '11': 'non_facility', '22': 'facility' } as const;
/**
 * Every practice's settings: the place-of-service split and rounding it prices with, and the ledger's (a posted entry
 * proves recovery; posting exports read with the SYNTHETIC PM EXPORT v1 template), for A's reconcile.
 */
export const SETTINGS = { place_of_service_settings: PLACE_OF_SERVICE, default_rounding: 'HALF_UP_CENT', proof_level: 'posted', posting_export_template: { template: 'synthetic_pm_export_v1' } } as const;

/**
 * The worker's command with a heap flag after `node` (#31's explicit heap limit; infra/lib/heap.ts): production's
 * worker command from tools/screening-capacity/containers.ts, which imports no heap constant (docs/adr/0071; B1).
 */
export function withHeapFlag(command: readonly string[], flag: string): string[] {
  if (command[0] !== 'node') {
    throw new RangeError('the command runs node');
  }
  if (!/^--max-old-space-size=\d+$/.test(flag) || command.some((word) => word.startsWith('--max-old-space-size'))) {
    throw new RangeError('one heap flag, --max-old-space-size=<MiB>');
  }
  return [command[0], flag, ...command.slice(1)];
}

export interface CapacityLine {
  readonly lineNo: number;
  readonly code: string;
  readonly modifiers: readonly string[];
  readonly units: number;
  /** YYYY-MM-DD. */
  readonly serviceDate: string;
}

export interface CapacityClaim {
  readonly claimNo: number;
  /** Under the plan mapped Medicare Advantage non-contracted; else under the SYNTHETIC contract's plan. */
  readonly medicareAdvantage: boolean;
  readonly lines: readonly CapacityLine[];
}

/**
 * A practice's claims, deterministic from `seed`, exactly `lines` lines in all: 1 to 6 lines a claim; one date, or two
 * days apart for one claim in three; a therapy code for each line half the time, else one of CAPACITY_CODES' other
 * 388; dates over the whole of PERIOD; every other claim under the Medicare Advantage plan.
 */
export function practiceClaims(lines: number, seed: string): CapacityClaim[] {
  const random = new Random(`tp-release-capacity/${seed}`);
  const first = calendarDate(2026, 1, 1);
  const claims: CapacityClaim[] = [];
  let left = lines;
  for (let claimNo = 1; left > 0; claimNo += 1) {
    const count = Math.min(left, random.int(1, 6));
    const day = random.int(0, 364);
    const dates = random.int(0, 2) === 0 ? [day, Math.min(364, day + random.int(1, 6))] : [day];
    claims.push({
      claimNo,
      medicareAdvantage: claimNo % 2 === 0,
      lines: Array.from({ length: count }, (_, index) => {
        const therapy = random.int(0, 1) === 0;
        const code = therapy ? (SCALE_THERAPY_CODES[random.int(0, SCALE_THERAPY_CODES.length - 1)] as string) : (CAPACITY_CODES[random.int(SCALE_THERAPY_CODES.length, CAPACITY_CODES.length - 1)] as string);
        return { lineNo: index + 1, code, modifiers: therapy ? ['GP'] : [], units: random.int(1, 3), serviceDate: addDays(first, dates[index % dates.length] ?? day) };
      }),
    });
    left -= count;
  }
  return claims;
}

/** The names a practice's rows carry, every one SYNTHETIC. */
export function practiceNames(label: string): { readonly payer: string; readonly payerId: string; readonly medicareAdvantagePlan: string; readonly contractPlan: string; readonly claimPrefix: string; readonly trace: string } {
  return {
    payer: `SYNTHETIC PAYER CAPACITY ${label}`,
    payerId: `2U:SYNCAP${label}`,
    medicareAdvantagePlan: `CE:SYNPLAN-CAPACITY-${label}-MA`,
    contractPlan: `CE:SYNPLAN-CAPACITY-${label}-COMM`,
    claimPrefix: `SYNCAP${label}`,
    trace: `SYNEFTCAP${label}0001`,
  };
}

/** Practice C's 835s: SYNTHETIC remittances of `claims` claims of 1 to 3 therapy lines each, dated in 2026. */
export function capacity835(index: number, claims: number): Buffer {
  const world = new SynthWorld(`tp-release-capacity/C/${String(index)}`);
  const payer = world.payer(`CAP${String(index)}`);
  const payee = world.payee('CAPC');
  const paymentDate = calendarDate(2026, 11, 2 + index);
  const built: Claim[] = Array.from({ length: claims }, (_, n) => {
    const date = addDays(calendarDate(2026, 1, 5), (index * 31 + n) % 300);
    return claim({
      patientControlNumber: `SYNPCNCAP${String(index)}${String(n + 1).padStart(5, '0')}`,
      payerClaimControlNumber: `SYNCCNCAP${String(index)}${String(n + 1).padStart(5, '0')}`,
      patient: world.patient(),
      renderingProvider: world.renderingProvider(),
      refs: [{ qualifier: 'CE', value: `SYNPLAN-CAPACITY-C-${String((n % 2) + 1)}` }],
      lines: Array.from({ length: 1 + (n % 3) }, (_, lineIndex) => {
        const code = SCALE_THERAPY_CODES[(n + lineIndex) % 5] ?? '97110';
        return line({ code, modifiers: ['GP'], units: String(1 + ((n + lineIndex) % 3)), charge: dollars('120.00'), allowed: dollars('80.00'), patientShare: [{ reason: '2', amount: dollars('16.00') }], dates: { kind: 'single', date } });
      }),
    });
  });
  const remit = remittance({ payer, payee, claims: built, paymentDate, trace: `SYNEFTCAPC${String(index).padStart(4, '0')}`, originatorId: world.originatorId(`C${String(index)}`) }, world);
  const bytes = Buffer.from(renderDocument(documentFor835(singleTransactionFile(remit, { isa13: 710_000 + index, date: paymentDate })), { lineEnding: '\n' }), 'latin1');
  assertSyntheticX12(bytes, `release-capacity C ${String(index)}`);
  return bytes;
}

/** The claims of a reprocessing check (step 7b): small, as a payer's checks are, since a line-level posting row is matched among its check's claims. */
export const REPROCESSING_CHECK_CLAIMS = 20;
/** Checks per reprocessing 835: each file one interchange of this many transactions, one parse_835 job. */
export const REPROCESSING_CHECKS_PER_FILE = 100;
/** The date A's reprocessing pays and posts: the original remittance's (insertClaims), the reprocessing loaded after it. */
export const REPROCESSING_PAID_ON = '2026-12-31';

/** An actionable line's key in `expected`: its claim's number and its line number. */
export const lineKey = (claimNo: number, lineNo: number): string => `${String(claimNo)}:${String(lineNo)}`;

/** A claim's number as insertClaims seals it (also its patient control number's body). */
export const claimNumber = (label: string, claimNo: number): string => `${practiceNames(label).claimPrefix}${String(claimNo).padStart(7, '0')}`;

/** A line as insertClaims wrote it: charged 100.00, allowed 50.00, the patient's 10.00 (PR 2), paid 40.00. */
const ORIGINAL_LINE = { charge: dollars('100.00'), allowed: dollars('50.00'), patientShare: dollars('10.00') } as const;

export interface Reprocessing {
  /** The 835s, each one interchange of up to REPROCESSING_CHECKS_PER_FILE checks. */
  readonly files: readonly Buffer[];
  /** The posting export: one line-level row per actionable line (its correction's payment, code and date). */
  readonly postingExport: string;
  /** The actionable lines it pays and posts. */
  readonly lines: number;
}

/**
 * A's reprocessing (step 7b), deterministic from the claims insertClaims wrote: for each claim holding an actionable
 * line (`expected`, by lineKey, its expected allowed amount in cents), its reversal (status 22, every amount negated) and
 * its correction (frequency 7, naming it in REF F8, the same patient control number), whose actionable lines are allowed
 * and paid their expected amount and whose other lines are as the original paid them. Checks of
 * REPROCESSING_CHECK_CLAIMS claims, each its own payment (trace); the posting export posts each actionable line from
 * its own row. Every identifier SYNTHETIC.
 */
export function reprocessing(label: string, claims: readonly CapacityClaim[], expected: ReadonlyMap<string, bigint>): Reprocessing {
  const world = new SynthWorld(`tp-release-capacity/${label}/reprocessing`);
  const names = practiceNames(label);
  const payer = { ...world.payer(`CAPACITY ${label}`), name: names.payer, refs: [{ qualifier: '2U', value: names.payerId.slice('2U:'.length) }] };
  const payee = world.payee(`CAP${label}`);
  const patient = world.patient();
  const provider = world.renderingProvider();
  const paidOn = parseCalendarDate(REPROCESSING_PAID_ON);
  const touched = claims.filter((entry) => entry.lines.some((item) => expected.has(lineKey(entry.claimNo, item.lineNo))));
  const checks: { trace: string; claims: Claim[] }[] = [];
  const rows: Parameters<typeof postingExport>[0][number][] = [];
  for (let start = 0; start < touched.length; start += REPROCESSING_CHECK_CLAIMS) {
    const trace = `${names.trace.slice(0, -4)}R${String(checks.length + 1).padStart(5, '0')}`;
    const built: Claim[] = [];
    for (const entry of touched.slice(start, start + REPROCESSING_CHECK_CLAIMS)) {
      const number = claimNumber(label, entry.claimNo);
      const plan = { qualifier: 'CE', value: (entry.medicareAdvantage ? names.medicareAdvantagePlan : names.contractPlan).slice('CE:'.length) };
      const filingIndicator = entry.medicareAdvantage ? '16' : '12';
      const dates = (item: CapacityLine) => ({ kind: 'single' as const, date: parseCalendarDate(item.serviceDate) });
      const original = claim({
        patientControlNumber: `SYNPCN${number}`,
        payerClaimControlNumber: number,
        filingIndicator,
        patient,
        renderingProvider: provider,
        refs: [plan],
        lines: entry.lines.map((item) =>
          line({ code: item.code, modifiers: [...item.modifiers], units: String(item.units), charge: ORIGINAL_LINE.charge, allowed: ORIGINAL_LINE.allowed, patientShare: [{ reason: '2', amount: ORIGINAL_LINE.patientShare }], dates: dates(item) }),
        ),
      });
      const corrected = claim({
        patientControlNumber: `SYNPCN${number}`,
        payerClaimControlNumber: `${number}R`,
        filingIndicator,
        frequencyCode: '7',
        patient,
        renderingProvider: provider,
        refs: [plan, { qualifier: 'F8', value: number }],
        lines: entry.lines.map((item) => {
          const amount = expected.get(lineKey(entry.claimNo, item.lineNo));
          if (amount === undefined) {
            return line({ code: item.code, modifiers: [...item.modifiers], units: String(item.units), charge: ORIGINAL_LINE.charge, allowed: ORIGINAL_LINE.allowed, patientShare: [{ reason: '2', amount: ORIGINAL_LINE.patientShare }], dates: dates(item) });
          }
          const allowed: Cents = cents(amount);
          rows.push({ postedOn: paidOn, checkOrTrace: trace, payerName: names.payer, claimReference: `SYNPCN${number}`, procedureCode: item.code, serviceDate: parseCalendarDate(item.serviceDate), amount: allowed, batch: `SYNBATCH-CAP${label}` });
          return line({ code: item.code, modifiers: [...item.modifiers], units: String(item.units), charge: allowed > ORIGINAL_LINE.charge ? allowed : ORIGINAL_LINE.charge, allowed, dates: dates(item) });
        }),
      });
      built.push(reversalOf(original), corrected);
    }
    checks.push({ trace, claims: built });
  }
  const files: Buffer[] = [];
  for (let start = 0; start < checks.length; start += REPROCESSING_CHECKS_PER_FILE) {
    const isa13 = 720_000 + files.length + 1;
    const remittances = checks.slice(start, start + REPROCESSING_CHECKS_PER_FILE).map((check) => remittance({ payer, payee, claims: check.claims, paymentDate: paidOn, trace: check.trace, originatorId: world.originatorId(`R${label}`) }, world));
    const bytes = Buffer.from(renderDocument(documentFor835({ interchanges: [envelopeOf(remittances, { isa13, date: paidOn })] }), { lineEnding: '\n' }), 'latin1');
    assertSyntheticX12(bytes, `release-capacity ${label} reprocessing ${String(files.length + 1)}`);
    files.push(bytes);
  }
  return { files, postingExport: postingExport(rows), lines: rows.length };
}

/** A seeded practice: its ID, its billing manager and its key. */
export interface SeededPractice {
  readonly label: string;
  readonly practiceId: string;
  readonly manager: string;
  readonly cipher: PracticeCipher;
}

/** The connections the seeding uses: the owner (bulk rows, as the large pricing test does) and the application login. */
export interface Seeding {
  readonly owner: DatabaseClient;
  readonly app: DatabasePool;
  /** The worker's local document store as the harness sees it (DOCUMENTS_DIR's host side). */
  readonly documentsDir: string;
}

/** The contract specialist who approves the place-of-service split and abstracts the contracts. */
export async function specialist(seeding: Seeding): Promise<string> {
  const { owner } = seeding;
  const internal = await createOrganization(owner, 'internal', 'capacity');
  const id = await createUser(owner, { hardwareKeyRequired: true });
  await addMembership(owner, internal, id, 'contract_specialist');
  await withActor(seeding.app, id, (scope) => scope.client.query('SELECT console_approve_place_of_service_split($1)', [JSON.stringify(PLACE_OF_SERVICE)]));
  return id;
}

/**
 * A SYNTHETIC practice: its tenant world, its data key under the harness's master key (the worker's TP_LOCAL_MASTER_KEY),
 * its settings, a billing manager, the specialist's support grant, and its location set to CAPACITY_ZIP by the billing
 * manager, as the Pricing settings page sets it.
 */
export async function seedPractice(seeding: Seeding, label: string, specialistId: string): Promise<SeededPractice> {
  const { owner } = seeding;
  const world = await createTenantWorld(owner, `capacity ${label}`);
  const key = await provisionPracticeKey(new LocalKeyProvider(developmentMasterKey()), world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1, settings = $3 WHERE id = $2', [key.dataKeyRef, world.practiceId, JSON.stringify(SETTINGS)]);
  const manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
  await asOwner(owner, [world.practiceId], () =>
    owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'SYN-CAPACITY', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [world.practiceId, specialistId]),
  );
  await withPracticeScope(seeding.app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) => scope.client.query('SELECT practice_set_location($1, $2, NULL)', [world.practiceId, CAPACITY_ZIP]));
  return { label, practiceId: world.practiceId, manager, cipher: key.cipher };
}

/** Claims written per statement. */
const CLAIMS_PER_INSERT = 2_000;

/**
 * Bulk-inserts a practice's claims as the owner: a loaded 835 document, its payer, the two plans, a patient, one
 * remittance, the claims (their numbers sealed under the practice's key) and lines, and a PR adjustment per line; then
 * ANALYZE, as autovacuum would leave the statistics after a load of this size.
 */
export async function insertClaims(seeding: Seeding, practice: SeededPractice, claims: readonly CapacityClaim[]): Promise<void> {
  const { owner } = seeding;
  const names = practiceNames(practice.label);
  const { practiceId, cipher } = practice;
  await asOwner(owner, [practiceId], async () => {
    const one = async (sql: string, values: unknown[]) => ((await owner.query<{ id: string }>(sql, values)).rows[0] as { id: string }).id;
    const document = await one(
      "INSERT INTO source_document (practice_id, kind, size_bytes, content_type, uploaded_by, sha256, scan_status, scan_at, status) VALUES ($1, 'x12_835', 1, 'application/octet-stream', $2, $3, 'clean', now(), 'loaded') RETURNING id",
      [practiceId, practice.manager, createHash('sha256').update(`SYNTHETIC capacity ${practice.label}`).digest('hex')],
    );
    const payer = await one('INSERT INTO payer (practice_id, payer_id_raw, name_raw) VALUES ($1, $2, $3) RETURNING id', [practiceId, names.payerId, names.payer]);
    const ma = await one('INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, $3) RETURNING id', [practiceId, payer, names.medicareAdvantagePlan]);
    const commercial = await one('INSERT INTO plan (practice_id, payer_id, plan_key) VALUES ($1, $2, $3) RETURNING id', [practiceId, payer, names.contractPlan]);
    const patient = await one('INSERT INTO patient_ref (practice_id, pseudonym) VALUES ($1, $2) RETURNING id', [practiceId, cipher.lookupHash('patient_ref.pseudonym', `SYNTHETIC PATIENT CAPACITY ${practice.label}`)]);
    const remittanceId = await one(
      `INSERT INTO remittance (practice_id, source_document_id, sender_id, receiver_id, isa13, gs06, st02, trn02, trn03, bpr02_cents, bpr_credit_debit, bpr_method, bpr16_date,
         payer_name, payer_id, payee_npi, payee_id_qualifier, claim_count, plb_total_cents)
       VALUES ($1, $2, 'SYNTHSENDER', 'SYNTHRECEIVER', '000000001', '1', '0001', $3, '1SYN00000C', 0, 'C', 'ACH', '2026-12-31', $4, $5, '9900000001', 'XX', $6, 0)
       RETURNING id`,
      [practiceId, document, names.trace, names.payer, payer, claims.length],
    );
    for (let start = 0; start < claims.length; start += CLAIMS_PER_INSERT) {
      const chunk = claims.slice(start, start + CLAIMS_PER_INSERT);
      const numbers = chunk.map((entry) => `${names.claimPrefix}${String(entry.claimNo).padStart(7, '0')}`);
      const dates = chunk.map((entry) => entry.lines.map((item) => item.serviceDate).sort());
      await owner.query(
        `INSERT INTO claim (practice_id, remittance_id, claim_no, patient_control_number, payer_claim_control_number, payer_claim_control_number_hash, claim_status_code,
           charge_cents, paid_cents, patient_resp_cents, filing_indicator, patient_ref_id, service_from, service_to)
         SELECT $1, $2, x.claim_no, x.pcn, x.ccn, x.ccn_hash, '1', x.lines * 10000, x.lines * 4000, x.lines * 1000, CASE WHEN x.ma THEN '16' ELSE '12' END, $3, x.service_from, x.service_to
           FROM unnest($4::int[], $5::text[], $6::text[], $7::text[], $8::int[], $9::boolean[], $10::date[], $11::date[]) AS x (claim_no, pcn, ccn, ccn_hash, lines, ma, service_from, service_to)`,
        [
          practiceId,
          remittanceId,
          patient,
          chunk.map((entry) => entry.claimNo),
          numbers.map((number) => cipher.encrypt('claim.patient_control_number', `SYNPCN${number}`)),
          numbers.map((number) => cipher.encrypt('claim.payer_claim_control_number', number)),
          numbers.map((number) => cipher.lookupHash('claim.payer_claim_control_number', number)),
          chunk.map((entry) => entry.lines.length),
          chunk.map((entry) => entry.medicareAdvantage),
          dates.map((list) => list[0]),
          dates.map((list) => list.at(-1)),
        ],
      );
      const lines = chunk.flatMap((entry) => entry.lines.map((item) => ({ ...item, claimNo: entry.claimNo, plan: entry.medicareAdvantage ? ma : commercial })));
      await owner.query(
        `INSERT INTO service_line (practice_id, claim_id, line_no, procedure_qualifier, procedure_code, modifiers, charge_cents, paid_cents, units, service_date, place_of_service,
           observed_allowed_cents, observed_allowed_basis, patient_share_cents, payer_plan_key)
         SELECT $1, c.id, x.line_no, 'HC', x.code, CASE WHEN x.therapy THEN '{GP}'::text[] ELSE '{}'::text[] END, 10000, 4000, x.units, x.service_date, '11', 5000, 'paid_plus_pr', 1000, x.plan
           FROM unnest($3::int[], $4::int[], $5::text[], $6::boolean[], $7::int[], $8::date[], $9::uuid[]) AS x (claim_no, line_no, code, therapy, units, service_date, plan)
           JOIN claim c ON c.practice_id = $1 AND c.remittance_id = $2 AND c.claim_no = x.claim_no`,
        [
          practiceId,
          remittanceId,
          lines.map((item) => item.claimNo),
          lines.map((item) => item.lineNo),
          lines.map((item) => item.code),
          lines.map((item) => item.modifiers.includes('GP')),
          lines.map((item) => item.units),
          lines.map((item) => item.serviceDate),
          lines.map((item) => item.plan),
        ],
      );
    }
    await owner.query(
      `INSERT INTO adjustment (practice_id, claim_id, service_line_id, group_code, reason_code, amount_cents, position)
       SELECT l.practice_id, l.claim_id, l.id, 'PR', '2', 1000, l.line_no FROM service_line l WHERE l.practice_id = $1`,
      [practiceId],
    );
  });
  await owner.query('ANALYZE claim, service_line, adjustment, plan, payer');
}

/** A term at a percentage of the current Medicare fee schedule, the flags left to the contract's defaults (off). */
const termsAt = (percentage: string) => ({
  scope: {},
  method: 'PERCENT_OF_MEDICARE',
  parameters: { percentage, year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
  flags: { timed_units_rule: 'PER_CODE' },
});
const quoteAt = (percentage: string) => `Every covered service is paid at ${percentage}% of the Medicare fee schedule`;

/**
 * A's and B's plans mapped: the Medicare Advantage plan non-contracted, the other to a SYNTHETIC contract at 110% of
 * Medicare, drafted and signed off by the billing manager and abstracted and approved by the specialist through
 * @tp/contracts' services, its quote on a SYNTHETIC PDF's page.
 */
export async function mapPlans(seeding: Seeding, practice: SeededPractice, specialistId: string): Promise<void> {
  const { owner } = seeding;
  const names = practiceNames(practice.label);
  const { practiceId } = practice;
  const documentId = randomUUID();
  const pdf = syntheticPdf([
    ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.'],
    ['SYNTHETIC EXHIBIT A FEE SCHEDULE', quoteAt('110')],
  ]);
  const ids = await asOwner(owner, [practiceId], async () => {
    await owner.query(
      `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
       VALUES ($1, $2, 'contract', $3, $4, 'application/pdf', $5, 'clean', now(), 'stored')`,
      [documentId, practiceId, createHash('sha256').update(pdf).digest('hex'), pdf.length, practice.manager],
    );
    const plan = async (key: string) => (await owner.query<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [practiceId, key])).rows[0]?.id ?? '';
    const payer = (await owner.query<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 AND payer_id_raw = $2', [practiceId, names.payerId])).rows[0]?.id ?? '';
    return { payer, medicareAdvantage: await plan(names.medicareAdvantagePlan), contract: await plan(names.contractPlan) };
  });
  const as = <T>(actorId: string, run: (context: WorkflowContext) => Promise<T>) =>
    withPracticeScope(seeding.app, { actorId, practiceIds: [practiceId] }, (scope) =>
      run({ scope, requestId: `release-capacity-${randomUUID()}`, evidence: new EvidenceResolver({ pages: documentPages({ read: () => Promise.resolve({ bytes: pdf, contentType: 'application/pdf' }) }) }) }),
    );
  const versionId = await as(practice.manager, async (context) => {
    const contract = await createContract(context, { practiceId, payerId: ids.payer, title: 'SYNTHETIC CAPACITY AGREEMENT' });
    return (await createDraftVersion(context, { practiceId, contractId: contract.contractId, effectiveFrom: PERIOD.from, effectiveTo: null, sourceDocumentIds: [documentId] })).versionId;
  });
  await as(specialistId, async (context) => {
    const { rateRecordId } = await addRateRecord(context, { practiceId, versionId, terms: termsAt('110'), citation: { documentId, page: 2, quote: quoteAt('110') } });
    for (const field of RATE_RECORD_FIELDS) {
      await approveRateRecordField(context, { practiceId, rateRecordId, field });
    }
    await approveVersion(context, { practiceId, versionId });
  });
  await as(practice.manager, async (context) => {
    await signOffVersion(context, { practiceId, versionId });
    await mapPlan(context, { practiceId, planId: ids.medicareAdvantage, kind: 'ma_noncontracted', contractVersionId: null, effectiveFrom: PERIOD.from });
    await mapPlan(context, { practiceId, planId: ids.contract, kind: 'contract', contractVersionId: versionId, effectiveFrom: PERIOD.from });
  });
}

/**
 * Stages one of C's 835s as intake leaves a clean upload waiting for its parse (apps/worker/src/price/test-support/
 * pricing-world.ts, stage()): the document row in the billing manager's scope, its bytes sealed under the practice's key
 * in the worker's local document store, then hashed, scanned clean and marked scanned as the intake job records it.
 * Returns the document's ID, for its parse_835 job.
 */
export async function stage835(seeding: Seeding, practice: SeededPractice, content: Buffer): Promise<string> {
  const id = randomUUID();
  await withPracticeScope(seeding.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', $3, 'application/octet-stream', $4)", [
      id,
      practice.practiceId,
      content.length,
      practice.manager,
    ]),
  );
  await new DocumentStore(new LocalSealedBytes(seeding.documentsDir)).write(practice.cipher, documentObjectKey(practice.practiceId, id), Readable.from([content]));
  await asOwner(seeding.owner, [practice.practiceId], () =>
    seeding.owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
  );
  return id;
}

/** A run of PERIOD under the release, created in the billing manager's scope as the Pricing runs page creates one. */
export async function createRun(seeding: Seeding, practice: SeededPractice, releaseNo: number): Promise<string> {
  const created = await withPracticeScope(seeding.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    createPricingRun(scope, { practiceId: practice.practiceId, periodFrom: PERIOD.from, periodTo: PERIOD.to, releaseNo, requestId: `release-capacity-${randomUUID()}` }),
  );
  return created.pricingRunId;
}

/** An audit report of the run, requested in the billing manager's scope with the report action's own statement (apps/web/src/lib/routes/reports.ts). */
export async function requestReport(seeding: Seeding, practice: SeededPractice, runId: string): Promise<string> {
  const id = randomUUID();
  await withPracticeScope(seeding.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query('INSERT INTO audit_report (id, practice_id, pricing_run_id, requested_by) VALUES ($1, $2, $3, app_actor_id())', [id, practice.practiceId, runId]),
  );
  return id;
}

/** A's actionable lines after its triage, by lineKey (claim number and line number), each with its expected allowed amount (step 7b). */
export async function actionableLines(seeding: Seeding, practice: SeededPractice, runId: string): Promise<Map<string, bigint>> {
  const { owner } = seeding;
  const { rows } = await asOwner(owner, [practice.practiceId], () =>
    owner.query<{ claim_no: number; line_no: number; expected: string }>(
      `SELECT c.claim_no, l.line_no, p.expected_allowed_cents::text AS expected
         FROM case_line cl JOIN service_line l ON l.id = cl.service_line_id JOIN claim c ON c.id = l.claim_id
         JOIN priced_line p ON p.service_line_id = l.id AND p.pricing_run_id = $2
        WHERE cl.practice_id = $1 AND p.expected_allowed_cents IS NOT NULL`,
      [practice.practiceId, runId],
    ),
  );
  return new Map(rows.map((row) => [lineKey(row.claim_no, row.line_no), BigInt(row.expected)]));
}

/**
 * A posting export staged as intake leaves a clean one waiting for its reconcile (apps/worker/src/reconcile/test-support/
 * ledger-world.ts, stageExport()): the document row in the billing manager's scope, its bytes sealed under the
 * practice's key in the worker's local document store, hashed, scanned clean and stored. Returns its ID, for the
 * reconcile job that intake queues for it.
 */
export async function stagePostingExport(seeding: Seeding, practice: SeededPractice, content: string): Promise<string> {
  const id = randomUUID();
  const bytes = Buffer.from(content, 'utf8');
  await withPracticeScope(seeding.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'posting_export', $3, 'text/csv', $4)", [
      id,
      practice.practiceId,
      bytes.length,
      practice.manager,
    ]),
  );
  await new DocumentStore(new LocalSealedBytes(seeding.documentsDir)).write(practice.cipher, documentObjectKey(practice.practiceId, id), Readable.from([bytes]));
  await asOwner(seeding.owner, [practice.practiceId], () =>
    seeding.owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'stored' WHERE id = $1", [id, createHash('sha256').update(bytes).digest('hex')]),
  );
  return id;
}
