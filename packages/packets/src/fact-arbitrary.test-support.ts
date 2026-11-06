import fc from 'fast-check';
import { cents } from '@tp/money';

import { assemblePacket } from './assemble';
import type { ContractCitation, PacketContent, PacketContentV1, PacketContentV2 } from './format';
import { REGULATION, assemblyInput, calculation, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

/**
 * SYNTHETIC packets for the facts' catalog and renderer tests (design lane-b-packet-figure-placeholders, section 8):
 * patterns of one to six lines over several codes (the CPT shape, the HCPCS shapes G0283 and 0275T, and a code of
 * another shape), with modifiers (of the shape and not), several claims and patients, one-code, one-claim and one-line
 * patterns, fractional units, lines whose values differ or match, every cited method (a fixed schedule, per visit, a
 * lesser-of with a fixed or a percentage schedule, a percent of Medicare, a regulation), a fractional contract amount,
 * the first level or above it, interest stated, not stated or absent, one, two alike or two different contract
 * windows, a patient's share not on record, and a tp-packet/1 version. Invented values only.
 */

export const FACT_CODES = ['97110', '97112', 'G0283', '0275T', '97140', '9701'] as const;
const MODIFIERS = [[], [], ['GP'], ['GP', 'KX'], ['59'], ['XYZ']] as const;
const UNITS = ['1', '2', '3', '0.5', '1.25', '2.5'] as const;

const lineDraw = fc.record({
  code: fc.constantFrom(...FACT_CODES),
  modifiers: fc.constantFrom(...MODIFIERS),
  units: fc.constantFrom(...UNITS),
  expected: fc.constantFrom(10_000, 12_345, 7_000, 99_999_999),
  short: fc.constantFrom(3_000, 1, 4_321),
  paidPercent: fc.constantFrom(80, 100, 0),
  claim: fc.integer({ min: 1, max: 3 }),
  patient: fc.integer({ min: 1, max: 3 }),
  date: fc.integer({ min: 1, max: 4 }),
  shareOnRecord: fc.constantFrom(true, true, true, false),
});

export const factDraws = fc.record({
  lines: fc.array(lineDraw, { minLength: 1, maxLength: 6 }),
  citation: fc.constantFrom('fixed', 'per_visit', 'lesser_fixed', 'lesser_percent', 'percent', 'regulation', 'fixed_fraction'),
  level: fc.constantFrom(1, 1, 2),
  interest: fc.constantFrom('stated', 'not_stated', 'none'),
  windows: fc.constantFrom('one', 'alike', 'different'),
  format: fc.constantFrom('tp-packet/2', 'tp-packet/2', 'tp-packet/2', 'tp-packet/1'),
  quoteBraces: fc.constantFrom(false, false, false, true),
});
export type FactDraw = typeof factDraws extends fc.Arbitrary<infer T> ? T : never;

function citationOf(draw: FactDraw) {
  const quote = draw.quoteBraces ? 'SYNTHETIC clause {{fact:pattern.paid}} pays 50.00 per unit' : '97110 is paid 50.00 per unit';
  const pick: Record<FactDraw['citation'], () => ContractCitation | typeof REGULATION> = {
    fixed: () => contractCitation({ quote }),
    fixed_fraction: () => contractCitation({ quote, parameters: { amount_cents: '5000.5' } }),
    per_visit: () => contractCitation({ quote, method: 'PER_VISIT', parameters: { amount_cents: '9000' } }),
    lesser_fixed: () => contractCitation({ quote, method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '6000' } } }),
    lesser_percent: () => contractCitation({ quote, method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percent: '110', year_basis: 'LOCKED:2025' } } }),
    percent: () => contractCitation({ quote, method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5', year_basis: 'LOCKED:2024' } }),
    regulation: () => (draw.quoteBraces ? { ...REGULATION, reference: '42 CFR {{422.214}}' } : REGULATION),
  };
  return pick[draw.citation]();
}

/** A packet from a draw. */
export function factPacket(draw: FactDraw): PacketContent {
  const windows = {
    one: [contractWindowSource()],
    alike: [contractWindowSource(), contractWindowSource({ contract_version_id: '00000000-0000-4000-8000-0000000000c1', page: 1 })],
    different: [contractWindowSource(), contractWindowSource({ contract_version_id: '00000000-0000-4000-8000-0000000000c1', days: 180, page: 9 })],
  }[draw.windows];
  const content = assemblePacket(
    assemblyInput({
      disputeLevel: draw.level,
      nextLevelDeadline: draw.level === 1 ? null : { status: 'verified', source: 'contract', endsOn: '2027-01-15', cause: null },
      citation: citationOf(draw),
      deadlineSources: windows,
      interest: draw.interest === 'none' ? null : { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      lines: draw.lines.map((item, index) => {
        const expected = BigInt(item.expected);
        const observed = expected - BigInt(item.short);
        const paid = (observed * BigInt(item.paidPercent)) / 100n;
        const hex = (index + 1).toString(16).padStart(12, '0');
        const share = calculation(cents(expected), cents(observed), cents(paid));
        return {
          ...line(index + 1, {
            claimId: `20000000-0000-4000-8000-${item.claim.toString(16).padStart(12, '0')}`,
            patientKey: `40000000-0000-4000-8000-${item.patient.toString(16).padStart(12, '0')}`,
            serviceDate: `2026-03-0${String(item.date)}`,
            procedureCode: item.code,
            modifiers: [...item.modifiers],
            units: item.units,
            expectedCents: cents(expected),
            observedCents: cents(observed),
            varianceCents: cents(expected - observed),
            paidCents: cents(paid),
            receivedOn: draw.interest === 'stated' ? '2026-02-10' : null,
            calculation: item.shareOnRecord ? share : { ...share, patient_share_cents: null },
          }),
          serviceLineId: `10000000-0000-4000-8000-${hex}`,
          pricedLineId: `30000000-0000-4000-8000-${hex}`,
        };
      }),
    }),
  );
  return draw.format === 'tp-packet/1' ? asV1(content) : content;
}

/** A tp-packet/2 content written as a tp-packet/1 version: no deadline, no line's deadline or calculation. */
export function asV1(content: PacketContentV2): PacketContentV1 {
  const { deadline: _deadline, ...rest } = content;
  return { ...rest, format: 'tp-packet/1', lines: content.lines.map(({ deadline: _d, calculation: _c, ...kept }) => kept) };
}

export const factPackets = factDraws.map(factPacket);
