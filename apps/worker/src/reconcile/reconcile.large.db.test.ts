import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readDatabaseUrl } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseHandler } from '../parse/job';
import { FIXTURES, type Practice } from '../price/test-support/pricing-world';
import { LED_PLAN, LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * CAS-42.3 (SUITE-CAP-1b, under the ledger freeze exception Q1 granted 2026-10-27; docs/adr/0083): a reconcile at size.
 * LINES case lines, each posted by one line-level row of a SYNTHETIC posting export, are reconciled in one pass of the
 * reconcile step (reconcilePractice, as the reconcile job runs it). The pass completes, the LINES posted entries are
 * written, each line reaches the stage its entries put it at (recovered, the practice's proof level being posted), and
 * no backend holds more than one advisory lock while it runs: the practice's `ledger:` lock, which lockLedger takes and
 * both ledger_entry triggers now re-take, and no lock per posting row, per line or per stage event.
 *
 * Fails first on the base (before 20261109090000_line_status_heads.sql): the pass's one transaction takes a
 * `ledger_evidence:` lock per posting row, a `ledger_line:` lock per line and a `line_status:` lock per stage event, about
 * three per line, which the sampled bound catches at any size and which run the cluster's shared lock table out (53200,
 * out of shared memory) once they pass it.
 *
 * LINES is 2,000 by default, not the design's 20,000 (TP_LARGE_RECONCILE_LINES sets it): the pass itself grows faster
 * than its lines whatever its locks (it compares every open case line with the new claims of its code and date, and
 * writes each line's stage as a statement of its own that refreshes the line's whole case), so 20,000 lines take far
 * longer than a CI shard (6,000 took 342 s on a 4-CPU container; the build's report). The bound on the locks is the
 * same at every size; the pass's own time at size is handed on.
 *
 * The setup reaches that pass through the job code in steps each small enough for the base's lock table: the original
 * payments are loaded by the parse job and priced and triaged PER_CHUNK lines at a time (one run per chunk's days), and
 * the adjusted remittances that pay the difference are loaded and reconciled (the ledger's approvals) PER_CHUNK lines
 * at a time. The adjusted remittances hold PER_REMITTANCE claims each, as a payer's checks do, since a line-level row is
 * matched among its check's claims. The 835s are LED-06's SYNTHETIC fixtures (fixtures/synthetic/LED-06) with their
 * claim loop repeated under new SYNTHETIC numbers; every identifier says SYN or SYNTHETIC.
 *
 * Each check also carries interest in the implementation guide's shape (docs/adr/0084): every correction reports
 * INTEREST_CENTS of interest (AMT I) and the check pays its claims' interest in one PLB L6 naming nothing, so the
 * approving reconciles credit each line's interest once, from its check's PLB L6, and the measured pass walks every
 * PLB L6 of the practice's history again and writes nothing more. Fails first without the interest path's indexes
 * (review INT-REL-2): each PLB L6's draws scanned every case line against every match, 161 s for this pass. A later
 * check then takes each claim's interest back, by a PLB L6 naming its correction, beside another patient's claim, so the
 * measured pass also walks LINES PLB L6s that take interest back, each reading the holdings of its chain's lines
 * (PR 126 review F-M2-2: those holdings were rebuilt from every interest entry for each such PLB L6, quadratic in the
 * practice's history; they are now kept once a pass).
 */

/** The case lines the measured pass posts. */
const LINES = Number.parseInt(process.env.TP_LARGE_RECONCILE_LINES ?? '2000', 10);
/** Lines per original 835, pricing run, triage and approving reconcile: well inside the base's lock table per transaction. */
const PER_CHUNK = 2_000;
/** Claims per adjusted remittance (each reversed and corrected). */
const PER_REMITTANCE = 20;
/** The most advisory locks any backend may hold during the pass: the practice's `ledger:` lock (section 8.4). */
const MOST_ADVISORY_LOCKS = 1;
/**
 * The pass's time budget: about two and a half times what 2,000 lines took on a 4-CPU container (57.7 s), the rule of
 * section 8.4, so a per-row lock or another quadratic step returning fails it without a slow runner flaking it.
 */
const PASS_BUDGET_MS = 150_000;

/** Each case line: LED-06's 97110 x 2 line paid 70.00 against an expected 100.00, corrected to 100.00. */
const DIFFERENCE_CENTS = '3000';
/** The interest each correction reports (AMT I) and its check's PLB L6 pays: 0.50 a claim. */
const INTEREST_CENTS = 50;
/** What the other patient's claim in each check taking interest back pays: LED-06's original, 70.00. */
const OTHER_CENTS = 7000;

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 120_000);

afterAll(async () => {
  await w.close();
});

/** A fixture's segments, without their terminators. */
const segmentsOf = (fixture: string) =>
  readFileSync(path.join(FIXTURES, fixture), 'latin1')
    .split('~')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

/** Splits a one-transaction fixture into its envelope (ISA, GS), its transaction's header (ST to LX) and its claim loops' segments. */
function template(fixture: string) {
  const segments = segmentsOf(fixture);
  const firstClaim = segments.findIndex((segment) => segment.startsWith('CLP*'));
  const se = segments.findIndex((segment) => segment.startsWith('SE*'));
  return { envelope: segments.slice(0, 2), header: segments.slice(2, firstClaim), claims: segments.slice(firstClaim, se) };
}

const ORIGINAL = template('LED-06/original.835');
const ADJUSTED = template('LED-06/adjusted.835');

const number = (n: number) => String(n).padStart(6, '0');
const patientControlNumber = (n: number) => `SYNPCNRCL${number(n)}`;
const traceOf = (chunk: number, check: number) => `SYNEFTRCL${String(chunk).padStart(2, '0')}${String(check).padStart(4, '0')}`;

/**
 * Case line n's code and date of service. Each chunk spreads its lines over DAYS_PER_CHUNK days of its own (so its
 * run's period holds them alone) and the five codes of the contract's schedule, as a practice's month spreads them:
 * the reconcile compares each case line with the new claims of its code and date (candidatesFor), so a whole month on
 * one code and day would measure that comparison, not the pass's locks.
 */
const CODES = ['97110', '97112', '97140', '97530', '97116'] as const;
const DAYS_PER_CHUNK = 9;
function lineOf(n: number): { readonly chunk: number; readonly serviceDate: string; readonly code: string } {
  const index = n - 1;
  const chunk = Math.floor(index / PER_CHUNK);
  const within = index % PER_CHUNK;
  const day = new Date(Date.UTC(2026, 0, 1 + chunk * DAYS_PER_CHUNK + (within % DAYS_PER_CHUNK)));
  return { chunk, serviceDate: day.toISOString().slice(0, 10), code: CODES[Math.floor(within / DAYS_PER_CHUNK) % CODES.length] as string };
}
/** A chunk's first and last dates of service: its pricing run's period. */
function periodOf(chunk: number): { readonly from: string; readonly to: string } {
  const at = (offset: number) => new Date(Date.UTC(2026, 0, 1 + chunk * DAYS_PER_CHUNK + offset)).toISOString().slice(0, 10);
  return { from: at(0), to: at(DAYS_PER_CHUNK - 1) };
}

/** Case line n's claim loops: LED-06's with its numbers, code and date of service replaced (the original's, or the adjusted's reversal and correction, the correction reporting its interest after its REF F8). */
function claimLoops(loops: readonly string[], n: number): string[] {
  const { serviceDate, code } = lineOf(n);
  return loops.flatMap((segment) => (segment.startsWith('REF*F8*') ? [segment, `AMT*I*${cents(INTEREST_CENTS)}`] : [segment])).map((segment) =>
    segment
      .replaceAll('SYNPCNLED06001', patientControlNumber(n))
      .replaceAll('SYNCCNLED060001', `SYNCCNRCL${number(n)}`)
      .replaceAll('SYNCCNLED060002', `SYNCCNRCL${number(n)}A`)
      .replace(/^SVC\*HC:97110\*/, `SVC*HC:${code}*`)
      .replace(/^DTM\*472\*\d{8}$/, `DTM*472*${serviceDate.replaceAll('-', '')}`),
  );
}

/** One interchange (ISA13 `control`) holding one transaction per check: its header with the check's amount and trace, its claims' loops. */
function interchange(shape: ReturnType<typeof template>, control: number, checks: readonly { readonly trace: string; readonly amount: string; readonly loops: readonly string[] }[]): Buffer {
  const isa13 = String(control).padStart(9, '0');
  const gs06 = String(control);
  const [isa, gs] = shape.envelope as [string, string];
  const transactions = checks.flatMap((check, index) => {
    const st02 = String(index + 1).padStart(4, '0');
    const body = [
      `ST*835*${st02}`,
      ...shape.header
        .slice(1)
        .map((segment) => (segment.startsWith('BPR*') ? segment.replace(/^BPR\*C\*[\d.-]+\*/, `BPR*C*${check.amount}*`) : segment.startsWith('TRN*') ? segment.replace(/^TRN\*1\*[^*]+\*/, `TRN*1*${check.trace}*`) : segment)),
      ...check.loops,
    ];
    return [...body, `SE*${String(body.length + 1)}*${st02}`];
  });
  const segments = [isa.replace(/\*\d{9}\*0\*T\*/, `*${isa13}*0*T*`), gs.replace(/\*\d+\*X\*/, `*${gs06}*X*`), ...transactions, `GE*${String(checks.length)}*${gs06}`, `IEA*1*${isa13}`];
  const text = `${segments.join('~\n')}~\n`;
  if (!text.includes('SYNTHETIC')) {
    throw new Error('a CAS-42.3 835 must carry the synthetic marker');
  }
  return Buffer.from(text, 'latin1');
}
const cents = (amount: number) => (amount / 100).toFixed(2);

/** The chunk's original payment: one check of `count` claims, each LED-06's original under case line n's numbers. */
function original835(chunk: number, first: number, count: number): Buffer {
  const loops = Array.from({ length: count }, (_, index) => claimLoops(ORIGINAL.claims, first + index)).flat();
  return interchange(ORIGINAL, 420_000_000 + chunk, [{ trace: `SYNEFTRCLO${String(chunk).padStart(4, '0')}`, amount: cents(7000 * count), loops }]);
}

/** The payee's identifier (N1*PE's NPI), which a check's PLB carries. */
const PAYEE = (ADJUSTED.header.find((segment) => segment.startsWith('N1*PE*')) ?? '').split('*')[4] ?? '';

/**
 * The chunk's adjusted payments: checks of PER_REMITTANCE claims, each LED-06's reversal and correction, paying 30.00 a
 * claim, and one PLB L6 naming nothing that pays the claims' interest (BPR02 30.50 a claim).
 */
function adjusted835(chunk: number, first: number, count: number): { readonly bytes: Buffer; readonly checks: readonly { readonly trace: string; readonly lines: readonly number[] }[] } {
  const checks: { trace: string; lines: number[] }[] = [];
  for (let start = 0; start < count; start += PER_REMITTANCE) {
    checks.push({ trace: traceOf(chunk, checks.length + 1), lines: Array.from({ length: Math.min(PER_REMITTANCE, count - start) }, (_, index) => first + start + index) });
  }
  const bytes = interchange(
    ADJUSTED,
    430_000_000 + chunk,
    checks.map((check) => ({
      trace: check.trace,
      amount: cents((3000 + INTEREST_CENTS) * check.lines.length),
      loops: [...check.lines.flatMap((n) => claimLoops(ADJUSTED.claims, n)), `PLB*${PAYEE}*20261231*L6*-${cents(INTEREST_CENTS * check.lines.length)}`],
    })),
  );
  return { bytes, checks };
}

/**
 * The chunk's checks taking interest back, one for each adjusted check: another patient's claim (LED-06's original under
 * its own SYNTHETIC numbers, on a day no case line has) paying 70.00, and one PLB L6 of 0.50 for each of the adjusted
 * check's claims, naming its correction: BPR02 70.00 less 0.50 a claim.
 */
function takenBack835(chunk: number, checks: readonly { readonly trace: string; readonly lines: readonly number[] }[]): Buffer {
  return interchange(
    ADJUSTED,
    440_000_000 + chunk,
    checks.map((check, index) => {
      const other = `${String(chunk).padStart(2, '0')}${String(index + 1).padStart(4, '0')}`;
      const loops = ORIGINAL.claims.map((segment) =>
        segment
          .replaceAll('SYNPCNLED06001', `SYNPCNRCLK${other}`)
          .replaceAll('SYNCCNLED060001', `SYNCCNRCLK${other}`)
          .replace(/^DTM\*472\*\d{8}$/, 'DTM*472*20260601'),
      );
      return {
        trace: `SYNEFTRCLT${other}`,
        amount: cents(OTHER_CENTS - INTEREST_CENTS * check.lines.length),
        loops: [...loops, ...check.lines.map((n) => `PLB*${PAYEE}*20261231*L6:SYNCCNRCL${number(n)}A*${cents(INTEREST_CENTS)}`)],
      };
    }),
  );
}

/** The posting export (LED-06's template, SYNTHETIC PM EXPORT v1): one line-level row per case line, its correction's payment. */
function postingExport(rows: readonly { readonly trace: string; readonly n: number }[]): Buffer {
  const [header] = readFileSync(path.join(FIXTURES, 'LED-06/posting-export.csv'), 'utf8').split(/\r?\n/);
  const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  const lines = rows.map((row) => `06/10/2026,${row.trace},SYNTHETIC PAYER L,${patientControlNumber(row.n)},${lineOf(row.n).code},${usDate(lineOf(row.n).serviceDate)},100.00,SYNBATCH-RCL,SYNTHSENDER`);
  return Buffer.from(`${[header, ...lines].join('\r\n')}\r\n`, 'utf8');
}

/** The largest number of advisory locks any one backend of this test's database holds, sampled every 25 ms. */
function sampleAdvisoryLocks(): { stop: () => Promise<{ readonly peak: number; readonly samples: number }> } {
  let sampling = true;
  let peak = 0;
  let samples = 0;
  const loop = (async () => {
    while (sampling) {
      const { rows } = await w.owner.query<{ n: number }>(
        `SELECT coalesce(max(n), 0)::int AS n FROM (SELECT count(*) AS n FROM pg_locks
           WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) GROUP BY pid) x`,
      );
      peak = Math.max(peak, rows[0]?.n ?? 0);
      samples += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();
  return {
    stop: async () => {
      sampling = false;
      await loop;
      return { peak, samples };
    },
  };
}

async function count(practice: Practice, sql: string, values: unknown[] = []): Promise<number> {
  const { rows } = await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ n: number }>(sql, values));
  return rows[0]?.n ?? -1;
}

describe('a real-size reconcile (CAS-42.3)', () => {
  it(`posts ${String(LINES)} case lines from one row each in one pass, holding at most the practice's ledger lock, their interest credited once and taken back once`, async () => {
    const chunks = Math.ceil(LINES / PER_CHUNK);
    expect(chunks).toBeGreaterThan(0);
    // Every chunk's days fall before the original payment (2026-04-06).
    expect(chunks * DAYS_PER_CHUNK).toBeLessThanOrEqual(95);
    const practice = await w.practice(`CAS-42.3 ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
    const parse = parseHandler(w.triage.pricing.parseServices);
    const load = async (fixture: string, bytes: Buffer) => {
      const documentId = await w.triage.pricing.stage(practice, fixture, bytes);
      await parse({ practice_id: practice.practiceId, document_id: documentId }, w.jobContext(practice));
    };
    const sizeOf = (chunk: number) => Math.min(PER_CHUNK, LINES - chunk * PER_CHUNK);
    const setupStarted = performance.now();

    // The original payments, priced and triaged one chunk (its own days) at a time.
    let versionId: string | null = null;
    for (let chunk = 0; chunk < chunks; chunk += 1) {
      await load('LED-06/original.835', original835(chunk, chunk * PER_CHUNK + 1, sizeOf(chunk)));
      versionId ??= (await w.triage.fixedContract(practice, { schedule: CODES.map((code) => ({ code, amountCents: '5000' })), effectiveFrom: '2026-01-01', disputeWindowDays: 3650 })).versionId;
      const runId = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId }], ...periodOf(chunk) });
      await w.triage.triage(practice, runId);
    }
    expect(await count(practice, 'SELECT count(*)::int AS n FROM case_line WHERE practice_id = $1', [practice.practiceId])).toBe(LINES);

    // The adjusted remittances, loaded and reconciled (the ledger's approvals) one chunk at a time; then the posting
    // export, one line-level row per case line: its correction's patient control number, code, date and payment.
    const rows: { trace: string; n: number }[] = [];
    const checks: { readonly chunk: number; readonly checks: readonly { readonly trace: string; readonly lines: readonly number[] }[] }[] = [];
    for (let chunk = 0; chunk < chunks; chunk += 1) {
      const adjusted = adjusted835(chunk, chunk * PER_CHUNK + 1, sizeOf(chunk));
      await load('LED-06/adjusted.835', adjusted.bytes);
      await w.reconcile(practice);
      rows.push(...adjusted.checks.flatMap((check) => check.lines.map((n) => ({ trace: check.trace, n }))));
      checks.push({ chunk, checks: adjusted.checks });
    }
    expect(await count(practice, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'approved' AND amount_cents = $2", [practice.practiceId, DIFFERENCE_CENTS])).toBe(LINES);
    expect(rows).toHaveLength(LINES);
    // Each line's interest credited once, from its check's PLB L6.
    const interest = async () => ({
      entries: await count(practice, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'interest' AND amount_cents = $2", [practice.practiceId, String(INTEREST_CENTS)]),
      takenBack: await count(practice, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'interest' AND amount_cents = $2", [practice.practiceId, String(-INTEREST_CENTS)]),
      cents: await count(practice, "SELECT coalesce(sum(amount_cents), 0)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'interest'", [practice.practiceId]),
      l6s: await count(practice, "SELECT count(*)::int AS n FROM provider_adjustment WHERE practice_id = $1 AND category = 'interest'", [practice.practiceId]),
    });
    expect(await interest()).toEqual({ entries: LINES, takenBack: 0, cents: INTEREST_CENTS * LINES, l6s: Math.ceil(LINES / PER_REMITTANCE) });
    // Then each claim's interest taken back by a later check's PLB L6 naming its correction, one chunk at a time.
    for (const chunk of checks) {
      await load('LED-06/adjusted.835', takenBack835(chunk.chunk, chunk.checks));
      await w.reconcile(practice);
    }
    const afterTakeBacks = { entries: LINES, takenBack: LINES, cents: 0, l6s: Math.ceil(LINES / PER_REMITTANCE) + LINES };
    expect(await interest()).toEqual(afterTakeBacks);
    const exportId = await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export', postingExport(rows));
    const setupMs = performance.now() - setupStarted;

    // The measured pass: the export read into its rows, then one transaction locked for the practice.
    const locks = sampleAdvisoryLocks();
    const started = performance.now();
    const outcome = await w.reconcile(practice, { documentId: exportId }).then(
      (summary) => ({ summary, error: null }),
      (error: unknown) => ({ summary: null, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    const passMs = performance.now() - started;
    const sampled = await locks.stop();
    // Recorded for the pull request: counts and times only.
    process.stdout.write(
      `CAS-42.3: ${String(LINES)} lines; setup ${(setupMs / 1000).toFixed(1)} s; pass ${(passMs / 1000).toFixed(1)} s${outcome.error === null ? '' : ` (failed: ${String((outcome.error as { code?: string }).code ?? 'error')})`}; peak advisory locks per backend ${String(sampled.peak)} over ${String(sampled.samples)} samples\n`,
    );
    if (outcome.error !== null) {
      throw outcome.error;
    }
    expect(outcome.summary?.postingsMatched).toBe(LINES);
    expect(sampled.samples).toBeGreaterThan(3);
    // The practice's ledger lock was seen, and nothing more however many rows and lines the pass posted.
    expect(sampled.peak).toBeGreaterThan(0);
    expect(sampled.peak).toBeLessThanOrEqual(MOST_ADVISORY_LOCKS);
    expect(passMs).toBeLessThan(PASS_BUDGET_MS);
    // The pass walked every PLB L6 again, those taking interest back among them, and wrote no more interest.
    expect(await interest()).toEqual(afterTakeBacks);

    // Every case line holds one posted entry of its difference, proved by its own row.
    expect(
      await count(
        practice,
        `SELECT count(DISTINCT e.service_line_id)::int AS n FROM ledger_entry e JOIN posting_row p ON p.id = e.evidence_id
          WHERE e.practice_id = $1 AND e.stage = 'posted' AND e.evidence_kind = 'posting_row' AND e.amount_cents = $2`,
        [practice.practiceId, DIFFERENCE_CENTS],
      ),
    ).toBe(LINES);
    expect(await count(practice, "SELECT count(*)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted'", [practice.practiceId])).toBe(LINES);
    expect(await count(practice, "SELECT count(DISTINCT evidence_id)::int AS n FROM ledger_entry WHERE practice_id = $1 AND stage = 'posted'", [practice.practiceId])).toBe(LINES);
    // Each line at the stage its entries put it at: recovered, the proof level being posted.
    expect(
      await count(
        practice,
        `SELECT count(*)::int AS n FROM case_line cl
          WHERE cl.practice_id = $1 AND (SELECT s.stage FROM line_status s WHERE s.practice_id = cl.practice_id AND s.service_line_id = cl.service_line_id ORDER BY s.seq DESC LIMIT 1) = 'recovered'`,
        [practice.practiceId],
      ),
    ).toBe(LINES);
  }, 1_800_000);
});
