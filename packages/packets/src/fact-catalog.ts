import { centsToString, parseCents, sumCents } from '@tp/money';

import { contractAmount, sumUnits } from './assemble';
import { type FactKind, type FactPhraseKey, type FactScope, type FactSubject, type FactWords, type OtherFact, type SetMeasure, factWords } from './fact-words';
import type { PacketContent, ScheduleLine } from './format';
import { interestStated, lineInterestStated } from './interest';
import { isFactId } from './placeholders';
import type { FigureRole } from './roles-reader/kinds';
import { canonicalNumber } from './scan';

/**
 * The catalog of a packet version's facts (design lane-b-packet-figure-placeholders, section 1): every value a
 * narrative's fact token may name, each with its id, kind, role, scope, the schedule rows it covers, its value, where in
 * the content each of its figures is read, its phrase and whether a model may use it. Built from the stored version's
 * content alone, so anyone can build it again; pure and browser-safe. Code computes every value: the pattern's and each
 * code's totals are the content's stored values (already hashed), and only a claim's and an explicit set of rows'
 * amounts and units are summed here, cents as bigint (@tp/money sumCents) and units as an exact decimal
 * (./assemble.ts sumUnits), never through a float.
 *
 * **One set of lines has one id** (canonical ids). A set of rows is named, for a measure, by the first of these that
 * holds it: the pattern (every line); a code (its lines; only a code of the CPT and HCPCS shape, `^[A-Z0-9]{5}$`, has
 * an id, its content code lowercased); a claim (its lines, two or more, named by its first row); a line (one row); and
 * otherwise `lines.<a>+<b>...` (rows ascending and distinct, two or more and fewer than all). So a one-code pattern has
 * no code totals (the pattern's are the same lines), a claim of one line is its line, a claim whose lines are a code's
 * has no claim facts, and a code of one line names that line's amounts. The catalog holds only canonical ids; a
 * well-formed id that names its set by a lower subject is `fact_not_canonical`, with the id that names it.
 *
 * Every row-set subject holds the same measures (./fact-words.ts SetMeasure): the count of lines (not an explicit
 * list of rows, whose count is itself), units, the expected, allowed and paid amounts, the shortfall, the patients'
 * share (a tp-packet/2 version's) and the service dates. A line also holds its own dates, its code and its modifiers.
 * A value code cannot state exactly is no fact: an amount that is not whole cents, a patient's share not on record, a
 * per-line value only some lines hold, a code or modifier of another shape, a quote holding braces.
 */

/** A span of dates: from one to another, or (a contract version in effect with no end) open. */
export interface DateSpan {
  readonly from: string;
  readonly to: string | null;
}

/**
 * A fact's value, by its kind: whole cents as integer text (`amount`), a whole number (`count`, `days`, `page`,
 * `version`, `release`, `level`, `year`), an exact decimal (`units`), the content's text (`percent`, `code`, `quote`,
 * `reference`), an ISO date (`date`), a span of them (`date_span`), or the modifiers in the content's order.
 */
export type FactValue = string | number | readonly string[] | DateSpan;

/** A JSON path into the content, `#` standing for each of the fact's rows. */
export type FactPath = readonly (string | number)[];

export interface FactEntry {
  readonly id: string;
  readonly subject: FactSubject;
  /** The id's measure: `expected`, `expected_each`, `code`, `rate`, `percent`, ... */
  readonly measure: string;
  readonly kind: FactKind;
  readonly role: FigureRole | null;
  readonly scope: FactScope | null;
  /** The schedule rows the fact covers, ascending: every row for the pattern, its set for a part, interest's stated rows; none for the rest. */
  readonly rows: readonly number[];
  readonly value: FactValue;
  /** Where each figure of the value is read in the content: one path, or two for a span (its first and last date). */
  readonly paths: readonly FactPath[];
  /** Whether code summed the value over `rows` here (a claim's or a set of rows'); the pattern's and codes' are stored. */
  readonly summed: boolean;
  readonly phrase: FactPhraseKey;
  /** Whether a model may use it (section 2.2): no row-bound subject. */
  readonly model: boolean;
}

