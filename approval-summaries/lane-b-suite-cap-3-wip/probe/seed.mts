// SUITE-CAP-3 profile: seeds one SYNTHETIC practice for a reconcile pass of N case lines into a database migrated from
// empty, through the job code (as CAS-42.3 does): original 835s loaded by the parse_835 job, a fixed-schedule contract
// signed off, one run priced and triaged (every line short and actionable), then the reprocessing 835s (each claim's
// reversal and correction paying every line its expected amount, checks of 20 original claims as step 7b's) loaded by
// the parse job. The posting export (one line-level row per case line, as step 7b's) is written to OUT for the pass to
// stage. The database is then ANALYZEd and renamed cap3_<spread>_<N>_seed, the template every measured copy is made from.
//
// Usage: TP_REPO=<checkout> ADMIN_URL=<postgres url> OUT=<dir> node --import tsx seed.mts <N> <spread R|A>
// Prints IDs, counts and times only.
import { mkdirSync, writeFileSync } from 'node:fs';

import { REPO, dbUrl, repo } from './common.mts';

const N = Number.parseInt(process.argv[2] ?? '', 10);
const SPREAD = process.argv[3] ?? 'R';
const ADMIN_URL = process.env.ADMIN_URL ?? '';
const OUT = process.env.OUT ?? '';
if (!Number.isInteger(N) || N % 4 !== 0 || !['R', 'A'].includes(SPREAD) || ADMIN_URL === '' || OUT === '') {
  throw new Error('usage: seed.mts <N, a multiple of 4> <R|A>, with TP_REPO, ADMIN_URL and OUT set');
}

/** The denominators (README, "Shape"). */
const LINES_PER_CLAIM = 4; // as price.large
const CODES = ['97110', '97112', '97140', '97530', '97116'] as const; // the contract's schedule; each claim omits one
const CLAIMS_PER_PATIENT = 12; // one claim (visit) a date
const R_CLAIMS_PER_DAY = 20; // realistic: 20 short visits a day, so 16 claims of each code a date
const A_DAYS = 20; // adverse: the whole N in one month of 20 dates, so N/100 claims of each code a date
const CLAIMS_PER_ORIGINAL_FILE = 500; // 2,000 lines an original 835 (one check)
const CHECK_CLAIMS = 20; // step 7b's REPROCESSING_CHECK_CLAIMS
const CHECKS_PER_FILE = 100; // step 7b's REPROCESSING_CHECKS_PER_FILE
const ORIGINAL_PAID = '2026-09-30';
const REPROCESSING_PAID = '2026-10-15';
const PLAN = 'SYNPLAN-CAP3';

const db = await repo('packages/db/src/index.ts');
const testing = await repo('packages/db/src/testing.ts');
const synth = await repo('packages/synth/src/index.ts');
const money = await repo('packages/money/src/index.ts');
// Every practice key under the local development master key, so the measured pass (another process) opens the cipher.
db.LocalKeyProvider.random = () => new db.LocalKeyProvider(db.developmentMasterKey());
const { LedgerWorld, ledSettings } = await repo('apps/worker/src/reconcile/test-support/ledger-world.ts');

const started = performance.now();
const say = (what: string) => process.stdout.write(`${((performance.now() - started) / 1000).toFixed(1)} s ${what}\n`);

const claims = N / LINES_PER_CLAIM;
const dayOf = (claimNo: number) => (SPREAD === 'R' ? Math.floor(claimNo / R_CLAIMS_PER_DAY) : claimNo % A_DAYS);
const firstDay = SPREAD === 'R' ? '2026-01-01' : '2026-06-01';
const patientOf = (claimNo: number) => (SPREAD === 'R' ? Math.floor(dayOf(claimNo) / CLAIMS_PER_PATIENT) * R_CLAIMS_PER_DAY + (claimNo % R_CLAIMS_PER_DAY) : Math.floor(claimNo / CLAIMS_PER_PATIENT));
const pad = (n: number, width = 7) => String(n).padStart(width, '0');

