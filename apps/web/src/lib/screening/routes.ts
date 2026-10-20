import { PROSPECT_BILLING_ARRANGEMENTS, type ScopeClient, type ScopePool } from '@tp/db/runtime';
import { type Cents, cents } from '@tp/money';
import { textPhiFindings } from '@tp/observability';
import {
  PHI_KIND_LABELS,
  SCREENING_COLUMNS,
  SCREENING_MAX_FILE_BYTES,
  SCREENING_MAX_HEADER_CELLS,
  SCREENING_MAX_HEADER_LENGTH,
  SCREENING_MAX_REASONS,
  SCREENING_MAX_ROWS,
  SCREENING_MAX_ROWS_TEXT,
  SCREENING_MIN_CLAIM_LINES,
  SCREENING_PAYER_PRODUCTS,
  SCREENING_STATES,
  SCREENING_TOKEN,
  type ScreeningColumn,
  type ScreeningLeftOut,
  type ScreeningRejection,
  type ScreeningRow,
  checkHeaders,
  decodeScreeningRows,
  leftOutPlausible,
  screeningTokenHash,
  storableRejections,
} from '@tp/worker/screening';
import { z } from 'zod';

import { platformRoute, publicRoute } from '../http/invoke';
import { InputError, type Issue, type MutationResult, NotFoundError } from '../http/route';
import { BILLING_ARRANGEMENT_LABELS } from '../routes/onboarding';
import { optionalText } from '../routes/schemas';
import { SCREENING_STANDINGS, type ScreeningStanding } from './labels';
import { screeningRateAccount } from './rate';

/**
 * The free screening's routes (Change Order 001, CO-04; reconciliation-001 D18 to D21; docs/adr/0062):
 *
 * - The screening page (/screening, public): whether screening is open (a rule release in force and a place-of-service
 *   split approved; production stays closed until release 1), the columns, products, states and limits.
 * - The upload (/screening, public action, the screening rate limit: per client address, and per email domain or
 *   free-mail mailbox). Nothing is recorded while screening is closed. The browser parsed the file and sends no byte
 *   of it: the hash, the header's canonical column names, the row count and the rows' totals in their canonical form,
 *   and how many rows of fewer than 11 claim lines it left out, their claim lines and their allowed total (three
 *   numbers; never which rows). The server checks the form's fields (an address it can mail: plain ASCII, a dotted
 *   domain), the header names and every row again; a row of fewer than 11 claim lines, sent around the browser, is
 *   refused by its row number (it can be one patient's service line). A refused upload is recorded by hash, count and
 *   reasons alone (reject_screening_upload()), and its messages name a column by position and kind, never a header's
 *   text or a cell's value. A clean one is stored
 *   and queued for pricing in one call (submit_screening()), and the browser says to check the email: the result's
 *   link goes to the contact address only. A ZIP whose Medicare locality needs its ZIP+4 is refused: the engine
 *   takes a five-digit ZIP alone, so no ZIP+4 is asked for or kept. The refusal stays until PR 6b, which takes a
 *   ZIP+4 and resolves its locality before launch (the founder's ruling of 2026-10-18, 11:47 UTC, superseding ruling 3).
 * - The result (/screening/results/[resultId], public): the token in the link, looked up by its SHA-256 alone; a link
 *   that is unknown, expired or not yet complete is not found. Every figure is the database's bigint sum of the
 *   engine's per-row results, before sequestration; a code in the reduction across codes has two figures (before
 *   the reduction, and fully reduced), and where each row and group stands is the database's (screening_standing()).
 *   A result under a release since withdrawn keeps its notice and may still be converted.
 * - The conversion (/screening/results/[resultId], public action, the public form's rate limit): an audit request
 *   from the screening, an audit event that outlives the screening's expiry.
 * - The console's split (/console/screening): the contract specialist (rate_record.approve) approves the platform's
 *   default place-of-service split; a person, never a model.
 *
 * Public routes open no session scope: each runs one SECURITY DEFINER function on the application's pool, as the
 * audit request does, and the function writes the audit event.
 */

const HEX64 = /^[0-9a-f]{64}$/;
/**
 * An address the mail service can send to, lower-cased: an RFC 5322 dot-atom before the @ (no leading, trailing or
 * doubled dot), and a domain of at least two dotted labels with no trailing dot; plain ASCII only. The
 * screening_prospect_contact_email CHECK holds the same.
 */
export const SCREENING_EMAIL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** A form field as the wrapper receives it: bounded text, blank when missing, so the rate limit counts first. */
const field = (max: number) => z.string().max(max, `at most ${String(max)} characters`).default('');