/** A fact a template's id names, or why it names none. */
export type FactLookup =
  | { readonly found: FactEntry }
  | { readonly problem: 'unknown_fact' }
  | { readonly problem: 'fact_not_canonical'; readonly canonical: string };

interface CodeRows {
  readonly code: string;
  readonly id: string;
  /** Its index in pattern.codes, or null when only the lines name it. */
  readonly index: number | null;
  readonly rows: readonly number[];
}

interface ClaimRows {
  readonly first: number;
  readonly rows: readonly number[];
}

export interface FactCatalog {
  readonly content: PacketContent;
  /** Every fact the catalog enumerates, in a fixed order (an explicit set of rows is resolved on demand, never listed). */
  readonly entries: readonly FactEntry[];
  readonly byId: ReadonlyMap<string, FactEntry>;
  /** @internal */
  readonly context: CatalogContext;
}

interface CatalogContext {
  readonly content: PacketContent;
  readonly lines: readonly ScheduleLine[];
  readonly byRow: ReadonlyMap<number, { readonly line: ScheduleLine; readonly index: number }>;
  readonly all: readonly number[];
  /** The codes that have an id, by id. */
  readonly codes: ReadonlyMap<string, CodeRows>;
  /** Each claim's rows, by each of its rows. */
  readonly claims: ReadonlyMap<number, ClaimRows>;
  /** Above the first level: the payer's copy prints no first-level window. */
  readonly nextLevel: boolean;
  readonly words: FactWords;
  readonly fields: ReturnType<typeof fieldTables>;
}

/** Whether a content code has an id: the CPT and HCPCS shape, whose lowercase form is one-to-one with it. */
export const codeShaped = (code: string): boolean => /^[A-Z0-9]{5}$/.test(code);
/** Whether a modifier is rendered: two capital letters or digits. */
export const modifierShaped = (modifier: string): boolean => /^[A-Z0-9]{2}$/.test(modifier);

/** Whether an amount is whole cents as integer text (null, or a fraction of a cent, is not). */
const wholeCents = (text: string | null): text is string => /^(?:0|-?[1-9]\d*)$/.test(String(text));

/**
 * Where each measure is read: each amount's field in a schedule row, and the pattern's and a code's stored fields where
 * they store the measure (neither stores the paid amount or the patients' share). Built on each call (./fact-words.ts).
 */
function fieldTables() {
  const amounts = {
    expected: ['expected_cents'],
    allowed: ['observed_cents'],
    paid: ['paid_cents'],
    variance: ['variance_cents'],
    patient_share: ['calculation', 'patient_share_cents'],
  } as const;
  const pattern: Partial<Record<SetMeasure | 'claims' | 'patients', string>> = {
    lines: 'lines',
    claims: 'claims',
    patients: 'patients',
    units: 'units',
    expected: 'expected_cents',
    allowed: 'observed_cents',
    variance: 'variance_cents',
  };
  const code: Partial<Record<SetMeasure, string>> = {
    lines: 'lines',
    units: 'units',
    expected: 'expected_cents',
    allowed: 'observed_cents',
    variance: 'variance_cents',
  };
  return { amounts, pattern, code } as const;
}

/** A row's amount at a field path (a tp-packet/2 row's patients' share may be null). */
const fieldOf = (line: ScheduleLine, path: readonly string[]): string | null => path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], line) as string | null;

/** The sum of whole-cent amounts, or null when any is not whole cents or none is given. */
function wholeSum(amounts: readonly (string | null)[]): string | null {
  return amounts.length > 0 && amounts.every(wholeCents) ? centsToString(sumCents(amounts.map(parseCents))) : null;
}

