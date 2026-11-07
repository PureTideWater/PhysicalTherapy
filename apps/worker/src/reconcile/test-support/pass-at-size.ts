import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PracticeCipher } from '@tp/db';

import type { JobContext } from '../../jobs/handlers';
import { parseHandler } from '../../parse/job';
import { FIXTURES, type Practice } from '../../price/test-support/pricing-world';
import { type ReconcileServices, type ReconcileSummary, reconcilePractice } from '../pass';
import { LED_PLAN, type LedgerWorld, ledSettings } from './ledger-world';

/**
 * A step-7b reconcile at size, for CAS-50 and CAS-51 (SUITE-CAP-3; docs/adr/0087; design sections 7 and 8.4), on
 * SYNTHETIC rows only: a practice of `lines` case lines built through the job code from LED-06's synthetic segments, as
 * CAS-42.3 builds its own (reconcile.large.db.test.ts): the original payments loaded by the parse job, a fixed schedule
 * signed off, one run priced and triaged (every line paid 70.00 against an expected 100.00, so short 30.00 and
 * actionable), then each claim's reversal and correction paying the 100.00 (checks of CHECK_CLAIMS claims) loaded by
 * the parse job, and the posting export (one line-level row per case line) staged. The measured pass is that export's
 * reconcile, which approves and posts every line in one pass: step 7b's shape (the weekly run's,
 * tools/release-capacity).
 *
 * The shapes (design section 7, CAS-51) spread the lines over codes and dates:
 * - `R`, spread over cases: the schedule's five codes, one case per code, 80 lines a date, so each code and date holds
 *   16 lines at every size (the probe's spread R);
 * - `F`, one case: every line of one code under a one-code schedule, so triage puts them all in one case, as step 7b's
 *   practice F is, its dates over half a year (the case refresh and the matched-pair exclusion bite hardest there);
 * - `A`, few dates: the five codes on 20 dates, so a code and date holds lines/100 lines and grows with the size (the
 *   probe's spread A), the only shape that sees a term growing with a code and date's lines.
 *
 * F is built from LED-06's line, not the weekly run's own claims (tools/release-capacity/scenario.ts), whose codes are
 * the scale release's, which a test world does not load, and whose module imports the worker's package from outside
 * it: what the shape needs of F, every line in one case, its dates spread, is kept.
 *
 * The measured pass runs through a proxy over its job scope's client that records each statement in issue order (its
 * text, parameters, row count, the rows of the statements a test asks for, and its time) and a wrapper over
 * PracticeCipher.decrypt that records each decrypt's column and the statement it followed (never its value). Nothing
 * here logs a row, a parameter or a plaintext: the tests print counts and times only.
 */

/** The schedule's codes (the contract's, 50.00 a unit; LED-06's line is two units). */
export const CODES = ['97110', '97112', '97140', '97530', '97116'] as const;
/** Claims per reprocessing check, as step 7b's (REPROCESSING_CHECK_CLAIMS): a line-level row is matched among its check's claims. */
const CHECK_CLAIMS = 20;
/** Checks per reprocessing 835, as step 7b's (REPROCESSING_CHECKS_PER_FILE). */
const CHECKS_PER_FILE = 100;
/** Claims per original 835 (one check each). */
const CLAIMS_PER_ORIGINAL = 2_000;
/** Spread R's lines a date: 16 of each code. */
const R_LINES_PER_DATE = 80;
/** Spread A's dates. */
const A_DATES = 20;
/** F's dates. */
const F_DATES = 180;
/** The first date of service; every date falls before LED-06's original payment (2026-04-06). */
const FIRST_DAY = Date.UTC(2025, 9, 1);
/** Each line's difference: LED-06's 97110 x 2 paid 70.00 against an expected 100.00, corrected to 100.00. */
export const DIFFERENCE_CENTS = '3000';

export type Shape = 'R' | 'F' | 'A';