export interface ScreeningLimits {
  readonly maxRows: number;
  readonly maxFileBytes: number;
  readonly maxHeaderCells: number;
  readonly maxHeaderLength: number;
  readonly maxReasons: number;
  /** The fewest claim lines a row may sum (the CMS small-cell standard): a smaller row is left out before sending. */
  readonly minClaimLines: number;
}

export const SCREENING_LIMITS: ScreeningLimits = {
  maxRows: SCREENING_MAX_ROWS,
  maxFileBytes: SCREENING_MAX_FILE_BYTES,
  maxHeaderCells: SCREENING_MAX_HEADER_CELLS,
  maxHeaderLength: SCREENING_MAX_HEADER_LENGTH,
  maxReasons: SCREENING_MAX_REASONS,
  minClaimLines: SCREENING_MIN_CLAIM_LINES,
};

export interface ScreeningPageData {
  readonly sent: boolean;
  /** A rule release is in force and a place-of-service split is approved. */
  readonly open: boolean;
  readonly releaseNo: number | null;
  readonly columns: readonly ScreeningColumn[];
  readonly products: readonly (typeof SCREENING_PAYER_PRODUCTS)[number][];
  readonly states: readonly string[];
  readonly limits: ScreeningLimits;
  /**
   * The server's clock as it built the page (ISO 8601, UTC). The browser dates a file's quarters by it, moved on by its
   * own clock since, so the server never refuses as after the current quarter a row the page sent (whose number, once
   * rows of fewer than 11 claim lines are left out, would not be the file's), and a wrong computer clock refuses
   * nothing the server takes.
   */
  readonly serverTime: string;
}

async function withClient<T>(pool: ScopePool<ScopeClient>, work: (client: ScopeClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

function pgError(error: unknown): { readonly code: string; readonly constraint: string | undefined } | null {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    const constraint = 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
    return { code: error.code, constraint };
  }
  return null;
}

export const screeningPage = publicRoute({
  id: 'public.screening_page',
  kind: 'page',
  path: '/screening',
  phi: false,
  params: z.object({ sent: optionalText(z.literal('1')) }),
  handle: async ({ params, services }): Promise<ScreeningPageData> => {
    const { open, releaseNo } = await screeningOpen(services.pool);
    return {
      sent: params.sent !== undefined,
      open,
      releaseNo,
      columns: SCREENING_COLUMNS,
      products: SCREENING_PAYER_PRODUCTS,
      states: SCREENING_STATES,
      limits: SCREENING_LIMITS,
      serverTime: services.now().toISOString(),
    };
  },
});

/** The column a server message names: its position, never the header the person typed. */
function columnName(reason: ScreeningRejection): string {
  return reason.column === undefined ? 'A column' : `Column ${String(reason.column)}`;
}

const FIELD_NAMES: Readonly<Record<ScreeningColumn, string>> = {
  procedure_code: 'procedure code',
  modifiers: 'modifiers',
  units: 'units',
  place_of_service: 'place of service',
  payer_product: 'payer product',
  service_band: 'service band',
  allowed_total: 'allowed total',
  claim_count: 'claim count',
};

/** A refusal's reason as the server words it: positions, rows, fields and kinds only. */
export function screeningReasonMessage(reason: ScreeningRejection): string {
  const row = reason.row === undefined ? 'A row' : `Row ${reason.row.toLocaleString('en-US')}`;
  const fieldName = reason.field === undefined ? 'a column' : FIELD_NAMES[reason.field];
  switch (reason.code) {
    case 'phi_column':
      return `${columnName(reason)} holds ${reason.phi === undefined ? 'patient information' : PHI_KIND_LABELS[reason.phi]}; remove it and upload again`;
    case 'unknown_column':
      return `${columnName(reason)} is not one of the eight screening columns; remove it`;
    case 'duplicate_column':
      return `${columnName(reason)} is a second ${fieldName} column; keep one`;
    case 'missing_column':
      return `The file has no ${fieldName} column; add it`;
    case 'row_shape':
      return `${row} does not have one cell for each column`;
    case 'invalid_value':
      return `${row}: the ${fieldName} is not in the screening’s format`;
    case 'band_holds_date':
      return `${row}: ${columnName(reason).toLowerCase()} holds dates of service; a screening takes a calendar quarter, such as 2026-Q1`;
    case 'band_in_future':
      return `${row}: the service band’s quarter has not started yet`;
    case 'duplicate_row':
      return `${row} repeats row ${reason.first_row === undefined ? 'above' : reason.first_row.toLocaleString('en-US')}; add the two into one row`;
    case 'no_rows':
      return 'The file has no rows under its header';
    case 'too_many_rows':
      return `A screening takes at most ${SCREENING_MAX_ROWS.toLocaleString('en-US')} rows`;
    case 'row_count_mismatch':
      return 'The rows sent do not match the file; choose the file again';
    case 'too_few_claim_lines': {
      const floor = String(SCREENING_MIN_CLAIM_LINES);
      const why = `a screening takes a row of at least ${floor} claim lines, so that no row can describe one patient’s care`;
      return reason.row === undefined ? `Every row sums fewer than ${floor} claim lines, so there is nothing to screen: ${why}` : `${row} sums fewer than ${floor} claim lines; ${why}: leave it out`;
    }
  }
}

interface ProspectFields {
  readonly practiceName: string;
  readonly state: string;
  readonly zip: string;
  readonly contactEmail: string;
}

/** The form's own fields, checked: what the prospect row needs, or the issues (no record is made for them). */
function prospectFields(input: { readonly practiceName: string; readonly state: string; readonly zip: string; readonly contactEmail: string }): ProspectFields {
  const issues: Issue[] = [];
  const practiceName = input.practiceName.trim();
  if (practiceName === '' || practiceName.length > 200) {
    issues.push({ field: 'practiceName', message: 'the practice’s name, at most 200 characters' });
  } else if (textPhiFindings(practiceName).length > 0) {
    issues.push({ field: 'practiceName', message: 'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number' });
  }
  const state = input.state.trim().toUpperCase();
  if (!(SCREENING_STATES as readonly string[]).includes(state)) {
    issues.push({ field: 'state', message: 'choose the state the practice bills from' });
  }
  const zip = input.zip.trim();
  if (!/^[0-9]{5}$/.test(zip)) {
    issues.push({ field: 'zip', message: 'the practice’s five-digit ZIP code' });
  }
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!SCREENING_EMAIL.test(contactEmail) || contactEmail.length > 254 || contactEmail.indexOf('@') > 64) {
    issues.push({ field: 'contactEmail', message: 'an email address: the result’s link is sent there' });
  }
  if (issues.length > 0) {
    throw new InputError(issues);
  }
  return { practiceName, state, zip, contactEmail };
}