function contextOf(content: PacketContent): CatalogContext {
  const lines = content.lines;
  const byRow = new Map(lines.map((line, index) => [line.row, { line, index }] as const));
  // The rows in schedule order (assemblePacket numbers them from 1 in that order).
  const all = lines.map((line) => line.row);
  const codes = new Map<string, CodeRows>();
  for (const code of new Set(lines.map((line) => line.procedure_code))) {
    if (codeShaped(code)) {
      const index = content.pattern.codes.findIndex((summary) => summary.procedure_code === code);
      const id = code.toLowerCase();
      codes.set(id, { code, id, index: index === -1 ? null : index, rows: lines.filter((line) => line.procedure_code === code).map((line) => line.row) });
    }
  }
  const claims = new Map<number, ClaimRows>();
  for (const claimId of new Set(lines.map((line) => line.claim_id))) {
    const rows = lines.filter((line) => line.claim_id === claimId).map((line) => line.row);
    const claim = { first: rows[0] as number, rows };
    for (const row of rows) {
      claims.set(row, claim);
    }
  }
  const nextLevel = content.format === 'tp-packet/2' && content.deadline.basis === 'next_level_window';
  return { content, lines, byRow, all, codes, claims, nextLevel, words: factWords(), fields: fieldTables() };
}

const sameRows = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((row, index) => row === b[index]);

/** The code (with an id) whose lines are exactly these rows. */
const codeOfRows = (context: CatalogContext, rows: readonly number[]) => [...context.codes.values()].find((code) => sameRows(code.rows, rows));

/**
 * The canonical id of a measure over a set of rows (ascending, distinct, each a row of the schedule), by the
 * precedence pattern, code, claim, line, set of rows; null where no subject holds the measure for the set (the count
 * of an explicit set of rows; a code or modifiers of no one code or row).
 */
function canonicalName(context: CatalogContext, rows: readonly number[], measure: SetMeasure | 'code' | 'modifiers'): string | null {
  const whole = measure !== 'code' && measure !== 'modifiers';
  if (whole && rows.length === context.all.length) {
    return `pattern.${measure}`;
  }
  const code = codeOfRows(context, rows);
  if (code !== undefined) {
    return measure === 'code' ? `code.${code.id}` : `code.${code.id}.${measure}`;
  }
  const [only] = rows;
  if (!whole) {
    return rows.length === 1 ? `line.${String(only)}.${measure}` : null;
  }
  const claim = rows.length > 1 ? context.claims.get(only ?? 0) : undefined;
  if (claim !== undefined && sameRows(claim.rows, rows)) {
    return `claim.${String(claim.first)}.${measure}`;
  }
  if (measure === 'lines') {
    return null;
  }
  if (rows.length === 1) {
    return `line.${String(only)}.${measure === 'service_dates' ? 'service_date' : measure}`;
  }
  return `lines.${rows.join('+')}.${measure}`;
}

interface Built {
  readonly kind: FactKind;
  readonly role: FigureRole | null;
  readonly value: FactValue;
  readonly paths: readonly FactPath[];
  readonly summed: boolean;
  readonly phrase: FactPhraseKey;
}

const roleOf = (context: CatalogContext, measure: keyof FactWords['lineMeasures']): FigureRole | null => context.words.lineMeasures[measure].role;

/**
 * A measure's value over a set of rows, summed by code (or each row's own, for one row): what the catalog states for a
 * claim, a line and an explicit set of rows, and what a property test holds equal to the stored code and pattern
 * totals. Null where code cannot state it exactly (an amount not whole cents, a patient's share not on record).
 */
export function summedValue(content: PacketContent, rows: readonly number[], measure: SetMeasure): FactValue | null {
  const context = contextOf(content);
  return rows.length > 0 && rows.every((row) => context.byRow.has(row)) ? (summed(context, rows, measure)?.value ?? null) : null;
}

/** A measure summed over rows, each a row of the schedule (its callers hold that), at least one. */
function summed(context: CatalogContext, rows: readonly number[], measure: SetMeasure): Omit<Built, 'phrase'> | null {
  const lines = rows.map((row) => (context.byRow.get(row) as { readonly line: ScheduleLine }).line);
  const { role, kind } = context.words.lineMeasures[measure];
  if (measure === 'lines') {
    return { kind, role, value: lines.length, paths: [['lines']], summed: true };
  }
  if (measure === 'units') {
    return { kind, role, value: canonicalNumber(sumUnits(lines.map((line) => line.units))), paths: [['lines', '#', 'units']], summed: true };
  }
  if (measure === 'service_dates') {
    const dates = lines.map((line) => line.service_date).sort();
    const path = ['lines', '#', 'service_date'];
    return { kind, role, value: { from: dates[0] as string, to: dates.at(-1) as string }, paths: [path, path], summed: true };
  }
  if (measure === 'patient_share' && context.content.format !== 'tp-packet/2') {
    return null;
  }
  const field = context.fields.amounts[measure];
  const value = wholeSum(lines.map((line) => fieldOf(line, field)));
  return value === null ? null : { kind, role, value, paths: [['lines', '#', ...field]], summed: true };
}

