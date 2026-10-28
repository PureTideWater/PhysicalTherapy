import fc from 'fast-check';
import { cents, formatCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { narrativeFacts } from './facts';
import type { PacketContentV2 } from './format';
import { IDS, REGULATION, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord, roleOracle } from './test-support';
import { verifyNarrative } from './verifier';

/**
 * Properties of the role reader through the verifier (docs/adr/0086; test matrix CAS-43 and CAS-44). The oracle reads
 * the generated content's fields by role (./role-examples.ts roleOracle()) and the quoted texts the generator wrote
 * from typed templates, recording each quoted figure and its label: it never reads ./facts.ts or ./roles.ts, so no
 * property tests the reader against itself. Values no input holds are built (the largest held value and an offset),
 * never filtered for. Each property's seed and run count are pinned.
 *
 * The oracle's prose and shape cases, spelled out: "one" and "zero" are prose, never a figure, so a template of value
 * 1 or 0 written in words passes; a five-digit value written in digits without a comma after a row's noun ("Line
 * 97110") is a procedure code, so it passes there exactly when it is one of the lines' codes.
 */

const SEED = 20_261_028;
const CODES = ['97110', '97112', '97140', '97530', 'G0283'] as const;

/** The quoted texts' templates: each records its figure and the word before it, the figure's label. */
interface Quoted {
  readonly label: string;
  readonly value: number;
}

const generated = fc
  .record({
    lines: fc.array(
      fc.record({ code: fc.constantFrom(...CODES), units: fc.integer({ min: 1, max: 4 }), perUnit: fc.integer({ min: 1000, max: 20_000 }), short: fc.integer({ min: 1, max: 999 }), claim: fc.integer({ min: 1, max: 4 }) }),
      { minLength: 1, maxLength: 5 },
    ),
    contract: fc.boolean(),
    version: fc.integer({ min: 1, max: 20 }),
    page: fc.integer({ min: 1, max: 99_999 }),
    windowPage: fc.integer({ min: 1, max: 99_999 }),
    windowDays: fc.integer({ min: 1, max: 99_999 }),
    release: fc.integer({ min: 900_001, max: 949_999 }),
    level: fc.constantFrom(1, 1, 1, 2),
    daysToPay: fc.integer({ min: 1, max: 60 }),
    section: fc.integer({ min: 2, max: 99 }),
    group: fc.integer({ min: 2, max: 99 }),
  })
  .map((draw) => {
    const quoted: Quoted[] = [
      { label: 'section', value: draw.section },
      { label: 'group', value: draw.group },
    ];
    const content = assemblePacket(
      assemblyInput({
        disputeLevel: draw.level,
        nextLevelDeadline: draw.level === 1 ? null : { status: 'verified', source: 'contract', endsOn: '2027-01-15', cause: null },
        practice: { practice_id: IDS.practice, name: `SYNTHETIC THERAPY GROUP ${String(draw.group)}`, npi: null, tax_id_last4: null },
        citation: draw.contract
          ? contractCitation({ version_no: draw.version, page: draw.page, quote: `Section ${String(draw.section)} of the SYNTHETIC agreement pays 97110 at 50.00 per unit` })
          : { ...REGULATION, statement: `Section ${String(draw.section)} of the SYNTHETIC rule pays what Original Medicare pays.` },
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
    return { content, quoted };
  });

/** Each role's sentence, the figure written where `{}` is, and the roles the sentence reads it in (any of them). */
const NUMBER_TEMPLATES: Readonly<Record<string, string>> = {
  window_days: 'Disputes are raised within {} days [1].',
  days_to_pay: 'The payer has {} days to pay [4].',
  days_late: 'The payer paid {} days late [4].',
  citation_page: 'The clause is on page {} [1].',
  window_page: 'The dispute window is on page {} [1].',
  version: 'The contract, version {}, applies [1].',
  release: 'Release {} priced the lines [2].',
  level: 'This is a level {} appeal [1].',
  lines: 'There were {} lines [3].',
  claims: 'There were {} claims [3].',
  patients: 'There were {} patients [3].',
  units: 'The lines billed {} units in all [3].',
  line_units: 'Each line billed {} units [3].',
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
  deadline: 'The window closes on {} [1].',
  effective_date: 'The contract took effect on {} [1].',
};
const ROW_ROLES = new Set(['row', 'claim_row', 'patient_row']);

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
      { seed: SEED, numRuns: 12 },
    );
    // Every pair of roles was reached, a value held in one written in the other's words.
    const roles = Object.keys(NUMBER_TEMPLATES);
    expect([...reached].sort()).toEqual(roles.flatMap((held) => roles.map((role) => `${held}>${role}`)).sort());
  }, 120_000);

  it('passes an amount or a date in a role’s words exactly when the inputs hold it in that role', () => {
    fc.assert(
      fc.property(generated, ({ content }) => {
        const oracle = roleOracle(content);
        for (const [templates, write] of [
          [AMOUNT_TEMPLATES, (value: string) => `$${formatCents(cents(BigInt(value)))}`],
          [DATE_TEMPLATES, (value: string) => value],
        ] as const) {
          const values = new Set(Object.keys(templates).flatMap((role) => [...(oracle.get(role) ?? [])]));
          for (const value of [...values].filter((item) => !item.startsWith('-'))) {
            for (const [role, template] of Object.entries(templates)) {
              const narrative = template.replace('{}', write(value));
              expect(passes(narrative, content), narrative).toBe(oracle.get(role)?.has(value) === true);
            }
          }
        }
      }),
      { seed: SEED, numRuns: 12 },
    );
  }, 120_000);

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
      { seed: SEED, numRuns: 25 },
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
      { seed: SEED, numRuns: 25 },
    );
  }, 60_000);
});