/** The worker's heap limit in MiB, read from infra/lib/heap.ts's HEAP_MIB (its text: no apps/worker file imports infra). */
export const WORKER_HEAP_MIB = Number.parseInt(/worker:\s*(\d+)/.exec(readFileSync(path.resolve(import.meta.dirname, '../../../../../infra/lib/heap.ts'), 'utf8'))?.[1] ?? '', 10);

/** Case line n's (from 1) code and date of service in a shape. */
export function lineOf(shape: Shape, n: number): { readonly code: string; readonly serviceDate: string } {
  const index = n - 1;
  const [day, code] =
    shape === 'R'
      ? [Math.floor(index / R_LINES_PER_DATE), CODES[Math.floor((index % R_LINES_PER_DATE) / (R_LINES_PER_DATE / CODES.length))]]
      : shape === 'A'
        ? [index % A_DATES, CODES[Math.floor(index / A_DATES) % CODES.length]]
        : [index % F_DATES, CODES[0]];
  return { code: code as string, serviceDate: new Date(FIRST_DAY + day * 86_400_000).toISOString().slice(0, 10) };
}

/** The most lines a shape's dates hold before LED-06's payment. */
export const mostLines = (shape: Shape): number => (shape === 'R' ? 180 * R_LINES_PER_DATE : Number.MAX_SAFE_INTEGER);

/** A fixture's segments, without their terminators. */
const segmentsOf = (fixture: string) =>
  readFileSync(path.join(FIXTURES, fixture), 'latin1')
    .split('~')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

/** A one-transaction fixture's envelope (ISA, GS), its transaction's header (ST to LX) and its claim loops' segments. */
function template(fixture: string) {
  const segments = segmentsOf(fixture);
  const firstClaim = segments.findIndex((segment) => segment.startsWith('CLP*'));
  const se = segments.findIndex((segment) => segment.startsWith('SE*'));
  return { envelope: segments.slice(0, 2), header: segments.slice(2, firstClaim), claims: segments.slice(firstClaim, se) };
}

const ORIGINAL = template('LED-06/original.835');
const ADJUSTED = template('LED-06/adjusted.835');

const number = (n: number) => String(n).padStart(6, '0');
const patientControlNumber = (n: number) => `SYNPCNCAP${number(n)}`;

/** Case line n's claim loops: LED-06's (the original's, or the reversal and correction) with its numbers, code and date. */
function claimLoops(shape: Shape, loops: readonly string[], n: number): string[] {
  const { serviceDate, code } = lineOf(shape, n);
  return loops.map((segment) =>
    segment
      .replaceAll('SYNPCNLED06001', patientControlNumber(n))
      .replaceAll('SYNCCNLED060001', `SYNCCNCAP${number(n)}`)
      .replaceAll('SYNCCNLED060002', `SYNCCNCAP${number(n)}A`)
      .replace(/^SVC\*HC:97110\*/, `SVC*HC:${code}*`)
      .replace(/^DTM\*472\*\d{8}$/, `DTM*472*${serviceDate.replaceAll('-', '')}`),
  );
}

const amountOf = (cents: number) => (cents / 100).toFixed(2);

/** One interchange (ISA13 `control`), a transaction a check: its header with the check's amount and trace, its claims. */
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
    throw new Error('a step-7b 835 must carry the synthetic marker');
  }
  return Buffer.from(text, 'latin1');
}

/** The posting export (LED-06's template, SYNTHETIC PM EXPORT v1): one line-level row per case line, its correction's payment. */
function postingExport(shape: Shape, rows: readonly { readonly trace: string; readonly n: number }[]): Buffer {
  const [header] = readFileSync(path.join(FIXTURES, 'LED-06/posting-export.csv'), 'utf8').split(/\r?\n/);
  const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
  const lines = rows.map((row) => `06/10/2026,${row.trace},SYNTHETIC PAYER L,${patientControlNumber(row.n)},${lineOf(shape, row.n).code},${usDate(lineOf(shape, row.n).serviceDate)},100.00,SYNBATCH-CAP,SYNTHSENDER`);
  return Buffer.from(`${[header, ...lines].join('\r\n')}\r\n`, 'utf8');
}

