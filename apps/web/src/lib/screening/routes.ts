import {
  PROSPECT_BILLING_ARRANGEMENTS,
  PROSPECT_SOURCES,
  type ProspectSource,
  SCREENING_WAIT_REASONS,
  type ScopeClient,
  type ScopePool,
  type ScreeningWaitReason,
  withPublicSnapshot,
} from '@tp/db/runtime';
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
  type ContentQuarterRun,
  type ContentQuarters,
  type ScreeningColumn,
  type ScreeningLeftOut,
  type ScreeningRejection,
  type ScreeningRow,
  checkHeaders,
  decodeScreeningRows,
  leftOutPlausible,
  outsideContentPlausible,
  screeningTokenHash,
  storableRejections,
} from '@tp/worker/screening';
import { KEPT_WITH, type KeptWith } from '@tp/worker/screening-wording';
import { z } from 'zod';

import { attributionValues, readAttribution } from '../http/attribution';
import { rateSubjectHash } from '../http/rate-limit';
import { type Environment, SCREENING_LEGAL_SURFACES, showsLegalSurfaces } from '../legal-surfaces';
import { platformRoute, publicRoute } from '../http/invoke';
import { InputError, type Issue, type MutationResult, NotFoundError } from '../http/route';
import { BILLING_ARRANGEMENT_LABELS, PROSPECT_SOURCE_OPTIONS } from '../routes/onboarding';
import { optionalText } from '../routes/schemas';
import type { ScreeningLaunch } from '../server/config';
import { ZIP_CODE_FORMAT, parseZipCode } from '../zip';
import { contentQuarters, quarterRowsLayBefore } from './content-span';
import { SCREENING_STANDINGS, type ScreeningStanding } from './labels';
import { screeningRateAccount } from './rate';
import { SCREENING_WAIT_STATES, type ScreeningWaitState, screeningSentPath, screeningWaitStateOf } from './sent';

