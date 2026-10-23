import { randomUUID } from 'node:crypto';

import { openPool, screeningDevLoginUrl } from '@tp/db';
import { createLogger } from '@tp/observability';
import { type ExpiryResult, type RunningWorker, SCREENING_THREADS, expireScreenings, startScreeningConsumer, startWorker } from '@tp/worker/runtime';
import { PgBoss } from 'pg-boss';

import { E2E_MAIL_EVENTS_DIR, E2E_MAIL_OUTBOX_DIR, E2E_MAIL_STREAM_PREFIX, E2E_ORIGIN, e2eDatabaseUrl } from './env';
import type { OutboxMessage } from './outbox';

/**
 * The free screening's journey support (Change Order 001, CO-04): an upload built in memory from SYNTHETIC rows (no
 * CSV is committed; the fixture rules refuse a table that is not synthetic, and these rows are totals, never a
 * patient's), the screening's own consumer running beside the e2e server as WORKER_JOBS=screening runs it, the
 * expiry job run once on an operator pool of the e2e database (the login switches to tp_operator in each transaction,
 * as the platform worker's does), and the prospect's emails as the local outbox holds them. The ZIP is release 900001's locality ZIP that
 * needs no ZIP+4 (00011); every code is one the release's SYNTHETIC fee schedule prices, in its 2026 quarters (the one
 * row of 2025, OUTSIDE_ROWS, is the browser's to leave out).
 */

export const SCREENING_ZIP = '00011';
/** release 900001's ZIP whose locality needs the ZIP+4 (plus_four_required). */
export const SCREENING_ZIP_PLUS_FOUR = '00012';

/** The eight columns, in the template's order. */
export const SCREENING_HEADER = ['procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count'] as const;

export type ScreeningCsvRow = readonly [code: string, modifiers: string, units: string, place: string, product: string, band: string, allowed: string, claims: string];

/**
 * A clean SYNTHETIC upload: Medicare-priced rows (Original Medicare and Medicare Advantage without a contract), one
 * place of service the approved split leaves out (so the engine leaves it unpriced), rows that cannot be priced
 * without a contract (Medicare Advantage under contract, commercial) and one row a screening does not price
 * (Medicaid), each of at least 11 claim lines. G01's codes stand in for the owner's rulings of 2026-10-18: 97110 GP at
 * $18.00 a line lies between its two figures (within the range of the reduction across codes), and 97140 GP at $12.00
 * a line is more than $5 a line below its fully reduced figure (an anomaly).
 */