/** A refusal's issues: one per reason kept (at most 20), the last saying how many more there were. */
function reasonIssues(reasons: readonly ScreeningRejection[], total: number): Issue[] {
  const issues = reasons.map((reason) => ({ field: 'upload', message: screeningReasonMessage(reason) }));
  if (total <= issues.length) {
    return issues;
  }
  const kept = issues.slice(0, SCREENING_MAX_REASONS - 1);
  const more = total - kept.length;
  return [...kept, { field: 'upload', message: `And ${more.toLocaleString('en-US')} more ${more === 1 ? 'problem' : 'problems'} like these` }];
}

const SCREENING_CLOSED: Issue = { field: 'input', message: 'screening is not open yet; try again later' };

/** Whether screening is open: a rule release in force and a place-of-service split approved. */
async function screeningOpen(pool: ScopePool<ScopeClient>): Promise<{ readonly open: boolean; readonly releaseNo: number | null }> {
  const status = await withClient(pool, async (client) => {
    const { rows } = await client.query<{ release_no: number | null; place_of_service_split_id: string | null }>('SELECT release_no, place_of_service_split_id FROM screening_status()');
    return rows[0];
  });
  const releaseNo = status?.release_no ?? null;
  const open = releaseNo !== null && (status?.place_of_service_split_id ?? null) !== null;
  return { open, releaseNo: open ? releaseNo : null };
}

/** The header cells the browser sent, or null when they are not a JSON array of at most 64 bounded strings. */
function headerCells(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const cells = z.array(z.string().max(SCREENING_MAX_HEADER_LENGTH)).max(SCREENING_MAX_HEADER_CELLS).safeParse(parsed);
  return cells.success ? cells.data : null;
}

/** The upload checked again: the rows, or the reasons it is refused (at most 20 kept) and how many there were. */
function checkUpload(
  headers: readonly string[],
  rowsText: string,
  rowCount: number,
  now: Date,
): { readonly rows: readonly ScreeningRow[] } | { readonly reasons: readonly ScreeningRejection[]; readonly total: number } {
  const header = checkHeaders(headers);
  if (!header.ok) {
    return { reasons: header.reasons, total: header.total };
  }
  const decoded = decodeScreeningRows(rowsText, now);
  if (!decoded.ok) {
    return { reasons: decoded.reasons, total: decoded.total };
  }
  if (decoded.rows.length !== rowCount) {
    return { reasons: [{ code: 'row_count_mismatch' }], total: 1 };
  }
  return { rows: decoded.rows };
}

const UPLOAD_UNREADABLE = 'the file could not be read here; choose it again';