/**
 * The free screening's routes (Change Order 001, CO-04; reconciliation-001 D18 to D21; docs/adr/0062):
 *
 * - The screening page (/screening, public): whether screening is open (a rule release in force and a place-of-service
 *   split approved; production stays closed until release 1), the columns, products, states and limits.
 * - The upload (/screening, public action, the screening rate limit: per client address, and per email domain or
 *   free-mail mailbox). Nothing is recorded while screening is closed. The browser parsed the file and sends no byte
 *   of it, nor any hash of it: the header's canonical column names, the row count and the rows' totals in their
 *   canonical form, and how many rows of fewer than 11 claim lines it left out, their claim lines and their allowed
 *   total (three numbers; never which rows). The server checks the form's fields (an address it can mail: plain
 *   ASCII, a dotted domain), the header names and every row again; a row of fewer than 11 claim lines, sent around
 *   the browser, is refused by its row number (it can be one patient's service line). A refused upload is recorded by
 *   count and reasons alone, with no hash (reject_screening_upload()), and its messages name a column by position and
 *   kind, never a header's text or a cell's value. A clean one is stored and queued for pricing in one call
 *   (submit_screening(), which hashes the rows it stores and replaces any earlier screening of the same practice), and
 *   the browser says to check the email: the result's link goes to the contact address only. The ZIP code field takes
 *   five digits or ZIP+4 (PR 6b; the founder's ruling of 2026-10-18, 11:47 UTC, superseding ruling 3; docs/adr/0064):
 *   a ZIP whose Medicare locality needs its ZIP+4 is refused until the ZIP+4 is given (screening_zip_plus_four, "enter
 *   the ZIP+4"), and the ZIP+4 is kept only for such a ZIP. A Medicare row in a quarter outside the content the release
 *   in force has loaded (rule_release_content_span(), audit #7) is left out by the browser and counted, three numbers
 *   beside the floor's; one sent anyway is refused by its row (band_outside_content), as submit_screening() refuses it
 *   too (the founder's answer of 2026-10-21 to PR 6b's Q6 (a)).
 * - The result (/screening/results/[resultId], public): the token in the link, looked up by its SHA-256 alone; a link
 *   that is unknown, expired or not yet complete is not found. Every figure is the database's bigint sum of the
 *   engine's per-row results, before sequestration; a code in the reduction across codes has two figures (before
 *   the reduction, and fully reduced), and where each row and group stands is the database's (screening_standing()).
 *   The groups by code and payer product come one page at a time (?groups=N, 50 a page, the largest difference
 *   first), with the database's counts over every group and its sums of the groups the page does not show, so what
 *   the page holds is bounded whatever the result's size (audit #53 part 1: a worst-shape result's 20,507 groups,
 *   all at once, exhausted the web task's heap). A result under a release since withdrawn keeps its notice and may
 *   still be converted.
 * - The conversion (/screening/results/[resultId], public action, the public form's rate limit): an audit request
 *   from the screening, with its attribution and from_screening, an audit event that outlives the screening's expiry;
 *   the database keeps the screening's summary with the request for 12 months from the screening.
 * - The opened signal (/api/screening/opened, public POST, its own rate limit): the result page's script sends it
 *   once the page has been visible two seconds and used; the database records the first open of a complete,
 *   unexpired result (its run, its counts-only outcome's band, its kept summary). The page's GET records nothing, so a
 *   mail scanner opening the link counts as no open. It answers alike whatever the link.
 * - What every submission keeps beside the file's rows (audit #57; the founder's rulings of 2026-10-20): how the
 *   prospect heard of us (a closed list, optional), a referring firm (optional, screened for identifier shapes), and
 *   the first-party attribution cookie's campaign codes and kind of paid click, read here on the server
 *   (src/lib/http/attribution.ts). The database writes the counts-only outcome of every submission, refused or
 *   accepted.
 * - The console's split (/console/screening): the contract specialist (rate_record.approve) approves the platform's
 *   default place-of-service split (place_of_service_split since PR 6b: every place a practice has not set, pinned on
 *   each pricing run, and the screening's); a person, never a model. Its audit action and object type keep their
 *   screening names, so the approval history reads under one name (docs/adr/0064).
 *
 * Public routes open no session scope: each runs one SECURITY DEFINER function on the application's pool, as the
 * audit request does, and the function writes the audit event.
 */

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
  /** After an upload, how long its result is likely to take (SCREENING_WAIT_STATES); null on the form itself. */
  readonly wait: ScreeningWaitState | null;
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
  /** "How did you hear about us?": a blank first option (no answer), then the closed list. */
  readonly sources: readonly { readonly value: string; readonly label: string }[];
  /**
   * The quarters the release in force has the Medicare content for, up to the server's current quarter (audit #7): the
   * browser leaves a Medicare row of any other quarter out. None while screening is closed.
   */
  readonly contentQuarters: readonly ContentQuarterRun[];
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
  // `wait` is read leniently, at any length: a link from before it existed, or one edited by hand, says only that the
  // file arrived (screeningWaitStateOf), and never answers 404.
  params: z.object({ sent: optionalText(z.literal('1')), wait: optionalText(z.string()) }),
  handle: async ({ params, services }): Promise<ScreeningPageData> => {
    const { open, releaseNo } = await screeningOpen(services.pool, services.environment, services.screeningLaunch);
    const now = services.now();
    const sent = params.sent !== undefined;
    return {
      sent,
      wait: sent ? screeningWaitStateOf(params.wait) : null,
      open,
      releaseNo,
      columns: SCREENING_COLUMNS,
      products: SCREENING_PAYER_PRODUCTS,
      states: SCREENING_STATES,
      limits: SCREENING_LIMITS,
      serverTime: now.toISOString(),
      sources: PROSPECT_SOURCE_OPTIONS,
      contentQuarters: releaseNo === null ? [] : await withClient(services.pool, (client) => contentQuarters(client, releaseNo, now)),
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
    case 'band_outside_content':
      return reason.row === undefined
        ? 'Every Medicare row is in a quarter outside the Medicare content PaidWhole has loaded'
        : `${row}: the service band’s quarter is outside the Medicare content PaidWhole has loaded, so a Medicare row in it cannot be screened; leave it out`;
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
      const why = `a screening takes a row of at least ${floor} claim lines, because a row of fewer can describe one patient’s care`;
      return reason.row === undefined ? `Every row sums fewer than ${floor} claim lines, so there is nothing to screen: ${why}` : `${row} sums fewer than ${floor} claim lines; ${why}: leave it out`;
    }
  }
}

interface ProspectFields {
  readonly practiceName: string;
  readonly state: string;
  /** The five-digit ZIP, and the four digits after it when the form gave a ZIP+4 (kept only where Medicare needs it). */
  readonly zip: string;
  readonly plusFour: string | null;
  readonly contactEmail: string;
  /** How the prospect heard of us, or null when the form left it blank. */
  readonly heardFrom: ProspectSource | null;
  /** The billing firm that referred the practice, or null. */
  readonly referringFirm: string | null;
}

/** The message a form gives text that looks like an identifier, a date or a phone number. */
export const NO_PATIENT_INFORMATION = 'this form takes no patient information: remove anything that looks like an identifier, a date or a phone number';