/** A practice seeded for a step-7b pass, and the export whose reconcile is that pass. */
export interface Seeded {
  readonly practice: Practice;
  readonly lines: number;
  readonly exportId: string;
  readonly cases: number;
  readonly setupMs: number;
}

/**
 * Seeds a practice of `lines` case lines in `shape` (see above) for a step-7b pass, through the job code, and ends with
 * every table analyzed (the planner's statistics of a seeded practice; the pass's own writes then land in tables whose
 * statistics predate them, as a weekly run's do). `tag` keeps two practices' traces and interchanges apart in one
 * world.
 */
export async function seedStep7b(w: LedgerWorld, shape: Shape, lines: number, tag: number): Promise<Seeded> {
  if (!Number.isInteger(lines) || lines < CHECK_CLAIMS || lines > mostLines(shape) || tag < 0 || tag > 9) {
    throw new RangeError('a step-7b practice needs a whole number of lines its dates can hold, and a tag of one digit');
  }
  const started = performance.now();
  const practice = await w.practice(`SUITE-CAP-3 step 7b ${shape} ${String(lines)} ${String(tag)}`, ledSettings('posted'));
  const parse = parseHandler(w.triage.pricing.parseServices);
  const load = async (fixture: string, bytes: Buffer) => {
    const documentId = await w.triage.pricing.stage(practice, fixture, bytes);
    await parse({ practice_id: practice.practiceId, document_id: documentId }, w.jobContext(practice));
  };
  const trace = (kind: string, k: number) => `SYNEFTCAP${String(tag)}${kind}${String(k).padStart(5, '0')}`;
  const control = (base: number, k: number) => base + tag * 10_000 + k;

  // The original payments: one check of up to CLAIMS_PER_ORIGINAL claims a file.
  for (let first = 1, file = 0; first <= lines; first += CLAIMS_PER_ORIGINAL, file += 1) {
    const count = Math.min(CLAIMS_PER_ORIGINAL, lines - first + 1);
    const loops = Array.from({ length: count }, (_, index) => claimLoops(shape, ORIGINAL.claims, first + index)).flat();
    await load('LED-06/original.835', interchange(ORIGINAL, control(440_000_000, file), [{ trace: trace('O', file), amount: amountOf(7000 * count), loops }]));
  }
  const schedule = (shape === 'F' ? CODES.slice(0, 1) : CODES).map((code) => ({ code, amountCents: '5000' }));
  const { versionId } = await w.triage.fixedContract(practice, { schedule, effectiveFrom: '2025-01-01', disputeWindowDays: 3650 });
  // Mapped from the contract's own start (pricedRun would map from 2026-01-01), so the dates may begin in 2025.
  await w.triage.pricing.mapped(practice, await w.triage.pricing.planOf(practice, LED_PLAN), 'contract', '2025-01-01', versionId);
  const dates = Array.from({ length: lines }, (_, index) => lineOf(shape, index + 1).serviceDate).sort();
  const runId = await w.triage.pricedRun(practice, { plans: [{ key: LED_PLAN, versionId }], from: dates[0] as string, to: dates.at(-1) as string });
  await w.triage.triage(practice, runId);
  const [counted] = await w.rows<{ lines: number; cases: number }>(practice, 'SELECT count(*)::int AS lines, count(DISTINCT case_id)::int AS cases FROM case_line WHERE practice_id = $1', [practice.practiceId]);
  if (counted?.lines !== lines) {
    throw new Error('triage did not put every line of the step-7b practice in a case');
  }

  // The reprocessing: checks of CHECK_CLAIMS claims, each claim's reversal and correction; CHECKS_PER_FILE checks a
  // file.
  const checks: { trace: string; lines: number[] }[] = [];
  for (let first = 1; first <= lines; first += CHECK_CLAIMS) {
    checks.push({ trace: trace('R', checks.length + 1), lines: Array.from({ length: Math.min(CHECK_CLAIMS, lines - first + 1) }, (_, index) => first + index) });
  }
  for (let start = 0, file = 0; start < checks.length; start += CHECKS_PER_FILE, file += 1) {
    const batch = checks.slice(start, start + CHECKS_PER_FILE);
    await load(
      'LED-06/adjusted.835',
      interchange(
        ADJUSTED,
        control(450_000_000, file),
        batch.map((check) => ({ trace: check.trace, amount: amountOf(3000 * check.lines.length), loops: check.lines.flatMap((n) => claimLoops(shape, ADJUSTED.claims, n)) })),
      ),
    );
  }
  const exportId = await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export', postingExport(shape, checks.flatMap((check) => check.lines.map((n) => ({ trace: check.trace, n })))));
  await w.owner.query('ANALYZE');
  return { practice, lines, exportId, cases: counted.cases, setupMs: performance.now() - started };
}