/** A whole number the form sent, blank as zero (a request that names nothing left out), or null when it is not one. */
function wholeField(text: string, digits: number): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  return new RegExp(`^[0-9]{1,${String(digits)}}$`).test(trimmed) ? Number(trimmed) : null;
}

/** The rows the browser says it left out, as sent: three whole numbers, or null when one is not. */
function leftOutFields(input: { readonly leftOutRows: string; readonly leftOutClaimLines: string; readonly leftOutAllowedCents: string }): ScreeningLeftOut | null {
  const rows = wholeField(input.leftOutRows, 6);
  const claimLines = wholeField(input.leftOutClaimLines, 7);
  const allowed = wholeField(input.leftOutAllowedCents, 13);
  return rows === null || claimLines === null || allowed === null ? null : { rows, claimLines, allowedCents: cents(BigInt(allowed)) };
}

export const screeningSubmit = publicRoute({
  id: 'public.screening_submit',
  kind: 'action',
  path: '/screening',
  phi: false,
  rateLimit: 'screening',
  rateAccount: (input) => screeningRateAccount(input.contactEmail),
  params: z.object({}),
  input: z.object({
    practiceName: field(400),
    state: field(8),
    zip: field(16),
    contactEmail: field(320),
    fileSha256: field(64),
    // The header cells as JSON (the browser sends the columns' canonical names): at most 64 of 200 characters, each
    // escaped at worst to six.
    headers: field(SCREENING_MAX_HEADER_CELLS * (SCREENING_MAX_HEADER_LENGTH * 6 + 3) + 2),
    rowCount: field(12),
    rows: field(SCREENING_MAX_ROWS_TEXT),
    // The rows of fewer than 11 claim lines the browser left out: how many, their claim lines and their allowed total
    // in cents. Blank is none (a request built without the page).
    leftOutRows: field(12),
    leftOutClaimLines: field(12),
    leftOutAllowedCents: field(20),
  }),
  handle: async ({ input, services, request }): Promise<MutationResult> => {
    // Nothing about a prospect is recorded before screening opens (release 1), not even a refusal.
    if (!(await screeningOpen(services.pool)).open) {
      throw new InputError([SCREENING_CLOSED]);
    }
    const prospect = prospectFields(input);
    const fileSha256 = input.fileSha256.trim().toLowerCase();
    const headers = headerCells(input.headers);
    const rowCount = /^[0-9]{1,8}$/.test(input.rowCount.trim()) ? Number(input.rowCount.trim()) : null;
    const leftOut = leftOutFields(input);
    if (!HEX64.test(fileSha256) || headers === null || rowCount === null || leftOut === null) {
      throw new InputError([{ field: 'upload', message: UPLOAD_UNREADABLE }]);
    }
    const checked = checkUpload(headers, input.rows, rowCount, services.now());
    const prospectValues = [prospect.practiceName, prospect.state, prospect.zip, prospect.contactEmail];
    if ('reasons' in checked) {
      const reasons = storableRejections(checked.reasons);
      try {
        await withClient(services.pool, (client) =>
          client.query('SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8)', [...prospectValues, fileSha256, Math.min(rowCount, 10_000_000), JSON.stringify(reasons), request.requestId]),
        );
      } catch (error) {
        if (pgError(error)?.constraint === 'screening_closed') {
          throw new InputError([SCREENING_CLOSED]);
        }
        throw error;
      }
      throw new InputError(reasonIssues(reasons, checked.total));
    }
    const { rows } = checked;
    // What the browser says it left out must be what it could have counted beside these rows; nothing is recorded otherwise.
    if (!leftOutPlausible(leftOut, rows.length)) {
      throw new InputError([{ field: 'upload', message: UPLOAD_UNREADABLE }]);
    }
    let runId: string;
    try {
      runId = await withClient(services.pool, async (client) => {
        const result = await client.query<{ run_id: string }>('SELECT submit_screening($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) AS run_id', [
          ...prospectValues,
          fileSha256,
          rows.map((row) => row.procedureCode),
          rows.map((row) => row.modifiers.join(' ')),
          rows.map((row) => row.units),
          rows.map((row) => row.placeOfService),
          rows.map((row) => row.payerProduct),
          rows.map((row) => row.serviceBand),
          rows.map((row) => row.allowedCents.toString()),
          rows.map((row) => row.claimCount),
          leftOut.rows,
          leftOut.claimLines,
          leftOut.allowedCents.toString(),
          request.requestId,
        ]);
        return result.rows[0]?.run_id ?? '';
      });
    } catch (error) {
      const refused = pgError(error);
      if (refused?.code === '23514' || refused?.code === '23505') {
        throw new InputError([submitIssue(refused.constraint)]);
      }
      throw error;
    }
    try {
      await services.queue.enqueueScreeningRun(runId);
    } catch {
      // Not fatal: the run stays queued and the minute's sweep prices it.
      services.logger.warn('screening run not queued; the sweep will price it', { screening_run_id: runId, error_code: 'SCREENING_NOT_QUEUED' });
    }
    return { redirect: '/screening?sent=1' };
  },
});

