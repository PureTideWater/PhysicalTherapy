/**
 * The model gateway's synthetic contract evaluation set (PRD 14: "The evaluation set starts with 40
 * synthetic contracts and exhibits of varied layouts (tables, prose, scanned)"; test matrix MOD-01):
 * 40 invented contracts and fee-schedule exhibits, each written out as intake receives it and with the
 * rate records it states as ground truth, every field with its value, the text it is written in, the
 * page and the quote.
 *
 * - table: a text PDF whose Exhibit A is a table of codes, modifiers, places and rates (or a CSV
 *   exhibit, one row per rate);
 * - prose: a text PDF whose rates are sentences in the compensation article;
 * - scanned: a PDF of page images with no text layer (drawn as a table or as prose), and the scan
 *   reader's recorded answer beside it (formats/scan.ts).
 *
 * Methods, codes, modifiers, places of service, amounts, percentages, locked fee-schedule years,
 * rounding and adjustment clauses, windows and the way each date and amount is written vary from case
 * to case, from a seeded generator, so the set is the same on every run. Distracting figures (filing
 * and dispute windows, section numbers, days to pay) sit beside the terms as they do in a contract.
 * Nothing here is a real payer, provider or rate.
 *
 * Each truth is written in format /2 (docs/adr/0070 Part 1): tier small, page text faithful (every
 * text PDF and CSV is read as written, and every scan's recorded answer is error-free), no pair or
 * twin, the amended rows' original and amendment records named as expected conflicts, and each record's
 * role. The documents and recordings are the bytes they were under format /1; the set v2 generator
 * (contract-set-v2.ts) reuses this file's terms, writers and layout.
 */
import { type Cents, centsToString, formatCents } from '@tp/money';

import { type CalendarDate, addDays, calendarDate } from '../core/dates';
import { prettyJson } from '../core/json';
import { Random } from '../core/random';
import { type Exhibit, exhibitPageLines, exhibitPdf } from '../formats/exhibit';
import { scannedPdf, textractRecording } from '../formats/scan';
import {
  CONTRACT_SET_V1_FORMAT,
  CONTRACT_TRUTH_FORMAT,
  type ContractLayout,
  type ContractSetV1Case,
  type ContractSetV1Manifest,
  type ContractTruth,
  type ContractTruthRecord,
  type TruthField,
  type TruthFieldValue,
  type TruthFlags,
  type TruthRecord,
} from './formats';

export const CONTRACT_SET_SIZE = 40;
/** The directory under the MOD-01 case that holds the set. */
export const CONTRACT_SET_DIR = 'contract-set';

export type Method = 'FIXED_SCHEDULE' | 'PERCENT_OF_MEDICARE' | 'LESSER_OF' | 'PER_VISIT';
export type Rounding = 'HALF_UP_CENT' | 'HALF_EVEN_CENT' | 'TRUNCATE';

