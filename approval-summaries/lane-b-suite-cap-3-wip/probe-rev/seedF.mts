// SUITE-CAP-3 review: seeds SUITE-CAP-1b's step-7b practice F (tools/release-capacity/scenario.ts at cc3dd7f6) alone,
// into a database migrated from empty, through the job code: F's claims are the scenario's own (reconcileClaims(N):
// 1 to 6 lines a claim, one date or two, dates over 2026, one patient control number a claim), each line's code mapped
// onto a code SYNTHETIC release 900001 carries (distinct within a claim; the scale release is not loaded here), the
// original 835s (ORIGINAL_LINE: charged 100.00, allowed 50.00, PR 10.00) loaded by the parse_835 job, F's contract as
// the scenario abstracts it (FIXED_RATE: one rate record, every covered service at 100.00 a unit, its window cited and
// verified), so triage puts every line in ONE case, then the scenario's own reprocessing() (each claim's reversal and
// correction, every actionable line allowed and paid its expected amount, checks of 20 claims, 100 checks a file)
// loaded by the parse job, and its posting export (one line-level row per actionable line) written to OUT. Statistics
// as the harness leaves them where step 7b queues F's reconcile: every table analyzed but the ledger tables, posting_row,
// eft_row, case and remittance (never analyzed). The database is renamed cap3_f_<N>_seed.
//
// With `x`, the other tenants of the harness's database are there too, as step 7b finds them: practices A (100,000
// lines), B (20,000), D and E (100,000 each), their claims bulk-inserted by the scenario's own insertClaims (claim,
// service_line, adjustment, then ANALYZE as it does; not priced or triaged here: the scale release is not loaded), so
// the planner's statistics on the claim tables are the harness's size; the database is then cap3_fx_<N>_seed.
//
// Usage: TP_REPO=<checkout> ADMIN_URL=<postgres url> OUT=<dir> node --import tsx seedF.mts <N> [x]
// Prints IDs, counts and times only.
import { mkdirSync, writeFileSync } from 'node:fs';

import { REPO, dbUrl, repo } from './common.mts';

const N = Number.parseInt(process.argv[2] ?? '', 10);
const OTHERS = process.argv[3] === 'x';
const ADMIN_URL = process.env.ADMIN_URL ?? '';
const OUT = process.env.OUT ?? '';
if (!Number.isInteger(N) || ADMIN_URL === '' || OUT === '') {
  throw new Error('usage: seedF.mts <N>, with TP_REPO, ADMIN_URL and OUT set');
}
const db = await repo('packages/db/src/index.ts');
const testing = await repo('packages/db/src/testing.ts');
const synth = await repo('packages/synth/src/index.ts');
const scenario = await repo('tools/release-capacity/scenario.ts');
db.LocalKeyProvider.random = () => new db.LocalKeyProvider(db.developmentMasterKey());
const { LedgerWorld, ledSettings } = await repo('apps/worker/src/reconcile/test-support/ledger-world.ts');

const started = performance.now();
const say = (what: string) => process.stdout.write(`${((performance.now() - started) / 1000).toFixed(1)} s ${what}\n`);

/** Release 900001's timed therapy codes; a claim's lines take distinct ones. */
const RELEASE_CODES = ['97110', '97112', '97116', '97140', '97530', '97035', '97026'] as const;
const LABEL = scenario.RECONCILE_PRACTICE as string;
const claims = (scenario.reconcileClaims(N) as any[]).map((entry) => ({
  ...entry,
  lines: entry.lines.map((item: any, index: number) => ({ ...item, code: RELEASE_CODES[(entry.claimNo * 3 + index) % RELEASE_CODES.length], modifiers: ['GP'] })),
}));
const names = scenario.practiceNames(LABEL);
const PAID = scenario.REPROCESSING_PAID_ON as string;
// One check holding every claim, as insertClaims writes one remittance (claim_no is then the scenario's claimNo).
const CLAIMS_PER_ORIGINAL_FILE = Number.MAX_SAFE_INTEGER;

// The same parties the scenario's reprocessing() draws (its world, in its order), so the originals carry them too.
const world = new synth.SynthWorld(`tp-release-capacity/${LABEL}/reprocessing`);
const payer = { ...world.payer(`CAPACITY ${LABEL}`), name: names.payer, refs: [{ qualifier: '2U', value: names.payerId.slice('2U:'.length) }] };
const payee = world.payee(`CAP${LABEL}`);
const patient = world.patient();
const provider = world.renderingProvider();
const plan = { qualifier: 'CE', value: names.contractPlan.slice('CE:'.length) };
const original = (entry: any) => {
  const number = scenario.claimNumber(LABEL, entry.claimNo);
  return synth.claim({
    patientControlNumber: `SYNPCN${number}`,
    payerClaimControlNumber: number,
    filingIndicator: '12',
    patient,
    renderingProvider: provider,
    refs: [plan],
    lines: entry.lines.map((item: any) =>
      synth.line({ code: item.code, modifiers: [...item.modifiers], units: String(item.units), charge: scenario.ORIGINAL_LINE.charge, allowed: scenario.ORIGINAL_LINE.allowed, patientShare: [{ reason: '2', amount: scenario.ORIGINAL_LINE.patientShare }], dates: { kind: 'single', date: synth.parseCalendarDate(item.serviceDate) } }),
    ),
  });
};
const render = (remittances: unknown[], isa13: number) => {
  const bytes = Buffer.from(synth.renderDocument(synth.documentFor835({ interchanges: [synth.envelopeOf(remittances, { isa13, date: synth.parseCalendarDate(PAID) })] }), { lineEnding: '\n' }), 'latin1');
  synth.assertSyntheticX12(bytes, 'suite-cap-3 review F');
  return bytes;
};

