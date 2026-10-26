import { type Cents, cents, centsToString, decimal, parseCents, subtractCents } from '@tp/money';
import { type IndexedRelease, type LineFacts, type PricingTrace, price } from '@tp/pricing';
import { contractAgreement, fixedTerms, lineFacts, pricingInput, syntheticRelease } from '@tp/pricing/testing';

import type { AssemblyInput, AssemblyLine } from './assemble';
import { lineCalculation } from './calculation';
import { type Segment, type Sentence, plainText } from './explain/figures';
import type { LineWords } from './explain/line';
import { pathMatchesSlot } from './explain/slots';
import { CODES, PAYER_CODES } from './explain/words';
import type { Worksheet } from './explain/worksheet';
import type { ContractCitation, DeadlineSource, LineCalculation, RegulationCitation } from './format';
import type { PromptPayRecord } from './interest';

/**
 * SYNTHETIC inputs for the packet tests: a fixed-schedule contract that pays 97110 at 50.00 per unit
 * and three 97110 x 2 lines allowed 70.00 each (test matrix CAS-08), invented identifiers only. Each
 * line's window is the contract's own 3650 days, cited from page 1 of its document and verified (D17),
 * and its calculation summary is the fixed schedule's (its patient share the observed amount less paid).
 */

export const IDS = {
  practice: '00000000-0000-4000-8000-000000000001',
  payer: '00000000-0000-4000-8000-000000000002',
  plan: '00000000-0000-4000-8000-000000000003',
  contract: '00000000-0000-4000-8000-000000000004',
  version: '00000000-0000-4000-8000-000000000005',
  rateRecord: '00000000-0000-4000-8000-000000000006',
  document: '00000000-0000-4000-8000-000000000007',
  remittanceDocument: '00000000-0000-4000-8000-000000000008',
  run: '00000000-0000-4000-8000-000000000009',
  case: '00000000-0000-4000-8000-00000000000a',
  verifier: '00000000-0000-4000-8000-00000000000b',
} as const;

export const SHA = 'a'.repeat(64);

export function contractCitation(overrides: Partial<ContractCitation> = {}): ContractCitation {
  return {
    kind: 'contract',
    contract_id: IDS.contract,
    contract_title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT',
    contract_version_id: IDS.version,
    version_no: 1,
    effective_from: '2026-01-01',
    effective_to: null,
    rate_record_id: IDS.rateRecord,
    method: 'FIXED_SCHEDULE',
    parameters: { amount_cents: '5000' },
    document_id: IDS.document,
    document_sha256: SHA,
    page: 2,
    quote: '97110 is paid 50.00 per unit',
    page_sha256: SHA,
    ...overrides,
  };
}

export const REGULATION: RegulationCitation = {
  kind: 'regulation',
  method: 'MA_NONCONTRACTED',
  reference: '42 CFR 422.214',
  statement: 'A non-contracting provider accepts as payment in full what it could collect under Original Medicare.',
};

/** The contract's own dispute window, cited and verified: what each SYNTHETIC line's deadline rests on. */
export function contractWindowSource(overrides: Partial<Extract<DeadlineSource, { kind: 'contract_window' }>> = {}): DeadlineSource {
  return {
    kind: 'contract_window',
    contract_version_id: IDS.version,
    days: 3650,
    document_id: IDS.document,
    page: 1,
    quote: 'Disputes are raised within 3650 days of the payment date.',
    hash: SHA,
    verified_by: IDS.verifier,
    verified_at: '2026-01-02T09:00:00.000Z',
    ...overrides,
  };
}

/** A fixed-schedule line's calculation summary: the base and the one rounding at the expected amount. */
export function calculation(expected: Cents, observed: Cents, paid: Cents, overrides: Partial<LineCalculation> = {}): LineCalculation {
  const amount = centsToString(expected);
  return {
    method: 'FIXED_SCHEDULE',
    release_no: 900001,
    steps: [{ step: 'base', amount_cents: amount }],
    rounding: { rule: 'HALF_UP_CENT', unrounded_cents: amount, rounded_cents: amount },
    observed_basis: 'paid_plus_pr',
    patient_share_cents: centsToString(subtractCents(observed, paid)),
    trace_sha256: SHA,
    ...overrides,
  };
}