/** Page text as evidence compares it (the same normalization as @tp/contracts normalizePageText). */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ORDINAL = (day: number) => (day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th');

/** A date written one of the ways a contract writes one (and the gateway's reader reads). */
export function writtenDate(date: CalendarDate, style: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  const name = MONTHS[month - 1] ?? 'January';
  switch (style % 5) {
    case 0:
      return date;
    case 1:
      return `${String(month)}/${String(day)}/${String(year)}`;
    case 2:
      return `${name} ${String(day)}, ${String(year)}`;
    case 3:
      return `${String(day)} ${name} ${String(year)}`;
    default:
      return `${name.slice(0, 3)}. ${String(day)}${ORDINAL(day)}, ${String(year)}`;
  }
}

/** An amount written with a dollar sign and cents, without the sign, or (for whole dollars) as dollars only. */
export function writtenAmount(amount: Cents, style: number): string {
  const text = formatCents(amount);
  if (style === 2 && text.endsWith('.00')) {
    return `$${text.slice(0, -3)}`;
  }
  return style === 1 ? text : `$${text}`;
}

export const writtenPercent = (percent: string, style: number) => (style === 1 ? `${percent} percent` : `${percent}%`);

export const listed = (items: readonly string[]) => (items.length === 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`);

/** Wraps a sentence at word boundaries into lines of at most `width` characters. */
export function wrap(sentence: string, width = 88): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of sentence.split(' ')) {
    if (current !== '' && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current === '' ? word : `${current} ${word}`;
    }
  }
  if (current !== '') {
    lines.push(current);
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------
// What each case states

export interface RateRow {
  readonly codes: readonly string[];
  readonly modifiers: readonly string[];
  readonly places: readonly string[];
  readonly amount: Cents | null;
  readonly percentage: string | null;
  /** A locked fee-schedule year, or null for the schedule in effect on the date of service. */
  readonly year: number | null;
}

export interface CaseSpec {
  readonly id: string;
  readonly layout: ContractLayout;
  readonly drawnAs: 'table' | 'prose' | 'csv';
  readonly kind: 'contract' | 'exhibit';
  readonly method: Method;
  readonly lesserOf: 'FIXED_SCHEDULE' | 'PERCENT_OF_MEDICARE' | null;
  readonly payer: string;
  readonly provider: string;
  readonly from: CalendarDate;
  readonly lastDay: CalendarDate | null;
  readonly dateStyle: number;
  readonly amountStyle: number;
  readonly percentStyle: number;
  readonly rounding: Rounding | null;
  readonly flags: TruthFlags | null;
  readonly rows: readonly RateRow[];
  /** An amendment that replaces some rows' rates from a later date (contracts only). */
  readonly amendment: { readonly from: CalendarDate; readonly rows: readonly RateRow[] } | null;
}

export const TIMED_CODES = ['97110', '97112', '97116', '97140', '97150', '97530', '97535', '97542', '97750', '97760', '97763', '97032', '97033', '97035', 'G0283'];
export const EVALUATION_CODES = ['97161', '97162', '97163', '97164', '97165', '97166', '97167', '97168'];
export const MODIFIERS = ['GP', 'GO', 'KX', '59', 'CQ', 'CO'];
export const PLACES = ['11', '22', '12', '19'];
export const PERCENTAGES = ['100', '105', '110', '112.5', '115', '120', '125', '130', '87.5', '95'];
export const STARTS: readonly CalendarDate[] = [calendarDate(2026, 1, 1), calendarDate(2026, 2, 1), calendarDate(2026, 3, 1), calendarDate(2026, 4, 1), calendarDate(2025, 7, 1), calendarDate(2026, 1, 15)];
export const ENDS: readonly (CalendarDate | null)[] = [null, calendarDate(2026, 12, 31), calendarDate(2027, 6, 30), null, calendarDate(2027, 12, 31)];
export const ROUNDINGS: readonly (Rounding | null)[] = [null, 'HALF_UP_CENT', 'HALF_EVEN_CENT', 'TRUNCATE', null];

export function draw<T>(random: Random, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(random.int(0, pool.length - 1), 1)[0] as T);
  }
  return out;
}

function layoutOf(n: number): { readonly layout: ContractLayout; readonly drawnAs: 'table' | 'prose' | 'csv' } {
  if (n <= 14) {
    return { layout: 'table', drawnAs: n >= 11 ? 'csv' : 'table' };
  }
  if (n <= 27) {
    return { layout: 'prose', drawnAs: 'prose' };
  }
  return { layout: 'scanned', drawnAs: n % 2 === 0 ? 'table' : 'prose' };
}

function rowsFor(random: Random, method: Method, lesserOf: CaseSpec['lesserOf'], drawnAs: CaseSpec['drawnAs']): RateRow[] {
  const percentRows = method === 'PERCENT_OF_MEDICARE' || lesserOf === 'PERCENT_OF_MEDICARE';
  if (method === 'PER_VISIT') {
    const groups = random.int(1, 2);
    const codes = draw(random, [...TIMED_CODES.slice(0, 10), ...EVALUATION_CODES.slice(0, 4)], groups * 3);
    return Array.from({ length: groups }, (_, index) => ({
      codes: codes.slice(index * 3, index * 3 + 3),
      modifiers: [],
      places: index === 0 && random.chance(40) ? [random.pick(PLACES)] : [],
      amount: random.cents(6_500n, 18_000n),
      percentage: null,
      year: null,
    }));
  }
  const count = random.int(2, drawnAs === 'prose' ? 4 : 6);
  if (percentRows && drawnAs === 'prose') {
    // A sentence of prose sets one percentage for a group of codes.
    const codes = draw(random, [...EVALUATION_CODES, ...TIMED_CODES], count * 2);
    return Array.from({ length: Math.max(1, Math.floor(count / 2) + 1) }, (_, index) => ({
      codes: codes.slice(index * 2, index * 2 + random.int(1, 2)),
      modifiers: random.chance(25) ? [random.pick(MODIFIERS)] : [],
      places: [],
      amount: null,
      percentage: random.pick(PERCENTAGES),
      year: random.chance(40) ? random.pick([2024, 2025]) : null,
    })).filter((row) => row.codes.length > 0);
  }
  const codes = draw(random, [...TIMED_CODES, ...EVALUATION_CODES], count);
  return codes.map((code) => ({
    codes: [code],
    modifiers: random.chance(35) ? draw(random, MODIFIERS, random.int(1, 2)) : [],
    places: random.chance(30) ? [random.pick(PLACES)] : [],
    amount: percentRows ? null : random.cents(1_800n, 16_000n),
    percentage: percentRows ? random.pick(PERCENTAGES) : null,
    year: percentRows && random.chance(40) ? random.pick([2024, 2025]) : null,
  }));
}

export function flagsFor(random: Random): TruthFlags | null {
  if (!random.chance(35)) {
    return null;
  }
  return {
    apply_mppr: random.chance(60),
    apply_assistant_reduction: random.chance(50),
    apply_sequestration: random.chance(30),
    apply_ncci: random.chance(60),
    timed_units_rule: random.pick(['MEDICARE_POOLED', 'PER_CODE'] as const),
  };
}

/** The 40 cases' terms, from one seed per case. */
export function contractSetSpecs(): CaseSpec[] {
  return Array.from({ length: CONTRACT_SET_SIZE }, (_, index) => {
    const n = index + 1;
    const id = `C${String(n).padStart(2, '0')}`;
    const random = new Random(`tp-synth/MOD-01/${id}`);
    const { layout, drawnAs } = layoutOf(n);
    const exhibit = drawnAs === 'csv' || (drawnAs === 'table' && n % 3 === 0);
    const methods: readonly Method[] = exhibit ? ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE'] : ['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'FIXED_SCHEDULE', 'PER_VISIT'];
    const method = methods[n % methods.length] as Method;
    const lesserOf = method === 'LESSER_OF' ? random.pick(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE'] as const) : null;
    const from = random.pick(STARTS);
    const lastDay = exhibit ? null : random.pick(ENDS);
    const rows = rowsFor(random, method, lesserOf, drawnAs);
    const amendable = !exhibit && method === 'FIXED_SCHEDULE' && n % 4 === 1;
    const amendFrom = addDays(from, random.pick([91, 120, 181]));
    return {
      id,
      layout,
      drawnAs,
      kind: exhibit ? 'exhibit' : 'contract',
      method,
      lesserOf,
      payer: `SYNTHETIC PAYER ${String.fromCharCode(65 + (n % 26))}${String(n)}`,
      provider: `SYNTHETIC THERAPY GROUP ${String(n).padStart(2, '0')}`,
      from,
      lastDay,
      dateStyle: random.int(0, 4),
      amountStyle: drawnAs === 'table' && random.chance(30) ? 1 : random.chance(20) ? 2 : 0,
      percentStyle: random.chance(30) ? 1 : 0,
      rounding: exhibit ? null : random.pick(ROUNDINGS),
      flags: exhibit ? null : flagsFor(random),
      rows,
      amendment: amendable ? { from: amendFrom, rows: rows.slice(0, 2).map((row) => ({ ...row, amount: row.amount === null ? null : random.cents(row.amount + 50n, row.amount + 900n) })) } : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// Writing a case out, and its truth

export const ROUNDING_TEXT: Readonly<Record<Rounding, string>> = {
  HALF_UP_CENT: 'All payment amounts are rounded half up to the nearest cent.',
  HALF_EVEN_CENT: 'All payment amounts are rounded to the nearest cent, an exact half going to the even cent.',
  TRUNCATE: 'All payment amounts are truncated to the whole cent.',
};

export function flagsText(flags: TruthFlags): string {
  const applies = (on: boolean, what: string, plural = false) => `${what} ${on ? (plural ? 'apply' : 'applies') : plural ? 'do not apply' : 'does not apply'}`;
  return [
    'Adjustments: the',
    `${applies(flags.apply_mppr, 'multiple procedure payment reduction')};`,
    `the ${applies(flags.apply_assistant_reduction, 'assistant reduction')};`,
    `${applies(flags.apply_sequestration, 'sequestration')};`,
    `${applies(flags.apply_ncci, 'NCCI edits', true)};`,
    flags.timed_units_rule === 'MEDICARE_POOLED' ? 'timed units are counted under the Medicare pooled 8-minute rule.' : 'timed units are counted for each code on its own.',
  ].join(' ');
}

export function methodClause(spec: CaseSpec): string {
  if (spec.kind === 'exhibit') {
    return spec.method === 'PERCENT_OF_MEDICARE' ? 'Rates below are percentages of the Medicare Physician Fee Schedule.' : 'Rates below are fixed amounts per unit of service.';
  }
  const where = spec.drawnAs === 'prose' ? 'in Article 3' : 'in Exhibit A';
  switch (spec.method) {
    case 'FIXED_SCHEDULE':
      return `Payer shall reimburse Covered Services at the fixed amounts per unit of service stated ${where}.`;
    case 'PERCENT_OF_MEDICARE':
      return `Payer shall reimburse Covered Services at the percentage of the Medicare Physician Fee Schedule stated ${where} for each code.`;
    case 'LESSER_OF':
      return spec.lesserOf === 'PERCENT_OF_MEDICARE'
        ? `Payer shall pay the lesser of the billed charge and the percentage of the Medicare Physician Fee Schedule stated ${where}.`
        : `Payer shall pay the lesser of the billed charge and the fixed amount per unit stated ${where}.`;
    case 'PER_VISIT':
      return `Payer shall pay one case rate per visit for the codes listed ${where}, whatever the units billed.`;
  }
}

export function rateText(spec: CaseSpec, row: RateRow): string {
  if (row.amount !== null) {
    return `${writtenAmount(row.amount, spec.amountStyle)} ${spec.method === 'PER_VISIT' ? 'per visit' : 'per unit'}`;
  }
  const percent = writtenPercent(row.percentage ?? '100', spec.percentStyle);
  return row.year === null ? `${percent} of the Medicare fee schedule in effect` : `${percent} of the ${String(row.year)} Medicare fee schedule`;
}

/** A table row: code, modifiers, place and rate in columns two or more spaces apart. */
export function tableRow(spec: CaseSpec, row: RateRow): string {
  const codes = row.codes.join(', ');
  const modifiers = row.modifiers.length === 0 ? '-' : row.modifiers.join(' ');
  const places = row.places.length === 0 ? '-' : row.places.join(' ');
  return `${codes.padEnd(20)}  ${modifiers.padEnd(8)}  ${places.padEnd(5)}  ${rateText(spec, row)}`;
}

/** A sentence of prose that states one row's rate. */
export function proseSentence(spec: CaseSpec, row: RateRow): string {
  const modifiers = row.modifiers.length === 0 ? '' : ` billed with modifier${row.modifiers.length > 1 ? 's' : ''} ${listed(row.modifiers)}`;
  const places = row.places.length === 0 ? '' : ` in place of service ${listed(row.places)}`;
  const codes = `CPT ${listed(row.codes)}`;
  const percent = writtenPercent(row.percentage ?? '100', spec.percentStyle);
  const schedule = row.year === null ? 'the Medicare Physician Fee Schedule in effect on the date of service' : `the ${String(row.year)} Medicare Physician Fee Schedule`;
  const amount = row.amount === null ? '' : writtenAmount(row.amount, spec.amountStyle === 1 ? 0 : spec.amountStyle);
  switch (spec.method) {
    case 'FIXED_SCHEDULE':
      return `For ${codes}${modifiers}${places}, Payer shall pay ${amount} per unit.`;
    case 'PERCENT_OF_MEDICARE':
      return `Services billed under ${codes}${modifiers}${places} are paid at ${percent} of ${schedule}.`;
    case 'LESSER_OF':
      return row.amount === null ? `For ${codes}${modifiers}${places}, Payer pays the lesser of the billed charge or ${percent} of ${schedule}.` : `For ${codes}${modifiers}${places}, Payer pays the lesser of the billed charge or ${amount} per unit.`;
    case 'PER_VISIT':
      return `For a visit that includes any of ${codes}${places}, Payer pays a case rate of ${amount} per visit.`;
  }
}

export interface Placed {
  readonly page: number;
  readonly quote: string;
}

/** A document being laid out: pages of lines, and where each quoted sentence or row was put. */
export class Layout {
  readonly pages: { heading: string; lines: string[] }[] = [];

  page(heading: string): void {
    this.pages.push({ heading, lines: [] });
  }

  /** Writes a sentence (wrapped) on the current page; returns where it is and its quote. */
  sentence(text: string): Placed {
    const current = this.pages.at(-1);
    if (current === undefined) {
      throw new Error('a sentence goes on a page');
    }
    current.lines.push(...wrap(text));
    return { page: this.pages.length, quote: normalizeText(text) };
  }

  /** Writes a line as it is (a table row). */
  line(text: string): Placed {
    const current = this.pages.at(-1);
    if (current === undefined) {
      throw new Error('a line goes on a page');
    }
    current.lines.push(text);
    return { page: this.pages.length, quote: normalizeText(text) };
  }
}

export interface Written {
  readonly records: ContractTruthRecord[];
  readonly exhibit: Exhibit | null;
  readonly csv: string | null;
  /** Each page's text as evidence compares it. */
  readonly pageTexts: readonly string[];
}

export function field(value: TruthFieldValue['value'], written: TruthFieldValue['written'], at: Placed): TruthFieldValue {
  return { value, written, page: at.page, quote: at.quote };
}

/** The fields one row's record states, given where its row, its method clause and the shared terms were written. */
export function recordFields(
  spec: CaseSpec,
  row: RateRow,
  at: { readonly row: Placed; readonly method: Placed; readonly from: Placed | null; readonly to: Placed | null; readonly rounding: Placed | null; readonly flags: Placed | null },
  fromDate: CalendarDate,
  fromWritten: string,
): Partial<Record<TruthField, TruthFieldValue>> {
  const fields: Partial<Record<TruthField, TruthFieldValue>> = {};
  fields.method = field(spec.method, null, at.method);
  fields.codes = field(row.codes, row.codes, at.row);
  if (row.modifiers.length > 0) {
    fields.modifiers = field(row.modifiers, row.modifiers, at.row);
  }
  if (row.places.length > 0) {
    fields.places_of_service = field(row.places, row.places, at.row);
  }
  if (row.amount !== null) {
    const style = spec.drawnAs === 'prose' && spec.amountStyle === 1 ? 0 : spec.amountStyle;
    fields.amount = field(centsToString(row.amount), writtenAmount(row.amount, style), at.row);
  }
  if (row.percentage !== null) {
    fields.percentage = field(row.percentage, writtenPercent(row.percentage, spec.percentStyle), at.row);
  }
  if (row.year !== null) {
    fields.fee_schedule_year = field(String(row.year), String(row.year), at.row);
  }
  if (spec.lesserOf !== null) {
    fields.lesser_of_schedule = field(spec.lesserOf, null, at.method);
  }
  if (spec.flags !== null && at.flags !== null) {
    fields.flags = field(spec.flags, null, at.flags);
  }
  if (spec.rounding !== null && at.rounding !== null) {
    fields.rounding = field(spec.rounding, null, at.rounding);
  }
  if (at.from !== null) {
    fields.effective_from = field(fromDate, fromWritten, at.from);
  }
  if (spec.lastDay !== null && at.to !== null) {
    fields.effective_to = field(spec.lastDay, writtenDate(spec.lastDay, spec.dateStyle), at.to);
  }
  return fields;
}

export const label = (row: RateRow, where: string) => `${where}: ${row.codes.join(', ')}${row.modifiers.length > 0 ? ` ${row.modifiers.join(' ')}` : ''}${row.places.length > 0 ? ` POS ${row.places.join(' ')}` : ''}`;

function writePdfCase(spec: CaseSpec, random: Random): Written {
  const layout = new Layout();
  const fromWritten = writtenDate(spec.from, spec.dateStyle);
  let from: Placed;
  let to: Placed | null = null;
  let method: Placed;
  let rounding: Placed | null = null;
  let flags: Placed | null = null;
  if (spec.kind === 'contract') {
    layout.page('Article 1. Parties and term');
    layout.sentence(`This SYNTHETIC agreement is between ${spec.payer} ("Payer") and ${spec.provider} ("Provider").`);
    from = layout.sentence(
      spec.lastDay === null
        ? `This Agreement is effective ${fromWritten} and continues until either party ends it on 90 days written notice.`
        : `This Agreement is effective ${fromWritten} and remains in effect through ${writtenDate(spec.lastDay, spec.dateStyle)}.`,
    );
    to = spec.lastDay === null ? null : from;
    layout.sentence(`Section 1.3. Provider shall submit claims within ${String(random.pick([90, 120, 180, 365]))} days of the date of service.`);
    layout.sentence(`Section 1.4. Provider may dispute a payment within ${String(random.pick([60, 90, 120, 180]))} days of the remittance date.`);
    layout.page('Article 2. Compensation');
    method = layout.sentence(methodClause(spec));
    if (spec.rounding !== null) {
      rounding = layout.sentence(`Section 2.2. ${ROUNDING_TEXT[spec.rounding]}`);
    }
    if (spec.flags !== null) {
      flags = layout.sentence(`Section 2.3. ${flagsText(spec.flags)}`);
    }
    layout.sentence(`Section 2.5. Payer shall pay a clean claim within ${String(random.pick([30, 45]))} days of receiving it.`);
  } else {
    layout.page('Fee schedule exhibit');
    layout.sentence(`This SYNTHETIC fee schedule exhibit is issued by ${spec.payer} for ${spec.provider}.`);
    from = layout.sentence(`Fee schedule effective ${fromWritten}.`);
    method = layout.sentence(methodClause(spec));
  }
  const records: ContractTruthRecord[] = [];
  const shared = { method, from, to, rounding, flags };
  if (spec.drawnAs === 'prose') {
    layout.page('Article 3. Rates');
    for (const row of spec.rows) {
      const at = layout.sentence(proseSentence(spec, row));
      // In prose, the sentence that states a rate also states its method.
      const own = spec.method === 'LESSER_OF' || spec.method === 'PER_VISIT' ? at : method;
      records.push({ label: label(row, 'Article 3'), role: 'term', fields: recordFields(spec, row, { ...shared, row: at, method: own }, spec.from, fromWritten) });
    }
  } else {
    if (spec.kind === 'contract') {
      layout.page('Exhibit A. Fee schedule');
    }
    layout.line(`${'Codes'.padEnd(20)}  ${'Modifier'.padEnd(8)}  ${'POS'.padEnd(5)}  ${spec.amountStyle === 1 ? 'Rate (USD)' : 'Rate'}`);
    for (const row of spec.rows) {
      const at = layout.line(tableRow(spec, row));
      records.push({ label: label(row, spec.kind === 'contract' ? 'Exhibit A' : 'Exhibit'), role: 'term', fields: recordFields(spec, row, { ...shared, row: at }, spec.from, fromWritten) });
    }
  }
  if (spec.amendment !== null) {
    layout.page('Amendment 1');
    const amendWritten = writtenDate(spec.amendment.from, spec.dateStyle);
    const amendFrom = layout.sentence(`Effective ${amendWritten}, the rates below replace the rates stated earlier for the same codes.`);
    for (const row of spec.amendment.rows) {
      const at = spec.drawnAs === 'prose' ? layout.sentence(proseSentence(spec, row)) : layout.line(tableRow(spec, row));
      records.push({ label: label(row, 'Amendment 1'), role: 'amendment', fields: recordFields(spec, row, { ...shared, row: at, from: amendFrom }, spec.amendment.from, amendWritten) });
    }
  }
  const exhibit: Exhibit = { title: `SYNTHETIC ${spec.kind === 'contract' ? 'agreement' : 'fee schedule'} ${spec.id}`, pages: layout.pages };
  const pageTexts = exhibitPageLines(exhibit).map((lines) => normalizeText(lines.join('\n')));
  return { records, exhibit, csv: null, pageTexts };
}

const csvField = (text: string) => (/[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

/** A CSV exhibit: a heading block, then one row per rate; the page reader joins a row's fields with tabs. */
export function writeCsvCase(spec: CaseSpec): Written {
  const fromWritten = writtenDate(spec.from, spec.dateStyle);
  const rows: string[][] = [
    ['SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT'],
    [`SYNTHETIC fee schedule ${spec.id} issued by ${spec.payer} for ${spec.provider}`],
    [`Fee schedule effective ${fromWritten}`],
    [methodClause(spec)],
    ['Code', 'Modifier', 'Place of service', spec.amountStyle === 1 ? 'Rate (USD)' : 'Rate', 'Basis'],
  ];
  const text = (fields: readonly string[]) => normalizeText(fields.filter((item) => item.trim() !== '').join('\t'));
  const from: Placed = { page: 1, quote: text(rows[2] ?? []) };
  const method: Placed = { page: 1, quote: text(rows[3] ?? []) };
  const records: ContractTruthRecord[] = [];
  for (const row of spec.rows) {
    const basis = row.amount === null ? (row.year === null ? 'of the Medicare fee schedule in effect' : `of the ${String(row.year)} Medicare fee schedule`) : 'per unit';
    const rate = row.amount === null ? writtenPercent(row.percentage ?? '100', spec.percentStyle) : writtenAmount(row.amount, spec.amountStyle);
    const fields = [row.codes.join(' '), row.modifiers.join(' '), row.places.join(' '), rate, basis];
    rows.push(fields);
    records.push({ label: label(row, 'CSV row'), role: 'term', fields: recordFields(spec, row, { method, from, to: null, rounding: null, flags: null, row: { page: 1, quote: text(fields) } }, spec.from, fromWritten) });
  }
  const csv = `${rows.map((fields) => fields.map(csvField).join(',')).join('\r\n')}\r\n`;
  return { records, exhibit: null, csv, pageTexts: [normalizeText(rows.map((fields) => fields.filter((item) => item.trim() !== '').join('\t')).join('\n'))] };
}

/** Throws unless every field's quote is on its page and every written value is in its quote: the set's own MOD-01 check. */
export function checkTruth(id: string, records: readonly TruthRecord[], pageTexts: readonly string[]): void {
  for (const record of records) {
    for (const [name, value] of Object.entries(record.fields)) {
      const page = pageTexts[value.page - 1];
      if (page === undefined || !page.includes(value.quote) || value.quote === '') {
        throw new Error(`${id} ${record.label} ${name}: the quote is not on page ${String(value.page)}`);
      }
      const written = value.written === null ? [] : typeof value.written === 'string' ? [value.written] : value.written;
      for (const item of written) {
        if (!value.quote.includes(normalizeText(item))) {
          throw new Error(`${id} ${record.label} ${name}: the written value is not in its quote`);
        }
      }
    }
  }
}

export interface ContractSetFile {
  /** Relative to the MOD-01 case directory. */
  readonly path: string;
  readonly bytes: Uint8Array | string;
  readonly kind: 'pdf' | 'csv' | 'json';
  readonly description: string;
}

export function fieldCount(records: readonly TruthRecord[]): number {
  return records.reduce((sum, record) => sum + Object.keys(record.fields).length, 0);
}

/**
 * The expected conflicts of a case: each amended row's original record (the first rows, in order) and
 * the amendment record that replaces its rate from a later date over the same scope. Both are records
 * the document states; nothing in it says the original stops, so both are proposed and each is flagged
 * against the other for the specialist.
 */
export function amendmentConflicts(records: readonly ContractTruthRecord[]): [number, number][] {
  const terms = records.filter((record) => record.role === 'term').length;
  return records.flatMap((record, index): [number, number][] => (record.role === 'amendment' ? [[index - terms, index]] : []));
}

/** Every file of the set, and the manifest that lists its cases. */
export function contractSetFiles(): ContractSetFile[] {
  const files: ContractSetFile[] = [];
  const cases: ContractSetV1Case[] = [];
  for (const spec of contractSetSpecs()) {
    const random = new Random(`tp-synth/MOD-01/${spec.id}/layout`);
    const written = spec.drawnAs === 'csv' ? writeCsvCase(spec) : writePdfCase(spec, random);
    checkTruth(spec.id, written.records, written.pageTexts);
    const dir = `${CONTRACT_SET_DIR}/${spec.id}-${spec.layout}`;
    const scanned = spec.layout === 'scanned';
    const document = spec.drawnAs === 'csv' ? 'exhibit.csv' : 'document.pdf';
    const truth: ContractTruth = {
      format: CONTRACT_TRUTH_FORMAT,
      synthetic: true,
      id: spec.id,
      layout: spec.layout,
      drawnAs: scanned ? spec.drawnAs : null,
      kind: spec.kind,
      document,
      contentType: spec.drawnAs === 'csv' ? 'text/csv' : 'application/pdf',
      scan: scanned ? 'textract.json' : null,
      pages: written.pageTexts.length,
      tier: 'small',
      pageText: 'faithful',
      unfaithfulBecause: null,
      pairOf: null,
      twinOf: null,
      conflicts: amendmentConflicts(written.records),
      records: written.records,
    };
    if (written.csv !== null) {
      files.push({ path: `${dir}/${document}`, bytes: written.csv, kind: 'csv', description: `${spec.id}: a SYNTHETIC CSV fee-schedule exhibit, one row per rate.` });
    } else if (written.exhibit !== null) {
      const pageLines = exhibitPageLines(written.exhibit);
      if (scanned) {
        files.push({ path: `${dir}/${document}`, bytes: scannedPdf(pageLines, written.exhibit.title, spec.id), kind: 'pdf', description: `${spec.id}: a SYNTHETIC ${spec.kind} drawn as ${spec.drawnAs}, scanned: page images, no text layer.` });
        files.push({ path: `${dir}/textract.json`, bytes: prettyJson(textractRecording(pageLines, document)), kind: 'json', description: `${spec.id}: the scan reader's recorded text detection for the scanned pages (SYNTHETIC).` });
      } else {
        files.push({ path: `${dir}/${document}`, bytes: exhibitPdf(written.exhibit), kind: 'pdf', description: `${spec.id}: a SYNTHETIC ${spec.kind} with its rates as ${spec.drawnAs === 'prose' ? 'prose' : 'a table'} (text PDF).` });
      }
    }
    files.push({ path: `${dir}/truth.json`, bytes: prettyJson(truth), kind: 'json', description: `${spec.id}: the rate records the document states, every field with its value, page and quote (SYNTHETIC ground truth).` });
    cases.push({ id: spec.id, dir, layout: spec.layout, kind: spec.kind, records: written.records.length, fields: fieldCount(written.records) });
  }
  const manifest: ContractSetV1Manifest = {
    format: CONTRACT_SET_V1_FORMAT,
    synthetic: true,
    note: 'SYNTHETIC: 40 invented contracts and exhibits for the model gateway evaluation (PRD 14). No real payer, provider or rate.',
    cases,
  };
  files.unshift({ path: `${CONTRACT_SET_DIR}/set.json`, bytes: prettyJson(manifest), kind: 'json', description: 'The contract evaluation set: its 40 cases, their layouts and how many records and fields each states.' });
  return files;
}