const world = new synth.SynthWorld(`suite-cap-3/${SPREAD}/${String(N)}`);
const payer = world.payer('CAP3');
const payee = world.payee('CAP3');
const provider = world.renderingProvider();
const patients = new Map<number, unknown>();
const patientParty = (n: number) => {
  if (!patients.has(n)) {
    patients.set(n, world.patient());
  }
  return patients.get(n);
};
const d = synth.dollars;
const lineOf = (code: string, date: unknown, allowed: string) =>
  synth.line({ code, modifiers: ['GP'], units: '2', charge: d('150.00'), allowed: d(allowed), dates: { kind: 'single', date } });
const claimCodes = (claimNo: number) => CODES.filter((_, index) => index !== claimNo % CODES.length);
const serviceDate = (claimNo: number) => synth.addDays(synth.parseCalendarDate(firstDay), dayOf(claimNo));
const pcn = (claimNo: number) => `SYNPCNCAP3${pad(patientOf(claimNo))}`;
const ccn = (claimNo: number) => `SYNCCNCAP3${pad(claimNo)}`;
const originalClaim = (claimNo: number) =>
  synth.claim({
    patientControlNumber: pcn(claimNo),
    payerClaimControlNumber: ccn(claimNo),
    patient: patientParty(patientOf(claimNo)),
    renderingProvider: provider,
    refs: [{ qualifier: 'CE', value: PLAN }],
    lines: claimCodes(claimNo).map((code) => lineOf(code, serviceDate(claimNo), '70.00')),
  });
const render = (remittances: unknown[], isa13: number, date: string) => {
  const bytes = Buffer.from(synth.renderDocument(synth.documentFor835({ interchanges: [synth.envelopeOf(remittances, { isa13, date: synth.parseCalendarDate(date) })] }), { lineEnding: '\n' }), 'latin1');
  synth.assertSyntheticX12(bytes, 'suite-cap-3 profile');
  return bytes;
};

const w = await LedgerWorld.open(ADMIN_URL);
const scratchName: string = w.triage.pricing.database.name;
say(`database migrated and release loaded (${scratchName})`);
const practice = await w.practice('CAP3 SYNTHETIC PROFILE', ledSettings('posted'));
const { parseHandler } = await repo('apps/worker/src/parse/job.ts');
const parse = parseHandler(w.triage.pricing.parseServices);
const load = async (bytes: Buffer) => {
  const documentId = await w.triage.pricing.stage(practice, 'suite-cap-3', bytes);
  await parse({ practice_id: practice.practiceId, document_id: documentId }, w.jobContext(practice));
};