export function line(n: number, overrides: Partial<AssemblyLine> = {}): AssemblyLine {
  const hex = n.toString(16).padStart(12, '0');
  const base = {
    serviceLineId: `10000000-0000-4000-8000-${hex}`,
    claimId: `20000000-0000-4000-8000-${hex}`,
    pricedLineId: `30000000-0000-4000-8000-${hex}`,
    pricingRunId: IDS.run,
    patientKey: `40000000-0000-4000-8000-${hex}`,
    serviceDate: `2026-03-0${String(4 + n)}`,
    procedureCode: '97110',
    modifiers: [],
    units: '2',
    expectedCents: cents(10000n),
    observedCents: cents(7000n),
    varianceCents: cents(3000n),
    paidCents: cents(5600n),
    paidOn: '2026-04-08',
    receivedOn: null,
    windowEndsOn: '2036-04-05',
    ...overrides,
  };
  return {
    ...base,
    deadline: overrides.deadline ?? { status: 'verified', source: 'contract', endsOn: base.windowEndsOn, cause: null },
    calculation: overrides.calculation ?? calculation(base.expectedCents, base.observedCents, base.paidCents),
  };
}

export function promptPayRecord(overrides: Partial<PromptPayRecord> = {}): PromptPayRecord {
  return {
    state: 'ZZ',
    release_no: 900001,
    sha256: SHA,
    effective_from: '2026-01-01',
    effective_to: null,
    days_to_pay: 33,
    day_basis: 'calendar',
    annual_rate_percent: '9',
    exclusions: ['self_funded_plans'],
    statute: 'SYNTHETIC statute ZZ 1-2-3',
    ...overrides,
  };
}

export function assemblyInput(overrides: Partial<AssemblyInput> = {}): AssemblyInput {
  return {
    asOf: '2026-10-16',
    disputeLevel: 1,
    practice: { practice_id: IDS.practice, name: 'SYNTHETIC THERAPY GROUP 01', npi: null, tax_id_last4: null },
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-FIX-ONE', plan_name: null },
    citation: contractCitation(),
    releases: [{ release_no: 900001, manifest_sha256: SHA }],
    behavior: 'BELOW_CONTRACT_RATE',
    lines: [line(1), line(2), line(3)],
    interest: null,
    contractDocuments: [{ documentId: IDS.document, sha256: SHA }],
    remittances: [{ documentId: IDS.remittanceDocument, sha256: SHA, paidOn: '2026-04-08' }],
    attachedDocuments: [],
    nextLevelDeadline: null,
    deadlineSources: [contractWindowSource()],
    ...overrides,
  };
}

/**
 * The internal terms the payer's copy never prints outside its narrative and its quoted clauses, and a draft never
 * writes (audit item #37 part 1, T1, T5, T6 and T10; docs/adr/0061): the record's own vocabulary (hashes, traces,
 * verification, the audit flag, evidence gaps, the specialist line, releases as records), the vendor's name, and the
 * interest and timeliness wording the founder ruled out on 2026-10-20 (Q3 (a), Q4 (a)).
 */
export const PAYER_COPY_INTERNAL_TERMS: readonly RegExp[] = [
  /SHA-256/i,
  /hash/i,
  /trace/i,
  /verif/i,
  /audit/i,
  /evidence gap/i,
  /computed by code/i,
  /specialist/i,
  /PaidWhole/i,
  /tp-packet/i,
  /priced line/i,
  /pricing run/i,
  /rule release/i,
  /manifest/i,
  /placeholder/i,
  /approved alone/i,
  /written by/i,
  /Approval record/i,
  /level L\d/i,
  /\bL[1-3]\b/,
  /\bc(?:an|ould) ?not be computed\b/i,
  /can be computed/i,
  /not claimed/i,
  /filed within/i,
  /Version \d+, SHA/i,
];