export const CLEAN_ROWS: readonly ScreeningCsvRow[] = [
  ['97110', 'GP', '1', '11', 'ma_noncontracted', '2026-Q1', '720.00', '40'],
  ['97110', 'GP', '1', '11', 'medicare_ffs', '2026-Q2', '900.00', '30'],
  ['97140', 'GP', '1', '11', 'ma_noncontracted', '2026-Q2', '600.00', '50'],
  ['97530', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1200.50', '12'],
  ['97112', 'GP', '1', '99', 'medicare_ffs', '2026-Q1', '825.00', '11'],
  ['97110', 'GP', '1', '11', 'ma_contracted', '2026-Q1', '3,000.00', '60'],
  ['97140', 'GP 59', '1', '11', 'commercial', '2026-Q2', '$4,321.09', '45'],
  ['97116', '', '1', '11', 'medicaid', '2026-Q2', '150.00', '12'],
];

/**
 * Rows of fewer than 11 claim lines (the CMS small-cell standard; the founder's ruling of 2026-10-18): each could be
 * one patient's service line, so the browser leaves them out before sending and says how many rows, claim lines and
 * dollars it left out. Their code and quarter are in no clean row, so a request that carried them would show it.
 */
export const SMALL_ROWS: readonly ScreeningCsvRow[] = [
  ['97164', 'GP', '1', '11', 'medicare_ffs', '2026-Q3', '36.84', '1'],
  ['97164', 'GP', '1', '11', 'commercial', '2026-Q3', '400.00', '10'],
];

/** What the browser counts of SMALL_ROWS, and the result shows: 2 rows, 11 claim lines, $436.84. */
export const SMALL_LEFT_OUT = { rows: 2, claimLines: 11, allowedCents: 43_684n, allowed: '$436.84' } as const;

/**
 * A Medicare row in a quarter before release 900001's loaded MPPR and MUE content (2026): the browser leaves it out and
 * counts it, apart from the small rows, and says which quarters are loaded (audit #7; the founder's answer of 2026-10-21
 * to PR 6b's Q6 (a)). Its code and quarter are in no other row, so a request that carried it would show it.
 */
export const OUTSIDE_ROWS: readonly ScreeningCsvRow[] = [['97035', '', '1', '11', 'medicare_ffs', '2025-Q4', '412.00', '12']];

/** What the browser counts of OUTSIDE_ROWS, and the result shows: 1 row, 12 claim lines, $412.00. */
export const OUTSIDE_LEFT_OUT = { rows: 1, claimLines: 12, allowedCents: 41_200n, allowed: '$412.00' } as const;

/** Rows as CSV lines, each CRLF-terminated as a spreadsheet writes it, quoting a cell with a comma. */
export function screeningRowsCsv(rows: readonly (readonly string[])[]): Buffer {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return Buffer.from(rows.map((row) => `${row.map(cell).join(',')}\r\n`).join(''), 'utf8');
}

/** A CSV of the rows under a header, CRLF-terminated as a spreadsheet writes it, quoting a cell with a comma. */
export function screeningCsv(rows: readonly (readonly string[])[], header: readonly string[] = SCREENING_HEADER): Buffer {
  return screeningRowsCsv([header, ...rows]);
}

/**
 * The clean header with a fourth column a prospect's billing system adds, "Member ID", and SYNTHETIC values in it:
 * refused in the browser, the column named, before anything is sent.
 */
export function memberIdCsv(): Buffer {
  const header = [...SCREENING_HEADER.slice(0, 3), 'Member ID', ...SCREENING_HEADER.slice(3)];
  return screeningCsv(
    CLEAN_ROWS.slice(0, 2).map((row, index) => [...row.slice(0, 3), `SYNTHMBR${String(index + 1).padStart(4, '0')}`, ...row.slice(3)]),
    header,
  );
}

/** A clean header with a date of service in place of the quarter: refused, the column named. */
export function dateOfServiceCsv(): Buffer {
  const header = [...SCREENING_HEADER.slice(0, 5), 'DOS', ...SCREENING_HEADER.slice(6)];
  return screeningCsv([['97110', 'GP', '1', '11', 'medicare_ffs', '2026-02-03', '60.00', '1']], header);
}

/** The result link a screening email carries: the origin, /screening/results/ and the 32-letter token. */
export function resultLinkIn(message: OutboxMessage): string {
  const link = /https?:\/\/[^\s]+\/screening\/results\/[a-z]{32}/.exec(message.body)?.[0];
  if (link === undefined) {
    throw new Error('the screening email holds no result link');
  }
  return link;
}

/** An operator pool on the e2e database: its superuser login, which the expiry's transactions switch to tp_operator. */
async function withOperator<T>(run: (operator: ReturnType<typeof openPool>) => Promise<T>): Promise<T> {
  const operator = openPool(e2eDatabaseUrl(), 2);
  try {
    return await run(operator);
  } finally {
    await operator.end();
  }
}

/**
 * The screening's own consumer, as WORKER_JOBS=screening runs it (docs/adr/0062; PR 6b-3): its pricing threads (three,
 * as production's task), on the screening's dev login (tp_screening_dev, which switches to tp_screening in each
 * transaction), working screening_price and its minute's sweep from the e2e database's queue, and emailing to the local
 * outbox at the e2e server's origin. The platform no longer prices a screening, so a journey that screens starts this
 * and waits for the email the consumer sends.
 */
export async function startLocalScreeningConsumer(): Promise<{ worker: RunningWorker; close: () => Promise<void> }> {
  const boss = new PgBoss(e2eDatabaseUrl());
  boss.on('error', () => undefined);
  const logger = createLogger({ sink: () => undefined });
  const screening = await startScreeningConsumer(
    {
      databaseUrl: screeningDevLoginUrl(e2eDatabaseUrl()),
      concurrency: SCREENING_THREADS,
      // Each message's SES-shaped events go beside the outbox, for the mail journeys' platform job (docs/adr/0065).
      notifications: { mail: { kind: 'local', dir: E2E_MAIL_OUTBOX_DIR, eventsDir: E2E_MAIL_EVENTS_DIR, streamPrefix: E2E_MAIL_STREAM_PREFIX }, appOrigin: E2E_ORIGIN, staticAssetOrigin: null },
    },
    boss,
    logger,
    { workerId: `e2e-screening-${randomUUID()}` },
  );
  const worker = await startWorker({ boss, logger, screening, heartbeatMs: 60_000, shutdownTimeoutMs: 10_000 });
  return { worker, close: () => worker.stop() };
}

/** The screening_expiry job, once: every screening past its 30 days deleted, each with its audit event. */
export function expireScreeningsOnce(): Promise<ExpiryResult> {
  return withOperator((operator) => expireScreenings({ operator, jobId: randomUUID() }));
}