/** The phrase key of a row-set fact: its subject and measure, a span of one date in the `.one` form. */
function setPhrase(subject: 'pattern' | 'code' | 'claim' | 'line' | 'lines', measure: string, value: FactValue): FactPhraseKey {
  const one = typeof value === 'object' && !Array.isArray(value) && (value as DateSpan).from === (value as DateSpan).to;
  return `${subject}.${measure}${one ? '.one' : ''}` as FactPhraseKey;
}

/** The pattern's fact of a measure: its stored value where it stores one, summed over every row otherwise. */
function patternFact(context: CatalogContext, measure: SetMeasure | 'claims' | 'patients'): Built | null {
  const { pattern } = context.content;
  if (measure === 'service_dates') {
    const value = { from: pattern.first_service_date, to: pattern.last_service_date };
    return { kind: 'date_span', role: 'service_date', value, paths: [['pattern', 'first_service_date'], ['pattern', 'last_service_date']], summed: false, phrase: setPhrase('pattern', measure, value) };
  }
  const stored = context.fields.pattern[measure];
  if (stored === undefined) {
    const made = summed(context, context.all, measure as SetMeasure);
    return made === null ? null : { ...made, phrase: setPhrase('pattern', measure, made.value) };
  }
  const { kind, role } = context.words.lineMeasures[measure];
  const raw = (pattern as unknown as Record<string, unknown>)[stored];
  const value = storedValue(kind, raw);
  return value === null ? null : { kind, role, value, paths: [['pattern', stored]], summed: false, phrase: `pattern.${measure}` as FactPhraseKey };
}

/** A stored count, count of units or amount as the catalog states it, or null where it is not exact. */
function storedValue(kind: FactKind, raw: unknown): FactValue | null {
  if (kind === 'units') {
    return canonicalNumber(raw as string);
  }
  // An amount, or a count (a whole number as an amount is whole cents: its digits and no fraction).
  return wholeCents(raw as string) ? (raw as FactValue) : null;
}

/** A code's fact of a measure: its stored total where it stores one, summed over its rows otherwise. */
function codeFact(context: CatalogContext, code: CodeRows, measure: SetMeasure): Built | null {
  const stored = context.fields.code[measure];
  if (stored === undefined || code.index === null) {
    const made = summed(context, code.rows, measure);
    return made === null ? null : { ...made, phrase: setPhrase('code', measure, made.value) };
  }
  const { kind, role } = context.words.lineMeasures[measure];
  const raw = (context.content.pattern.codes[code.index] as unknown as Record<string, unknown>)[stored];
  const value = storedValue(kind, raw);
  return value === null ? null : { kind, role, value, paths: [['pattern', 'codes', code.index, stored]], summed: false, phrase: `code.${measure}` as FactPhraseKey };
}

/** A line's own value of a set measure (one row: no sum), with its path in that row. */
function lineFact(context: CatalogContext, row: number, measure: Exclude<SetMeasure, 'lines'>): Built | null {
  const found = context.byRow.get(row) as { readonly index: number };
  const made = summed(context, [row], measure);
  if (made === null) {
    return null;
  }
  const lineMeasure = measure === 'service_dates' ? 'service_date' : measure;
  const value = typeof made.value === 'object' && !Array.isArray(made.value) ? (made.value as DateSpan).from : made.value;
  const field = measure === 'units' ? ['units'] : measure === 'service_dates' ? ['service_date'] : context.fields.amounts[measure];
  return { kind: context.words.lineMeasures[lineMeasure].kind, role: roleOf(context, lineMeasure), value, paths: [['lines', found.index, ...field]], summed: false, phrase: `line.${lineMeasure}` as FactPhraseKey };
}