/** The internal terms `text` holds, by their patterns' source. */
export function internalTermsIn(text: string): string[] {
  return PAYER_COPY_INTERNAL_TERMS.filter((term) => term.test(text)).map((term) => term.source);
}

/** A code, never printed as one (the payer's copy's words): lower-case words joined by underscores, or upper-case ones. */
export const CODE_SHAPES: readonly RegExp[] = [/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/];

// ---------------------------------------------------------------------------------------------------
// Real traces, and the checks of a calculation's words (combined audit #38; docs/adr/0072)

export interface PricedLineOptions {
  /** The line's facts, over the SYNTHETIC fixed-schedule line's (97110 x 2 at 50.00 a unit, allowed 70.00, paid 56.00). */
  readonly facts?: Partial<LineFacts>;
  readonly release?: IndexedRelease;
  /** The remittance's payment date (2026-04-08). */
  readonly remittanceDate?: string;
}

/**
 * A schedule row priced by the engine, with the trace it was priced as: SYNTHETIC line `n` of its own claim, priced
 * under the SYNTHETIC contract's rate record (IDS.rateRecord: 50.00 per unit, the contract's dispute window of 3650
 * days) unless told otherwise, its calculation summary copied from the real trace (lineCalculation), so the
 * summary's SHA-256 is the trace's. The row's expected, observed, variance and window are the trace's; its paid
 * amount is observed less the patient share.
 */
export function pricedLine(n: number, options: PricedLineOptions = {}): { readonly line: AssemblyLine; readonly trace: PricingTrace } {
  const windows = { timely_filing_days: null, dispute_window_days: 3650, appeal_levels: [] };
  const facts = lineFacts({
    units: '2',
    serviceDate: `2026-03-0${String(4 + n)}`,
    chargeCents: cents(12000n),
    observedAllowedCents: cents(7000n),
    observedAllowedBasis: 'paid_plus_pr',
    patientShareAdjustments: [{ groupCode: 'PR', reasonCode: '2', amountCents: cents(1400n) }],
    agreement: contractAgreement({ terms: fixedTerms(5000n), rateRecordId: IDS.rateRecord, windows }),
    ...options.facts,
  });
  const [priced] = price(pricingInput(options.release ?? syntheticRelease(), [facts], { claim: { remittanceDate: options.remittanceDate ?? '2026-04-08' } }));
  if (priced?.outcome !== 'priced') {
    throw new Error('pricedLine() prices a line the engine prices');
  }
  const { trace } = priced;
  const observed = parseCents(trace.line.observed_allowed_cents);
  const patientShare = parseCents(trace.steps.patient_share_cents ?? '0');
  return {
    trace,
    line: line(n, {
      serviceDate: trace.line.service_date,
      procedureCode: trace.line.procedure_code,
      modifiers: trace.line.modifiers,
      units: trace.line.units,
      expectedCents: priced.expectedAllowedCents,
      observedCents: observed,
      varianceCents: priced.varianceCents,
      paidCents: subtractCents(observed, patientShare),
      windowEndsOn: trace.steps.window?.ends_on ?? null,
      calculation: lineCalculation(trace),
    }),
  };
}

/** Every sentence of a line's words: the summary and each step's. */
export function lineSentences(words: LineWords): Sentence[] {
  return [words.summary, ...words.steps.flatMap((step) => step.sentences)];
}

/** Every sentence of a worksheet, its table's cells each as a sentence of one segment. */
export function worksheetSentences(sheet: Worksheet): Sentence[] {
  const cell = (segment: Segment): Sentence => ({ segments: [segment] });
  return [
    sheet.title,
    ...sheet.rows,
    sheet.headings.part,
    sheet.headings.rvu,
    sheet.headings.gpci,
    sheet.headings.unit,
    ...sheet.parts.flatMap((part) => [part.name, cell(part.rvu), cell(part.gpci), cell(part.unit)]),
    sheet.total.name,
    cell(sheet.total.unit),
    ...sheet.formula,
    sheet.reductions,
    sheet.check,
  ];
}

