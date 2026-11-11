import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseRateTerms, windowRuleComputed } from '@tp/contracts';
import { cents } from '@tp/money';
import { type PricedLine, disputeWindow, indexRelease, price } from '@tp/pricing';
import { contractAgreement, lineFacts, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { readRecordFile } from '@tp/rules/content';
import { SCALE_RELEASE_SHAPE, SCALE_THERAPY_CODES, dollars, scaleCodes, scaleZips } from '@tp/synth';
import { DEFAULT_TRIAGE_SETTINGS, type DeadlineStatus, type TriageFacts, contractWindowRuleComputed, deadlineVerification, judgeLine, triageSettings } from '@tp/triage';
import { describe, expect, it } from 'vitest';

import { COMMANDS, WORKER_JOBS } from '../../infra/lib/constructs/compute';
import { heapFlag } from '../../infra/lib/heap';
import { repositoryRoot } from '../content-files';
import { SYNTHETIC_RELEASE_DIR } from '../release/synthetic';
import { SERVICE_COMMANDS, serviceCommand } from '../screening-capacity/containers';
import { HARNESS_LOGINS, type HarnessDirectories, workerEnvironment } from '../screening-capacity/env';
import {
  CAPACITY_CODES,
  CAPACITY_ZIP,
  CONTRACT_DISPUTE_WINDOW,
  FIXED_RATE,
  FIXED_UNIT_CENTS,
  FULL_SIZE,
  MEDICARE_RATE,
  ORIGINAL_LINE,
  PERIOD,
  RECONCILE_PRACTICE,
  REPROCESSING_CHECK_CLAIMS,
  REPROCESSING_CHECKS_PER_FILE,
  REPROCESSING_PAID_ON,
  SETTINGS,
  SMALL_SIZE,
  againstExpected,
  capacity835,
  claimNumber,
  contractPages,
  lineKey,
  practiceClaims,
  practiceNames,
  reconcileClaims,
  reprocessing,
  windowQuote,
  withHeapFlag,
} from './scenario';

/**
 * The weekly real-size test's worker and practices (audit #31; docs/adr/0071; docs/adr/0083; test matrix RCC-07 and
 * CAS-42.4): the worker runs
 * production's command with the heap flag after node, and production's environment; the practices hold the shapes the
 * design names, every identifier SYNTHETIC.
 */

const quarterOf = (date: string) => Math.floor((Number.parseInt(date.slice(5, 7), 10) - 1) / 3) + 1;

describe('the worker the test runs', () => {
  it('runs production’s worker command, with heapFlag("worker") after node and nothing else changed', () => {
    expect(SERVICE_COMMANDS.worker).toEqual(COMMANDS.worker);
    expect(serviceCommand('worker')).toEqual(COMMANDS.worker);
    expect(withHeapFlag(serviceCommand('worker'), heapFlag('worker'))).toEqual(['node', '--max-old-space-size=560', '--enable-source-maps', 'dist/main.js']);
    expect(SERVICE_COMMANDS.worker.some((word) => word.startsWith('--max-old-space-size'))).toBe(false);
  });

  it('refuses a command that is not node’s, a second heap flag, or a flag that is not one', () => {
    expect(() => withHeapFlag(['tsx', 'src/main.ts'], heapFlag('worker'))).toThrow(RangeError);
    expect(() => withHeapFlag(['node', '--max-old-space-size=256', 'dist/main.js'], heapFlag('worker'))).toThrow(RangeError);
    expect(() => withHeapFlag(['node', 'dist/main.js'], '--inspect')).toThrow(RangeError);
  });

  it('imports no heap constant from the screening harness, so infra/lib/heap.ts joins no watched closure (B1)', () => {
    for (const file of ['tools/screening-capacity/containers.ts', 'tools/screening-capacity/env.ts']) {
      expect(readFileSync(path.join(repositoryRoot, file), 'utf8'), file).not.toMatch(/from '[^']*infra\/lib\/heap'/);
    }
  });

  it('gives the worker production’s practice jobs on the worker’s own login and the queue login, never the operator’s or the application’s', () => {
    const dirs = Object.fromEntries(['outbox', 'auditCopies', 'restoreDrill', 'supportMail', 'devAuth', 'documents', 'billing', 'modelOutputs', 'agreements', 'compliance'].map((name) => [name, `/data/${name}`])) as unknown as HarnessDirectories;
    const env = workerEnvironment('postgres://postgres:test@db:5432/tp', 'http://localhost:3000', dirs, 'c3ludGhldGlj');
    expect(env.WORKER_JOBS).toBe(WORKER_JOBS.worker);
    expect(new URL(env.DATABASE_URL ?? '').username).toBe(HARNESS_LOGINS.worker.username);
    expect(new URL(env.QUEUE_DATABASE_URL ?? '').username).toBe(HARNESS_LOGINS.queue.username);
    expect(env).not.toHaveProperty('OPERATOR_DATABASE_URL');
    expect(env).not.toHaveProperty('SCREENING_DATABASE_URL');
    expect(env).toMatchObject({ NODE_ENV: 'test', DOCUMENTS_DIR: '/data/documents', TP_KEY_PROVIDER: 'local', MAIL_OUTBOX_DIR: '/data/outbox' });
  });
});

describe('the practices', () => {
  it('sizes the full test as the design names it, and the smoke run smaller in every part', () => {
    expect(FULL_SIZE).toEqual({ measuredLines: 100_000, reportLines: 20_000, remittances: 4, claimsPerRemittance: 2_000, largeTogetherLines: 100_000, reconcileLines: 10_000 });
    expect(SMALL_SIZE.remittances).toBe(4);
    expect(SMALL_SIZE.largeTogetherLines).toBe(2_000);
    for (const key of ['measuredLines', 'reportLines', 'claimsPerRemittance', 'largeTogetherLines', 'reconcileLines'] as const) {
      expect(SMALL_SIZE[key]).toBeLessThan(FULL_SIZE[key]);
    }
    expect(PERIOD).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('locates the practices at a ZIP of the scale release that needs no ZIP+4, and draws codes from its first 400', () => {
    expect(scaleZips(SCALE_RELEASE_SHAPE).find((zip) => zip.zip === CAPACITY_ZIP)?.plusFour).toBe(false);
    expect(CAPACITY_CODES).toEqual(scaleCodes(SCALE_RELEASE_SHAPE).slice(0, 400));
  });

  it('gives A exactly its lines in claims of 1 to 6, on one or two dates, over every quarter of 2026, half therapy codes, half Medicare Advantage', () => {
    const claims = practiceClaims(FULL_SIZE.measuredLines, 'A');
    const lines = claims.flatMap((entry) => entry.lines);
    expect(lines).toHaveLength(100_000);
    expect(claims.every((entry) => entry.lines.length >= 1 && entry.lines.length <= 6)).toBe(true);
    expect(new Set(claims.map((entry) => entry.lines.length))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(claims.map((entry) => entry.claimNo)).toEqual(claims.map((_, index) => index + 1));
    // One or two dates a claim, and claims holding lines on the same date (the NCCI pairs the keyed read fetches).
    expect(claims.every((entry) => new Set(entry.lines.map((item) => item.serviceDate)).size <= 2)).toBe(true);
    expect(claims.some((entry) => new Set(entry.lines.map((item) => item.serviceDate)).size === 2)).toBe(true);
    expect(claims.filter((entry) => entry.lines.length > new Set(entry.lines.map((item) => item.serviceDate)).size).length).toBeGreaterThan(claims.length / 2);
    expect(lines.every((item) => item.serviceDate >= PERIOD.from && item.serviceDate <= PERIOD.to)).toBe(true);
    expect(new Set(lines.map((item) => quarterOf(item.serviceDate)))).toEqual(new Set([1, 2, 3, 4]));
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      expect(lines.filter((item) => quarterOf(item.serviceDate) === quarter).length, `Q${String(quarter)}`).toBeGreaterThan(20_000);
    }
    // Codes from the first 400, the therapy codes about half the lines (45% to 55%), with GP on them alone.
    const therapy: readonly string[] = SCALE_THERAPY_CODES;
    expect(lines.every((item) => CAPACITY_CODES.includes(item.code))).toBe(true);
    const share = lines.filter((item) => therapy.includes(item.code)).length / lines.length;
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThan(0.55);
    expect(new Set(lines.filter((item) => !therapy.includes(item.code)).map((item) => item.code)).size).toBeGreaterThan(350);
    expect(lines.every((item) => (therapy.includes(item.code) ? item.modifiers.join() === 'GP' : item.modifiers.length === 0))).toBe(true);
    expect(lines.every((item) => item.units >= 1 && item.units <= 3)).toBe(true);
    expect(claims.filter((entry) => entry.medicareAdvantage).length).toBe(Math.floor(claims.length / 2));
  });

  it('gives B its lines in the same shape, and generates both the same every time', () => {
    const claims = practiceClaims(FULL_SIZE.reportLines, 'B');
    expect(claims.flatMap((entry) => entry.lines)).toHaveLength(20_000);
    expect(practiceClaims(FULL_SIZE.reportLines, 'B')).toEqual(claims);
    expect(practiceClaims(FULL_SIZE.reportLines, 'A')).not.toEqual(claims);
    expect(practiceClaims(7, 'A').flatMap((entry) => entry.lines)).toHaveLength(7);
  });

  it('writes C’s 835s as SYNTHETIC remittances of their claims, each a payment of its own', () => {
    const files = [1, 2].map((index) => capacity835(index, 50).toString('latin1'));
    for (const text of files) {
      expect(text.startsWith('ISA*')).toBe(true);
      expect(text.match(/~\n?CLP\*/g)).toHaveLength(50);
      expect(text).toContain('SYNTHETIC');
      // Every patient and claim number the file names is a SYNTHETIC one.
      expect([...text.matchAll(/CLP\*([^*]+)\*/g)].every((match) => match[1]?.startsWith('SYNPCNCAP') === true)).toBe(true);
      expect([...text.matchAll(/NM1\*QC\*1\*([^*]+)\*/g)].every((match) => match[1]?.startsWith('SYNTHLAST') === true)).toBe(true);
    }
    // Each its own payment: its own trace and interchange control number.
    const trace = (text: string) => /TRN\*1\*([^*~]+)/.exec(text)?.[1];
    const isa13 = (text: string) => text.split('*')[13];
    expect(trace(files[0] ?? '')).not.toBe(trace(files[1] ?? ''));
    expect(isa13(files[0] ?? '')).not.toBe(isa13(files[1] ?? ''));
    expect(capacity835(1, 50).equals(capacity835(1, 50))).toBe(true);
  });

  it('gives D and E, the large jobs together’s practices, A’s shape at their size, each its own claims (D20)', () => {
    for (const label of ['D', 'E']) {
      const claims = practiceClaims(FULL_SIZE.largeTogetherLines, label);
      expect(claims.flatMap((entry) => entry.lines)).toHaveLength(100_000);
      expect(claims).not.toEqual(practiceClaims(FULL_SIZE.measuredLines, 'A'));
    }
    expect(practiceClaims(SMALL_SIZE.largeTogetherLines, 'D').flatMap((entry) => entry.lines)).toHaveLength(2_000);
  });

  it('writes C’s second set of 835s, for the large jobs together, as payments of their own, apart from the first set', () => {
    const first = [1, 2, 3, 4].map((index) => capacity835(index, 5).toString('latin1'));
    const second = [1, 2, 3, 4].map((index) => capacity835(index + SMALL_SIZE.remittances, 5).toString('latin1'));
    const trace = (text: string) => /TRN\*1\*([^*~]+)/.exec(text)?.[1];
    const isa13 = (text: string) => text.split('*')[13];
    expect(new Set([...first, ...second].map(trace)).size).toBe(8);
    expect(new Set([...first, ...second].map(isa13)).size).toBe(8);
  });

  it('gives every practice the ledger settings F’s reconcile reads: a posted entry proves recovery, posting exports in the SYNTHETIC template', () => {
    expect(SETTINGS).toMatchObject({ place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, proof_level: 'posted', posting_export_template: { template: 'synthetic_pm_export_v1' } });
  });

  it('names every row SYNTHETIC', () => {
    for (const label of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const names = practiceNames(label);
      expect(names.payer).toMatch(/^SYNTHETIC /);
      for (const value of [names.payerId, names.medicareAdvantagePlan, names.contractPlan, names.claimPrefix, names.trace]) {
        expect(value, value).toMatch(/SYN/);
      }
    }
  });
});

describe('the SYNTHETIC contract’s dispute window, which makes the practices’ contract lines actionable (step 7b’s on F)', () => {
  // The dispute-window records release 900110 carries (tools/release/scale.ts, HAND_TYPED): release 900001's, Medicare's only.
  const carried = readRecordFile(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR, 'dispute_window', '2026', 'records.json'), 'dispute_window/2026/records.json').records.map((located) => located.record);
  const release = indexRelease({ releaseNo: 900_110, manifestSha256: 'a'.repeat(64), records: carried });
  const versionId = '00000000-0000-4000-8000-000000000001';
  const asOf = '2026-11-04';
  const paidOn = REPROCESSING_PAID_ON;
  const material = cents(1_234n);
  // A priced line's facts as triage reads them, but for its window and deadline.
  const facts = (mappingKind: 'contract' | 'ma_noncontracted', windowEndsOn: string | null, deadlineStatus: DeadlineStatus): TriageFacts => ({
    varianceCents: material,
    windowEndsOn,
    deadlineStatus,
    windowRuleComputed: true,
    claimReversed: false,
    claimSuperseded: false,
    mappingKind,
    mappingInForce: true,
    contractVersionStatus: mappingKind === 'contract' ? 'signed_off' : null,
    contractVersionCoversService: true,
    releaseWithdrawn: false,
    contentNotLoaded: false,
    writtenOff: false,
    visitVarianceCents: null,
    reviewFlags: [],
  });
  const windowOf = (days: number | null, ma = false) =>
    disputeWindow({ contractWindows: ma ? null : { timely_filing_days: null, dispute_window_days: days, appeal_levels: [] }, remittanceDate: paidOn, serviceDate: '2026-06-01', asOf, release });

  it('states its days on page 1 in the rule the product computes, the most a version may state, cited apart from the fee schedule on page 2', () => {
    expect(windowRuleComputed(CONTRACT_DISPUTE_WINDOW.rule)).toBe(true);
    expect(contractWindowRuleComputed(CONTRACT_DISPUTE_WINDOW.rule)).toBe(true);
    expect(CONTRACT_DISPUTE_WINDOW.days).toBe(3_650);
    const [first, second] = contractPages();
    expect(first).toContain(windowQuote(CONTRACT_DISPUTE_WINDOW.days));
    expect(windowQuote(CONTRACT_DISPUTE_WINDOW.days)).toBe('Disputes are raised within 3650 days of the payment date.');
    expect(second).toContain('Every covered service is paid at 110% of the Medicare fee schedule');
    expect(second?.some((text) => text.startsWith('Disputes'))).toBe(false);
  });

  it('keeps a contract line’s window open for ten years from A’s payment date, and its deadline verified as the seed leaves the version', () => {
    const window = windowOf(CONTRACT_DISPUTE_WINDOW.days);
    expect(window).toMatchObject({ source: 'contract', length: 3_650, unit: 'days', measured_from: 'remittance_date', from_date: '2026-12-31', ends_on: '2036-12-28', status: 'OPEN' });
    const deadline = deadlineVerification({
      trace: { agreement: { contract_version_id: versionId }, steps: { window } },
      recordLevel: null,
      releaseWithdrawn: false,
      contractWindow: {
        contractVersionId: versionId,
        status: 'signed_off',
        disputeWindowDays: CONTRACT_DISPUTE_WINDOW.days,
        evidence: { documentId: versionId, page: 1, quote: windowQuote(CONTRACT_DISPUTE_WINDOW.days), hash: 'b'.repeat(64), ...CONTRACT_DISPUTE_WINDOW.rule },
        verifiedBy: versionId,
        verifiedAt: '2026-11-04T00:00:00.000Z',
      },
    });
    expect(deadline).toMatchObject({ status: 'verified', source: 'contract', endsOn: '2036-12-28', cause: null });
    expect(judgeLine(facts('contract', window.ends_on, deadline.status), cents(500n), asOf)).toMatchObject({ validated: true, actionable: true, reasons: [] });
  });

  it('is why: a silent contract has no window under release 900110, and a Medicare Advantage line’s deadline is unverified', () => {
    // The release carries no commercial_default window, and that one would never be verified either.
    expect(carried.some((record) => (record.key as { readonly program?: string }).program === 'commercial_default')).toBe(false);
    const silent = windowOf(null);
    expect(silent).toMatchObject({ source: null, ends_on: null, status: 'NO_WINDOW' });
    expect(judgeLine(facts('contract', null, 'not_applicable'), cents(500n), asOf)).toMatchObject({ validated: true, actionable: false, reasons: ['NO_WINDOW'] });
    // Medicare's redetermination window, open, but its record is L1 and no Medicare Advantage route is confirmed (Q34).
    const ma = windowOf(null, true);
    expect(ma).toMatchObject({ source: 'release', ends_on: '2027-04-21', status: 'OPEN' });
    const level = carried.find((record) => (record.key as { readonly window?: string }).window === 'redetermination')?.verification.level ?? null;
    const deadline = deadlineVerification({ trace: { agreement: { contract_version_id: null }, steps: { window: ma } }, recordLevel: level, releaseWithdrawn: false, contractWindow: null });
    expect(deadline).toMatchObject({ status: 'unverified', cause: 'RECORD_BELOW_LEVEL' });
    expect(judgeLine(facts('ma_noncontracted', ma.ends_on, deadline.status), cents(500n), asOf)).toMatchObject({ validated: true, actionable: false, reasons: ['DEADLINE_UNVERIFIED'] });
  });

  it('makes a contract line actionable from the practice’s line materiality up, and none of the Medicare Advantage lines, which is what the run expects of A’s triage (expectedActionableLines)', () => {
    // The materiality triage reads from the practice's settings: the seed states none, so the default.
    const materiality = triageSettings(SETTINGS).lineMaterialityCents;
    expect(materiality).toBe(DEFAULT_TRIAGE_SETTINGS.lineMaterialityCents);
    const window = windowOf(CONTRACT_DISPUTE_WINDOW.days);
    const contract = (variance: bigint): TriageFacts => ({ ...facts('contract', window.ends_on, 'verified'), varianceCents: cents(variance) });
    expect(judgeLine(contract(materiality), materiality, asOf)).toMatchObject({ validated: true, actionable: true, reasons: [] });
    expect(judgeLine(contract(materiality + 10_000n), materiality, asOf)).toMatchObject({ actionable: true });
    expect(judgeLine(contract(materiality - 1n), materiality, asOf)).toMatchObject({ validated: true, actionable: false, reasons: ['BELOW_LINE_MATERIALITY'] });
    expect(judgeLine(contract(0n), materiality, asOf)).toMatchObject({ validated: false, actionable: false });
    // A Medicare Advantage line is never expected, however short.
    const ma = windowOf(null, true);
    expect(judgeLine({ ...facts('ma_noncontracted', ma.ends_on, 'unverified'), varianceCents: cents(materiality + 10_000n) }, materiality, asOf)).toMatchObject({ actionable: false, reasons: ['DEADLINE_UNVERIFIED'] });
  });
});

describe('the reprocessing step 7b loads and posts, over a month of both plans (CAS-42.4)', () => {
  const claims = practiceClaims(300, 'A');
  // Every third line actionable at an expected amount of its own, one above the original charge.
  const expected = new Map<string, bigint>();
  claims.forEach((entry) => {
    entry.lines.forEach((item, index) => {
      if ((entry.claimNo + index) % 3 === 0) {
        expected.set(lineKey(entry.claimNo, item.lineNo), BigInt(5_000 + ((entry.claimNo * 37 + item.lineNo) % 7_000)));
      }
    });
  });
  const touched = claims.filter((entry) => entry.lines.some((item) => expected.has(lineKey(entry.claimNo, item.lineNo))));
  const built = reprocessing('A', claims, expected);
  const texts = built.files.map((file) => file.toString('latin1'));
  const segments = texts.flatMap((text) => text.split(/~\n?/));

  it('reverses each claim holding an actionable line and pays its correction, in checks of REPROCESSING_CHECK_CLAIMS claims', () => {
    expect(built.lines).toBe(expected.size);
    const checks = Math.ceil(touched.length / REPROCESSING_CHECK_CLAIMS);
    expect(segments.filter((segment) => segment.startsWith('TRN*1*'))).toHaveLength(checks);
    expect(built.files).toHaveLength(Math.ceil(checks / REPROCESSING_CHECKS_PER_FILE));
    const clps = segments.filter((segment) => segment.startsWith('CLP*'));
    expect(clps).toHaveLength(2 * touched.length);
    // Each touched claim: its reversal (status 22, frequency 8) under its own number, then its correction (frequency 7, REF F8 naming it).
    for (const entry of touched) {
      const number = claimNumber('A', entry.claimNo);
      const reversal = clps.find((segment) => segment.split('*')[7] === number);
      expect(reversal?.split('*')[2], number).toBe('22');
      expect(reversal?.split('*')[1]).toBe(`SYNPCN${number}`);
      expect(reversal?.split('*')[3]).toBe(`-${String(entry.lines.length * 100)}.00`);
      expect(reversal?.split('*')[4]).toBe(`-${String(entry.lines.length * 40)}.00`);
      const correction = clps.find((segment) => segment.split('*')[7] === `${number}R`);
      expect(correction?.split('*')[1]).toBe(`SYNPCN${number}`);
      expect(correction?.split('*')[9]).toBe('7');
    }
    expect(segments.filter((segment) => segment.startsWith('REF*F8*'))).toHaveLength(touched.length);
    expect(claims.length).toBeGreaterThan(touched.length);
  });

  it('pays each actionable line its expected amount, and the correction’s other lines as the original paid them', () => {
    const corrections = texts.flatMap((text) => text.split(/~\n?(?=CLP\*)/).filter((loop) => /^CLP\*[^*]+\*1\*/.test(loop)));
    expect(corrections).toHaveLength(touched.length);
    const paidLines = corrections.flatMap((loop) => [...loop.matchAll(/SVC\*HC:([^*:~]+)[^*]*\*([\d.]+)\*([\d.]+)/g)].map((match) => Math.round(Number(match[3]) * 100)));
    const wanted = touched.flatMap((entry) => entry.lines.map((item) => Number(expected.get(lineKey(entry.claimNo, item.lineNo)) ?? 4_000n)));
    expect(paidLines).toEqual(wanted);
  });

  it('posts each actionable line from its own line-level row: its patient control number, code, date and expected amount, under its check', () => {
    const rows = built.postingExport.trimEnd().split('\r\n');
    expect(rows[0]).toBe('Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch,Payee ID');
    expect(rows).toHaveLength(expected.size + 1);
    const traces = new Set(segments.filter((segment) => segment.startsWith('TRN*1*')).map((segment) => segment.split('*')[2]));
    const posted = rows.slice(1).map((row) => row.split(','));
    expect(posted.every((row) => traces.has(row[1] ?? '') && row[2] === practiceNames('A').payer && row[8] === 'SYNTHSENDER')).toBe(true);
    // Two lines of one claim may share a code and a date: compare the rows as a list, each with its amount.
    const wanted = touched.flatMap((entry) =>
      entry.lines.flatMap((item) => {
        const amount = expected.get(lineKey(entry.claimNo, item.lineNo));
        const date = `${item.serviceDate.slice(5, 7)}/${item.serviceDate.slice(8, 10)}/${item.serviceDate.slice(0, 4)}`;
        return amount === undefined ? [] : [`SYNPCN${claimNumber('A', entry.claimNo)} ${item.code} ${date} ${(Number(amount) / 100).toFixed(2)}`];
      }),
    );
    expect(posted.map((row) => `${row[3] ?? ''} ${row[4] ?? ''} ${row[5] ?? ''} ${row[6] ?? ''}`)).toEqual(wanted);
  });

  it('names its payer and plans as the practice’s rows do, writes SYNTHETIC files only, and is the same every time', () => {
    expect(segments).toContain(`N1*PR*${practiceNames('A').payer}`);
    expect(segments).toContain('REF*2U*SYNCAPA');
    expect(segments.some((segment) => segment === 'REF*CE*SYNPLAN-CAPACITY-A-MA')).toBe(true);
    expect(segments.some((segment) => segment === 'REF*CE*SYNPLAN-CAPACITY-A-COMM')).toBe(true);
    expect(texts.every((text) => text.includes('SYNTHETIC'))).toBe(true);
    expect(reprocessing('A', claims, expected).files.map((file) => file.toString('latin1'))).toEqual(texts);
    expect(reprocessing('A', claims, new Map())).toMatchObject({ files: [], lines: 0 });
  });
});

describe('step 7b’s practice, F (SUITE-CAP-3 D14: a practice of its own at 10,000 lines until Lane A’s trigger fixes move step 7b back to A)', () => {
  // Built in each test, so a scenario without F fails each test rather than the file.
  const seeded = () => {
    const claims = reconcileClaims(FULL_SIZE.reconcileLines);
    return { claims, lines: claims.flatMap((entry) => entry.lines.map((item) => ({ ...item, claimNo: entry.claimNo }))) };
  };

  it('seeds F, not A, at its own full size of 10,000 lines, every claim under its contract, while A keeps its full month', () => {
    const { claims, lines } = seeded();
    expect(RECONCILE_PRACTICE).toBe('F');
    expect(FULL_SIZE.measuredLines).toBe(100_000);
    // Step 7b is the full-size form of CAS-42.3's pass (and CAS-51's), whose default is 2,000 lines
    // (apps/worker/src/reconcile/reconcile.large.db.test.ts). The two sizes part on purpose (SUITE-CAP-3 D14, docs/adr/0087):
    // F reconciles 10,000 lines, sized for its first attempt to complete within 360 s, and never fewer than CAS-42.3's.
    const large = readFileSync(path.join(repositoryRoot, 'apps/worker/src/reconcile/reconcile.large.db.test.ts'), 'utf8');
    const largeDefault = Number.parseInt(/TP_LARGE_RECONCILE_LINES \?\? '(\d+)'/.exec(large)?.[1] ?? '0', 10);
    expect(largeDefault).toBeGreaterThan(0);
    expect(FULL_SIZE.reconcileLines).toBe(10_000);
    expect(FULL_SIZE.reconcileLines).toBeGreaterThanOrEqual(largeDefault);
    expect(lines).toHaveLength(FULL_SIZE.reconcileLines);
    expect(reconcileClaims(SMALL_SIZE.reconcileLines).flatMap((entry) => entry.lines)).toHaveLength(SMALL_SIZE.reconcileLines);
    expect(claims.every((entry) => !entry.medicareAdvantage)).toBe(true);
    // A's shape, under F's own seed: F's month is not A's.
    expect(claims.map((entry) => entry.lines)).toEqual(practiceClaims(FULL_SIZE.reconcileLines, 'F').map((entry) => entry.lines));
    expect(claims.map((entry) => entry.lines)).not.toEqual(practiceClaims(FULL_SIZE.reconcileLines, 'A').map((entry) => entry.lines));
    // Its reprocessing, every line paid its expected amount, names F's claims and plan alone.
    const built = reprocessing(RECONCILE_PRACTICE, claims, new Map(lines.map((item) => [lineKey(item.claimNo, item.lineNo), BigInt(item.units * FIXED_UNIT_CENTS)])));
    expect(built.lines).toBe(FULL_SIZE.reconcileLines);
    const text = built.files.map((file) => file.toString('latin1')).join('');
    expect(text).toContain(`CLP*SYNPCN${claimNumber('F', 1)}*22*`);
    expect(text).not.toContain('SYNCAPA');
    expect(text).not.toContain('SYNPLAN-CAPACITY-F-MA');
    expect(built.postingExport).toContain(`SYNPCN${claimNumber('F', 1)},`);
  });

  it('prices each of F’s lines at a fixed $100.00 a unit, at least the line materiality above what its original remittance allowed, so its triage makes every one actionable', () => {
    const { claims, lines } = seeded();
    expect(FIXED_UNIT_CENTS).toBe(Number(dollars('100.00')));
    expect(FIXED_RATE.quote).toBe('Every covered service is paid $100.00 per unit');
    expect(contractPages(FIXED_RATE)[1]).toEqual(['SYNTHETIC EXHIBIT A FEE SCHEDULE', FIXED_RATE.quote]);
    expect(contractPages()[1]).toEqual(['SYNTHETIC EXHIBIT A FEE SCHEDULE', MEDICARE_RATE.quote]);
    const terms = parseRateTerms(FIXED_RATE.terms, true);
    expect(terms).toMatchObject({ method: 'FIXED_SCHEDULE', parameters: { amount_cents: BigInt(FIXED_UNIT_CENTS) } });
    // The engine on each of F's claims under F's own terms: a fixed amount reads no fee-schedule value, so any release prices it alike.
    const agreement = contractAgreement({ terms });
    const release = syntheticRelease(900001);
    const priced = claims.flatMap((entry) =>
      price(
        pricingInput(
          release,
          entry.lines.map((item) =>
            lineFacts({ lineNo: item.lineNo, procedureCode: item.code, modifiers: [...item.modifiers], units: String(item.units), serviceDate: item.serviceDate, chargeCents: ORIGINAL_LINE.charge, observedAllowedCents: ORIGINAL_LINE.allowed, agreement }),
          ),
          { asOf: '2026-11-04' },
        ),
      ),
    );
    expect(priced).toHaveLength(FULL_SIZE.reconcileLines);
    expect(priced.filter((result) => result.outcome !== 'priced')).toEqual([]);
    const materiality = DEFAULT_TRIAGE_SETTINGS.lineMaterialityCents;
    for (const [index, result] of (priced as PricedLine[]).entries()) {
      const item = lines[index];
      expect(result.expectedAllowedCents).toBe(BigInt((item?.units ?? 0) * FIXED_UNIT_CENTS));
      expect(result.varianceCents).toBe(result.expectedAllowedCents - ORIGINAL_LINE.allowed);
      expect(result.varianceCents >= materiality).toBe(true);
    }
    // At the smallest variance, judged as triage judges it with the contract's verified window: actionable, no reason.
    const least = (priced as PricedLine[]).reduce((low, result) => (result.varianceCents < low ? result.varianceCents : low), BigInt(Number.MAX_SAFE_INTEGER));
    expect(least).toBe(5_000n);
    const facts: TriageFacts = {
      varianceCents: cents(least),
      windowEndsOn: '2036-12-28',
      deadlineStatus: 'verified',
      windowRuleComputed: true,
      claimReversed: false,
      claimSuperseded: false,
      mappingKind: 'contract',
      mappingInForce: true,
      contractVersionStatus: 'signed_off',
      contractVersionCoversService: true,
      releaseWithdrawn: false,
      contentNotLoaded: false,
      writtenOff: false,
      visitVarianceCents: null,
      reviewFlags: [],
    };
    expect(judgeLine(facts, materiality, '2026-11-04')).toMatchObject({ validated: true, actionable: true, reasons: [] });
  });

  it('describes step 7b and its settings as F’s wherever the harness names them: A only keeps its full month for triage and reports', () => {
    for (const file of ['run.ts', 'scenario.ts', 'checks.ts']) {
      // Comments joined across their line breaks, so a phrase split over two lines is read whole.
      const text = readFileSync(path.join(repositoryRoot, 'tools/release-capacity', file), 'utf8').replace(/\n\s*(?:\*|\/\/)\s*/g, ' ');
      expect(text, file).not.toMatch(/A['’]s (?:reconcile|reprocessing)/);
      expect(text, file).not.toMatch(/price A['’]s months/);
    }
  });
});

describe('A’s full month for triage and reports: its actionable lines beside the scenario’s (Lane A’s orchestrator, 2026-11-04)', () => {
  it('counts A’s actionable lines, those of them the scenario expects, and how many it expects, by lineKey', () => {
    const expected = new Set([lineKey(1, 1), lineKey(1, 2), lineKey(3, 1)]);
    expect(againstExpected(new Map([[lineKey(1, 1), 5_500n], [lineKey(1, 2), 6_000n], [lineKey(3, 1), 7_000n]]), expected)).toEqual({ lines: 3, expected: 3, matched: 3 });
    // A line of a Medicare Advantage claim actionable while an expected line is not: as many lines, one fewer matched.
    expect(againstExpected(new Map([[lineKey(1, 1), 5_500n], [lineKey(2, 1), 6_000n], [lineKey(3, 1), 7_000n]]), expected)).toEqual({ lines: 3, expected: 3, matched: 2 });
    expect(againstExpected(new Map([[lineKey(1, 1), 5_500n]]), expected)).toEqual({ lines: 1, expected: 3, matched: 1 });
    expect(againstExpected(new Map(), expected)).toEqual({ lines: 0, expected: 3, matched: 0 });
    expect(againstExpected(new Map(), new Set())).toEqual({ lines: 0, expected: 0, matched: 0 });
  });
});
