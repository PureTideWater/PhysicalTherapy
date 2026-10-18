import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { openPool } from '@tp/db';
import { createLogger } from '@tp/observability';
import { type ExpiryResult, LocalMailSender, type SweepResult, expireScreenings, sweepScreeningRuns } from '@tp/worker/runtime';

import { E2E_MAIL_OUTBOX_DIR, E2E_ORIGIN, e2eDatabaseUrl } from './env';

/**
 * The free screening's journey support (Change Order 001, CO-04): an upload built in memory from SYNTHETIC rows (no
 * CSV is committed; the fixture rules refuse a table that is not synthetic, and these rows are totals, never a
 * patient's), the worker's two screening jobs run once on an operator pool of the e2e database (the login switches to
 * tp_operator in each transaction, as the platform worker's does), and the prospect's emails as the local outbox
 * holds them. The ZIP is release 900001's locality ZIP that
 * needs no ZIP+4 (00011); every code is one the release's SYNTHETIC fee schedule prices, in its 2026 quarters.
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
 * (Medicaid). G01's codes stand in for the owner's rulings of 2026-10-18: 97110 GP at $18.00 a line lies between its
 * two figures (within the range of the reduction across codes), and 97140 GP at $12.00 a line is more than $5 a line
 * below its fully reduced figure (an anomaly).
 */
export const CLEAN_ROWS: readonly ScreeningCsvRow[] = [
  ['97110', 'GP', '1', '11', 'ma_noncontracted', '2026-Q1', '720.00', '40'],
  ['97110', 'GP', '1', '11', 'medicare_ffs', '2026-Q2', '900.00', '30'],
  ['97140', 'GP', '1', '11', 'ma_noncontracted', '2026-Q2', '600.00', '50'],
  ['97530', 'GP', '2', '11', 'medicare_ffs', '2026-Q1', '1200.50', '12'],
  ['97112', 'GP', '1', '99', 'medicare_ffs', '2026-Q1', '75.00', '2'],
  ['97110', 'GP', '1', '11', 'ma_contracted', '2026-Q1', '3,000.00', '60'],
  ['97140', 'GP 59', '1', '11', 'commercial', '2026-Q2', '$4,321.09', '45'],
  ['97116', '', '1', '11', 'medicaid', '2026-Q2', '150.00', '10'],
];

/** A CSV of the rows under a header, CRLF-terminated as a spreadsheet writes it, quoting a cell with a comma. */
export function screeningCsv(rows: readonly (readonly string[])[], header: readonly string[] = SCREENING_HEADER): Buffer {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return Buffer.from([header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n').concat('\r\n'), 'utf8');
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

export interface OutboxMessage {
  readonly to: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly html: string;
}

/** The messages the local outbox holds for one address, oldest first. */
export function outboxFor(email: string): OutboxMessage[] {
  if (!existsSync(E2E_MAIL_OUTBOX_DIR)) {
    return [];
  }
  return readdirSync(E2E_MAIL_OUTBOX_DIR)
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(E2E_MAIL_OUTBOX_DIR, file), 'utf8')) as OutboxMessage)
    .filter((message) => message.to.includes(email));
}

/** The result link a screening email carries: the origin, /screening/results/ and the 32-letter token. */
export function resultLinkIn(message: OutboxMessage): string {
  const link = /https?:\/\/[^\s]+\/screening\/results\/[a-z]{32}/.exec(message.body)?.[0];
  if (link === undefined) {
    throw new Error('the screening email holds no result link');
  }
  return link;
}

/** An operator pool on the e2e database: its superuser login, which each transaction switches to tp_operator. */
async function withOperator<T>(run: (operator: ReturnType<typeof openPool>) => Promise<T>): Promise<T> {
  const operator = openPool(e2eDatabaseUrl(), 2);
  try {
    return await run(operator);
  } finally {
    await operator.end();
  }
}

/**
 * The screening_price job's sweep, once, as the platform worker runs it every minute, but for runs of any age: each
 * queued run is priced and its link emailed to the local outbox at the e2e server's origin.
 */
export function priceScreeningsOnce(): Promise<SweepResult> {
  return withOperator((operator) =>
    sweepScreeningRuns({ operator, mail: new LocalMailSender(E2E_MAIL_OUTBOX_DIR, null), appOrigin: E2E_ORIGIN, logger: createLogger({ sink: () => undefined }), jobId: randomUUID() }, { minQueuedAgeSeconds: 0 }),
  );
}

/** The screening_expiry job, once: every screening past its 30 days deleted, each with its audit event. */
export function expireScreeningsOnce(): Promise<ExpiryResult> {
  return withOperator((operator) => expireScreenings({ operator, jobId: randomUUID() }));
}
