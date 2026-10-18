/**
 * The model gateway's 300-case synthetic narrative set (PRD 14: "Narrative drafting has a
 * zero-tolerance gate: any verifier failure on the 300-case synthetic set blocks the change"; test
 * matrix MOD-03). Each case is the approved records a packet version is assembled from (PRD 12, The
 * packet): the contract clause or the Medicare Advantage regulation, the rule release, the case's lines
 * not written off with their expected, observed and variance amounts, and prompt-pay interest where a
 * state rule applies. The assembly puts every identifier behind a placeholder, so the pattern
 * statement's inputs carry none; the case's own invented identifiers are listed beside it so the
 * verifier can refuse a narrative that holds one.
 *
 * Every case also says which facts a narrative of it must state (the shortfall, what the contract
 * requires, what the remittances show and the count: PRD 12, "what the contract requires, what the
 * remittances show, the delta and the count") and carries a reference narrative this package wrote from
 * its own sums, in one of several styles: what the local deterministic provider answers in CI.
 *
 * Methods, line counts, codes, units, amounts, dates, interest and dispute levels vary from case to
 * case, from one seed per case. Every value is invented.
 */
import { type Cents, centsToString, formatCents } from '@tp/money';

import { type CalendarDate, addDays, calendarDate } from '../core/dates';
import { prettyJson, sha256 } from '../core/json';
import { Random } from '../core/random';
import {
  NARRATIVE_SET_FORMAT,
  type NarrativeAssembly,
  type NarrativeCase,
  type NarrativeLine,
  type NarrativePromptPay,
  type NarrativeSetPart,
  type RequiredFact,
} from './formats';

export const NARRATIVE_SET_SIZE = 300;
export const NARRATIVE_PART_SIZE = 50;
/** The directory under the MOD-03 case that holds the set. */
export const NARRATIVE_SET_DIR = 'narrative-set';

type Method = NarrativeCase['method'];

const PAYERS = ['KESTREL', 'JUNIPER', 'HARBOR', 'SUMMIT', 'LANTERN', 'MERIDIAN', 'ORCHARD', 'BEACON', 'CANYON', 'WILLOW', 'GRANITE', 'PRAIRIE'];
const PRACTICES = ['CEDAR', 'BIRCH', 'ASPEN', 'MAPLE', 'ALDER', 'HAZEL', 'LARCH', 'ROWAN'];
const TIMED_CODES = ['97110', '97112', '97116', '97140', '97530', '97535', '97750', '97760', 'G0283'];
const EVALUATION_CODES = ['97161', '97162', '97163', '97164'];
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  '97110': 'Therapeutic exercise',
  '97112': 'Neuromuscular reeducation',
  '97116': 'Gait training',
  '97140': 'Manual therapy',
  '97530': 'Therapeutic activities',
  '97535': 'Self-care training',
  '97750': 'Physical performance test',
  '97760': 'Orthotic management',
  G0283: 'Electrical stimulation',
  '97161': 'Evaluation, low complexity',
  '97162': 'Evaluation, moderate complexity',
  '97163': 'Evaluation, high complexity',
  '97164': 'Re-evaluation',
};
const PERCENTAGES = ['100', '105', '110', '112.5', '115', '120', '125'];
const SURNAME_PARTS = [
  ['ZEPH', 'QUIL', 'MORV', 'TALV', 'BRIX', 'VEND', 'OSTR', 'KIRV'],
  ['YRA', 'ANO', 'ELLI', 'IXEN', 'OVAR', 'UNDE'],
];
const GIVEN = ['ARDEN', 'MARLO', 'TEMPE', 'ROSLYN', 'CALDER', 'IVORY', 'SOREN', 'WYNNE'];
const RULE_RELEASE = 900001;

/** A UUID for the case's records: kind and case in the first group, the item in the last. */
function uuid(kind: number, n: number, item: number): string {
  return `${kind.toString(16).padStart(8, '0')}-${n.toString(16).padStart(4, '0')}-4000-8000-${item.toString(16).padStart(12, '0')}`;
}

function methodOf(n: number): Method {
  const slot = n % 10;
  if (slot <= 3) {
    return 'FIXED_SCHEDULE';
  }
  if (slot <= 5) {
    return 'PERCENT_OF_MEDICARE';
  }
  if (slot === 6) {
    return 'LESSER_OF';
  }
  if (slot === 7) {
    return 'PER_VISIT';
  }
  return 'MA_NONCONTRACTED';
}

const sumCents = (amounts: readonly bigint[]) => amounts.reduce((sum, amount) => sum + amount, 0n);