/** The modifiers rendered for a set of rows: each row's the same, at least one, each of the shape; null otherwise. */
function modifiersOf(context: CatalogContext, rows: readonly number[]): readonly string[] | null {
  const lists = rows.map((row) => (context.byRow.get(row) as { readonly line: ScheduleLine }).line.modifiers);
  const first = lists[0] as readonly string[];
  const same = lists.every((list) => JSON.stringify(list) === JSON.stringify(first));
  return same && first.length > 0 && first.every(modifierShaped) ? first : null;
}

class Entries {
  readonly list: FactEntry[] = [];

  constructor(private readonly words: FactWords) {}

  add(id: string, subject: FactSubject, measure: string, scope: FactScope | null, rows: readonly number[], built: Built | null): void {
    if (built !== null) {
      this.list.push({ id, subject, measure, scope, rows, ...built, model: this.words.modelSubjects.includes(subject) });
    }
  }

  /** A fact of the other subjects (FactWords' otherFacts), its figure read at one path. */
  other(stem: OtherFact, index: number | null, value: FactValue | null, path: FactPath, rows: readonly number[] = [], phrase: FactPhraseKey = stem as FactPhraseKey): void {
    if (value === null) {
      return;
    }
    const { kind, role, scope } = this.words.otherFacts[stem];
    const [subject, measure] = stem.split('.') as [FactSubject, string];
    const id = index === null ? stem : `${stem}.${String(index)}`;
    this.add(id, subject, measure, scope, rows, { kind, role, value, paths: [path], summed: false, phrase });
  }
}

/** Whether text holds a brace a token could be read from: such a quote is no fact, so a rendered text never holds a token. */
const braced = (text: string) => text.includes('{') || text.includes('}');

/** The one value a list holds when every item is that value, or null. */
function oneOf<T>(values: readonly T[]): T | null {
  const distinct = [...new Set(values)];
  return distinct.length === 1 ? (distinct[0] as T) : null;
}

/**
 * A row's own facts: its units, amounts and service date (each only where the line names it canonically, unless
 * `canonical` is false), its payment, received and window dates, and its code and modifiers (canonical only).
 */
function rowEntries(context: CatalogContext, row: number, entries: Entries, canonical: boolean): void {
  const { line, index } = context.byRow.get(row) as { line: ScheduleLine; index: number };
  for (const measure of context.words.setMeasures.filter((item): item is Exclude<SetMeasure, 'lines'> => item !== 'lines')) {
    const lineMeasure = measure === 'service_dates' ? 'service_date' : measure;
    const id = `line.${String(row)}.${lineMeasure}`;
    if (!canonical || canonicalName(context, [row], measure) === id) {
      entries.add(id, 'line', lineMeasure, measure === 'service_dates' ? null : 'part', [row], lineFact(context, row, measure));
    }
  }
  const own = (measure: 'paid_on' | 'received_on' | 'window_ends_on', value: string | null) => {
    entries.add(`line.${String(row)}.${measure}`, 'line', measure, null, [row], value === null ? null : { kind: 'date', role: roleOf(context, measure), value, paths: [['lines', index, measure]], summed: false, phrase: `line.${measure}` });
  };
  own('paid_on', line.paid_on);
  own('received_on', line.received_on);
  // A line's first-level window, which the payer's copy states at the first level only.
  own('window_ends_on', context.nextLevel ? null : line.window_ends_on);
  // A row's code and modifiers only where its line names them (rowFacts() keeps no fact the catalog lists).
  if (codeShaped(line.procedure_code) && canonicalName(context, [row], 'code') === `line.${String(row)}.code`) {
    entries.add(`line.${String(row)}.code`, 'line', 'code', 'part', [row], { kind: 'code', role: null, value: line.procedure_code, paths: [['lines', index, 'procedure_code']], summed: false, phrase: 'line.code' });
  }
  const modifiers = modifiersOf(context, [row]);
  if (modifiers !== null && canonicalName(context, [row], 'modifiers') === `line.${String(row)}.modifiers`) {
    entries.add(`line.${String(row)}.modifiers`, 'line', 'modifiers', 'part', [row], { kind: 'modifiers', role: null, value: modifiers, paths: [['lines', index, 'modifiers']], summed: false, phrase: 'line.modifiers' });
  }
}

