import { z } from 'zod';

import { CONTENT_IDS, type ContentId, type DateRange, dayAfter } from './records';
import { cmsQuarterOf, cmsQuarterOfDate, cmsQuarterWindow, isIsoDate, isoDate, quarterLabel } from './schema';

/**
 * The content calendar (audit #59; docs/adr/0071; docs/runbooks/content-updates.md): when each family of global rule
 * content is published, how long ahead of its period it must be loaded, and the import commands that load it; and
 * contentDue(), the pure evaluation of what is due on a day against the content a release (or, before release 1, the
 * drafts) holds. The content-calendar workflow opens an issue per finding, and the console's Rule releases page shows
 * them. Imported only through the `@tp/rules/calendar` subpath, never from the package's index, so nothing the
 * screening-capacity closure reaches imports it (docs/adr/0071, the placement rule).
 */

export const CONTENT_FAMILIES = [
  'fee_schedule',
  'conversion_factor',
  'zip_locality',
  'mppr',
  'mppr_general',
  'ncci_mue',
  'ncci_ptp',
  'code_lists',
  'therapy_thresholds',
  'assistant_modifiers',
  'sequestration',
  'state_prompt_pay',
  'dispute_windows',
] as const;
export type ContentFamilyId = (typeof CONTENT_FAMILIES)[number];

/** A month and day, MM-DD. */
const mmdd = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

export const calendarEntrySchema = z.strictObject({
  family: z.enum(CONTENT_FAMILIES),
  /** Customer words, sentence case: the console, the Releases page and the issue titles show it. */
  title: z.string().min(3).max(80),
  contents: z.array(z.enum(CONTENT_IDS)).min(1),
  source: z.strictObject({ title: z.string().min(3), page: z.url({ protocol: /^https$/ }) }),
  cadence: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('quarterly') }),
    z.strictObject({ kind: z.literal('annual'), effective: mmdd }),
    z.strictObject({ kind: z.literal('dates'), effective: z.array(mmdd).min(2) }),
    z.strictObject({ kind: z.literal('on_change') }),
  ]),
  /** `window`: each period's content ends (a quarter's RVUs); `open`: content stays in force until replaced (PTP edits). */
  ends: z.enum(['window', 'open']),
  /** Days before a period starts that the source usually publishes it; null for on_change. */
  publicationLeadDays: z.number().int().min(0).max(365).nullable(),
  /** Days before a period starts that its content is due in a published release (the runbook's target time to load). */
  loadLeadDays: z.number().int().min(0).max(60),
  /** Days after the expected publication before a missing download is overdue. */
  graceDays: z.number().int().min(0).max(60),
  /** One template per importable record type; {year}, {from}, {to}, {url}, {yy}, {Q}, {period} and <file> placeholders. */
  importCommands: z.array(z.string().startsWith('pnpm rules:import ')),
  /** A RegExp source, matched case-insensitively against the file names a source page links to. */
  filePattern: z.string().nullable(),
  /** The file names the source page listed when the entry was last reviewed; null: not recorded yet. */
  knownFiles: z.array(z.string()).nullable(),
  /** Who confirmed the entry's dates against its source page, and when; null: never. */
  review: z.strictObject({ by: z.string().min(2).max(80), on: isoDate }).nullable(),
});
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

/** A MM-DD every year has (no 02-29, no 04-31). */
function isYearlyDay(text: string): boolean {
  return isIsoDate(`2025-${text}`);
}

export const contentCalendarSchema = z.array(calendarEntrySchema).superRefine((entries, context) => {
  const families = new Set<string>();
  const owners = new Map<ContentId, string>();
  entries.forEach((entry, index) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message: `${entry.family}: ${message}`, path: [index] });
    if (families.has(entry.family)) {
      issue('is in the calendar twice');
    }
    families.add(entry.family);
    for (const content of entry.contents) {
      const owner = owners.get(content);
      if (owner !== undefined) {
        issue(`${content} is already in ${owner}`);
      }
      owners.set(content, entry.family);
    }
    if ((entry.cadence.kind === 'on_change') !== (entry.publicationLeadDays === null)) {
      issue('publicationLeadDays is null exactly when the cadence is on_change');
    }
    const days = entry.cadence.kind === 'annual' ? [entry.cadence.effective] : entry.cadence.kind === 'dates' ? entry.cadence.effective : [];
    if (days.some((day) => !isYearlyDay(day)) || new Set(days).size !== days.length) {
      issue('every effective day is a day each year has, named once');
    }
    if (entry.filePattern !== null) {
      try {
        new RegExp(entry.filePattern, 'i');
      } catch {
        issue('filePattern is not a regular expression');
      }
    }
  });
});
export type ContentCalendar = z.infer<typeof contentCalendarSchema>;