// The original payments.
for (let first = 0, file = 0; first < claims; first += CLAIMS_PER_ORIGINAL_FILE, file += 1) {
  const built = Array.from({ length: Math.min(CLAIMS_PER_ORIGINAL_FILE, claims - first) }, (_, index) => originalClaim(first + index));
  const remit = synth.remittance({ payer, payee, claims: built, paymentDate: synth.parseCalendarDate(ORIGINAL_PAID), trace: `SYNEFTCAP3O${pad(file, 5)}`, originatorId: world.originatorId('CAP3O') }, world);
  await load(render([remit], 810_000 + file, ORIGINAL_PAID));
}
say(`original 835s loaded: ${String(claims)} claims`);
const contract = await w.triage.fixedContract(practice, { schedule: CODES.map((code) => ({ code, amountCents: '5000' })), effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
const lastDay = synth.addDays(synth.parseCalendarDate(firstDay), SPREAD === 'R' ? dayOf(claims - 1) : A_DAYS - 1);
const runId = await w.triage.pricedRun(practice, { plans: [{ key: `CE:${PLAN}`, versionId: contract.versionId }], from: firstDay, to: String(lastDay) });
say('priced');
await w.triage.triage(practice, runId);
const count = async (sql: string) => Number((await w.rows(practice, sql))[0]?.n ?? -1);
const caseLines = await count("SELECT count(*)::int AS n FROM case_line");
const actionable = await count("SELECT count(*)::int AS n FROM case_line cl WHERE (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable'");
say(`triaged: ${String(caseLines)} case lines, ${String(actionable)} actionable`);
if (caseLines !== N || actionable !== N) {
  throw new Error(`expected ${String(N)} actionable case lines`);
}

// The reprocessing (step 7b's shape): each claim reversed and corrected, every line paid its expected 100.00.
const rows: unknown[] = [];
const checks: { trace: string; claims: unknown[] }[] = [];
for (let first = 0; first < claims; first += CHECK_CLAIMS) {
  const trace = `SYNEFTCAP3R${pad(checks.length + 1, 5)}`;
  const built: unknown[] = [];
  for (let claimNo = first; claimNo < Math.min(first + CHECK_CLAIMS, claims); claimNo += 1) {
    const corrected = synth.claim({
      patientControlNumber: pcn(claimNo),
      payerClaimControlNumber: `${ccn(claimNo)}R`,
      frequencyCode: '7',
      patient: patientParty(patientOf(claimNo)),
      renderingProvider: provider,
      refs: [{ qualifier: 'CE', value: PLAN }, { qualifier: 'F8', value: ccn(claimNo) }],
      lines: claimCodes(claimNo).map((code) => lineOf(code, serviceDate(claimNo), '100.00')),
    });
    built.push(synth.reversalOf(originalClaim(claimNo)), corrected);
    for (const code of claimCodes(claimNo)) {
      rows.push({ postedOn: synth.parseCalendarDate(REPROCESSING_PAID), checkOrTrace: trace, payerName: payer.name, claimReference: pcn(claimNo), procedureCode: code, serviceDate: serviceDate(claimNo), amount: money.cents(10000n), batch: 'SYNBATCH-CAP3' });
    }
  }
  checks.push({ trace, claims: built });
}
for (let start = 0, file = 0; start < checks.length; start += CHECKS_PER_FILE, file += 1) {
  const remittances = checks.slice(start, start + CHECKS_PER_FILE).map((check) => synth.remittance({ payer, payee, claims: check.claims, paymentDate: synth.parseCalendarDate(REPROCESSING_PAID), trace: check.trace, originatorId: world.originatorId('CAP3R') }, world));
  await load(render(remittances, 820_000 + file, REPROCESSING_PAID));
}
say(`reprocessing 835s loaded: ${String(checks.length)} checks`);
const loadedClaims = await count('SELECT count(*)::int AS n FROM claim');
const superseded = await count('SELECT count(*)::int AS n FROM claim WHERE superseded_by_claim_id IS NOT NULL');
const name = `cap3_${SPREAD.toLowerCase()}_${String(N)}_seed`;
const dir = `${OUT}/${name}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/posting-export.csv`, synth.postingExport(rows));
await w.owner.query('ANALYZE');
await testing.endPool(w.app);
await testing.endPool(w.triage.pricing.worker);
await w.owner.end();
const admin = db.databaseClient(ADMIN_URL);
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.query(`ALTER DATABASE ${scratchName} RENAME TO ${name}`);
await admin.end();
const meta = {
  name,
  repo: REPO,
  n: N,
  spread: SPREAD,
  practiceId: practice.practiceId,
  managerId: practice.manager,
  claims,
  loadedClaims,
  superseded,
  postingRows: rows.length,
  denominators: { LINES_PER_CLAIM, codes: CODES.length, codesPerClaim: CODES.length - 1, CLAIMS_PER_PATIENT, claimsPerDay: SPREAD === 'R' ? R_CLAIMS_PER_DAY : claims / A_DAYS, dates: SPREAD === 'R' ? Math.ceil(claims / R_CLAIMS_PER_DAY) : A_DAYS, claimsPerCodeDate: SPREAD === 'R' ? (R_CLAIMS_PER_DAY * 4) / 5 : (claims / A_DAYS) * (4 / 5), CHECK_CLAIMS, CHECKS_PER_FILE, CLAIMS_PER_ORIGINAL_FILE },
  seedSeconds: Math.round((performance.now() - started) / 100) / 10,
  url: dbUrl(ADMIN_URL, name),
};
writeFileSync(`${dir}/meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
say(`seeded ${name}: ${String(loadedClaims)} claims, ${String(superseded)} superseded, ${String(rows.length)} posting rows`);
process.exit(0);