/** Where a figure's value is read: the trace and the citation of the row it names (the line's own when it names none). */
export type FigureSources = (row: number | undefined) => { readonly trace: unknown; readonly citation: unknown };

function valueAt(root: unknown, path: readonly (string | number)[]): unknown {
  let value = root;
  for (const key of path) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      return undefined;
    }
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}

/** A form written out again, independently of ./explain/figures.ts, for the by-source check. */
function formAgain(value: unknown, form: string): string | undefined {
  if (form === 'count') {
    return Array.isArray(value) ? String(value.length) : undefined;
  }
  if (typeof value === 'number') {
    return form === 'verbatim' ? String(value) : undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  switch (form) {
    case 'verbatim':
      return value;
    case 'percent':
      return `${value}%`;
    case 'per_rvu':
      return `$${value} per RVU`;
    case 'dollars':
    case 'exact_dollars': {
      const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
      if (match === null || (form === 'dollars' && match[3] !== undefined)) {
        return undefined;
      }
      const digits = (match[2] as string).padStart(3, '0');
      const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '');
      const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const fraction = (match[3] ?? '').replace(/0+$/, '');
      const zero = /^0+$/.test(match[2] as string) && fraction === '';
      return `${match[1] === '-' && !zero ? '-' : ''}$${grouped}.${digits.slice(-2)}${fraction}`;
    }
    default:
      return undefined;
  }
}

/**
 * The first and third figure checks (design 4.1): every figure resolves at its path, in its trace or citation, to the
 * text it prints in its form (written out again here); its path is its slot's (./explain/slots.ts); every text segment
 * holds no digit; every code segment is one of CODES (PAYER_CODES for the payer); every label is a number. Each
 * problem names the slot, the path or the segment, so a failure says where.
 */
export function figureSourceProblems(sentences: readonly Sentence[], sources: FigureSources, payer: boolean): string[] {
  const codes: readonly string[] = payer ? PAYER_CODES : CODES;
  const problems: string[] = [];
  for (const sentence of sentences) {
    for (const segment of sentence.segments) {
      if ('text' in segment) {
        if (/\d/.test(segment.text)) problems.push(`a digit in text: ${segment.text}`);
      } else if ('code' in segment) {
        if (!codes.includes(segment.code)) problems.push(`a code outside the list: ${segment.code}`);
      } else if ('label' in segment) {
        if (!/^[1-9]\d*$/.test(segment.label)) problems.push(`a label that is not a number: ${segment.label}`);
      } else if ('figure' in segment) {
        const { source } = segment;
        const { trace, citation } = sources(source.row);
        const value = valueAt(source.from === 'trace' ? trace : citation, source.path);
        const again = formAgain(value, source.form);
        if (again !== segment.figure) problems.push(`${source.slot} at ${source.path.join('.')} prints ${segment.figure}, its value reads ${String(again)}`);
        if (!pathMatchesSlot(source.slot, source.from, source.path)) problems.push(`${source.slot} prints ${source.from} ${source.path.join('.')}, not its slot's path`);
      }
    }
  }
  return problems;
}

/** A sentence's text with its codes, labels and quoted passages masked: what the by-parsing check reads. */
export function maskedText(sentence: Sentence): string {
  return sentence.segments.map((segment) => ('code' in segment || 'label' in segment || 'quoted' in segment ? ' ' : 'text' in segment ? segment.text : segment.figure)).join('');
}

/** Cents of a dollar amount as written ("$1,234.567" is "123456.7"), by an exact shift of the decimal point. */
function centsOfDollars(text: string): string {
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace(/^-?\$/, '').replaceAll(',', '').split('.');
  const padded = fraction.padEnd(2, '0');
  const shifted = `${whole}${padded.slice(0, 2)}${padded.length > 2 ? `.${padded.slice(2)}` : ''}`;
  return canonical(`${negative ? '-' : ''}${shifted}`);
}