/** How the prospect heard of us, as the form sent it: blank is none; anything off the list is an issue. */
export function heardFromField(text: string, issues: Issue[]): ProspectSource | null {
  const value = text.trim();
  if (value === '') {
    return null;
  }
  if (!(PROSPECT_SOURCES as readonly string[]).includes(value)) {
    issues.push({ field: 'heardFrom', message: 'choose one of the listed answers, or leave it blank' });
    return null;
  }
  return value as ProspectSource;
}

/** The referring firm as the form sent it: blank is none; at most 200 characters, and no identifier shapes. */
export function referringFirmField(text: string, issues: Issue[]): string | null {
  const value = text.trim().replace(/\s+/g, ' ');
  if (value === '') {
    return null;
  }
  if (value.length > 200) {
    issues.push({ field: 'referringFirm', message: 'the firm’s name, at most 200 characters' });
    return null;
  }
  if (textPhiFindings(value).length > 0) {
    issues.push({ field: 'referringFirm', message: NO_PATIENT_INFORMATION });
    return null;
  }
  return value;
}

/** The form's own fields, checked: what the prospect row needs, or the issues (no record is made for them). */
function prospectFields(input: {
  readonly practiceName: string;
  readonly state: string;
  readonly zip: string;
  readonly contactEmail: string;
  readonly heardFrom: string;
  readonly referringFirm: string;
}): ProspectFields {
  const issues: Issue[] = [];
  const practiceName = input.practiceName.trim();
  if (practiceName === '' || practiceName.length > 200) {
    issues.push({ field: 'practiceName', message: 'the practice’s name, at most 200 characters' });
  } else if (textPhiFindings(practiceName).length > 0) {
    issues.push({ field: 'practiceName', message: NO_PATIENT_INFORMATION });
  }
  const state = input.state.trim().toUpperCase();
  if (!(SCREENING_STATES as readonly string[]).includes(state)) {
    issues.push({ field: 'state', message: 'choose the state the practice bills from' });
  }
  const zipCode = parseZipCode(input.zip);
  if (zipCode === null) {
    issues.push({ field: 'zip', message: `the practice’s ZIP code: ${ZIP_CODE_FORMAT}` });
  }
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (!SCREENING_EMAIL.test(contactEmail) || contactEmail.length > 254 || contactEmail.indexOf('@') > 64) {
    issues.push({ field: 'contactEmail', message: 'an email address: the result’s link is sent there' });
  }
  const heardFrom = heardFromField(input.heardFrom, issues);
  const referringFirm = referringFirmField(input.referringFirm, issues);
  if (issues.length > 0) {
    throw new InputError(issues);
  }
  return { practiceName, state, zip: zipCode?.zip5 ?? '', plusFour: zipCode?.plusFour ?? null, contactEmail, heardFrom, referringFirm };
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

/** A launch value's report hash: the SHA-256 of the tag's passing capacity report, in lowercase hex. */
const REPORT_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Decision 13 (docs/adr/0062; SCR-20): a production server screens only when the deploy's launch value (ScreeningLaunch,
 * which the launch check prints once the tag's capacity report passed with time enforced on both image IDs) names the
 * release tag this server runs. CloudFormation keeps a parameter's value when a deploy leaves it out, so a value from an
 * earlier tag vouches for nothing here and keeps the screening closed. Closing never stops the consumer: runs already
 * queued are still priced. Staging and development are not gated (the end-to-end journey and the factor measurement
 * need them open).
 */
export function screeningLaunched(environment: Environment, launch: ScreeningLaunch): boolean {
  if (environment !== 'production') {
    return true;
  }
  const { imageTag, value } = launch;
  if (imageTag === null || value === null || imageTag === '' || imageTag === 'none' || !value.startsWith(`${imageTag}:`)) {
    return false;
  }
  return REPORT_SHA256.test(value.slice(imageTag.length + 1));
}

/**
 * Whether screening is open: a rule release in force and a place-of-service split approved, and, on a production
 * server, counsel's review of what the screening says is kept recorded (src/lib/legal-surfaces.ts: until then nothing is
 * screened or kept there under wording counsel has not confirmed) and the deploy's launch value for this server's
 * release (screeningLaunched).
 */
async function screeningOpen(pool: ScopePool<ScopeClient>, environment: Environment, launch: ScreeningLaunch): Promise<{ readonly open: boolean; readonly releaseNo: number | null }> {
  if (!showsLegalSurfaces(SCREENING_LEGAL_SURFACES, environment)) {
    return { open: false, releaseNo: null };
  }
  if (!screeningLaunched(environment, launch)) {
    return { open: false, releaseNo: null };
  }
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

/**
 * The upload checked again: the rows, or the reasons it is refused (at most 20 kept) and how many there were. A
 * Medicare row whose quarter is not one of `quarters` (the release in force's loaded content) is refused by its row:
 * the browser leaves such a row out, so one here was sent around it.
 */
function checkUpload(
  headers: readonly string[],
  rowsText: string,
  rowCount: number,
  now: Date,
  quarters: ContentQuarters,
): { readonly rows: readonly ScreeningRow[] } | { readonly reasons: readonly ScreeningRejection[]; readonly total: number } {
  const header = checkHeaders(headers);
  if (!header.ok) {
    return { reasons: header.reasons, total: header.total };
  }
  const decoded = decodeScreeningRows(rowsText, now, quarters);
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

/** Whole cents as sent, blank as zero, or null when they are not at most `digits` digits (bigint: no float on an amount). */
function centsField(text: string, digits: number): Cents | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return cents(0n);
  }
  return new RegExp(`^[0-9]{1,${String(digits)}}$`).test(trimmed) ? cents(BigInt(trimmed)) : null;
}

/**
 * The Medicare rows the browser says it left out for a quarter outside the loaded content, as sent: three whole
 * numbers (at most 50,000 rows of at most 100,000 claim lines, at most $25,000.00 a claim line), or null when one is
 * not.
 */
function outsideContentFields(input: { readonly outsideContentRows: string; readonly outsideContentClaimLines: string; readonly outsideContentAllowedCents: string }): ScreeningLeftOut | null {
  const rows = wholeField(input.outsideContentRows, 6);
  const claimLines = wholeField(input.outsideContentClaimLines, 10);
  const allowed = centsField(input.outsideContentAllowedCents, 17);
  return rows === null || claimLines === null || allowed === null ? null : { rows, claimLines, allowedCents: allowed };
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
    // The Medicare rows the browser left out because their quarter is outside the content the release in force has
    // loaded: how many, their claim lines and their allowed total in cents. Blank is none.
    outsideContentRows: field(12),
    outsideContentClaimLines: field(16),
    outsideContentAllowedCents: field(24),
    // How the prospect heard of us (PROSPECT_SOURCES; blank is none) and a referring firm (optional).
    heardFrom: field(32),
    referringFirm: field(400),
  }),
  handle: async ({ input, services, request }): Promise<MutationResult> => {
    // When the web received this upload: the proxy's stamp at header time, before Next read the multipart body, copied
    // the rows, parsed the input and counted the rate limit (src/lib/http/received.ts), so the time to its email covers
    // the web's whole share (decision 14; TimeToEmailMs); this handler's own clock where no proxy ran.
    // submit_screening() clamps it into the ten minutes before its own clock.
    const receivedAt = request.receivedAt ?? new Date();
    // Nothing about a prospect is recorded before screening opens (release 1), not even a refusal.
    const { open, releaseNo } = await screeningOpen(services.pool, services.environment, services.screeningLaunch);
    if (!open || releaseNo === null) {
      throw new InputError([SCREENING_CLOSED]);
    }
    const prospect = prospectFields(input);
    const headers = headerCells(input.headers);
    const rowCount = /^[0-9]{1,8}$/.test(input.rowCount.trim()) ? Number(input.rowCount.trim()) : null;
    const leftOut = leftOutFields(input);
    const outside = outsideContentFields(input);
    if (headers === null || rowCount === null || leftOut === null || outside === null) {
      throw new InputError([{ field: 'upload', message: UPLOAD_UNREADABLE }]);
    }
    const now = services.now();
    const quarters = await withClient(services.pool, (client) => contentQuarters(client, releaseNo, now));
    const checked = checkUpload(headers, input.rows, rowCount, now, quarters);
    // A refused upload's prospect names the five-digit ZIP alone (its ZIP+4 is kept only on an accepted screening of a ZIP that needs it).
    const prospectValues = [prospect.practiceName, prospect.state, prospect.zip, prospect.contactEmail];
    // How the prospect heard of us, the first-party cookie's campaign codes and kind of paid click (read on the
    // server, checked again by the database), and the referring firm. The screening terms' SHA-256 is null until their
    // wording and checkbox land (audit #51); the follow-up consent's until PR 6e captures it.
    const attribution = [prospect.heardFrom, ...attributionValues(readAttribution(request.cookies, services.environment)), prospect.referringFirm];
    const termsSha256 = null;
    const consentSha256 = null;
    if ('reasons' in checked) {
      const reasons = storableRejections(checked.reasons);
      try {
        await withClient(services.pool, (client) =>
          // No hash of a refused upload: its rows can hold the very row the claim-line floor withholds.
          client.query('SELECT reject_screening_upload($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)', [
            ...prospectValues,
            Math.min(rowCount, 10_000_000),
            JSON.stringify(reasons),
            ...attribution,
            termsSha256,
            request.requestId,
          ]),
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
    if (!leftOutPlausible(leftOut, rows.length) || !outsideContentPlausible(outside, rows.length, leftOut.rows)) {
      throw new InputError([{ field: 'upload', message: UPLOAD_UNREADABLE }]);
    }
    // The account the rate limiter counts this upload against, as the limiter keeps it: its keyed HMAC, never the
    // address or the domain (the database sums the account's rows of the day by it; the founder's Q7).
    const account = screeningRateAccount(input.contactEmail);
    if (account === null) {
      throw new InputError([{ field: 'contactEmail', message: 'an email address: the result’s link is sent there' }]);
    }
    const rateAccountSubject = rateSubjectHash(services.sealer, 'screening', 'account', account);
    let runId: string;
    try {
      runId = await withClient(services.pool, async (client) => {
        // The database hashes the rows it stores (their canonical form); no hash is taken from the browser.
        const result = await client.query<{ run_id: string }>(
          `SELECT submit_screening($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                                   $28, $29, $30) AS run_id`,
          [
          prospect.practiceName,
          prospect.state,
          prospect.zip,
          // The ZIP+4 as given: submit_screening() keeps it only where the ZIP's locality needs it.
          prospect.plusFour,
          prospect.contactEmail,
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
          outside.rows,
          outside.claimLines,
          outside.allowedCents.toString(),
          ...attribution,
          consentSha256,
          termsSha256,
          receivedAt.toISOString(),
          rateAccountSubject,
          request.requestId,
          ],
        );
        return result.rows[0]?.run_id ?? '';
      });
    } catch (error) {
      const refused = pgError(error);
      if (refused?.code === '23514' || refused?.code === '23505') {
        throw new InputError([submitIssue(refused.constraint)]);
      }
      throw error;
    }
    // Where the run stands in the queue: its tier (Q7), and how many runs are pricing or ahead of it.
    let wait: ScreeningQueuePlace | null;
    try {
      wait = await withClient(services.pool, (client) => screeningQueuePlace(client, runId));
    } catch {
      // Not fatal: the run is stored, and the minute's sweep sends its job at its own priority. Where it stands is not
      // known, so the page says only that the file arrived.
      services.logger.warn('screening run not queued; the sweep will send it', { screening_run_id: runId, error_code: 'SCREENING_NOT_QUEUED' });
      return { redirect: screeningSentPath('sent') };
    }
    const place = wait ?? { priority: 0, reason: null, pricing: 0, queuedAhead: 0 };
    if (place.reason !== null) {
      services.logger.info('screening upload sent to wait', { screening_run_id: runId, error_code: SCREENING_UPLOAD_WAIT_CODES[place.reason] });
    }
    try {
      await services.queue.enqueueScreeningRun(runId, { priority: place.priority });
    } catch {
      // Not fatal: the run stays queued and the minute's sweep sends its job again at its priority.
      services.logger.warn('screening run not queued; the sweep will send it', { screening_run_id: runId, error_code: 'SCREENING_NOT_QUEUED' });
    }
    return { redirect: screeningSentPath(screeningWaitState(place, services.screeningSlots)) };
  },
});

/** The "sent" page's four states and its path (src/lib/screening/sent.ts holds their words). */
export { SCREENING_WAIT_STATES, type ScreeningWaitState, screeningSentPath };

/** Where a stored run stands (screening_wait()): its queue priority and tier, the runs pricing, and those ahead of it. */
export interface ScreeningQueuePlace {
  readonly priority: number;
  readonly reason: ScreeningWaitReason | null;
  readonly pricing: number;
  readonly queuedAhead: number;
}

/**
 * The code an upload sent to wait is logged with, by its tier (the worker's SCREENING_WAIT_CODES; routes.db.test.ts
 * holds the two equal). The line counts toward the UploadsSentToWait metric (infra/lib/screening.ts).
 */
export const SCREENING_UPLOAD_WAIT_CODES: Readonly<Record<ScreeningWaitReason, string>> = { account_share: 'SCREENING_ACCOUNT_SHARE', daily_cap: 'SCREENING_DAILY_CAP' };

/** The run's place, or null when there is no such run (one a later screening already replaced). */
async function screeningQueuePlace(client: ScopeClient, runId: string): Promise<ScreeningQueuePlace | null> {
  const { rows } = await client.query<{ queue_priority: number; wait_reason: string | null; pricing: number; queued_ahead: number }>(
    'SELECT queue_priority, wait_reason, pricing, queued_ahead FROM screening_wait($1)',
    [runId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const reason = row.wait_reason === null ? null : (SCREENING_WAIT_REASONS as readonly string[]).includes(row.wait_reason) ? (row.wait_reason as ScreeningWaitReason) : null;
  return { priority: row.queue_priority, reason, pricing: row.pricing, queuedAhead: row.queued_ahead };
}

/**
 * The state the "sent" page shows: `waiting` when the upload waits (past its account's share or the day's cap, which the
 * page does not tell apart: sent.ts); otherwise `minutes` when the runs pricing and those ahead of it fill every slot
 * the consumer has (its tasks times its threads), so this one cannot start at once; `soon` when one is free.
 */
export function screeningWaitState(place: ScreeningQueuePlace, slots: number): ScreeningWaitState {
  // Past the account's share or the day's cap alike: the page says it waits, the email says why (sent.ts).
  if (place.reason !== null) {
    return 'waiting';
  }
  return place.pricing + place.queuedAhead >= slots ? 'minutes' : 'soon';
}

/**
 * What the screening says when the ZIP code needs more than five digits, or Medicare's list for it is not loaded
 * (PR 6b; the founder's answers of 2026-10-21 to Q12: the recommended wording, for counsel to confirm before the
 * screening opens).
 */
export const SCREENING_ZIP_MESSAGES = {
  screening_zip_plus_four: 'This ZIP code spans more than one Medicare payment area. Enter the full ZIP+4, such as 27601-1234, so the screening uses the right one.',
  // Right under either answer to Q37 (a ZIP+4 the ZIP9 file does not list): the digits may be right.
  screening_zip_plus_four_unknown: 'Medicare’s ZIP+4 list in force does not list this ZIP+4. If the four digits after the hyphen are right, a screening cannot price this ZIP+4 yet.',
  screening_locality_not_loaded: 'PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP code yet, so a screening cannot price it. Try again later.',
} as const;

/** What a refusal of submit_screening() says, by the rule it names. */
function submitIssue(constraint: string | undefined): Issue {
  switch (constraint) {
    case 'screening_closed':
      return SCREENING_CLOSED;
    case 'screening_zip_unknown':
      return { field: 'zip', message: 'this ZIP code is not in the Medicare locality map in force; check it' };
    case 'screening_zip_plus_four':
      return { field: 'zip', message: SCREENING_ZIP_MESSAGES.screening_zip_plus_four };
    case 'screening_zip_plus_four_unknown':
      return { field: 'zip', message: SCREENING_ZIP_MESSAGES.screening_zip_plus_four_unknown };
    case 'screening_locality_not_loaded':
      return { field: 'zip', message: SCREENING_ZIP_MESSAGES.screening_locality_not_loaded };
    case 'screening_band_outside_content':
      return { field: 'upload', message: 'a Medicare row is in a quarter outside the Medicare content PaidWhole has loaded; choose the file again, and the page leaves it out' };
    case 'screening_rows':
    case 'screening_result_once':
    case 'screening_upload_accepted_rows':
    case 'screening_upload_outside_content_claim_lines':
    case 'screening_upload_outside_content_allowed':
    case 'screening_upload_outside_content_accepted':
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
  /** The ZIP+4's four digits, kept only when the ZIP's locality needs them (the heading names it); null otherwise. */
  readonly zipPlusFour: string | null;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** The rule release the screening was priced under has since been withdrawn: its figures are under content known to be wrong. */
  readonly releaseWithdrawn: boolean;
  /** What this screening's summary is kept with (screening_result_summary's kept_with), which its notice says. */
  readonly keptWith: KeptWith;
  readonly priced: ScreeningPricedTotals;
  /** MA contracted and commercial rows: the dollars that cannot be priced without a contract. */
  readonly contractRequired: ScreeningGroupTotals;
  /** Medicaid and other rows. */
  readonly notScreened: ScreeningGroupTotals;
  /** Medicare rows the engine left unpriced, or whose rates change inside the quarter. */
  readonly couldNotPrice: ScreeningGroupTotals;
  /** Rows of fewer than 11 claim lines the browser left out before sending, as it counted them: in no other figure. */
  readonly leftOut: ScreeningGroupTotals;
  /**
   * Medicare rows the browser left out because their quarter is outside the content the release had loaded (audit #7;
   * Q6 (a)), as it counted them: in no other figure.
   */
  readonly outsideContent: ScreeningGroupTotals;
  /** The release's first loaded quarter when every such row lies before it (the content runs to the screening's quarter); null otherwise. */
  readonly outsideContentBefore: string | null;
}

export interface ScreeningResultGroup {
  /** Its place in the database's order: the largest difference from the lowest figures first, from 1. */
  readonly groupNo: number;
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

/** The groups not on the page shown, summed by the database (screening_result_group_totals()). */
export interface ScreeningOtherGroups {
  readonly groups: number;
  readonly anomalyGroups: number;
  readonly rows: number;
  readonly claimLines: number;
  readonly expectedCents: Cents;
  /** The lowest figures: a pooled row's fully reduced figure, any other row's one figure. */
  readonly lowestCents: Cents;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  readonly lowestDifferenceCents: Cents;
}

/** Every group of the result as the database counts them, and the page of them shown. */
export interface ScreeningGroupPage {
  readonly groups: number;
  readonly anomalyGroups: number;
  readonly withinReductionGroups: number;
  readonly perPage: number;
  readonly pages: number;
  /** The page shown: the one asked for, or the last when that is past it. */
  readonly page: number;
  /** The page's first and last group by number; 0 and 0 when nothing was priced. */
  readonly firstGroup: number;
  readonly lastGroup: number;
  readonly others: ScreeningOtherGroups;
}

export interface ScreeningResultData {
  /** The link's token, for the conversion form's hidden field; the page is reached by it anyway. */
  readonly resultId: string;
  /** The conversion was just sent (?requested=1). */
  readonly requested: boolean;
  readonly converted: boolean;
  readonly summary: ScreeningSummary;
  /** One page of the groups by code and payer product (at most SCREENING_GROUPS_PER_PAGE), in the database's order. */
  readonly groups: readonly ScreeningResultGroup[];
  readonly groupPage: ScreeningGroupPage;
  readonly coverage: readonly ScreeningResultCoverage[];
  /** At most 25 rows, the largest difference from their lowest figure first. */
  readonly rows: readonly ScreeningResultRow[];
  readonly arrangements: readonly { readonly value: string; readonly label: string }[];
}

/** How many rows the result shows. */
export const SCREENING_TOP_ROWS = 25;

/** How many groups by code and payer product a page of the result shows (the database gives at most 100). */
export const SCREENING_GROUPS_PER_PAGE = 50;

/** The page of groups asked for (?groups=N): a whole number from 1, anything else the first page. */
const groupsPage = z.preprocess((value) => (typeof value === 'string' && /^[1-9][0-9]{0,8}$/.test(value) ? Number(value) : 1), z.number().int().min(1));

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
  | 'left_out_observed_cents'
  | 'outside_content_rows'
  | 'outside_content_claim_lines'
  | 'outside_content_observed_cents',
  string | number
> & {
  readonly practice_name: string;
  readonly state: string;
  readonly zip: string;
  readonly zip_plus_four: string | null;
  readonly release_no: number;
  readonly engine_version: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly converted: boolean;
  readonly release_withdrawn: boolean;
  readonly kept_with: string;
};

function keptWithOf(text: string): KeptWith {
  if (!(KEPT_WITH as readonly string[]).includes(text)) {
    throw new Error('the database gave a kept summary basis this page does not know');
  }
  return text as KeptWith;
}

export const screeningResult = publicRoute({
  id: 'public.screening_result',
  kind: 'page',
  path: '/screening/results/[resultId]',
  phi: false,
  params: z.object({ resultId, requested: optionalText(z.literal('1')), groups: groupsPage }),
  handle: async ({ params, services }): Promise<ScreeningResultData> => {
    const hash = screeningTokenHash(params.resultId);
    // Every read on one snapshot (withPublicSnapshot: one read-only transaction at REPEATABLE READ, so a result the
    // expiry job or a replacing submission deletes between two reads is read whole or not found, never a summary over
    // an empty page of groups): the summary, the counts, the page of groups, the coverage and the rows.
    return withPublicSnapshot(services.pool, async (client) => {
      const summary = (await client.query<SummaryRow>('SELECT * FROM screening_result_summary($1)', [hash])).rows[0];
      if (summary === undefined) {
        throw new NotFoundError();
      }
      // The counts over every group and the sums of those off the page first: the page shown is the one asked for, or
      // the last when that is past it, as the database takes it.
      const counted = (
        await client.query<{
          groups: number;
          anomaly_groups: number;
          within_reduction_groups: number;
          page_size: number;
          pages: number;
          page_no: number;
          first_group: number;
          last_group: number;
          other_groups: number;
          other_anomaly_groups: number;
          other_rows: number;
          other_claim_lines: string;
          other_expected_cents: string;
          other_lowest_cents: string;
          other_observed_cents: string;
          other_difference_cents: string;
          other_lowest_difference_cents: string;
        }>('SELECT * FROM screening_result_group_totals($1, $2, $3)', [hash, params.groups, SCREENING_GROUPS_PER_PAGE])
      ).rows[0];
      if (counted === undefined) {
        throw new NotFoundError();
      }
      const groups = await client.query<{
        group_no: number;
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
      }>('SELECT * FROM screening_result_groups($1, $2, $3)', [hash, counted.page_no, SCREENING_GROUPS_PER_PAGE]);
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
      // The quarters the run's release had the Medicare content for, up to the screening's own quarter: when they are one
      // run that reaches it, every row left out for its quarter lay before the first (quarterRowsLayBefore).
      const quarters = await contentQuarters(client, summary.release_no, summary.created_at);
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
          zipPlusFour: summary.zip_plus_four,
          releaseNo: summary.release_no,
          engineVersion: summary.engine_version,
          createdAt: summary.created_at,
          expiresAt: summary.expires_at,
          releaseWithdrawn: summary.release_withdrawn,
          keptWith: keptWithOf(summary.kept_with),
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
          outsideContent: totals('outside_content_rows', 'outside_content_claim_lines', 'outside_content_observed_cents'),
          outsideContentBefore: quarterRowsLayBefore(quarters, summary.created_at),
        },
        groups: groups.rows.map((group) => ({
          groupNo: group.group_no,
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
        groupPage: {
          groups: counted.groups,
          anomalyGroups: counted.anomaly_groups,
          withinReductionGroups: counted.within_reduction_groups,
          perPage: counted.page_size,
          pages: counted.pages,
          page: counted.page_no,
          firstGroup: counted.first_group,
          lastGroup: counted.last_group,
          others: {
            groups: counted.other_groups,
            anomalyGroups: counted.other_anomaly_groups,
            rows: counted.other_rows,
            claimLines: count(counted.other_claim_lines),
            expectedCents: money(counted.other_expected_cents),
            lowestCents: money(counted.other_lowest_cents),
            observedCents: money(counted.other_observed_cents),
            differenceCents: money(counted.other_difference_cents),
            lowestDifferenceCents: money(counted.other_lowest_difference_cents),
          },
        },
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
      issues.push({ field: 'contactName', message: NO_PATIENT_INFORMATION });
    }
    const locations = /^[0-9]{1,4}$/.test(input.locations.trim()) ? Number(input.locations.trim()) : 0;
    if (locations < 1 || locations > 1000) {
      issues.push({ field: 'locations', message: 'a whole number of locations from 1 to 1,000' });
    }
    const payers = input.payers;
    if (payers.length < 1 || payers.length > 50 || payers.some((name) => name.length > 120)) {
      issues.push({ field: 'payers', message: 'name 1 to 50 payers, each at most 120 characters' });
    } else if (payers.some((name) => textPhiFindings(name).length > 0)) {
      issues.push({ field: 'payers', message: NO_PATIENT_INFORMATION });
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

/**
 * The result page's signal that a person opened it (src/components/screening/opened-signal.tsx sends it once the page
 * has been visible two seconds and used). A malformed link returns before the database; the database records the
 * first open of a complete, unexpired result alone. The route's file answers 204 whatever happened, so the answer says
 * nothing about the link.
 */
export const screeningOpened = publicRoute({
  id: 'public.screening_opened',
  kind: 'handler',
  method: 'POST',
  path: '/api/screening/opened',
  phi: false,
  rateLimit: 'screening_signal',
  params: z.object({}),
  input: z.object({ resultId: field(64) }),
  handle: async ({ input, services }): Promise<null> => {
    if (!SCREENING_TOKEN.test(input.resultId)) {
      return null;
    }
    await withClient(services.pool, (client) => client.query('SELECT screening_result_opened($1)', [screeningTokenHash(input.resultId)]));
    return null;
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
      'SELECT id, settings, approved_by, approved_by_email, approved_at, in_force FROM console_place_of_service_splits()',
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
      id = (await scope.client.query<{ id: string }>('SELECT console_approve_place_of_service_split($1::jsonb) AS id', [JSON.stringify(settings)])).rows[0]?.id;
    } catch (error) {
      if (pgError(error)?.constraint === 'place_of_service_split_settings') {
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

export const SCREENING_ROUTES = [screeningPage, screeningSubmit, screeningResult, screeningConvert, screeningOpened, screeningSplitPage, screeningSplitApprove] as const;