/** What a refusal of submit_screening() says, by the rule it names. */
function submitIssue(constraint: string | undefined): Issue {
  switch (constraint) {
    case 'screening_closed':
      return SCREENING_CLOSED;
    case 'screening_zip_unknown':
      return { field: 'zip', message: 'this ZIP code is not in the Medicare locality map in force; check it' };
    case 'screening_zip_plus_four':
      return {
        field: 'zip',
        message: 'this ZIP code spans two Medicare localities, and a free screening cannot price one yet: its rows would need the ZIP+4, which the pricing does not take',
      };
    case 'screening_rows':
    case 'screening_result_once':
      return { field: 'upload', message: 'the rows could not be stored as sent; choose the file again' };
    case undefined:
    default:
      return { field: 'input', message: 'the screening could not be stored as sent; check the form and try again' };
  }
}

// ---------------------------------------------------------------------------------------------------
// The result

/** Rows, their claim lines and what the file says was allowed for them. */
export interface ScreeningGroupTotals {
  readonly rows: number;
  readonly claimLines: number;
  readonly observedCents: Cents;
}

export interface ScreeningPricedTotals extends ScreeningGroupTotals {
  /** The Medicare figure, before the reduction across codes (and before sequestration, as every figure). */
  readonly expectedCents: Cents;
  /** Expected less allowed. */
  readonly differenceCents: Cents;
  /** Rows of a code in the reduction across codes, each with a fully reduced figure. */
  readonly pooledRows: number;
  /** The lowest figures: the fully reduced figure for those rows, the one figure for the others. */
  readonly reducedCents: Cents;
  /** The lowest figures less allowed. */
  readonly reducedDifferenceCents: Cents;
}

export interface ScreeningSummary extends ScreeningGroupTotals {
  readonly practiceName: string;
  readonly state: string;
  readonly zip: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** The rule release the screening was priced under has since been withdrawn: its figures are under content known to be wrong. */
  readonly releaseWithdrawn: boolean;
  readonly priced: ScreeningPricedTotals;
  /** MA contracted and commercial rows: the dollars that cannot be priced without a contract. */
  readonly contractRequired: ScreeningGroupTotals;
  /** Medicaid and other rows. */
  readonly notScreened: ScreeningGroupTotals;
  /** Medicare rows the engine left unpriced, or whose rates change inside the quarter. */
  readonly couldNotPrice: ScreeningGroupTotals;
  /** Rows of fewer than 11 claim lines the browser left out before sending, as it counted them: in no other figure. */
  readonly leftOut: ScreeningGroupTotals;
}

export interface ScreeningResultGroup {
  readonly payerProduct: string;
  readonly procedureCode: string;
  readonly rows: number;
  readonly claimLines: number;
  readonly expectedCents: Cents;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  /** With a row of a code in the reduction across codes: the rows' lowest figures summed (the fully reduced one for such a row); null otherwise. */
  readonly reducedCents: Cents | null;
  /** That less allowed; null with it. */
  readonly reducedDifferenceCents: Cents | null;
  /** A row of it is in the reduction across a visit's codes, which a row priced alone is before. */
  readonly inReductionPool: boolean;
  /** How many of its rows are anomalies: more than $5 a claim line below their lowest figure. */
  readonly anomalyRows: number;
  /** At least one of its rows is an anomaly (the database's flag). */
  readonly anomaly: boolean;
  /** Where it stands (screening_standing(), the database's). */
  readonly standing: ScreeningStanding;
}

export interface ScreeningResultCoverage {
  readonly payerProduct: string;
  readonly disposition: string;
  readonly unpricedReason: string | null;
  readonly unpricedDetail: string | null;
  readonly rows: number;
  readonly claimLines: number;
  readonly observedCents: Cents;
}

export interface ScreeningResultRow {
  readonly rowNo: number;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly payerProduct: string;
  readonly serviceBand: string;
  readonly claimCount: number;
  readonly observedCents: Cents;
  readonly expectedLineCents: Cents;
  readonly expectedCents: Cents;
  readonly differenceCents: Cents;
  readonly inReductionPool: boolean;
  /** For a code in the reduction across codes: the fully reduced figure for one line, the row's, and its difference; null otherwise. */
  readonly reducedLineCents: Cents | null;
  readonly reducedCents: Cents | null;
  readonly reducedDifferenceCents: Cents | null;
  readonly standing: ScreeningStanding;
}