/**
 * Each row's own values (its units, amounts and service date) that its line does not name canonically, so the catalog
 * lists them under no line's id: a one-line pattern's line (named by the pattern), a code of one line (named by the
 * code). With the catalog's line facts, every value the schedule prints on a row, which ADR 0086's reader holds as some
 * line's (./facts.ts narrativeFacts). Not ids a template may use: it names them by their canonical ids.
 */
export function rowFacts(catalog: FactCatalog): readonly FactEntry[] {
  const entries = new Entries(catalog.context.words);
  for (const row of catalog.context.all) {
    rowEntries(catalog.context, row, entries, false);
  }
  return entries.list.filter((entry) => !catalog.byId.has(entry.id));
}

export function factCatalog(content: PacketContent): FactCatalog {
  const context = contextOf(content);
  const entries = new Entries(context.words);
  const { citation, pattern, interest } = content;

  entries.other('packet.as_of', null, content.as_of, ['as_of']);
  entries.other('packet.level', null, content.dispute_level, ['dispute_level']);

  if (citation.kind === 'contract') {
    entries.other('citation.version', null, citation.version_no, ['citation', 'version_no']);
    entries.other('citation.page', null, citation.page, ['citation', 'page']);
    const effective: DateSpan = { from: citation.effective_from, to: citation.effective_to };
    const { kind, role, scope } = context.words.otherFacts['citation.effective'];
    const paths: FactPath[] = [['citation', 'effective_from'], ...(effective.to === null ? [] : [['citation', 'effective_to']])];
    entries.add('citation.effective', 'citation', 'effective', scope, [], { kind, role, value: effective, paths, summed: false, phrase: effective.to === null ? 'citation.effective.open' : 'citation.effective' });
    entries.other('citation.quote', null, braced(citation.quote) ? null : citation.quote, ['citation', 'quote']);
    // One rate, the citation's (no code has its own: every code's contract amount is this one copied), whole cents only.
    const rate = contractAmount(citation);
    if (wholeCents(rate)) {
      const schedule = citation.method === 'LESSER_OF';
      const path = schedule ? ['citation', 'parameters', 'schedule', 'amount_cents'] : ['citation', 'parameters', 'amount_cents'];
      const { kind, role } = context.words.otherFacts['contract.rate'];
      const phrase: FactPhraseKey = citation.method === 'PER_VISIT' ? 'contract.rate.PER_VISIT' : schedule ? 'contract.rate.LESSER_OF' : 'contract.rate.FIXED_SCHEDULE';
      entries.add('contract.rate', 'contract', 'rate', citation.method === 'PER_VISIT' ? 'visit' : 'unit', [], { kind, role, value: rate, paths: [path], summed: false, phrase });
    }
  } else {
    entries.other('citation.reference', null, braced(citation.reference) ? null : citation.reference, ['citation', 'reference']);
    entries.other('citation.quote', null, braced(citation.statement) ? null : citation.statement, ['citation', 'statement']);
  }
  pattern.contract_percentages.forEach((percent, index) => {
    entries.other('contract.percent', index + 1, percent, ['pattern', 'contract_percentages', index]);
  });
  pattern.contract_years.forEach((year, index) => {
    entries.other('contract.year', index + 1, year, ['pattern', 'contract_years', index]);
  });
  content.rule_releases.forEach((release, index) => {
    entries.other('release.no', index + 1, release.release_no, ['rule_releases', index, 'release_no']);
  });

  // The pattern: every line. Its per-line value only where every line of two or more holds the same one.
  for (const measure of [...context.words.setMeasures.slice(0, 1), 'claims' as const, 'patients' as const, ...context.words.setMeasures.slice(1)]) {
    entries.add(`pattern.${measure}`, 'pattern', measure, measure === 'lines' || measure === 'claims' || measure === 'patients' || measure === 'service_dates' ? null : 'total', context.all, patternFact(context, measure));
  }
  if (context.all.length > 1) {
    for (const measure of context.words.eachMeasures) {
      const values = context.all.map((row) => lineFact(context, row, measure));
      // One value every line holds (none where some line holds none).
      if (oneOf(values.map((built) => built?.value ?? null)) !== null) {
        const field = measure === 'units' ? ['units'] : context.fields.amounts[measure];
        entries.add(`pattern.${measure}_each`, 'pattern', `${measure}_each`, 'line', context.all, { ...(values[0] as Built), paths: [['lines', '#', ...field]], phrase: `pattern.${measure}_each` as FactPhraseKey });
      }
    }
  }

  // Each code with an id: the code itself, its modifiers, and each measure its lines are canonically named by.
  for (const code of context.codes.values()) {
    entries.add(`code.${code.id}`, 'code', 'code', 'part', code.rows, { kind: 'code', role: null, value: code.code, paths: [['lines', '#', 'procedure_code']], summed: false, phrase: 'code.code' });
    const modifiers = modifiersOf(context, code.rows);
    if (modifiers !== null) {
      entries.add(`code.${code.id}.modifiers`, 'code', 'modifiers', 'part', code.rows, { kind: 'modifiers', role: null, value: modifiers, paths: [['lines', '#', 'modifiers']], summed: false, phrase: 'code.modifiers' });
    }
    for (const measure of context.words.setMeasures) {
      if (canonicalName(context, code.rows, measure) === `code.${code.id}.${measure}`) {
        entries.add(`code.${code.id}.${measure}`, 'code', measure, measure === 'service_dates' || measure === 'lines' ? null : 'part', code.rows, codeFact(context, code, measure));
      }
    }
  }

  // Each claim of two lines or more that names its set canonically, by its first row.
  for (const claim of new Set(context.claims.values())) {
    for (const measure of context.words.setMeasures) {
      const id = `claim.${String(claim.first)}.${measure}`;
      if (canonicalName(context, claim.rows, measure) === id) {
        const made = summed(context, claim.rows, measure);
        entries.add(id, 'claim', measure, measure === 'service_dates' || measure === 'lines' ? null : 'part', claim.rows, made === null ? null : { ...made, phrase: setPhrase('claim', measure, made.value) });
      }
    }
  }

  // Each line: its own dates, its code and modifiers, and each measure it names canonically.
  for (const row of context.all) {
    rowEntries(context, row, entries, true);
  }

  if (content.format === 'tp-packet/2') {
    entries.other('deadline.ends_on', null, content.deadline.ends_on, ['deadline', 'ends_on']);
    // The contract window's day count and page, at the first level only, and only where every clause states the same one.
    const windows = context.nextLevel ? [] : content.deadline.sources.flatMap((source, index) => (source.kind === 'contract_window' ? [{ source, index }] : []));
    const [first] = windows;
    if (first !== undefined) {
      // Read at the first clause: every clause states the same.
      entries.other('deadline.window_days', null, oneOf(windows.map(({ source }) => source.days)), ['deadline', 'sources', first.index, 'days']);
      entries.other('deadline.window_page', null, oneOf(windows.map(({ source }) => source.page)), ['deadline', 'sources', first.index, 'page']);
    }
  }

  // Interest only where code computed it above zero (interestStated()): the payer's copy states no other.
  const stated = interestStated(interest) ? interest : null;
  if (stated !== null) {
    const rows = stated.lines.filter(lineInterestStated).map((line) => line.row);
    entries.other('interest.total', null, stated.total_cents, ['interest', 'total_cents'], rows);
    entries.other('interest.rate', null, stated.annual_rate_percent, ['interest', 'annual_rate_percent']);
    entries.other('interest.days_to_pay', null, stated.days_to_pay, ['interest', 'days_to_pay']);
    entries.other('interest.release', null, stated.release_no, ['interest', 'release_no']);
  }

  return { content, entries: entries.list, byId: new Map(entries.list.map((entry) => [entry.id, entry])), context };
}