interface Totals {
  readonly lines: number;
  readonly claims: number;
  readonly patients: number;
  readonly units: number;
  readonly expected: bigint;
  readonly observed: bigint;
  readonly variance: bigint;
  readonly first: string;
  readonly last: string;
  readonly codes: readonly string[];
}

function totals(lines: readonly NarrativeLine[]): Totals {
  const dates = lines.map((line) => line.serviceDate).sort();
  return {
    lines: lines.length,
    claims: new Set(lines.map((line) => line.claimId)).size,
    patients: new Set(lines.map((line) => line.patientKey)).size,
    units: lines.reduce((sum, line) => sum + Number.parseInt(line.units, 10), 0),
    expected: sumCents(lines.map((line) => BigInt(line.expectedCents))),
    observed: sumCents(lines.map((line) => BigInt(line.observedCents))),
    variance: sumCents(lines.map((line) => BigInt(line.varianceCents))),
    first: dates[0] ?? '',
    last: dates.at(-1) ?? '',
    codes: [...new Set(lines.map((line) => line.procedureCode))].sort(),
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(date: string): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10)) as [number, number, number];
  return `${MONTHS[month - 1] ?? ''} ${String(day)}, ${String(year)}`;
}

/** Dollars as a narrative writes them: $1234.56, or with thousands grouped ($1,234.56). */
function money(amount: bigint, grouped: boolean): string {
  const text = formatCents(amount as Cents);
  if (!grouped) {
    return `$${text}`;
  }
  const [whole = '0', fraction = '00'] = text.split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

const plural = (count: number, one: string, many: string) => `${String(count)} ${count === 1 ? one : many}`;
const listed = (items: readonly string[]) => (items.length === 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`);

interface Terms {
  readonly method: Method;
  readonly codes: readonly string[];
  readonly amount: bigint | null;
  readonly percentage: string | null;
  readonly year: number | null;
  readonly versionNo: number;
  readonly page: number;
}

/** What the contract requires, in one sentence citing it; a regulation case says what the regulation requires. */
function requirement(terms: Terms, payer: string, style: number): string {
  const amount = terms.amount === null ? '' : money(terms.amount, style === 1);
  const schedule = terms.year === null ? 'the Medicare fee schedule' : `the ${String(terms.year)} Medicare fee schedule`;
  const version = style === 2 ? `The contract cited on page ${String(terms.page)}` : `Version ${String(terms.versionNo)} of the contract`;
  switch (terms.method) {
    case 'FIXED_SCHEDULE':
      return `${version} pays ${listed(terms.codes)} at ${amount} per unit [1].`;
    case 'PERCENT_OF_MEDICARE':
      return `${version} pays ${listed(terms.codes)} at ${terms.percentage ?? ''}% of ${schedule} [1].`;
    case 'LESSER_OF':
      return `${version} pays the lesser of the billed charge and ${amount} per unit for ${listed(terms.codes)} [1].`;
    case 'PER_VISIT':
      return `${version} pays a case rate of ${amount} per visit for ${listed(terms.codes)} [1].`;
    case 'MA_NONCONTRACTED':
      return `${payer} has no contract with the practice for this Medicare Advantage plan, so it owes what Original Medicare would pay under 42 CFR 422.214 [1].`;
  }
}

/** The reference narrative: what the contract requires, what the remittances show, the delta and the count, each sentence cited. */
function referenceNarrative(terms: Terms, sums: Totals, payer: string, interest: 'computed' | 'not_computed' | null, style: number): string[] {
  const grouped = style === 1;
  const span =
    sums.first === sums.last ? `on ${style === 1 ? longDate(sums.first) : sums.first}` : style === 1 ? `between ${longDate(sums.first)} and ${longDate(sums.last)}` : `from ${sums.first} to ${sums.last}`;
  const regulation = terms.method === 'MA_NONCONTRACTED';
  const opening = [requirement(terms, payer, style)];
  if (regulation) {
    opening.push(`Rule release ${String(RULE_RELEASE)} sets that amount [2].`);
  }
  const basis = regulation ? 'At the Original Medicare amount' : 'At the contract rate';
  let body: string[];
  switch (style) {
    case 0:
      body = [
        `The remittances allowed ${money(sums.observed, grouped)} for ${plural(sums.lines, 'line', 'lines')} on ${plural(sums.claims, 'claim', 'claims')} with service dates ${span} [3].`,
        `${basis} those lines come to ${money(sums.expected, grouped)}, a shortfall of ${money(sums.variance, grouped)} [3].`,
      ];
      break;
    case 1:
      body = [
        `Across ${plural(sums.lines, 'line', 'lines')} for ${plural(sums.patients, 'patient', 'patients')}, with services ${span}, ${payer} allowed ${money(sums.observed, grouped)} [3].`,
        `${regulation ? 'Original Medicare would have paid' : 'The contract requires'} ${money(sums.expected, grouped)} for the same lines [3].`,
        `The difference owed is ${money(sums.variance, grouped)} [3].`,
      ];
      break;
    default:
      body = [
        `Expected payment for the ${plural(sums.lines, 'line', 'lines')} in the schedule is ${money(sums.expected, grouped)} and the remittances show ${money(sums.observed, grouped)} [3].`,
        `The payer underpaid ${plural(sums.claims, 'claim', 'claims')} by ${money(sums.variance, grouped)} in all [3].`,
      ];
  }
  const closing: string[] = [];
  if (interest === 'computed') {
    closing.push('Prompt-pay interest under the state rule is stated as its own line and is not part of the shortfall [4].');
  } else if (interest === 'not_computed') {
    closing.push('Prompt-pay interest under the state rule could not be computed from the records on file [4].');
  }
  if (style === 0) {
    return [[...opening, ...body, ...closing].join(' ')];
  }
  return [opening.join(' '), body.join(' '), ...(closing.length > 0 ? [closing.join(' ')] : [])];
}

function requiredFacts(terms: Terms, sums: Totals): RequiredFact[] {
  const facts: RequiredFact[] = [
    { kind: 'amount', value: centsToString(sums.variance as Cents), what: 'shortfall' },
    { kind: 'amount', value: centsToString(sums.expected as Cents), what: 'expected' },
    { kind: 'amount', value: centsToString(sums.observed as Cents), what: 'observed' },
    { kind: 'number', value: String(sums.lines), what: 'lines' },
  ];
  if (terms.amount !== null) {
    facts.push({ kind: 'amount', value: centsToString(terms.amount as Cents), what: 'contract_rate' });
  }
  if (terms.percentage !== null) {
    facts.push({ kind: 'percent', value: terms.percentage, what: 'contract_percentage' });
  }
  facts.push({ kind: 'marker', value: '1', what: 'citation' }, { kind: 'marker', value: '3', what: 'line_schedule' });
  return facts;
}

function syntheticName(random: Random): string {
  return `${random.pick(SURNAME_PARTS[0] ?? [])}${random.pick(SURNAME_PARTS[1] ?? [])}, ${random.pick(GIVEN)} ${random.alphanumeric(1).replace(/\d/, 'Q')}`;
}

function narrativeCase(n: number): NarrativeCase {
  const id = `N${String(n).padStart(3, '0')}`;
  const random = new Random(`tp-synth/MOD-03/${id}`);
  const method = methodOf(n);
  const payerName = `SYNTHETIC ${random.pick(PAYERS)} HEALTH PLAN`;
  const practiceName = `SYNTHETIC ${random.pick(PRACTICES)} PHYSICAL THERAPY`;
  const codeCount = method === 'FIXED_SCHEDULE' || method === 'LESSER_OF' ? 1 : random.int(1, 3);
  const pool = method === 'PER_VISIT' ? TIMED_CODES : [...TIMED_CODES, ...EVALUATION_CODES];
  const codes: string[] = [];
  while (codes.length < codeCount) {
    const code = random.pick(pool);
    if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  codes.sort();
  const amount = method === 'FIXED_SCHEDULE' || method === 'LESSER_OF' ? random.cents(2_000n, 15_000n) : method === 'PER_VISIT' ? random.cents(7_000n, 18_000n) : null;
  const percentage = method === 'PERCENT_OF_MEDICARE' ? random.pick(PERCENTAGES) : null;
  const year = method === 'PERCENT_OF_MEDICARE' && random.chance(35) ? random.pick([2024, 2025]) : null;
  const terms: Terms = { method, codes, amount, percentage, year, versionNo: random.int(1, 3), page: random.int(2, 6) };

  // Patients, their claims (one date of service each) and the claims' lines.
  const lineCount = random.int(1, 12);
  const patientCount = random.int(1, Math.min(4, lineCount));
  const claimCount = random.int(patientCount, Math.max(patientCount, Math.min(lineCount, patientCount + 4)));
  const base = addDays(calendarDate(2026, 1, 5), random.int(0, 120));
  const claims = Array.from({ length: claimCount }, (_, index) => ({
    id: uuid(0x20000000, n, index + 1),
    patient: uuid(0x40000000, n, (index % patientCount) + 1),
    date: addDays(base, random.int(0, 70)),
  }));
  const interestKind: 'computed' | 'not_computed' | null = method === 'MA_NONCONTRACTED' || !random.chance(30) ? null : random.chance(70) ? 'computed' : 'not_computed';
  const lines: NarrativeLine[] = Array.from({ length: lineCount }, (_, index) => {
    const claim = claims[index < claimCount ? index : random.int(0, claimCount - 1)] ?? claims[0];
    if (claim === undefined) {
      throw new Error('a case has a claim');
    }
    const units = method === 'PER_VISIT' ? 1 : random.int(1, 4);
    const code = codes[index % codes.length] ?? '97110';
    const unitAmount = amount ?? random.cents(2_500n, 14_000n);
    const expected = method === 'PER_VISIT' ? unitAmount : unitAmount * BigInt(units);
    const variance = random.cents(300n, expected / 2n > 300n ? expected / 2n : 301n);
    const observed = expected - variance;
    const paid = observed - random.cents(0n, observed / 5n);
    const paidOn = addDays(claim.date, random.int(20, 45));
    return {
      serviceLineId: uuid(0x10000000, n, index + 1),
      claimId: claim.id,
      pricedLineId: uuid(0x30000000, n, index + 1),
      pricingRunId: uuid(0x09000000, n, 1),
      patientKey: claim.patient,
      serviceDate: claim.date,
      procedureCode: code,
      modifiers: [],
      units: String(units),
      expectedCents: centsToString(expected as Cents),
      observedCents: centsToString(observed as Cents),
      varianceCents: centsToString(variance),
      paidCents: centsToString(paid as Cents),
      paidOn,
      receivedOn: interestKind !== null || random.chance(50) ? addDays(claim.date, random.int(3, 10)) : null,
      windowEndsOn: random.chance(80) ? addDays(paidOn, 365) : null,
    };
  });
  const sums = totals(lines);
  const lastPaid = lines.map((line) => line.paidOn).sort().at(-1) ?? base;
  const asOf: CalendarDate = addDays(lastPaid > '2026-09-16' ? (lastPaid as CalendarDate) : calendarDate(2026, 9, 16), random.int(1, 30));

  const documentSha = sha256(`SYNTHETIC contract document ${id}`);
  const quote: Readonly<Record<Method, () => string>> = {
    FIXED_SCHEDULE: () => `${codes[0] ?? ''} ${DESCRIPTIONS[codes[0] ?? ''] ?? ''} $${formatCents((amount ?? 0n) as Cents)} per unit`,
    LESSER_OF: () => `Payer pays the lesser of the billed charge or $${formatCents((amount ?? 0n) as Cents)} per unit for ${codes[0] ?? ''}`,
    PER_VISIT: () => `Payer pays a case rate of $${formatCents((amount ?? 0n) as Cents)} per visit for ${listed(codes)}`,
    PERCENT_OF_MEDICARE: () => `Services billed under CPT ${listed(codes)} are paid at ${percentage ?? ''}% of the ${year === null ? '' : `${String(year)} `}Medicare Physician Fee Schedule`,
    MA_NONCONTRACTED: () => '',
  };
  const parameters: Readonly<Record<string, unknown>> =
    method === 'FIXED_SCHEDULE' || method === 'PER_VISIT'
      ? { amount_cents: centsToString((amount ?? 0n) as Cents) }
      : method === 'LESSER_OF'
        ? { schedule: { method: 'FIXED_SCHEDULE', amount_cents: centsToString((amount ?? 0n) as Cents) }, charge_basis: 'LINE_CHARGE' }
        : { percentage, year_basis: year === null ? 'CURRENT' : `LOCKED:${String(year)}`, locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' };
  const citation: Readonly<Record<string, unknown>> =
    method === 'MA_NONCONTRACTED'
      ? {
          kind: 'regulation',
          method: 'MA_NONCONTRACTED',
          reference: '42 CFR 422.214',
          statement: 'A non-contracting provider accepts as payment in full what it could collect under Original Medicare.',
        }
      : {
          kind: 'contract',
          contract_id: uuid(0x04000000, n, 1),
          contract_title: `SYNTHETIC ${random.pick(PAYERS)} PROVIDER AGREEMENT`,
          contract_version_id: uuid(0x05000000, n, 1),
          version_no: terms.versionNo,
          effective_from: '2026-01-01',
          effective_to: random.chance(40) ? '2027-01-01' : null,
          rate_record_id: uuid(0x06000000, n, 1),
          method,
          parameters,
          document_id: uuid(0x07000000, n, 1),
          document_sha256: documentSha,
          page: terms.page,
          quote: quote[method](),
          page_sha256: sha256(`SYNTHETIC page text ${id}`),
        };
  const record: NarrativePromptPay | null =
    interestKind === null
      ? null
      : interestKind === 'computed'
        ? { state: 'ZZ', release_no: RULE_RELEASE, sha256: sha256('SYNTHETIC prompt-pay record ZZ'), effective_from: '2026-01-01', effective_to: null, days_to_pay: 33, day_basis: 'calendar', annual_rate_percent: '9', exclusions: ['self_funded_plans'], statute: 'SYNTHETIC statute ZZ 1-2-3' }
        : random.chance(50)
          ? null
          : { state: 'ZZ', release_no: RULE_RELEASE, sha256: sha256('SYNTHETIC prompt-pay record ZZ'), effective_from: '2026-01-01', effective_to: null, days_to_pay: 30, day_basis: 'business', annual_rate_percent: '8', exclusions: [], statute: 'SYNTHETIC statute ZZ 4-5-6' };
  const behaviors = method === 'PERCENT_OF_MEDICARE' ? ['BELOW_CONTRACT_RATE', 'PRIOR_YEAR_CONVERSION_FACTOR'] : method === 'MA_NONCONTRACTED' ? ['BELOW_CONTRACT_RATE'] : ['BELOW_CONTRACT_RATE', 'MPPR_NOT_IN_CONTRACT'];
  const remittanceDates = [...new Set(lines.map((line) => line.paidOn))].sort();
  const assembly: NarrativeAssembly = {
    asOf,
    disputeLevel: random.chance(15) ? 2 : 1,
    practice: { practice_id: uuid(0x01000000, n, 1), name: practiceName, npi: null, tax_id_last4: null },
    payer: { payer_id: uuid(0x02000000, n, 1), name: payerName, payer_id_raw: `PI:SYNPAYER${random.digits(4)}`, plan_id: uuid(0x03000000, n, 1), plan_key: `CE:SYNPLAN-${random.alphanumeric(6)}`, plan_name: null },
    citation,
    releases: [{ release_no: RULE_RELEASE, manifest_sha256: sha256(`SYNTHETIC release ${String(RULE_RELEASE)}`) }],
    behavior: random.pick(behaviors),
    lines,
    interest: interestKind === null ? null : { state: 'ZZ', releaseNo: RULE_RELEASE, record },
    contractDocuments: method === 'MA_NONCONTRACTED' ? [] : [{ documentId: uuid(0x07000000, n, 1), sha256: documentSha }],
    remittances: remittanceDates.map((paidOn, index) => ({ documentId: uuid(0x08000000, n, index + 1), sha256: sha256(`SYNTHETIC remittance ${id} ${String(index)}`), paidOn })),
    attachedDocuments: [],
  };
  const identifiers = [
    ...[...new Set(claims.map((claim) => claim.patient))].flatMap(() => [syntheticName(random), `SYNM${random.digits(8)}`]),
    ...claims.map(() => `SYNC${random.digits(10)}`),
  ];
  const style = n % 3;
  return { id, method, assembly, identifiers, required: requiredFacts(terms, sums), reference: { paragraphs: referenceNarrative(terms, sums, payerName, interestKind, style) } };
}

export function narrativeSetCases(): NarrativeCase[] {
  return Array.from({ length: NARRATIVE_SET_SIZE }, (_, index) => narrativeCase(index + 1));
}

export interface NarrativeSetFile {
  /** Relative to the MOD-03 case directory. */
  readonly path: string;
  readonly text: string;
  readonly description: string;
}

/** The set in parts of fifty cases. */
export function narrativeSetFiles(): NarrativeSetFile[] {
  const cases = narrativeSetCases();
  const files: NarrativeSetFile[] = [];
  for (let start = 0; start < cases.length; start += NARRATIVE_PART_SIZE) {
    const part = start / NARRATIVE_PART_SIZE + 1;
    const content: NarrativeSetPart = {
      format: NARRATIVE_SET_FORMAT,
      synthetic: true,
      note: 'SYNTHETIC: invented pattern statements for the model gateway narrative gate (PRD 14). No real practice, payer, patient or claim.',
      part,
      cases: cases.slice(start, start + NARRATIVE_PART_SIZE),
    };
    // One case to a line, so a change to a case is a change to its line.
    const { cases: partCases, ...header } = content;
    const head = prettyJson(header).trimEnd().slice(0, -2);
    files.push({
      path: `${NARRATIVE_SET_DIR}/part-${String(part).padStart(2, '0')}.json`,
      text: `${head},\n  "cases": [\n${partCases.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]\n}\n`,
      description: `Narrative cases ${String(start + 1)} to ${String(Math.min(start + NARRATIVE_PART_SIZE, cases.length))}: each case's approved records, invented identifiers, required facts and a reference narrative.`,
    });
  }
  return files;
}