export interface ScreeningResultData {
  /** The link's token, for the conversion form's hidden field; the page is reached by it anyway. */
  readonly resultId: string;
  /** The conversion was just sent (?requested=1). */
  readonly requested: boolean;
  readonly converted: boolean;
  readonly summary: ScreeningSummary;
  readonly groups: readonly ScreeningResultGroup[];
  readonly coverage: readonly ScreeningResultCoverage[];
  /** At most 25 rows, the largest difference from their lowest figure first. */
  readonly rows: readonly ScreeningResultRow[];
  readonly arrangements: readonly { readonly value: string; readonly label: string }[];
}

/** How many rows the result shows. */
export const SCREENING_TOP_ROWS = 25;

function standingOf(text: string): ScreeningStanding {
  if (!(SCREENING_STANDINGS as readonly string[]).includes(text)) {
    throw new Error('the database gave a screening standing this page does not know');
  }
  return text as ScreeningStanding;
}

const resultId = z.string().regex(SCREENING_TOKEN);
const money = (text: string | number | bigint): Cents => cents(BigInt(text));
const moneyOrNull = (text: string | null): Cents | null => (text === null ? null : money(text));
const count = (text: string | number): number => Number(text);

type SummaryRow = Record<
  | 'rows'
  | 'priced_rows'
  | 'contract_rows'
  | 'not_screened_rows'
  | 'unpriced_rows'
  | 'claim_lines'
  | 'observed_cents'
  | 'priced_claim_lines'
  | 'expected_cents'
  | 'priced_observed_cents'
  | 'difference_cents'
  | 'pooled_rows'
  | 'reduced_cents'
  | 'reduced_difference_cents'
  | 'contract_claim_lines'
  | 'contract_observed_cents'
  | 'not_screened_claim_lines'
  | 'not_screened_observed_cents'
  | 'unpriced_claim_lines'
  | 'unpriced_observed_cents'
  | 'left_out_rows'
  | 'left_out_claim_lines'
  | 'left_out_observed_cents',
  string | number
> & {
  readonly practice_name: string;
  readonly state: string;
  readonly zip: string;
  readonly release_no: number;
  readonly engine_version: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly converted: boolean;
  readonly release_withdrawn: boolean;
};