/** A fact of an explicit set of rows (`lines.<a>+<b>...`), resolved on demand, never listed. */
function setOfRows(catalog: FactCatalog, rows: readonly number[], measure: SetMeasure): FactEntry | null {
  const made = summed(catalog.context, rows, measure);
  if (made === null) {
    return null;
  }
  const id = `lines.${rows.join('+')}.${measure}`;
  return { id, subject: 'lines', measure, scope: measure === 'service_dates' ? null : 'part', rows, ...made, phrase: setPhrase('lines', measure, made.value), model: false };
}

/** The fact a canonical name of a measure over rows names, listed or (a set of rows) resolved, or null when none. */
function named(catalog: FactCatalog, name: string | null, rows: readonly number[], measure: SetMeasure | 'code' | 'modifiers'): FactEntry | null {
  if (name === null) {
    return null;
  }
  return catalog.byId.get(name) ?? (name.startsWith('lines.') ? setOfRows(catalog, rows, measure as SetMeasure) : null);
}

/**
 * The rows an id's row list names (its digits and `+` signs), ascending and distinct, or null when one is written with a
 * leading zero, is empty or is not a row of the schedule.
 */
function rowsNamed(catalog: FactCatalog, list: string): number[] | null {
  const rows = list.split('+');
  const numbers = [...new Set(rows.map(Number))].sort((a, b) => a - b);
  return rows.every((row) => !row.startsWith('0')) && numbers.every((row) => catalog.context.byRow.has(row)) ? numbers : null;
}