/** One statement the measured pass issued, in issue order. */
export interface Issued {
  readonly text: string;
  readonly values: readonly unknown[];
  readonly rowCount: number;
  /** Its rows, for the statements `keepRows` names; else empty. */
  readonly rows: readonly Record<string, unknown>[];
  readonly ms: number;
}

/** One decrypt the pass made: its column and how many statements had been issued before it (never its value). */
export interface Decrypted {
  readonly column: string;
  readonly ciphertext: string;
  readonly after: number;
}

export interface Measured {
  readonly summary: ReconcileSummary;
  readonly statements: readonly Issued[];
  readonly decrypts: readonly Decrypted[];
  readonly passMs: number;
}

/** The side recording decrypts, carried by the pass's own async context (a timed-out pass never records into the next). */
const recording = new AsyncLocalStorage<{ readonly decrypts: Decrypted[]; readonly issued: () => number }>();
let wrapped = false;

/** Wraps PracticeCipher.decrypt once for the process: each call is recorded for the pass running, never logged. */
function wrapDecrypt(): void {
  if (wrapped) {
    return;
  }
  wrapped = true;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype's own method, called with its receiver below
  const original = PracticeCipher.prototype.decrypt;
  PracticeCipher.prototype.decrypt = function decrypt(this: PracticeCipher, column, ciphertext) {
    recording.getStore()?.decrypts.push({ column, ciphertext, after: recording.getStore()?.issued() ?? 0 });
    return original.call(this, column, ciphertext);
  };
}

/**
 * The reconcile step (reconcilePractice, as the reconcile job runs it) of `documentId` for the practice, through the
 * recording proxy: each statement's text, parameters, row count and time, and the rows of those `keepRows` accepts.
 * `pass` is the reconcile under test (the shipped one unless named).
 */
export async function measuredPass(
  w: LedgerWorld,
  practice: Practice,
  documentId: string,
  keepRows: (text: string) => boolean,
  pass: (context: JobContext, services: ReconcileServices, practiceId: string, options: { readonly documentId?: string }) => Promise<ReconcileSummary> = reconcilePractice,
): Promise<Measured> {
  wrapDecrypt();
  const statements: Issued[] = [];
  const decrypts: Decrypted[] = [];
  const base = w.jobContext(practice);
  const context: JobContext = {
    ...base,
    transaction: (work) =>
      base.transaction((scope) => {
        const client = scope.client;
        const query = async (text: string, values: readonly unknown[]) => {
          const started = performance.now();
          const result = await client.query(text, values as unknown[]);
          statements.push({ text, values, rowCount: result.rowCount ?? 0, rows: keepRows(text) ? result.rows : [], ms: performance.now() - started });
          return result;
        };
        const proxied = new Proxy(client, {
          get(target, property, receiver) {
            if (property === 'query') {
              return (text: string | { text: string; values?: unknown[] }, values?: unknown[]) => (typeof text === 'string' ? query(text, values ?? []) : query(text.text, text.values ?? []));
            }
            const value: unknown = Reflect.get(target, property, receiver);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          },
        });
        Object.defineProperty(scope, 'client', { value: proxied, configurable: true, writable: true });
        return work(scope);
      }),
  };
  const started = performance.now();
  const summary = await recording.run({ decrypts, issued: () => statements.length }, () => pass(context, w.services, practice.practiceId, { documentId }));
  return { summary, statements, decrypts, passMs: performance.now() - started };
}