/** A number's canonical text (@tp/money decimal: no leading or trailing zeros). */
function canonical(text: string): string {
  return decimal(text).toString();
}

const TOKEN = /(-?\$[\d,]+(?:\.\d+)?(?: per RVU)?)|(\d+(?:\.\d+)?%)|(\d{4}-\d{2}-\d{2})|(?<![A-Za-z0-9.-])(-?\d+(?:\.\d+)?)(?![A-Za-z0-9]|\.\d)/g;

/** Every number a text states, canonicalised: dollars as cents, a conversion factor and a percent as their number, a date as written. */
export function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const [, dollars, percent, date, number] = match;
    if (dollars !== undefined) {
      tokens.push(dollars.endsWith(' per RVU') ? canonical(dollars.replace(/^\$/, '').replace(' per RVU', '').replaceAll(',', '')) : centsOfDollars(dollars));
    } else if (percent !== undefined) {
      tokens.push(canonical(percent.slice(0, -1)));
    } else if (date !== undefined) {
      tokens.push(date);
    } else if (number !== undefined) {
      tokens.push(canonical(number));
    }
  }
  return tokens;
}

/** Every leaf value of the sources, canonicalised as numberTokens() reads the words, with every array's length. */
export function sourceNumbers(...roots: readonly unknown[]): Set<string> {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'number') {
      found.add(canonical(String(value)));
    } else if (typeof value === 'string') {
      if (/^-?\d+(?:\.\d+)?$/.test(value)) found.add(canonical(value));
      for (const token of numberTokens(value)) found.add(token);
    } else if (Array.isArray(value)) {
      found.add(String(value.length));
      value.forEach(visit);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(visit);
    }
  };
  roots.forEach(visit);
  return found;
}

/**
 * The second figure check (design 4.1), which reads no segment's source: every number the words state, their codes,
 * labels and quoted passages masked, is a leaf value of the traces or the citations (or an array's length there).
 */
export function figureTokenProblems(sentences: readonly Sentence[], roots: readonly unknown[]): string[] {
  const known = sourceNumbers(...roots);
  return sentences.flatMap((sentence) => numberTokens(maskedText(sentence)).filter((token) => !known.has(token)).map((token) => `${token} in "${plainText(sentence)}" is in no source`));
}

/**
 * What a reader might expect a fee-schedule worksheet to state and the trace does not hold (design 4.1, C7), computed
 * here in the test from the trace's own fields: the geographically adjusted RVUs (each RVU times its GPCI) and their
 * sum, the total RVU, and the amounts per unit at 100% (each part, and their total, over the percentage). A value the
 * trace does hold (a GPCI of 1.000 makes a product equal its RVU) is left out: stating it is stating the trace.
 */
export function derivedFeeScheduleValues(trace: PricingTrace): string[] {
  const schedule = trace.steps.fee_schedule;
  if (schedule === null || schedule.rvu === null || schedule.gpci === null || schedule.unit_cents === null || schedule.setting === null) {
    return [];
  }
  const { rvu, gpci, unit_cents: units } = schedule;
  const pe = schedule.setting === 'facility' ? rvu.pe_rvu_facility : rvu.pe_rvu_non_facility;
  const share = decimal(schedule.percentage).dividedBy(decimal(100n));
  const products = [decimal(rvu.work_rvu).times(decimal(gpci.work_gpci)), decimal(pe).times(decimal(gpci.pe_gpci)), decimal(rvu.mp_rvu).times(decimal(gpci.mp_gpci))];
  const derived = [
    ...products,
    products.reduce((sum, item) => sum.plus(item)),
    decimal(rvu.work_rvu).plus(decimal(pe)).plus(decimal(rvu.mp_rvu)),
    ...[units.total, units.work, units.pe, units.mp].map((part) => decimal(part).dividedBy(share)),
  ].map((value) => value.toString());
  const held = sourceNumbers(trace);
  return [...new Set(derived)].filter((value) => !held.has(value));
}