/**
 * The fact an id names in a catalog: the fact; `fact_not_canonical` with the canonical id when a well-formed id names
 * its set by a lower subject (a code's lines as `lines.*`, a claim by a row that is not its first, a one-line claim, a
 * code in a one-code pattern, rows out of order or repeated); `unknown_fact` when the content holds no such fact (no
 * such row or code, a value code cannot state exactly, interest not stated, a window above the first level, any id
 * outside the grammar).
 */
export function lookupFact(catalog: FactCatalog, id: string): FactLookup {
  const listed = catalog.byId.get(id);
  if (listed !== undefined) {
    return { found: listed };
  }
  if (!isFactId(id)) {
    return { problem: 'unknown_fact' };
  }
  const { context } = catalog;
  const set = /^lines\.([\d+]+)\.([a-z_]+)$/.exec(id);
  if (set !== null) {
    const rows = rowsNamed(catalog, set[1] as string);
    const measure = set[2] as SetMeasure;
    if (rows === null || !context.words.setMeasures.includes(measure) || measure === 'lines') {
      return { problem: 'unknown_fact' };
    }
    const canonical = canonicalName(context, rows, measure) as string;
    const found = named(catalog, canonical, rows, measure);
    return found === null ? { problem: 'unknown_fact' } : canonical === id ? { found } : { problem: 'fact_not_canonical', canonical };
  }
  const part = /^(claim|code|line)\.([a-z0-9]+)\.([a-z_]+)$/.exec(id);
  if (part === null) {
    return { problem: 'unknown_fact' };
  }
  const key = part[2] as string;
  const rows = part[1] === 'code' ? (context.codes.get(key)?.rows ?? null) : part[1] === 'claim' ? (context.claims.get(rowsNamed(catalog, key)?.[0] ?? 0)?.rows ?? null) : rowsNamed(catalog, key);
  if (rows === null) {
    return { problem: 'unknown_fact' };
  }
  const measure = (part[3] === 'service_date' ? 'service_dates' : part[3]) as SetMeasure;
  const found = named(catalog, canonicalName(context, rows, measure), rows, measure);
  return found === null ? { problem: 'unknown_fact' } : { problem: 'fact_not_canonical', canonical: found.id };
}

/**
 * The canonical id of a measure over a set of rows (in any order, repeats ignored), or null when no row is given, a row
 * is not the schedule's, or the content holds no such fact: the id the picker's "Sum of lines..." inserts, and the
 * one the verifier requires.
 */
export function canonicalFactId(catalog: FactCatalog, rows: readonly number[], measure: SetMeasure | 'code' | 'modifiers'): string | null {
  const set = [...new Set(rows)].sort((a, b) => a - b);
  if (set.length === 0 || !set.every((row) => catalog.context.byRow.has(row))) {
    return null;
  }
  return named(catalog, canonicalName(catalog.context, set, measure), set, measure)?.id ?? null;
}
