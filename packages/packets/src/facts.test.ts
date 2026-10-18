import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { type NarrativeFacts, narrativeFacts } from './facts';
import type { PacketContentV1, RegulationCitation } from './format';
import { IDS, SHA, assemblyInput, contractCitation, line, promptPayRecord } from './test-support';

/**
 * The inputs a narrative may state (./facts.ts): exactly the figures the version's own content holds,
 * each source once, and nothing else. Every figure below is written by hand from the SYNTHETIC inputs,
 * each source given a value no other source holds, so a source that went missing, or a figure that
 * came from nowhere, changes the sets.
 */

const sorted = (facts: NarrativeFacts) => ({
  amounts: [...facts.amounts].sort(),
  percents: [...facts.percents].sort(),
  dates: [...facts.dates].sort(),
  codes: [...facts.codes].sort(),
  modifiers: [...facts.modifiers].sort(),
  numbers: [...facts.numbers].sort(),
  dayCounts: [...facts.dayCounts].sort(),
  pages: [...facts.pages].sort(),
  identifiers: [...facts.identifiers].sort(),
  rows: facts.rows,
  markers: [...facts.markers].sort((a, b) => a - b),
});

describe('narrativeFacts', () => {
  it('holds every figure of a contract-cited version with interest, from each of its sources, and nothing else', () => {
    const content = assemblePacket(
      assemblyInput({
        disputeLevel: 5,
        citation: contractCitation({
          version_no: 6,
          page: 11,
          effective_from: '2025-07-01',
          effective_to: '2027-06-30',
          contract_title: 'SYNTHETIC AGREEMENT 2024',
          quote: 'Section 4.2: 97530-GO is paid 45.50 per unit, or 85% of billed, within 90 days of May 2026, starting June 3 and 2025-08-15, under SYNTHETIC 7-8-9',
          parameters: {
            amount_cents: '5000',
            // Amounts under keys ending in _cents and percentages under percent or percentage, at any depth;
            // anything else (text that is not one, another key, a number) is not an input.
            tiers: [
              { floor_cents: '1200', percent: '80' },
              { cap_cents: '-300', percent: 'about' },
              { percentage: '12.75', extra_cents: 4321 },
              { percent: 70 },
              { percent: 'about 60' },
              { percent: '50 or so' },
              707,
            ],
            note: null,
            contract_adjustment: { percentage: '95.50', year_basis: 'LOCKED:2023' },
            label_cents: 'n/a',
            ratio_cents: '1.5',
            share: '12.5',
            factor: 808,
          },
        }),
        practice: { practice_id: IDS.practice, name: 'SYNTHETIC THERAPY GROUP 61', npi: null, tax_id_last4: null },
        payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER 62', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-63', plan_name: 'SYNTHETIC PLAN 64' },
        releases: [
          { release_no: 900001, manifest_sha256: 'a'.repeat(64) },
          { release_no: 900002, manifest_sha256: 'b'.repeat(64) },
        ],
        lines: [
          line(1, { modifiers: ['GP', '59'], receivedOn: '2026-03-20', units: '7' }),
          line(2, {
            procedureCode: '97140',
            units: '8',
            expectedCents: cents(12000n),
            observedCents: cents(8000n),
            varianceCents: cents(4000n),
            paidCents: cents(6400n),
            paidOn: '2026-04-09',
            receivedOn: '2026-03-21',
            windowEndsOn: '2036-04-06',
          }),
          line(3, { units: '10' }),
        ],
        interest: { state: 'ZZ', releaseNo: 900003, record: promptPayRecord() },
        nextLevelDeadline: { status: 'unverified', source: 'contract', endsOn: '2027-01-15', cause: 'NEXT_LEVEL_UNCITED' },
      }),
    );
    expect(sorted(narrativeFacts(content))).toEqual({
      amounts: [
        '-300', // parameters: tiers[1].cap_cents
        '10000', // lines 1 and 3 expected; the pattern's variance
        '1200', // parameters: tiers[0].floor_cents
        '12000', // line 2 expected (and 97140's)
        '131', // interest, row 1: 30.00 at 9% for 177 days
        '1400', // lines 1 and 3: the calculation's patient share (tp-packet/2)
        '14000', // 97110 observed
        '1600', // line 2: the calculation's patient share (tp-packet/2)
        '174', // interest, row 2: 40.00 at 9% for 176 days
        '20000', // 97110 expected
        '22000', // the pattern's observed
        '3000', // lines 1 and 3 variance
        '305', // interest total
        '32000', // the pattern's expected
        '4000', // line 2 variance (and 97140's)
        '4550', // the quote: 45.50
        '5000', // parameters: amount_cents (each code's contract amount)
        '5600', // lines 1 and 3 paid
        '6000', // 97110 variance
        '6400', // line 2 paid
        '7000', // lines 1 and 3 observed
        '8000', // line 2 observed (and 97140's)
      ],
      percents: ['12.75', '80', '85', '9', '95.5'], // tiers[2].percentage, tiers[0].percent, the quote, the interest rate, the contract adjustment
      dates: [
        '2025-07-01', // effective from
        '2025-08-15', // the quote
        '2026-03-05',
        '2026-03-06',
        '2026-03-07', // service dates
        '2026-03-20',
        '2026-03-21', // received
        '2026-04-08',
        '2026-04-09', // paid
        '2026-04-22',
        '2026-04-23', // interest due
        '2026-10-16', // as of
        '2027-01-15', // the next level's window (tp-packet/2's deadline at dispute level 5)
        '2027-06-30', // effective to
        '2036-04-05',
        '2036-04-06', // windows end
      ],
      codes: ['97110', '97140', '97530'], // the lines' codes and the quote's
      modifiers: ['59', 'GO', 'GP'], // line 1's and the quote's
      numbers: [
        '0', // interest: days late
        '1', // 97140's lines
        '10', // line 3's units
        '11', // the page
        '17', // 97110's units
        '176',
        '177', // interest: days unpaid
        '2', // 97110's lines
        '2023', // the contract's locked year
        '2024', // the contract's title
        '2025',
        '2026',
        '2027',
        '2036', // the dates' years
        '25', // the pattern's units
        '3', // the schedule's lines, claims and patients
        '33', // interest: days to pay
        '4.2', // the quote's section
        '5', // the dispute level
        '6', // the contract version
        '61', // the practice's name
        '62', // the payer's name
        '64', // the plan's name
        '7', // line 1's units
        '8', // line 2's units (and 97140's)
        '90', // the quote's days
        '900001',
        '900002', // the rule releases
        '900003', // the interest's release
      ],
      // The contract window (tp-packet/2): its days and its quoted clause's numbers as days only, its page as a page only.
      dayCounts: ['3650'],
      pages: ['1'],
      identifiers: ['1-2-3', '7-8-9', 'CE:SYNPLAN-63', 'month:2026-05', 'month_day:06-03'], // the statute, the quote, the plan key, the quote's month and day
      rows: 3,
      markers: [1, 2, 3, 4, 5, 6, 7, 8],
    });
  });

  it('holds the regulation’s figures, and no figure for what the version does not state', () => {
    const regulation: RegulationCitation = { kind: 'regulation', method: 'MA_NONCONTRACTED', reference: 'SYNTHETIC RULE 71', statement: 'SYNTHETIC: a plan pays within 72 days.' };
    const fromRelease = { status: 'verified', source: 'release', endsOn: '2036-04-05', cause: null } as const;
    const content = assemblePacket(
      assemblyInput({
        citation: regulation,
        interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) },
        lines: [line(1, { deadline: fromRelease }), line(2, { deadline: fromRelease }), line(3, { deadline: fromRelease })],
        deadlineSources: [{ kind: 'release_record', release_no: 900001, sha256: SHA, program: 'medicare', level: 'L2' }],
      }),
    );
    expect(sorted(narrativeFacts(content))).toEqual({
      // The calculations' patient share (1400) besides the schedule's figures.
      amounts: ['10000', '1400', '21000', '3000', '30000', '5600', '7000', '9000'],
      // No rate, so no interest is computed: no percentage, due date, day count or interest amount.
      percents: [],
      dates: ['2026-03-05', '2026-03-06', '2026-03-07', '2026-04-08', '2026-10-16', '2036-04-05'],
      codes: ['97110'],
      modifiers: [],
      numbers: ['1', '2', '2026', '2036', '3', '33', '6', '71', '72', '900001'],
      dayCounts: [],
      pages: [],
      identifiers: ['1-2-3'],
      rows: 3,
      markers: [1, 2, 3, 4, 5, 6],
    });
  });

  it('holds none of the deadline and calculation figures for a tp-packet/1 version, which states none', () => {
    const current = assemblePacket(assemblyInput());
    const { deadline: _deadline, lines, ...rest } = current;
    const earlier: PacketContentV1 = { ...rest, format: 'tp-packet/1', lines: lines.map(({ deadline: _line, calculation: _calculation, ...item }) => item) };
    const facts = narrativeFacts(earlier);
    expect(facts.amounts.has('1400')).toBe(false);
    expect(facts.numbers.has('3650')).toBe(false);
    expect(facts.dayCounts.size + facts.pages.size).toBe(0);
    expect(narrativeFacts(current).amounts.has('1400')).toBe(true);
    // A tp-packet/2 version's window days are days only, never a number of any other kind.
    expect(narrativeFacts(current).numbers.has('3650')).toBe(false);
    expect(narrativeFacts(current).dayCounts.has('3650')).toBe(true);
    expect([...facts.dates].sort()).toEqual([...narrativeFacts(current).dates].sort());
  });
});
