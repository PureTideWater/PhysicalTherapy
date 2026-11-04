import fc from 'fast-check';
import { cents, formatCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { narrativeFacts } from './facts';
import type { PacketContentV2 } from './format';
import { IDS, REGULATION, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord, roleOracle, scopedOracle } from './test-support';
import { checkedFigures, verifyNarrative } from './verifier';

/**
 * Properties of the role reader through the verifier (docs/adr/0086; test matrix CAS-43 and CAS-44). The oracle reads
 * the generated content's fields by role (./role-examples.ts roleOracle()) and the quoted texts the generator wrote
 * from typed templates, recording each quoted figure and its label: it never reads ./facts.ts or ./roles.ts, so no
 * property tests the reader against itself. Values no input holds are built (the largest held value and an offset),
 * never filtered for. Each property's run count is pinned; its seed is the repo's convention (docs/adr/0066): fast-check's
 * own in a unit run, so each run tries new inputs, and MUTATION_SEED in a mutation run (tools/stryker/seed-setup.ts).
 * A counterexample a run finds is pinned as a named example (./role-examples.ts REVIEWED).
 *
 * The oracle's prose and shape cases, spelled out: "one" and "zero" are prose, never a figure, so a template of value
 * 1 or 0 written in words passes; a five-digit value written in digits without a comma after a row's noun ("Line
 * 97110") is a procedure code, so it passes there exactly when it is one of the lines' codes.
 *
 * Beside the one-cue templates (a figure held in the role its one cue names), the review of 2026-11-01 (PE-7, CORR-18,
 * CRIT-1) added: sentences with two cues, the figure held only in the farther one's role (each fails; one role per
 * figure, never the union); a quoted clause whose figures fill a list between edges ("Payment terms: 30, 45, 60 days":
 * each passes in a role only where the record holds it so); a year's lead before a count's noun ("the 2026 claims": a
 * count, never a year); and every date role in the oracle, the deadline's among them.
 *
 * The converging fix (docs/adr/0086, the closed rules) writes each amount with what it is stated per, read from the
 * content's fields too (./role-examples.ts scopedOracle()): an amount with no scope fails where its role's per-line and
 * total values differ (rule 2), a "respectively" list in either plain form maps its figures to its cues and their
 * scopes in order and the swap fails, and a list in neither plain form fails at every figure (rule 3).
 */

const CODES = ['97110', '97112', '97140', '97530', 'G0283'] as const;

/** The quoted texts' templates: each records its figure and the word before it, the figure's label. */
interface Quoted {
  readonly label: string;
  readonly value: number;
}

const draws = fc.record({
  lines: fc.array(
    fc.record({ code: fc.constantFrom(...CODES), units: fc.integer({ min: 1, max: 4 }), perUnit: fc.integer({ min: 1000, max: 20_000 }), short: fc.integer({ min: 1, max: 999 }), claim: fc.integer({ min: 1, max: 4 }) }),
    { minLength: 1, maxLength: 5 },
  ),
  citation: fc.constantFrom('fixed', 'percent', 'regulation'),
  percent: fc.constantFrom('80', '112.5', '95.5', '9'),
  locked: fc.integer({ min: 2019, max: 2026 }),
  version: fc.integer({ min: 1, max: 20 }),
  page: fc.integer({ min: 1, max: 99_999 }),
  windowPage: fc.integer({ min: 1, max: 99_999 }),
  windowDays: fc.integer({ min: 1, max: 99_999 }),
  release: fc.integer({ min: 900_001, max: 949_999 }),
  level: fc.constantFrom(1, 1, 1, 2),
  daysToPay: fc.integer({ min: 1, max: 60 }),
  section: fc.integer({ min: 2, max: 99 }),
  group: fc.integer({ min: 2, max: 99 }),
  // A list of day counts the clause's own words fill between edges ("Payment terms: 30, 45, 60 days").
  terms: fc.array(fc.integer({ min: 2, max: 9_999 }), { minLength: 2, maxLength: 4 }),
});
type Draw = typeof draws extends fc.Arbitrary<infer T> ? T : never;

/** A packet from a draw: its content, the quoted texts' labelled figures, and the day counts its clause lists. */
function build(draw: Draw) {
  const quoted: Quoted[] = [
    { label: 'section', value: draw.section },
    { label: 'group', value: draw.group },
  ];
  const clause = `Section ${String(draw.section)} of the SYNTHETIC agreement pays 97110 at 50.00 per unit. Payment terms: ${draw.terms.join(', ')} days`;
  const content = assemblePacket(
    assemblyInput({
      disputeLevel: draw.level,
      nextLevelDeadline: draw.level === 1 ? null : { status: 'verified', source: 'contract', endsOn: '2027-01-15', cause: null },
      practice: { practice_id: IDS.practice, name: `SYNTHETIC THERAPY GROUP ${String(draw.group)}`, npi: null, tax_id_last4: null },
      citation:
        draw.citation === 'regulation'
          ? { ...REGULATION, statement: `Section ${String(draw.section)} of the SYNTHETIC rule pays what Original Medicare pays.` }
          : contractCitation({
              version_no: draw.version,
              page: draw.page,
              quote: clause,
              ...(draw.citation === 'percent' ? { method: 'PERCENT_OF_MEDICARE', parameters: { percent: draw.percent, year_basis: `LOCKED:${String(draw.locked)}` } } : {}),
            }),
      releases: [{ release_no: draw.release, manifest_sha256: 'a'.repeat(64) }],
      deadlineSources: [contractWindowSource({ days: draw.windowDays, page: draw.windowPage, quote: `Disputes are raised within ${String(draw.windowDays)} days of the payment date.` })],
      interest: { state: 'ZZ', releaseNo: draw.release, record: promptPayRecord({ days_to_pay: draw.daysToPay }) },
      lines: draw.lines.map((item, index) => {
        const expected = BigInt(item.perUnit * item.units);
        const observed = expected - BigInt(item.short * item.units);
        const hex = (index + 1).toString(16).padStart(12, '0');
        return {
          ...line(index + 1, {
            claimId: `20000000-0000-4000-8000-${item.claim.toString(16).padStart(12, '0')}`,
            patientKey: `40000000-0000-4000-8000-${item.claim.toString(16).padStart(12, '0')}`,
            procedureCode: item.code,
            units: String(item.units),
            expectedCents: cents(expected),
            observedCents: cents(observed),
            varianceCents: cents(expected - observed),
            paidCents: cents((observed * 8n) / 10n),
            receivedOn: '2026-02-10',
          }),
          serviceLineId: `10000000-0000-4000-8000-${hex}`,
          pricedLineId: `30000000-0000-4000-8000-${hex}`,
        };
      }),
    }),
  );
  return { content, quoted, terms: draw.citation === 'regulation' ? [] : draw.terms };
}

const generated = draws.map(build);

/**
 * A packet at a percentage of Medicare, run first by the property that requires every role to be expected to pass
 * somewhere: a draw is a percentage's one time in three, so twelve runs would miss it about once in 130 (the 40-seed
 * run of 2026-11-01 found it).
 */
const AT_A_PERCENTAGE = build({
  lines: [{ code: '97110', units: 2, perUnit: 5000, short: 100, claim: 1 }],
  citation: 'percent',
  percent: '112.5',
  locked: 2025,
  version: 3,
  page: 4,
  windowPage: 5,
  windowDays: 3650,
  release: 900_002,
  level: 1,
  daysToPay: 30,
  section: 6,
  group: 7,
  terms: [30, 45],
});

/** Each role's sentence, the figure written where `{}` is, and the roles the sentence reads it in (any of them). */
const NUMBER_TEMPLATES: Readonly<Record<string, string>> = {
  window_days: 'Disputes are raised within {} days [1].',
  days_to_pay: 'The payer has {} days to pay [4].',
  days_late: 'The payer paid {} days late [4].',
  citation_page: 'The rate clause is on page {} [1].',
  window_page: 'The dispute window is on page {} [1].',
  version: 'The contract, version {}, applies [1].',
  release: 'Release {} priced the lines [2].',
  level: 'This is a level {} appeal [1].',
  lines: 'There were {} lines [3].',
  claims: 'There were {} claims [3].',
  patients: 'There were {} patients [3].',
  units: 'The lines billed {} units in all [3].',
  line_units: 'The lines billed {} units per line [3].',
  row: 'Line {} was short [3].',
  claim_row: 'Claim {} was short [3].',
  patient_row: 'Patient {} was underpaid [3].',
};
const AMOUNT_TEMPLATES: Readonly<Record<string, string>> = {
  expected: 'The contract requires {} [1].',
  allowed: 'The payer allowed {} [3].',
  paid: 'The payer paid {} [3].',
  variance: 'The shortfall is {} [3].',
  interest: 'Interest of {} is owed [4].',
  patient_share: 'The patient share is {} [3].',
};
const DATE_TEMPLATES: Readonly<Record<string, string>> = {
  service_date: 'The lines were billed on {} [3].',
  paid_date: 'The payer paid on {} [3].',
  received_date: 'The payer received the claims on {} [4].',
  due_date: 'The prompt-pay due date was {} [4].',
  deadline: 'The window closes on {} [1].',
  effective_date: 'The contract took effect on {} [1].',
  as_of_date: 'The packet is as of {} [1].',
};
const YEAR_TEMPLATES: Readonly<Record<string, string>> = {
  schedule_year: 'The payer paid under the {} fee schedule [1].',
  service_date: 'The lines were billed in {} [3].',
  paid_date: 'The payer paid in {} [3].',
  deadline: 'The window closes in {} [1].',
};
const PERCENT_TEMPLATES: Readonly<Record<string, string>> = {
  contract_percent: 'The contract pays {}% of the Medicare fee schedule [1].',
  interest_rate: 'Interest runs at {}% a year [4].',
};
const ROW_ROLES = new Set(['row', 'claim_row', 'patient_row']);

/** Two cues of each amount role and of each date role, as the clause before a figure and as the figure's own clause. */
const AMOUNT_CUES: Readonly<Record<string, readonly string[]>> = {
  expected: ['the contract requires', 'the contract expected'],
  allowed: ['the payer allowed'],
  paid: ['the payer paid', 'the remittance paid'],
  variance: ['the shortfall is', 'the payer underpaid'],
  interest: ['interest is'],
  patient_share: ['the patient owes'],
};
const DATE_CUES: Readonly<Record<string, string>> = {
  service_date: 'the lines were billed',
  paid_date: 'the payer paid',
  received_date: 'the payer received the claims',
  due_date: 'the prompt-pay due date was',
  deadline: 'the window closes',
  effective_date: 'the contract took effect',
};
/** A "respectively" list's cues, one word each. */
const LIST_CUES: Readonly<Record<string, string>> = { expected: 'expected', allowed: 'allowed', paid: 'paid' };
/**
 * Its two plain forms (rule 3 of docs/adr/0086), each with the scopes it states beside a cue or the list (the amended
 * rule 1): the cues before the list, a scope phrase right after each cue ({Sx}, {Sy}) or right after "amounts" ({S},
 * the whole list's); the cues after it, the same; and "respectively" right after the list, its cues after it.
 */
const RESPECTIVELY = [
  'The {A} {Sx} and the {B} {Sy} were {x} and {y}, respectively [3].',
  'The {A} and {B} amounts {S} were {x} and {y}, respectively [3].',
  '{x} and {y} were {A} {Sx} and {B} {Sy}, respectively [3].',
  '{x} and {y} were, respectively, {A} {Sx} and {B} {Sy} [3].',
  '{x} and {y} were the {A} and {B} amounts {S}, respectively [3].',
  '{x} and {y}, respectively, were the {A} and {B} amounts {S}, so the payer paid less [3].',
] as const;
/** A "respectively" list in neither plain form: a count, a code or a scope where only cues may be, a cue too many, none, or none before. */
const NOT_PLAIN = [
  '{x} and {y} on each of the 3 lines were {A} and {B}, respectively [3].',
  '{x} and {y} for 97110 were the {A} and {B} amounts, respectively [3].',
  'The {A} and {B} amounts were {x} and {y} per line, respectively [3].',
  '{x} and {y} were {A}, {B} and owed, respectively [3].',
  'These were {x} and {y}, respectively [3].',
  'The contract {A} {x} and the payer {B} {y}, respectively [3].',
  'Respectively, {x} and {y} were {A} and {B} per line [3].',
] as const;
/** The scope phrases an amount is written with, right after it. */
const SCOPE_TEXT = { line: 'per line', total: 'in total' } as const;
type Stated = keyof typeof SCOPE_TEXT;
const STATED: readonly Stated[] = ['line', 'total'];

/** Whether the scope oracle holds `value` in `role` as stated per `scope`. */
const heldPer = (scoped: ReadonlyMap<string, ReadonlySet<string>>, role: string, value: string, scope: Stated) => scoped.get(`${scope}|${role}`)?.has(value) === true;

/**
 * Rule 2 as the oracles read it: a value stated with no scope passes in a role that holds it, unless the role holds it
 * only per line or only in total and holds another value the other way.
 */
function unscopedHeld(oracle: ReadonlyMap<string, ReadonlySet<string>>, scoped: ReadonlyMap<string, ReadonlySet<string>>, role: string, value: string): boolean {
  if (oracle.get(role)?.has(value) !== true) {
    return false;
  }
  const line = heldPer(scoped, role, value, 'line');
  const total = heldPer(scoped, role, value, 'total');
  return line === total || (scoped.get(`${line ? 'total' : 'line'}|${role}`)?.size ?? 0) === 0;
}
/** Two clauses joined so that the second's cue is the figure's nearest and the first's the farther. */
const TWO_CUES = ['Although {A}, {B} {v} [3].', '{A} less, so {B} {v} [3].', 'Since {A}: {B} {v} [3].', '{A} and {B} {v} [3].'] as const;
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const twoCues = (template: string, farther: string, nearer: string, value: string) => capital(template.replace('{A}', farther).replace('{B}', nearer).replace('{v}', value));

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A whole number below a million in words: "three thousand six hundred fifty". */
function inWords(value: number): string {
  if (value < 20) {
    return UNITS[value] ?? '';
  }
  if (value < 100) {
    const unit = value % 10;
    return `${TENS[Math.floor(value / 10)] ?? ''}${unit === 0 ? '' : `-${UNITS[unit] ?? ''}`}`;
  }
  const [size, word] = value < 1000 ? [100, 'hundred'] : [1000, 'thousand'];
  const rest = value % size;
  return `${inWords(Math.floor(value / size))} ${word}${rest === 0 ? '' : ` ${inWords(rest)}`}`;
}

type Form = 'digits' | 'commas' | 'words';
const written = (value: number, form: Form) => (form === 'digits' ? String(value) : form === 'commas' ? value.toLocaleString('en-US') : inWords(value));
const dollars = (value: string) => `$${formatCents(cents(BigInt(value)))}`;

/** The facts of each content, read once. */
const factsOf = new WeakMap<PacketContentV2, ReturnType<typeof narrativeFacts>>();
const passes = (narrative: string, content: PacketContentV2) => {
  const facts = factsOf.get(content) ?? narrativeFacts(content);
  factsOf.set(content, facts);
  return verifyNarrative(narrative, facts, []).passed;
};

/** What the oracle expects of a number template of `role` with `value` written in `form`. */
function numberExpected(content: PacketContentV2, oracle: ReadonlyMap<string, ReadonlySet<string>>, role: string, value: number, form: Form): boolean {
  if (form === 'words' && value <= 1) {
    return true;
  }
  if (form === 'digits' && /^\d{5}$/.test(String(value)) && ROW_ROLES.has(role)) {
    return content.lines.some((item) => item.procedure_code === String(value));
  }
  return oracle.get(role)?.has(String(value)) === true;
}

/** The values the oracle holds in any of the roles. */
const valuesIn = (oracle: ReadonlyMap<string, ReadonlySet<string>>, roles: Iterable<string>) => new Set([...roles].flatMap((role) => [...(oracle.get(role) ?? [])]));

describe('properties of the role reader', () => {
  it('passes a number in a role’s words exactly when the inputs hold it in that role, for every role and every value held in any role', () => {
    const reached = new Set<string>();
    fc.assert(
      fc.property(generated, fc.constantFrom<Form>('digits', 'commas', 'words'), ({ content }, form) => {
        const oracle = roleOracle(content);
        for (const [held, values] of oracle) {
          if (!(held in NUMBER_TEMPLATES)) {
            continue;
          }
          for (const value of [...values].map(Number).filter((item) => item < 1_000_000)) {
            for (const [role, template] of Object.entries(NUMBER_TEMPLATES)) {
              reached.add(`${held}>${role}`);
              const narrative = template.replace('{}', written(value, form));
              expect(passes(narrative, content), `${narrative} (${held} ${String(value)})`).toBe(numberExpected(content, oracle, role, value, form));
            }
          }
        }
      }),
      { numRuns: 12 },
    );
    // Every pair of roles was reached, a value held in one written in the other's words.
    const roles = Object.keys(NUMBER_TEMPLATES);
    expect([...reached].sort()).toEqual(roles.flatMap((held) => roles.map((role) => `${held}>${role}`)).sort());
  }, 120_000);

  it('passes an amount, a date, a year or a percentage in a role’s words exactly when the inputs hold it in that role, every date role among them', () => {
    const reached = new Set<string>();
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        // An amount with no scope (rule 2), per line and in total.
        for (const value of [...valuesIn(oracle, Object.keys(AMOUNT_TEMPLATES))].filter((item) => !item.startsWith('-'))) {
          for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
            for (const [narrative, held] of [
              [template.replace('{}', dollars(value)), unscopedHeld(oracle, scoped, role, value)],
              ...STATED.map((scope) => [template.replace('{}', `${dollars(value)} ${SCOPE_TEXT[scope]}`), heldPer(scoped, role, value, scope)] as const),
            ] as const) {
              reached.add(`${role}:${String(held)}`);
              expect(passes(narrative, content), narrative).toBe(held);
            }
          }
        }
        for (const [templates, write] of [
          [DATE_TEMPLATES, (value: string) => value],
          [PERCENT_TEMPLATES, (value: string) => value],
        ] as const) {
          for (const value of [...valuesIn(oracle, Object.keys(templates))].filter((item) => !item.startsWith('-'))) {
            for (const [role, template] of Object.entries(templates)) {
              const narrative = template.replace('{}', write(value));
              const held = oracle.get(role)?.has(value) === true;
              reached.add(`${role}:${String(held)}`);
              expect(passes(narrative, content), narrative).toBe(held);
            }
          }
        }
        // A year: every date's year and the fee schedule's.
        const years = new Set([...valuesIn(oracle, Object.keys(DATE_TEMPLATES))].map((value) => value.slice(0, 4)));
        for (const year of [...years, ...(oracle.get('schedule_year') ?? [])]) {
          for (const [role, template] of Object.entries(YEAR_TEMPLATES)) {
            const held = role === 'schedule_year' ? oracle.get(role)?.has(year) === true : [...(oracle.get(role) ?? [])].some((value) => value.startsWith(`${year}-`));
            reached.add(`year ${role}:${String(held)}`);
            expect(passes(template.replace('{}', year), content), `${template} ${year}`).toBe(held);
          }
        }
      }),
      { numRuns: 12, examples: [[AT_A_PERCENTAGE]] },
    );
    // Every date role was expected to pass somewhere: the deadline's, the due date's and the packet's among them.
    for (const role of [...Object.keys(AMOUNT_TEMPLATES), ...Object.keys(DATE_TEMPLATES), ...Object.keys(PERCENT_TEMPLATES)]) {
      expect(reached.has(`${role}:true`), role).toBe(true);
    }
    for (const role of Object.keys(YEAR_TEMPLATES)) {
      expect(reached.has(`year ${role}:true`), role).toBe(true);
    }
  }, 120_000);

  it('holds a figure after two cues to the nearer one’s role alone: one held only in the farther one’s fails (PE-7, CORR-18)', () => {
    let farther = 0;
    fc.assert(
      fc.property(generated, fc.constantFrom(...TWO_CUES), ({ content }, template) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        // An amount per line or in total (rule 2), the template's own, and a date.
        const scope = STATED[TWO_CUES.indexOf(template) % STATED.length] as Stated;
        const amounts = [AMOUNT_CUES, (value: string) => `${dollars(value)} ${SCOPE_TEXT[scope]}`, (role: string, value: string) => heldPer(scoped, role, value, scope)] as const;
        const dates = [Object.fromEntries(Object.entries(DATE_CUES).map(([role, cue]) => [role, [cue]])), (value: string) => `on ${value}`, (role: string, value: string) => oracle.get(role)?.has(value) === true] as const;
        for (const [cues, write, holds] of [amounts, dates]) {
          for (const value of [...valuesIn(oracle, Object.keys(cues))].filter((item) => !item.startsWith('-'))) {
            for (const [far, farCues] of Object.entries(cues)) {
              for (const [near, nearCues] of Object.entries(cues)) {
                if (far === near) {
                  continue;
                }
                for (const [a, b] of farCues.flatMap((one) => nearCues.map((other) => [one, other] as const))) {
                  const held = holds(near, value);
                  farther += !held && holds(far, value) ? 1 : 0;
                  const narrative = twoCues(template, a, b, write(value));
                  expect(passes(narrative, content), narrative).toBe(held);
                }
              }
            }
          }
        }
        // Two day counts in one clause: each in its own role.
        const late = [...(oracle.get('days_late') ?? [])][0];
        const window = [...(oracle.get('window_days') ?? [])][0];
        if (late !== undefined && window !== undefined) {
          const each = (a: string, b: string) => `The payer paid ${a} days late and we dispute within ${b} days [1].`;
          expect(passes(each(late, window), content), each(late, window)).toBe(true);
          expect(passes(each(window, late), content), each(window, late)).toBe(late === window);
        }
      }),
      { numRuns: 12 },
    );
    // Some value was held only in the farther cue's role, and so failed.
    expect(farther).toBeGreaterThan(0);
  }, 120_000);

  it('maps a "respectively" list in either plain form to its cues and their scopes in order: a swapped pair fails (rule 3; CORR-6, CORR-D1)', () => {
    let swapped = 0;
    fc.assert(
      fc.property(generated, fc.constantFrom(...RESPECTIVELY), ({ content }, template) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        // Six values at most, each line's and the totals among them, so each run stays within the mutation job's time.
        const values = [...valuesIn(oracle, Object.keys(LIST_CUES))].filter((item) => !item.startsWith('-')).slice(0, 6);
        // One scope for the list, or one with each cue where the form states one with each.
        const each = template.includes('{Sx}');
        const scopes = each ? STATED.flatMap((sx) => STATED.map((sy) => [sx, sy] as const)) : STATED.map((scope) => [scope, scope] as const);
        for (const [a, cueA] of Object.entries(LIST_CUES)) {
          for (const [b, cueB] of Object.entries(LIST_CUES)) {
            if (a === b) {
              continue;
            }
            for (const [sx, sy] of scopes) {
              for (const x of values) {
                for (const y of values.filter((item) => item !== x)) {
                  const held = heldPer(scoped, a, x, sx) && heldPer(scoped, b, y, sy);
                  swapped += !held && heldPer(scoped, a, y, sx) && heldPer(scoped, b, x, sy) ? 1 : 0;
                  const narrative = template
                    .replace('{S}', SCOPE_TEXT[sx])
                    .replace('{Sx}', SCOPE_TEXT[sx])
                    .replace('{Sy}', SCOPE_TEXT[sy])
                    .replace('{A}', cueA)
                    .replace('{B}', cueB)
                    .replace('{x}', dollars(x))
                    .replace('{y}', dollars(y));
                  expect(passes(narrative, content), narrative).toBe(held);
                }
              }
            }
          }
        }
      }),
      { numRuns: 8 },
    );
    // Some pair was held only in the other order, and so failed.
    expect(swapped).toBeGreaterThan(0);
  }, 120_000);

  it('fails every figure of a "respectively" list in neither plain form, whatever its values, with its own words to give (rule 3)', () => {
    fc.assert(
      fc.property(generated, fc.constantFrom(...NOT_PLAIN), ({ content }, template) => {
        const oracle = roleOracle(content);
        const facts = narrativeFacts(content);
        const values = [...valuesIn(oracle, Object.keys(LIST_CUES))].filter((item) => !item.startsWith('-'));
        for (const [a, cueA] of Object.entries(LIST_CUES)) {
          for (const [b, cueB] of Object.entries(LIST_CUES).filter(([role]) => role !== a)) {
            for (const x of values) {
              const y = [...(oracle.get(b) ?? [])].find((item) => !item.startsWith('-')) ?? x;
              const narrative = template.replace('{A}', cueA).replace('{B}', cueB).replace('{x}', dollars(x)).replace('{y}', dollars(y));
              const figures = checkedFigures(narrative, facts).filter((figure) => figure.kind === 'amount');
              expect(figures.map((figure) => figure.needs), narrative).toEqual(['own_words', 'own_words']);
              expect(passes(narrative, content), narrative).toBe(false);
            }
          }
        }
      }),
      { numRuns: 8 },
    );
  }, 120_000);

  it('fails an amount whose words state no scope where its role’s per-line and total values differ, and passes it where they are one (rule 2)', () => {
    let unstated = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        const facts = narrativeFacts(content);
        for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
          for (const value of [...(oracle.get(role) ?? [])].filter((item) => !item.startsWith('-'))) {
            const narrative = template.replace('{}', dollars(value));
            const held = unscopedHeld(oracle, scoped, role, value);
            unstated += held ? 0 : 1;
            expect(passes(narrative, content), narrative).toBe(held);
            // A figure held in its role but not as its words state it fails for want of a scope, and says so.
            const [figure] = checkedFigures(narrative, facts);
            expect(figure?.needs ?? null, narrative).toBe(held ? null : 'scope');
            // Stated per line or in total, it passes exactly where its role holds it so.
            for (const scope of STATED) {
              const stated = template.replace('{}', `${dollars(value)} ${SCOPE_TEXT[scope]}`);
              expect(passes(stated, content), stated).toBe(heldPer(scoped, role, value, scope));
            }
          }
        }
      }),
      { numRuns: 12 },
    );
    // Some value was held one way only while its role's other values differed, and so failed with no scope.
    expect(unstated).toBeGreaterThan(0);
  }, 120_000);

  it('reads no scope from a trailing clause or a row’s noun alone, and none a total could take from rows named by their labels or a part of them (rules 1 and 2; PE3-1, PE3-2, CORR3-1)', () => {
    let parts = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        const count = content.lines.length;
        for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
          for (const value of [...(oracle.get(role) ?? [])].filter((item) => !item.startsWith('-'))) {
            const written = (words: string) => template.replace('{}', `${dollars(value)} ${words}`);
            const unscoped = unscopedHeld(oracle, scoped, role, value);
            // A trailing clause's "each line" is not the figure's: its own words alone state its scope (PE3-1).
            expect(passes(written('in total after each line was reprocessed'), content), role).toBe(heldPer(scoped, role, value, 'total'));
            expect(passes(written('after each line was reprocessed'), content), role).toBe(unscoped);
            // A row's noun alone states no row (PE3-2).
            expect(passes(written('in line with its policy'), content), role).toBe(unscoped);
            if (count >= 2) {
              // A part of the rows: the pattern's total is never its total (CORR3-1).
              parts += 1;
              expect(passes(written('for lines 1 and 2'), content), role).toBe(unscoped);
              expect(passes(written(`on 1 of the ${String(count)} lines`), content), role).toBe(unscoped);
            }
          }
        }
      }),
      { numRuns: 8 },
    );
    expect(parts).toBeGreaterThan(0);
  }, 120_000);

  it('reads a "respectively" list in the scope its own words state, never a clause of its own after it, and a scope with each cue as that cue’s figure’s (NEW-N1, NEW-N2)', () => {
    let failed = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        // Each line's expected and allowed amounts, and the totals (the pattern's and each code's).
        const lines = (pick: (item: (typeof content.lines)[number]) => string | null) => new Set(content.lines.map(pick).filter((item): item is string => item !== null && !item.startsWith('-')));
        const totals = (pick: (item: { readonly expected_cents: string; readonly observed_cents: string }) => string) => new Set([content.pattern, ...content.pattern.codes].map(pick).filter((item) => !item.startsWith('-')));
        const expected = { line: lines((item) => item.expected_cents), total: totals((item) => item.expected_cents) };
        const allowed = { line: lines((item) => item.observed_cents), total: totals((item) => item.observed_cents) };
        const cases: (readonly [string, boolean])[] = [];
        for (const x of expected.total) {
          for (const y of [...allowed.total, ...allowed.line]) {
            const held = allowed.total.has(y);
            cases.push([`The contract expected in total and the payer allowed in total ${dollars(x)} and ${dollars(y)}, respectively, which the payer explained for each line [3].`, held]);
            cases.push([`${dollars(x)} and ${dollars(y)} were expected in total and allowed in total, respectively [3].`, held]);
          }
          for (const y of [...allowed.line, ...allowed.total]) {
            cases.push([`${dollars(x)} and ${dollars(y)} were expected in total and allowed per line, respectively [3].`, allowed.line.has(y)]);
            cases.push([`${dollars(x)} and ${dollars(y)} were, respectively, expected in total and allowed per line [3].`, allowed.line.has(y)]);
          }
        }
        for (const [narrative, held] of cases) {
          failed += held ? 0 : 1;
          expect(passes(narrative, content), narrative).toBe(held);
        }
      }),
      { numRuns: 8 },
    );
    // Some figure was stated in the other scope, and so failed.
    expect(failed).toBeGreaterThan(0);
  }, 120_000);

  it('grants a scope by a phrase of the closed list beside the figure, right after it or right before it, and passes it exactly where its role holds it so (the amended rule 1)', () => {
    let granted = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        const count = String(content.lines.length);
        const after: Readonly<Record<Stated, readonly string[]>> = {
          line: ['per line', 'a line', 'per visit', 'for each line', 'on each line', `on each of the ${count} lines`, `for each of ${count} lines`],
          total: ['in total', 'in all', `across the ${count} lines`, 'for all the lines', `over these ${count} lines`, ...(content.pattern.claims === 1 ? ['for the claim'] : [])],
        };
        const before: Readonly<Record<Stated, readonly string[]>> = { line: ['each line’s', 'the per-line'], total: ['a total of', 'the total of'] };
        for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
          for (const value of [...(oracle.get(role) ?? [])].filter((item) => !item.startsWith('-'))) {
            for (const scope of STATED) {
              const held = heldPer(scoped, role, value, scope);
              granted += held ? 1 : 0;
              for (const phrase of after[scope]) {
                const narrative = template.replace('{}', `${dollars(value)} ${phrase}`);
                expect(passes(narrative, content), narrative).toBe(held);
              }
              for (const phrase of before[scope]) {
                const narrative = template.replace('{}', `${phrase} ${dollars(value)}`);
                expect(passes(narrative, content), narrative).toBe(held);
              }
            }
          }
        }
      }),
      { numRuns: 40 },
    );
    expect(granted).toBeGreaterThan(0);
  }, 240_000);

  it('never grants a scope by a phrase anywhere else in the sentence: an opening, another clause, past an edge, a dash or a word (the amended rule 1)', () => {
    let unstated = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        const count = String(content.lines.length);
        const phrases = ['per line', 'for each line', `on each of the ${count} lines`, 'in total', `across the ${count} lines`, 'for the claim'];
        for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
          for (const value of [...(oracle.get(role) ?? [])].filter((item) => !item.startsWith('-'))) {
            const held = unscopedHeld(oracle, scoped, role, value);
            unstated += held ? 0 : 1;
            const plain = template.replace('{}', dollars(value));
            const lower = plain.charAt(0).toLowerCase() + plain.slice(1);
            for (const phrase of phrases) {
              const capitalized = phrase.charAt(0).toUpperCase() + phrase.slice(1);
              for (const narrative of [
                `${capitalized}, ${lower}`,
                `${capitalized} ${lower}`,
                template.replace('{}', `${dollars(value)}, ${phrase}`),
                template.replace('{}', `${dollars(value)} – ${phrase}`),
                template.replace('{}', `${dollars(value)} as stated ${phrase}`),
                template.replace('{}', `${dollars(value)}, which the payer explained ${phrase}`),
                template.replace('{}', `${dollars(value)} after the lines were reprocessed ${phrase}`),
              ]) {
                expect(passes(narrative, content), narrative).toBe(held);
              }
            }
          }
        }
      }),
      { numRuns: 40 },
    );
    // Some value was held one way only while its role's other values differed, and so failed with no scope.
    expect(unstated).toBeGreaterThan(0);
  }, 240_000);

  it('fails an amount whose per-line and total values differ in a sentence that names a part of the lines, whatever scope phrase is beside it (the amended rule 1’s triggers)', () => {
    let triggered = 0;
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        const scoped = scopedOracle(content);
        const code = (content.lines[0] as (typeof content.lines)[number]).procedure_code;
        const served = (content.lines[0] as (typeof content.lines)[number]).service_date;
        const after = ['on line 1', 'for Patient 1', 'for the remaining lines', 'for some lines', 'for the other lines', 'for one of the lines', 'for the last line'];
        const opening = [`For ${code}, `, `For the services of ${served}, `, 'For the first line, '];
        for (const [role, template] of Object.entries(AMOUNT_TEMPLATES)) {
          for (const value of [...(oracle.get(role) ?? [])].filter((item) => !item.startsWith('-'))) {
            // Where per line and in total are one, scope is beside the point: it passes as before.
            const held = unscopedHeld(oracle, scoped, role, value);
            triggered += held ? 0 : 1;
            for (const scope of STATED) {
              const stated = template.replace('{}', `${dollars(value)} ${SCOPE_TEXT[scope]}`);
              for (const words of after) {
                const narrative = template.replace('{}', `${dollars(value)} ${SCOPE_TEXT[scope]} ${words}`);
                expect(passes(narrative, content), narrative).toBe(held);
              }
              for (const words of opening) {
                const narrative = `${words}${stated.charAt(0).toLowerCase()}${stated.slice(1)}`;
                expect(passes(narrative, content), narrative).toBe(held);
              }
            }
          }
        }
      }),
      { numRuns: 40 },
    );
    // Some value's role held other values the other way, and so failed in a sentence that names a part.
    expect(triggered).toBeGreaterThan(0);
  }, 240_000);

  it('fails a value no input holds in every role’s words', () => {
    fc.assert(
      fc.property(generated, fc.integer({ min: 1, max: 50_000 }), fc.constantFrom<Form>('digits', 'commas', 'words'), ({ content }, offset, form) => {
        const oracle = roleOracle(content);
        // Above every value held (a release is at least 900001), so neither a year nor a procedure code.
        const largest = Math.max(...[...oracle.entries()].filter(([role]) => role in NUMBER_TEMPLATES).flatMap(([, values]) => [...values].map(Number)));
        const value = largest + offset;
        for (const template of Object.values(NUMBER_TEMPLATES)) {
          const narrative = template.replace('{}', written(value, form));
          expect(passes(narrative, content), narrative).toBe(false);
        }
      }),
      { numRuns: 25 },
    );
  }, 60_000);

  it('passes a quoted figure beside its own label and fails it bare or in a role', () => {
    fc.assert(
      fc.property(generated, ({ content, quoted }) => {
        const oracle = roleOracle(content);
        const codes = new Set(content.lines.map((item) => item.procedure_code));
        for (const { label, value } of quoted) {
          expect(passes(`Under ${label} ${String(value)} the payer owes more [1].`, content), `${label} ${String(value)}`).toBe(true);
          expect(passes(`The payer cited ${String(value)} [1].`, content), String(value)).toBe(codes.has(String(value)));
          // In a count's words it passes only where the record counts it so.
          expect(passes(`There were ${String(value)} claims [3].`, content), String(value)).toBe(oracle.get('claims')?.has(String(value)) === true);
        }
      }),
      { numRuns: 25 },
    );
  }, 60_000);

  it('passes a figure a quoted clause lists between edges in a role only where the record holds it so (CRIT-1, PE-3)', () => {
    fc.assert(
      fc.property(generated, ({ content, terms }) => {
        const oracle = roleOracle(content);
        for (const value of terms) {
          for (const [role, template] of Object.entries(NUMBER_TEMPLATES)) {
            const narrative = template.replace('{}', String(value));
            expect(passes(narrative, content), `${narrative} (listed)`).toBe(numberExpected(content, oracle, role, value, 'digits'));
          }
          // Bare between edges, as the clause lists it, it repeats nothing.
          expect(passes(`The terms are, in order, ${String(value)}, and more [1].`, content), String(value)).toBe(false);
        }
      }),
      { numRuns: 25 },
    );
  }, 60_000);

  it('reads a year’s lead before a count’s noun as the count, never the year (CRIT-1, PE-8)', () => {
    fc.assert(
      fc.property(generated, fc.constantFrom('the', 'these', 'for', 'its', 'this'), ({ content }, lead) => {
        const oracle = roleOracle(content);
        const years = new Set([...valuesIn(oracle, Object.keys(DATE_TEMPLATES))].map((value) => value.slice(0, 4)));
        for (const year of years) {
          for (const role of ['claims', 'lines', 'patients'] as const) {
            const narrative = `The payer underpaid ${lead} ${year} ${role} [3].`;
            expect(passes(narrative, content), narrative).toBe(oracle.get(role)?.has(year) === true);
          }
        }
      }),
      { numRuns: 25 },
    );
  }, 60_000);
});