const w = await LedgerWorld.open(ADMIN_URL);
const scratchName: string = w.triage.pricing.database.name;
say(`database migrated and release loaded (${scratchName})`);
const practice = await w.practice('CAP3 SYNTHETIC REVIEW F', ledSettings('posted'));
const { parseHandler } = await repo('apps/worker/src/parse/job.ts');
const parse = parseHandler(w.triage.pricing.parseServices);
const load = async (bytes: Buffer) => {
  const documentId = await w.triage.pricing.stage(practice, 'suite-cap-3-f', bytes);
  await parse({ practice_id: practice.practiceId, document_id: documentId }, w.jobContext(practice));
};
for (let first = 0, file = 0; first < claims.length; first += CLAIMS_PER_ORIGINAL_FILE, file += 1) {
  const built = claims.slice(first, first + CLAIMS_PER_ORIGINAL_FILE).map(original);
  const remit = synth.remittance({ payer, payee, claims: built, paymentDate: synth.parseCalendarDate(PAID), trace: `${names.trace.slice(0, -4)}O${String(file + 1).padStart(5, '0')}`, originatorId: world.originatorId(`O${LABEL}`) }, world);
  await load(render([remit], 710_000 + file + 1));
}
say(`original 835s loaded: ${String(claims.length)} claims, ${String(N)} lines`);
// F's contract as mapPlans abstracts it at FIXED_RATE: one rate record (scope {}), so one pattern and one case.
const contract = await (w.triage as any).contractWith(practice, { effectiveFrom: '2026-01-01', disputeWindowDays: scenario.CONTRACT_DISPUTE_WINDOW.days }, [scenario.FIXED_RATE.quote], [{ terms: scenario.FIXED_RATE.terms, quote: scenario.FIXED_RATE.quote }]);
const runId = await w.triage.pricedRun(practice, { plans: [{ key: names.contractPlan, versionId: contract.versionId }], from: scenario.PERIOD.from, to: scenario.PERIOD.to });
say('priced');
await w.triage.triage(practice, runId);
const count = async (sql: string) => Number((await w.rows(practice, sql))[0]?.n ?? -1);
const caseLines = await count('SELECT count(*)::int AS n FROM case_line');
const cases = await count('SELECT count(*)::int AS n FROM "case"');
const actionable = await count("SELECT count(*)::int AS n FROM case_line cl WHERE (SELECT s.stage FROM line_status s WHERE s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'actionable'");
say(`triaged: ${String(cases)} case(s), ${String(caseLines)} case lines, ${String(actionable)} actionable`);
if (caseLines !== N || actionable !== N || cases !== 1) {
  throw new Error(`expected ${String(N)} actionable lines in one case`);
}
const expected = await scenario.actionableLines({ owner: w.owner }, { practiceId: practice.practiceId }, runId);
if (expected.size !== N) {
  throw new Error('the actionable lines do not key by the scenario claim numbers');
}
const reprocessed = scenario.reprocessing(LABEL, claims, expected);
for (const [index, file] of (reprocessed.files as Buffer[]).entries()) {
  await load(file);
  say(`reprocessing 835 ${String(index + 1)} of ${String(reprocessed.files.length)} loaded`);
}
const loadedClaims = await count('SELECT count(*)::int AS n FROM claim');
const superseded = await count('SELECT count(*)::int AS n FROM claim WHERE superseded_by_claim_id IS NOT NULL');
if (OTHERS) {
  for (const [label, lines] of [['A', 100_000], ['B', 20_000], ['D', 100_000], ['E', 100_000]] as const) {
    const other = await w.practice(`CAP3 SYNTHETIC OTHER ${label}`, ledSettings('posted'));
    await scenario.insertClaims({ owner: w.owner }, { label, practiceId: other.practiceId, manager: other.manager, cipher: other.cipher }, scenario.practiceClaims(lines, label));
    say(`other tenant ${label}: ${String(lines)} lines`);
  }
}
const name = `cap3_f${OTHERS ? 'x' : ''}_${String(N)}_seed`;
const dir = `${OUT}/${name}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/posting-export.csv`, reprocessed.postingExport);
const { rows: tables } = await w.owner.query(
  "SELECT format('%I', c.relname) AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname NOT IN ('ledger_entry', 'ledger_match', 'posting_row', 'eft_row', 'case', 'remittance')",
);
await w.owner.query(`ANALYZE ${tables.map((row: { t: string }) => row.t).join(', ')}`);
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
  spread: OTHERS ? 'F with the other tenants' : 'F',
  practiceId: practice.practiceId,
  managerId: practice.manager,
  claims: claims.length,
  loadedClaims,
  superseded,
  cases,
  postingRows: reprocessed.lines,
  reprocessingFiles: reprocessed.files.length,
  seedSeconds: Math.round((performance.now() - started) / 100) / 10,
  url: dbUrl(ADMIN_URL, name),
};
writeFileSync(`${dir}/meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
say(`seeded ${name}: ${String(claims.length)} original claims, ${String(loadedClaims)} claims, ${String(superseded)} superseded, ${String(reprocessed.lines)} posting rows`);
process.exit(0);