const CMS_PFS_RVU = 'https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files';
const CMS_THERAPY = 'https://www.cms.gov/medicare/coding-billing/therapy-services';
const CMS_NCCI = 'https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits';

/**
 * The entries. Cadences from PRD 9's table, PRD 19 "The year" and content/sources/README.md; pages are the README's.
 * Every lead, grace and publication value is a proposal until a reviewer confirms it against the source page, so each
 * entry ships with `review: null` and `knownFiles: null`, and the workflow reports both (docs/runbooks/content-updates.md,
 * "How to review an entry"). denial_category is PaidWhole's own classification, so it is in no entry.
 */
export const CONTENT_CALENDAR: ContentCalendar = contentCalendarSchema.parse([
  {
    family: 'fee_schedule',
    title: 'Medicare fee schedule (relative values and GPCIs)',
    contents: ['pfs_rvu', 'pfs_gpci'],
    source: { title: 'CMS, PFS Relative Value Files', page: CMS_PFS_RVU },
    cadence: { kind: 'quarterly' },
    ends: 'window',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: [
      'pnpm rules:import --type pfs_rvu --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the PPRRVU file of RVU{yy}{Q}>',
      'pnpm rules:import --type pfs_gpci --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the GPCI file of RVU{yy}{Q}>',
    ],
    filePattern: '^RVU\\d{2}[A-D].*\\.zip$',
    knownFiles: null,
    review: null,
  },
  {
    family: 'conversion_factor',
    title: 'Medicare conversion factor',
    contents: ['conversion_factor'],
    source: { title: 'The physician fee schedule final rule, in the Federal Register', page: 'https://www.federalregister.gov' },
    cadence: { kind: 'annual', effective: '01-01' },
    ends: 'window',
    publicationLeadDays: 55,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: ['pnpm rules:import --type conversion_factor --year {year} --url {url} --file <the conversion-factor CSV for {period}> --second-pass <its second, independent preparation>'],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'zip_locality',
    title: 'ZIP code to Medicare locality',
    contents: ['locality_map', 'locality_map_plus_four'],
    source: { title: 'CMS, Zip Code to Carrier Locality File (physician fee schedule pages)', page: 'https://www.cms.gov/medicare/payment/fee-schedules/physician' },
    cadence: { kind: 'quarterly' },
    ends: 'window',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: [
      'pnpm rules:import --type locality_map --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the ZIP5 file for {period}>',
      'pnpm rules:import --type locality_map_plus_four --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the ZIP9 file for {period}>',
    ],
    filePattern: '^ZIP.*\\.zip$',
    knownFiles: null,
    review: null,
  },
  {
    family: 'mppr',
    title: 'Medicare multiple-procedure reduction list (MPPR)',
    contents: ['mppr_code'],
    source: { title: 'CMS, Therapy Services', page: CMS_THERAPY },
    cadence: { kind: 'annual', effective: '01-01' },
    ends: 'window',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: ['pnpm rules:import --type mppr_rate --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the therapy MPPR rate file for {period}>'],
    filePattern: 'MPPR.*\\.(zip|csv|xlsx?)$',
    knownFiles: null,
    review: null,
  },
  {
    family: 'mppr_general',
    title: 'Medicare general practice-expense reduction',
    contents: ['mppr_general'],
    source: { title: 'CMS, Therapy Services', page: CMS_THERAPY },
    cadence: { kind: 'on_change' },
    ends: 'open',
    publicationLeadDays: null,
    loadLeadDays: 0,
    graceDays: 0,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'ncci_mue',
    title: 'Medicare unit limits (MUE)',
    contents: ['ncci_mue'],
    source: { title: 'CMS, Medicare NCCI Medically Unlikely Edits (MUEs)', page: `${CMS_NCCI}/medicare-ncci-medically-unlikely-edits` },
    cadence: { kind: 'quarterly' },
    ends: 'window',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: ['pnpm rules:import --type ncci_mue --year {year} --effective-from {from} --effective-to {to} --url {url} --file <the practitioner MUE table for {period}>'],
    filePattern: 'MUE.*\\.(zip|csv)$',
    knownFiles: null,
    review: null,
  },
  {
    family: 'ncci_ptp',
    title: 'Medicare coding edits (NCCI PTP)',
    contents: ['ncci_ptp'],
    source: { title: 'CMS, Medicare NCCI Procedure to Procedure (PTP) Edits', page: `${CMS_NCCI}/medicare-ncci-procedure-procedure-ptp-edits` },
    cadence: { kind: 'quarterly' },
    ends: 'open',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 5,
    importCommands: ['pnpm rules:import --type ncci_ptp --year {year} --url {url} --file <each practitioner PTP file for {period}>'],
    filePattern: 'PTP.*\\.zip$',
    knownFiles: null,
    review: null,
  },
  {
    family: 'code_lists',
    title: 'X12 claim adjustment, remark and status codes',
    contents: ['carc', 'rarc', 'claim_status_code'],
    source: { title: 'X12, Claim Adjustment Reason Codes (and the remark and claim status code lists beside it)', page: 'https://x12.org/codes/claim-adjustment-reason-codes' },
    cadence: { kind: 'dates', effective: ['03-01', '07-01', '11-01'] },
    ends: 'open',
    publicationLeadDays: 30,
    loadLeadDays: 14,
    graceDays: 7,
    importCommands: [
      'pnpm rules:import --type carc --year {year} --url {url} --file <the claim adjustment reason code list exported for the {period}>',
      'pnpm rules:import --type rarc --year {year} --url {url} --file <the remittance advice remark code list exported for the {period}>',
      'pnpm rules:import --type claim_status_code --year {year} --url {url} --file <the claim status code list exported for the {period}>',
    ],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    // Typed by a person from the final rule, twice, with /new-rule-record: no import command.
    family: 'therapy_thresholds',
    title: 'Medicare therapy thresholds',
    contents: ['therapy_threshold'],
    source: { title: 'CMS, Therapy Services', page: CMS_THERAPY },
    cadence: { kind: 'annual', effective: '01-01' },
    ends: 'window',
    publicationLeadDays: 55,
    loadLeadDays: 14,
    graceDays: 3,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'assistant_modifiers',
    title: 'Medicare therapy assistant reduction',
    contents: ['assistant_modifier'],
    source: { title: 'CMS, Therapy Services', page: CMS_THERAPY },
    cadence: { kind: 'on_change' },
    ends: 'open',
    publicationLeadDays: null,
    loadLeadDays: 0,
    graceDays: 0,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'sequestration',
    title: 'Medicare sequestration',
    contents: ['sequestration'],
    source: { title: 'CMS, Medicare notices on the payment reduction required by federal law', page: 'https://www.cms.gov/medicare' },
    cadence: { kind: 'on_change' },
    ends: 'open',
    publicationLeadDays: null,
    loadLeadDays: 0,
    graceDays: 0,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'state_prompt_pay',
    title: 'State prompt-pay rules',
    contents: ['state_prompt_pay'],
    source: { title: 'NC Department of Insurance, Prompt Pay Requirement (and G.S. 58-3-225)', page: 'https://www.ncdoi.gov/insurance-industry/form-and-rate-filings/life-and-health/prompt-pay-requirement' },
    cadence: { kind: 'on_change' },
    ends: 'open',
    publicationLeadDays: null,
    loadLeadDays: 0,
    graceDays: 0,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
  {
    family: 'dispute_windows',
    title: 'Medicare appeal windows',
    contents: ['dispute_window'],
    source: { title: 'CMS, Original Medicare (fee-for-service) appeals', page: 'https://www.cms.gov/medicare/appeals-grievances/fee-for-service' },
    cadence: { kind: 'on_change' },
    ends: 'open',
    publicationLeadDays: null,
    loadLeadDays: 0,
    graceDays: 0,
    importCommands: [],
    filePattern: null,
    knownFiles: null,
    review: null,
  },
]);

// ---------------------------------------------------------------------------------------------
// The evaluation (pure: no clock, no I/O)

/** What a content holds: its merged windows, its newest start and its newest source.retrieved. */
export interface ContentState {
  readonly windows: readonly DateRange[];
  readonly newestFrom: string | null;
  readonly newestRetrieved: string | null;
}
export type ContentStates = Readonly<Partial<Record<ContentId, ContentState>>>;

export interface DueSources {
  /** The release the in-force states are of; null: none published. */
  readonly releaseNo: number | null;
  readonly inForce: ContentStates;
  /** Drafts and prepared releases together (the workflow, and the console with a checkout). */
  readonly pending?: ContentStates;
  /** The number the next `pnpm release:assemble` takes; releaseNo + 1 (or 1) when not given. */
  readonly nextReleaseNo?: number;
}

/** In the order findings are listed. */
export const DUE_STAGES = ['no_release', 'not_loaded', 'ended', 'ends_in_14', 'ends_in_45', 'no_draft', 'overdue', 'calendar_unreviewed', 'calendar_review_due'] as const;
export type DueStage = (typeof DUE_STAGES)[number];

export interface DuePeriod {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

export interface DueItem {
  /** Null for no_release and calendar_unreviewed, which are aggregated. */
  readonly family: ContentFamilyId | null;
  readonly stage: DueStage;
  /** Stable from day to day: the issue's dedupe key. */
  readonly title: string;
  readonly loadedThrough: string | null;
  readonly period: DuePeriod | null;
  readonly dueOn: string | null;
  readonly commands: readonly string[];
  /** The body's sentences, plain text. */
  readonly lines: readonly string[];
}

export interface LoadedThrough {
  readonly through: string | null;
  readonly open: boolean;
  readonly loaded: boolean;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** The same day `months` later, or the month's last day when it has no such day. */
function addMonths(date: string, months: number): string {
  const index = Number.parseInt(date.slice(0, 4), 10) * 12 + Number.parseInt(date.slice(5, 7), 10) - 1 + months;
  const year = Math.floor(index / 12);
  const month = index % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Number.parseInt(date.slice(8, 10), 10), last);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/**
 * Through what date a content is loaded on `today`: the end of the window holding today, else the latest end before
 * today; open (a window holding today with no end): null with open true. Not loaded: no state, or no window.
 */
export function loadedThrough(state: ContentState | undefined, today: string): LoadedThrough {
  if (state === undefined || state.windows.length === 0) {
    return { through: null, open: false, loaded: false };
  }
  const holding = state.windows.find((window) => window.from <= today && (window.to === null || window.to >= today));
  if (holding !== undefined) {
    return holding.to === null ? { through: null, open: true, loaded: true } : { through: holding.to, open: false, loaded: true };
  }
  const ends = state.windows.flatMap((window) => (window.to !== null && window.to < today ? [window.to] : [])).sort();
  return { through: ends.at(-1) ?? null, open: false, loaded: true };
}

/** A family's: the earliest of its contents'; open only when every content is; not loaded when any content is not. */
export function familyLoadedThrough(entry: CalendarEntry, states: ContentStates, today: string): LoadedThrough {
  const each = entry.contents.map((content) => loadedThrough(states[content], today));
  if (each.some((one) => !one.loaded)) {
    return { through: null, open: false, loaded: false };
  }
  if (each.every((one) => one.open)) {
    return { through: null, open: true, loaded: true };
  }
  if (each.some((one) => !one.open && one.through === null)) {
    // Loaded only for days after today.
    return { through: null, open: false, loaded: true };
  }
  const ends = each.flatMap((one) => (one.through === null ? [] : [one.through])).sort();
  return { through: ends[0] ?? null, open: false, loaded: true };
}

interface Period extends DuePeriod {
  readonly year: number;
}

/** The cadence period holding `date`: its quarter, its year from the effective day, or the span from one listed date to the next. */
function periodHolding(cadence: Exclude<CalendarEntry['cadence'], { kind: 'on_change' }>, date: string): Period {
  if (cadence.kind === 'quarterly') {
    const quarter = cmsQuarterOfDate(date);
    return { label: quarterLabel(quarter), ...cmsQuarterWindow(quarter), year: quarter.year };
  }
  const days = cadence.kind === 'annual' ? [cadence.effective] : [...cadence.effective].sort();
  const year = Number.parseInt(date.slice(0, 4), 10);
  // Every start in the year before, this year and the next, in order: the period starts at the last one on or before `date`.
  const starts = [year - 1, year, year + 1].flatMap((y) => days.map((day) => `${String(y)}-${day}`));
  const index = starts.findLastIndex((start) => start <= date);
  const from = starts[index] as string;
  const to = addDays(starts[index + 1] as string, -1);
  const label = cadence.kind === 'annual' && cadence.effective === '01-01' ? from.slice(0, 4) : cadence.kind === 'annual' ? `${from.slice(0, 4)} (from ${from})` : `${from} update`;
  return { label, from, to, year: Number.parseInt(from.slice(0, 4), 10) };
}

/** The entry's templates filled for `period`, then the check and the assembly. */
function fillCommands(entry: CalendarEntry, period: Period, nextReleaseNo: number): string[] {
  const fill = (template: string) =>
    template
      .replaceAll('{year}', String(period.year))
      .replaceAll('{from}', period.from)
      .replaceAll('{to}', period.to)
      .replaceAll('{url}', '<download address>')
      .replaceAll('{yy}', String(period.year % 100).padStart(2, '0'))
      .replaceAll('{Q}', cmsQuarterOf(period.from))
      .replaceAll('{period}', period.label);
  return [...entry.importCommands.map(fill), 'pnpm verify-content', `pnpm release:assemble ${String(nextReleaseNo)}`];
}

function holds(state: ContentState | undefined, date: string): boolean {
  return state?.windows.some((window) => window.from <= date && (window.to === null || window.to >= date)) === true;
}

/**
 * What is due on `today` (5.8.2 of the design behind docs/adr/0071, rules 1 to 8): the content a release holds, or,
 * with no release published, the drafts and prepared releases (`pending`), judged against the calendar. One item per
 * family at most, plus the calendar's own findings, ordered by DUE_STAGES. Throws RangeError on a today that is not a
 * date.
 */
export function contentDue(calendar: ContentCalendar, sources: DueSources, today: string): DueItem[] {
  if (!isIsoDate(today)) {
    throw new RangeError(`today must be a calendar date written YYYY-MM-DD, not ${JSON.stringify(today)}`);
  }
  const items: DueItem[] = [];
  const onDrafts = sources.releaseNo === null;
  const nextReleaseNo = sources.nextReleaseNo ?? (sources.releaseNo ?? 0) + 1;
  // Rule 1: before release 1 the drafts are the state judged, and nothing stands beside them.
  const judged = onDrafts ? sources.pending : sources.inForce;
  const basis = onDrafts ? 'content in the drafts' : 'loaded content';
  if (onDrafts) {
    items.push({
      family: null,
      stage: 'no_release',
      title: 'No rule release is published',
      loadedThrough: null,
      period: null,
      dueOn: null,
      commands: [],
      lines: [
        sources.pending === undefined
          ? 'No rule release is published, so no content is judged here, only the calendar itself.'
          : 'No rule release is published yet, so each family below is judged on the drafts and the prepared releases.',
      ],
    });
  }

  // Rule 2: the calendar's own review.
  const unreviewed = calendar.filter((entry) => entry.review === null);
  if (unreviewed.length > 0) {
    items.push({
      family: null,
      stage: 'calendar_unreviewed',
      title: 'Content calendar: entries not reviewed',
      loadedThrough: null,
      period: null,
      dueOn: null,
      commands: [],
      lines: [
        `${String(unreviewed.length)} calendar entries have no review, so their dates are proposals not yet confirmed against their source pages:`,
        ...unreviewed.map((entry) => `- ${entry.title} (${entry.source.page})`),
      ],
    });
  }
  for (const entry of calendar) {
    if (entry.review !== null && addMonths(entry.review.on, 13) < today) {
      items.push({
        family: entry.family,
        stage: 'calendar_review_due',
        title: `Content calendar: ${entry.title} due for review`,
        loadedThrough: null,
        period: null,
        dueOn: addMonths(entry.review.on, 13),
        commands: [],
        lines: [`The calendar entry for ${entry.title} was last reviewed on ${entry.review.on}, more than 13 months ago: check its dates against ${entry.source.page} again.`],
      });
    }
  }

  if (judged !== undefined) {
    for (const entry of calendar) {
      const item = familyDue(entry, judged, onDrafts ? undefined : sources.pending, onDrafts, basis, today, nextReleaseNo);
      if (item !== null) {
        items.push(item);
      }
    }
  }
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => DUE_STAGES.indexOf(a.item.stage) - DUE_STAGES.indexOf(b.item.stage) || a.index - b.index)
    .map(({ item }) => item);
}

/** Rules 3 to 5 for one family; `pending` is what stands beside the judged state (none when the drafts are judged). */
function familyDue(
  entry: CalendarEntry,
  judged: ContentStates,
  pending: ContentStates | undefined,
  onDrafts: boolean,
  basis: string,
  today: string,
  nextReleaseNo: number,
): DueItem | null {
  const { cadence } = entry;
  if (cadence.kind === 'on_change') {
    return null;
  }
  // With the drafts judged, they are also where a draft for the next period would be.
  const drafts = onDrafts ? judged : pending;
  const base = { family: entry.family, loadedThrough: null, dueOn: null } as const;
  const loaded = familyLoadedThrough(entry, judged, today);

  // Rule 3.
  if (entry.contents.some((content) => judged[content] === undefined) || (entry.ends === 'window' && !loaded.open && loaded.through === null)) {
    const period = periodHolding(cadence, today);
    return {
      ...base,
      stage: 'not_loaded',
      title: onDrafts ? `Content not in the drafts: ${entry.title}` : `Content not loaded: ${entry.title}`,
      period: { label: period.label, from: period.from, to: period.to },
      commands: fillCommands(entry, period, nextReleaseNo),
      lines: [onDrafts ? `The drafts hold no ${entry.title} for ${today}.` : `No ${entry.title} is loaded for ${today}.`],
    };
  }

  // Rule 4.
  if (entry.ends === 'window') {
    if (loaded.through === null) {
      // Open: in force with no end, so nothing runs out.
      return null;
    }
    const through = loaded.through;
    const days = dayNumber(through) - dayNumber(today);
    const period = periodHolding(cadence, dayAfter(through));
    const dueOn = addDays(period.from, -entry.loadLeadDays);
    const draftReady = drafts !== undefined && entry.contents.every((content) => holds(drafts[content], period.from));
    const noDraft = drafts !== undefined && today >= dueOn && !draftReady;
    const where = onDrafts ? `The drafts hold ${entry.title}` : `${entry.title} is loaded`;
    const shared = {
      ...base,
      loadedThrough: through,
      period: { label: period.label, from: period.from, to: period.to },
      dueOn,
      commands: fillCommands(entry, period, nextReleaseNo),
    };
    if (days < 0) {
      return {
        ...shared,
        stage: 'ended',
        title: `Content ended: ${entry.title}, ${basis} ended on ${through}`,
        lines: [`${where} only through ${through}, ${String(-days)} days before ${today}. ${period.label} starts on ${period.from}.`],
      };
    }
    if (noDraft) {
      return {
        ...shared,
        stage: 'no_draft',
        title: `Content due: ${entry.title}, ${period.label} has no draft (due ${dueOn})`,
        lines: [
          `${where} through ${through}. ${period.label} starts on ${period.from} and is due in a published release by ${dueOn}, ${String(entry.loadLeadDays)} days before; ${onDrafts ? 'the drafts hold no window for the period' : 'the drafts and the prepared releases hold no window for it'}.`,
        ],
      };
    }
    if (days <= 45) {
      const within = days <= 14 ? 14 : 45;
      return {
        ...shared,
        stage: within === 14 ? 'ends_in_14' : 'ends_in_45',
        title: `Content due: ${entry.title}, ${basis} ends within ${String(within)} days (${through})`,
        lines: [`${where} through ${through}, ${String(days)} days after ${today}. ${period.label} starts on ${period.from} and is due in a published release by ${dueOn}.`],
      };
    }
    return null;
  }

  // Rule 5: open families, judged by when their newest files were retrieved.
  const publishedBy = (start: string) => addDays(start, -(entry.publicationLeadDays ?? 0));
  const period = periodHolding(cadence, addDays(today, (entry.publicationLeadDays ?? 0) - entry.graceDays));
  const expected = publishedBy(period.from);
  const stale = entry.contents.filter((content) => {
    const retrieved = judged[content]?.newestRetrieved ?? null;
    return retrieved === null || retrieved < expected;
  });
  const coming = (content: ContentId) => {
    const retrieved = pending?.[content]?.newestRetrieved ?? null;
    return retrieved !== null && retrieved >= expected;
  };
  if (stale.length === 0 || stale.every(coming)) {
    return null;
  }
  // The content refreshed longest ago speaks for the family.
  const retrieved = stale.map((content) => judged[content]?.newestRetrieved ?? null);
  const oldest = retrieved.includes(null) ? null : ((retrieved as string[]).sort()[0] ?? null);
  return {
    ...base,
    stage: 'overdue',
    title: `Content overdue: ${entry.title}, ${period.label} files ${onDrafts ? 'not in the drafts' : 'not loaded'}`,
    period: { label: period.label, from: period.from, to: period.to },
    dueOn: addDays(period.from, -entry.loadLeadDays),
    commands: fillCommands(entry, period, nextReleaseNo),
    lines: [
      `${entry.source.title} usually publishes the ${period.label} files by ${expected}, and ${period.label} starts on ${period.from}. ${onDrafts ? 'The drafts hold' : 'The loaded content holds'} ${oldest === null ? 'no files retrieved yet' : `files retrieved on ${oldest} at the latest`} for ${stale.join(', ')}.`,
    ],
  };
}