export const screeningResult = publicRoute({
  id: 'public.screening_result',
  kind: 'page',
  path: '/screening/results/[resultId]',
  phi: false,
  params: z.object({ resultId, requested: optionalText(z.literal('1')) }),
  handle: async ({ params, services }): Promise<ScreeningResultData> => {
    const hash = screeningTokenHash(params.resultId);
    return withClient(services.pool, async (client) => {
      const summary = (await client.query<SummaryRow>('SELECT * FROM screening_result_summary($1)', [hash])).rows[0];
      if (summary === undefined) {
        throw new NotFoundError();
      }
      const groups = await client.query<{
        payer_product: string;
        procedure_code: string;
        rows: number;
        claim_lines: string;
        expected_cents: string;
        reduced_cents: string | null;
        observed_cents: string;
        difference_cents: string;
        reduced_difference_cents: string | null;
        in_reduction_pool: boolean;
        anomaly_rows: number;
        anomaly: boolean;
        standing: string;
      }>('SELECT * FROM screening_result_groups($1)', [hash]);
      const coverage = await client.query<{
        payer_product: string;
        disposition: string;
        unpriced_reason: string | null;
        unpriced_detail: string | null;
        rows: number;
        claim_lines: string;
        observed_cents: string;
      }>('SELECT * FROM screening_result_coverage($1)', [hash]);
      const rows = await client.query<{
        row_no: number;
        procedure_code: string;
        modifiers: string[];
        units: number;
        place_of_service: string;
        payer_product: string;
        service_band: string;
        claim_count: number;
        observed_allowed_cents: string;
        expected_line_cents: string;
        expected_cents: string;
        difference_cents: string;
        in_reduction_pool: boolean;
        reduced_line_cents: string | null;
        reduced_cents: string | null;
        reduced_difference_cents: string | null;
        standing: string;
      }>('SELECT * FROM screening_result_rows($1, $2)', [hash, SCREENING_TOP_ROWS]);
      const totals = (rowsKey: keyof SummaryRow, claimsKey: keyof SummaryRow, observedKey: keyof SummaryRow): ScreeningGroupTotals => ({
        rows: count(summary[rowsKey] as number),
        claimLines: count(summary[claimsKey] as string),
        observedCents: money(summary[observedKey] as string),
      });
      return {
        resultId: params.resultId,
        requested: params.requested !== undefined,
        converted: summary.converted,
        summary: {
          practiceName: summary.practice_name,
          state: summary.state,
          zip: summary.zip,
          releaseNo: summary.release_no,
          engineVersion: summary.engine_version,
          createdAt: summary.created_at,
          expiresAt: summary.expires_at,
          releaseWithdrawn: summary.release_withdrawn,
          ...totals('rows', 'claim_lines', 'observed_cents'),
          priced: {
            ...totals('priced_rows', 'priced_claim_lines', 'priced_observed_cents'),
            expectedCents: money(summary.expected_cents),
            differenceCents: money(summary.difference_cents),
            pooledRows: count(summary.pooled_rows),
            reducedCents: money(summary.reduced_cents),
            reducedDifferenceCents: money(summary.reduced_difference_cents),
          },
          contractRequired: totals('contract_rows', 'contract_claim_lines', 'contract_observed_cents'),
          notScreened: totals('not_screened_rows', 'not_screened_claim_lines', 'not_screened_observed_cents'),
          couldNotPrice: totals('unpriced_rows', 'unpriced_claim_lines', 'unpriced_observed_cents'),
          leftOut: totals('left_out_rows', 'left_out_claim_lines', 'left_out_observed_cents'),
        },
        groups: groups.rows.map((group) => ({
          payerProduct: group.payer_product,
          procedureCode: group.procedure_code,
          rows: group.rows,
          claimLines: count(group.claim_lines),
          expectedCents: money(group.expected_cents),
          observedCents: money(group.observed_cents),
          differenceCents: money(group.difference_cents),
          reducedCents: moneyOrNull(group.reduced_cents),
          reducedDifferenceCents: moneyOrNull(group.reduced_difference_cents),
          inReductionPool: group.in_reduction_pool,
          anomalyRows: group.anomaly_rows,
          anomaly: group.anomaly,
          standing: standingOf(group.standing),
        })),
        coverage: coverage.rows.map((item) => ({
          payerProduct: item.payer_product,
          disposition: item.disposition,
          unpricedReason: item.unpriced_reason,
          unpricedDetail: item.unpriced_detail,
          rows: item.rows,
          claimLines: count(item.claim_lines),
          observedCents: money(item.observed_cents),
        })),
        rows: rows.rows.map((row) => ({
          rowNo: row.row_no,
          procedureCode: row.procedure_code,
          modifiers: row.modifiers,
          units: row.units,
          placeOfService: row.place_of_service,
          payerProduct: row.payer_product,
          serviceBand: row.service_band,
          claimCount: row.claim_count,
          observedCents: money(row.observed_allowed_cents),
          expectedLineCents: money(row.expected_line_cents),
          expectedCents: money(row.expected_cents),
          differenceCents: money(row.difference_cents),
          inReductionPool: row.in_reduction_pool,
          reducedLineCents: moneyOrNull(row.reduced_line_cents),
          reducedCents: moneyOrNull(row.reduced_cents),
          reducedDifferenceCents: moneyOrNull(row.reduced_difference_cents),
          standing: standingOf(row.standing),
        })),
        arrangements: PROSPECT_BILLING_ARRANGEMENTS.map((value) => ({ value, label: BILLING_ARRANGEMENT_LABELS[value] })),
      };
    });
  },
});

const payerList = field(6000).transform((text) =>
    text
      .split(/[\n,;]+/)
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  );

export const screeningConvert = publicRoute({
  id: 'public.screening_convert',
  kind: 'action',
  path: '/screening/results/[resultId]',
  phi: false,
  rateLimit: 'public_form',
  params: z.object({}),
  input: z.object({
    resultId: field(64),
    contactName: field(400),
    locations: field(16),
    payers: payerList,
    billingArrangement: field(32),
  }),
  handle: async ({ input, services, request }): Promise<MutationResult> => {
    if (!SCREENING_TOKEN.test(input.resultId)) {
      throw new NotFoundError();
    }
    const issues: Issue[] = [];
    const contactName = input.contactName.trim();
    if (contactName === '' || contactName.length > 200) {
      issues.push({ field: 'contactName', message: 'your name, at most 200 characters' });
    } else if (textPhiFindings(contactName).length > 0) {
      issues.push({ field: 'contactName', message: 'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number' });
    }
    const locations = /^[0-9]{1,4}$/.test(input.locations.trim()) ? Number(input.locations.trim()) : 0;
    if (locations < 1 || locations > 1000) {
      issues.push({ field: 'locations', message: 'a whole number of locations from 1 to 1,000' });
    }
    const payers = input.payers;
    if (payers.length < 1 || payers.length > 50 || payers.some((name) => name.length > 120)) {
      issues.push({ field: 'payers', message: 'name 1 to 50 payers, each at most 120 characters' });
    } else if (payers.some((name) => textPhiFindings(name).length > 0)) {
      issues.push({ field: 'payers', message: 'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number' });
    }
    const arrangement = (PROSPECT_BILLING_ARRANGEMENTS as readonly string[]).includes(input.billingArrangement) ? input.billingArrangement : null;
    if (arrangement === null) {
      issues.push({ field: 'billingArrangement', message: 'choose how you bill' });
    }
    if (issues.length > 0) {
      throw new InputError(issues);
    }
    try {
      await withClient(services.pool, (client) =>
        client.query('SELECT convert_screening($1, $2, $3, $4, $5, $6)', [screeningTokenHash(input.resultId), contactName, locations, payers, arrangement, request.requestId]),
      );
    } catch (error) {
      const refused = pgError(error);
      if (refused?.code === 'P0002') {
        throw new NotFoundError();
      }
      if (refused?.constraint === 'screening_converted_once') {
        throw new InputError([{ field: 'input', message: 'an audit was already requested from this screening' }]);
      }
      if (refused?.code === '23514') {
        throw new InputError([{ field: 'input', message: 'the request could not be stored as sent; check the form and try again' }]);
      }
      throw error;
    }
    return { redirect: `/screening/results/${input.resultId}?requested=1` };
  },
});