/** The statement families the bounds and budgets count, by their text (the shipped pass's, and the per-line reference's). */
export const FAMILY = {
  /** caseLines' read, where the remittances' step (and the search) begins. */
  caseLines: /FROM case_line cl JOIN "case" k/,
  /** passCandidates' control-number search, one a round. */
  control: /\bprobe \(ix, claim_id\) AS \(/,
  /** The patient search's statement (a). */
  patient: /\bnamed \(ix, claim_id\) AS \(/,
  /** The patient search's statement (b), patientPairs. */
  patientPairs: /\bp \(claim_id, ix\) AS \(SELECT \* FROM unnest/,
  /** The per-line reference's candidate queries (candidatesFor), two a line a round. */
  perLine: /c\.id <> ALL \(\$2::uuid\[\]\)/,
  /** claimLines: every caller issues this one text. */
  claimLines: /^\s*WITH RECURSIVE named \(id\) AS \(/,
  lineStatus: /^\s*INSERT INTO line_status\b/,
  ledgerMatch: /^\s*INSERT INTO ledger_match\b/,
  ledgerEntry: /^\s*INSERT INTO ledger_entry\b/,
  /** D15's never-matched read. */
  neverMatched: /\bEXCEPT SELECT m\.(posting_row_id|eft_row_id) FROM ledger_match m\b/,
  postingRows: /FROM posting_row p\s+WHERE p\.practice_id = \$1 AND p\.id = ANY \(\$2::uuid\[\]\)/,
  eftRows: /FROM eft_row e\s+WHERE e\.practice_id = \$1 AND e\.id = ANY \(\$2::uuid\[\]\)/,
  /** D7's read of a remittance's claims. */
  remittanceClaims: /^SELECT c\.id, c\.paid_cents::text AS paid_cents, c\.patient_control_number FROM claim c WHERE c\.remittance_id = \$1/,
  /** remittancesOf: a posting row's check. */
  remittancesOf: /^SELECT r\.id, r\.bpr02_cents::text AS payment_cents FROM remittance r WHERE r\.practice_id = \$1 AND r\.trn02 = \$2/,
  /** A posting row's named claims' lines. */
  namedLines: /^SELECT s\.claim_id, s\.procedure_code, s\.service_date::text AS service_date, s\.paid_cents::text AS paid_cents FROM service_line s WHERE s\.claim_id = ANY/,
} as const;

/** The search's statements: the candidate searches (the pass's and the per-line reference's). */
export const isSearch = (text: string): boolean => FAMILY.control.test(text) || FAMILY.patient.test(text) || FAMILY.patientPairs.test(text) || FAMILY.perLine.test(text);

/** How many statements of a family the pass issued. */
export const countOf = (measured: Measured, family: RegExp): number => measured.statements.filter((statement) => family.test(statement.text)).length;

/** The pass's own part: its time less its ledger_entry insert statements' (whose triggers are Lane A's; design section 14.1). */
export const ownMs = (measured: Measured): number => measured.passMs - measured.statements.filter((statement) => FAMILY.ledgerEntry.test(statement.text)).reduce((sum, statement) => sum + statement.ms, 0);