// ---------------------------------------------------------------------------------------------------
// The console: the place-of-service split

export interface ScreeningSplitView {
  readonly id: string;
  readonly settings: Readonly<Record<string, 'facility' | 'non_facility'>>;
  readonly approvedBy: string;
  readonly approvedByEmail: string | null;
  readonly approvedAt: Date;
  readonly inForce: boolean;
}

export interface ScreeningSplitPageData {
  readonly approved: boolean;
  /** The release in force, or null (screening stays closed without one). */
  readonly releaseNo: number | null;
  readonly inForce: ScreeningSplitView | null;
  readonly history: readonly ScreeningSplitView[];
}

export const screeningSplitPage = platformRoute({
  id: 'console.screening_split',
  kind: 'page',
  path: '/console/screening',
  phi: false,
  permission: 'rate_record.approve',
  params: z.object({ approved: optionalText(z.literal('1')) }),
  handle: async ({ scope, params }): Promise<ScreeningSplitPageData> => {
    const { rows } = await scope.client.query<{ id: string; settings: Record<string, 'facility' | 'non_facility'>; approved_by: string; approved_by_email: string | null; approved_at: Date; in_force: boolean }>(
      'SELECT id, settings, approved_by, approved_by_email, approved_at, in_force FROM console_screening_splits()',
    );
    const release = await scope.client.query<{ release_no: number | null }>('SELECT current_rule_release() AS release_no');
    const history = rows.map((row) => ({ id: row.id, settings: row.settings, approvedBy: row.approved_by, approvedByEmail: row.approved_by_email, approvedAt: row.approved_at, inForce: row.in_force }));
    return { approved: params.approved !== undefined, releaseNo: release.rows[0]?.release_no ?? null, inForce: history.find((split) => split.inForce) ?? null, history };
  },
  sample: { params: () => ({}) },
});

export const screeningSplitApprove = platformRoute({
  id: 'console.screening_split_approve',
  kind: 'action',
  path: '/console/screening',
  phi: false,
  permission: 'rate_record.approve',
  params: z.object({}),
  input: z.object({ settings: z.string().max(4000) }),
  audit: { action: 'screening_split_approved', objectType: 'screening_place_of_service_split' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    let settings: unknown;
    try {
      settings = JSON.parse(input.settings);
    } catch {
      settings = null;
    }
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new InputError([{ field: 'settings', message: 'a facility or non-facility setting for each place of service' }]);
    }
    let id: string | undefined;
    try {
      id = (await scope.client.query<{ id: string }>('SELECT console_approve_screening_split($1::jsonb) AS id', [JSON.stringify(settings)])).rows[0]?.id;
    } catch (error) {
      if (pgError(error)?.constraint === 'screening_place_of_service_split_settings') {
        throw new InputError([{ field: 'settings', message: 'each place of service is a two-digit code from 01 to 99, set to facility or non-facility, and at least one is set' }]);
      }
      throw error;
    }
    if (id === undefined) {
      throw new InputError([{ field: 'settings', message: 'the split was not recorded' }]);
    }
    return { objectId: id, redirect: '/console/screening?approved=1' };
  },
  sample: { params: () => ({}), input: () => ({ settings: JSON.stringify({ '11': 'non_facility', '22': 'facility' }) }) },
});

export const SCREENING_ROUTES = [screeningPage, screeningSubmit, screeningResult, screeningConvert, screeningSplitPage, screeningSplitApprove] as const;
