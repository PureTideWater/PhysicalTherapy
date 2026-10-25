import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { type NarrativeFacts, narrativeFacts } from './facts';
import type { PacketContentV1, PacketContentV2, RegulationCitation } from './format';
import { verifyNarrative } from './verifier';
import { IDS, SHA, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

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
        // Not the lines' first-level windows (2036-04-05, 2036-04-06): above the first level the copy states the
        // level's own window alone.
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
        '2027', // the dates' years
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
      // Not the lines' first-level contract window either (its days, its clause's numbers, its page), for the same reason.
      dayCounts: [],
      pages: [],
      // The statute, the quote, the quote's month and day; not the plan's key, since the payer's copy names the plan by its name.
      identifiers: ['1-2-3', '7-8-9', 'month:2026-05', 'month_day:06-03'],
      rows: 3,
      markers: [1, 2, 3, 4, 5, 6, 7, 8],
    });
  });

  it('holds the plan as the payer’s copy names it, never its remittance key’s qualifier (audit item #37 part 1, the verification of 2026-10-21)', () => {
    const payer = { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYER7', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-63', plan_name: null };
    // No name is known: the copy prints "plan identifier SYNPLAN-63", so that identifier is a figure and the key is not.
    const unnamed = narrativeFacts(assemblePacket(assemblyInput({ payer })));
    expect(unnamed.identifiers.has('SYNPLAN-63')).toBe(true);
    expect(unnamed.identifiers.has('CE:SYNPLAN-63')).toBe(false);
    expect(verifyNarrative('The plan identifier is SYNPLAN-63 [1].', unnamed, []).passed).toBe(true);
    expect(verifyNarrative('The plan is CE:SYNPLAN-63 [1].', unnamed, []).passed).toBe(false);
    // Named: the copy prints the name alone, so neither the identifier nor the key is one; the payer's ID never was.
    const named = narrativeFacts(assemblePacket(assemblyInput({ payer: { ...payer, plan_name: 'SYNTHETIC PLAN 64' } })));
    expect(named.numbers.has('64')).toBe(true);
    expect([...named.identifiers].filter((value) => value.includes('SYNPLAN') || value.includes('SYNPAYER'))).toEqual([]);
    expect(verifyNarrative('The plan identifier is SYNPLAN-63 [1].', named, []).passed).toBe(false);
  });

  it('holds a plan known only by its claim filing indicator as the copy prints it, its type in words, never the code (the founder’s ruling of 2026-10-21)', () => {
    const payer = { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'XV:SYNPAYERXV', plan_id: IDS.plan, plan_key: 'CLP06:12', plan_name: null };
    const typed = narrativeFacts(assemblePacket(assemblyInput({ payer })));
    const failed = (facts: NarrativeFacts, narrative: string) => verifyNarrative(narrative, facts, []).mismatches.map((mismatch) => [mismatch.code, mismatch.kind, narrative.slice(mismatch.start, mismatch.end)]);
    // The code is no figure of the plan's, so 12 is no input at all here: "plan identifier 12" states a number from nowhere.
    expect(typed.numbers.has('12')).toBe(false);
    expect(typed.identifiers.has('12')).toBe(false);
    expect(failed(typed, 'The claims were paid by SYNTHETIC PAYER Q under plan type Preferred Provider Organization (PPO) [1].')).toEqual([]);
    expect(failed(typed, 'The claims were paid by SYNTHETIC PAYER Q under plan identifier 12 [1].')).toEqual([['figure_not_in_input', 'number', '12']]);
    expect(failed(typed, 'The claims were paid under plan CLP06:12 [1].')).toEqual([['figure_not_in_input', 'identifier', 'CLP06:12']]);
    // ZZ names no type and an indicator with no words is printed by no copy: neither quotes anything, so neither is a figure.
    for (const plan_key of ['CLP06:ZZ', 'CLP06:Q9']) {
      const left = narrativeFacts(assemblePacket(assemblyInput({ payer: { ...payer, plan_key } })));
      expect(sorted(left), plan_key).toEqual(sorted(typed));
      expect(failed(left, 'The claims were paid under plan identifier 12 [1].'), plan_key).toEqual([['figure_not_in_input', 'number', '12']]);
    }
    // A plan whose quoted text holds a figure is held to it as printed: a named plan's 64, never the indicator's 12.
    const named = narrativeFacts(assemblePacket(assemblyInput({ payer: { ...payer, plan_name: 'SYNTHETIC PLAN 64' } })));
    expect(named.numbers.has('64')).toBe(true);
    expect(named.numbers.has('12')).toBe(false);
  });

  it('fails a remittance key in a narrative, digit or not, as a figure no input holds (the verification of 2026-10-21)', () => {
    const facts = narrativeFacts(assemblePacket(assemblyInput()));
    const failed = (narrative: string) => verifyNarrative(narrative, facts, []).mismatches.map((mismatch) => [mismatch.code, mismatch.kind]);
    // The content's own keys, another payer's, an ERA export's, and the loaders' longer qualifiers: no input holds one.
    for (const key of ['CE:SYNPLAN-FIX-ONE', '2U:SYNPAYERQ', 'XV:SYNPAYERXV', 'NAME:SYNTHETIC', 'PLAN:SYNTHETIC', 'TRN03:SYNPAYER', 'CLP06:HM']) {
      expect(failed(`The claims were paid under plan ${key} [1].`), key).toEqual([['figure_not_in_input', 'identifier']]);
    }
    // Read whole, so no part of it passes as a figure an input holds ("CE:3" is no count of 3 lines).
    expect(facts.numbers.has('3')).toBe(true);
    expect(failed('The plan is CE:3 [1].')).toEqual([['figure_not_in_input', 'identifier']]);
    // The plan as the copy names it passes, and so does the payer's name.
    expect(failed('The claims were paid by SYNTHETIC PAYER Q under plan identifier SYNPLAN-FIX-ONE [1].')).toEqual([]);
    // A key an input the verifier quotes holds may be repeated as it holds it.
    const quoting = narrativeFacts(assemblePacket(assemblyInput({ citation: contractCitation({ quote: '97110 is paid 50.00 per unit under schedule FS:SYNTHETIC' }) })));
    expect(quoting.identifiers.has('FS:SYNTHETIC')).toBe(true);
    expect(verifyNarrative('The contract pays 97110 under schedule FS:SYNTHETIC [1].', quoting, []).passed).toBe(true);
  });

  it('holds the lines’ windows and the clause behind them at the first level only, as the payer’s copy prints them (audit item #37 part 1)', () => {
    const first = assemblePacket(assemblyInput());
    const second = assemblePacket(assemblyInput({ disputeLevel: 2, nextLevelDeadline: { status: 'verified', source: 'release', endsOn: '2026-12-01', cause: null } }));
    // The contract window, its days as days and its page as a page, and each line's window: at the first level.
    expect(narrativeFacts(first).dates.has('2036-04-05')).toBe(true);
    expect([...narrativeFacts(first).dayCounts]).toEqual(['3650']);
    expect([...narrativeFacts(first).pages]).toEqual(['1']);
    // Above it, the level's own window alone; the line's first-level window and its clause are no figure.
    expect(narrativeFacts(second).dates.has('2026-12-01')).toBe(true);
    expect(narrativeFacts(second).dates.has('2036-04-05')).toBe(false);
    expect(narrativeFacts(second).dayCounts.size + narrativeFacts(second).pages.size).toBe(0);
    const window = 'Each line’s dispute window ends on 2036-04-05 [3].';
    expect(verifyNarrative(window, narrativeFacts(first), []).passed).toBe(true);
    expect(verifyNarrative(window, narrativeFacts(second), []).passed).toBe(false);
    expect(verifyNarrative('The contract’s dispute window is 3650 days [1].', narrativeFacts(second), []).passed).toBe(false);
    expect(verifyNarrative('The window for this level ends on 2026-12-01 [3].', narrativeFacts(second), []).passed).toBe(true);
  });

  it('holds interest only where it is stated, above zero: no $0.00 total, and no due date, days or amount of a line not stated', () => {
    // Paid on time and dated before the due date: every line computes $0.00.
    const onTime = assemblePacket(
      assemblyInput({
        asOf: '2026-03-10',
        lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-03-09' })],
        interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      }),
    );
    expect(onTime.interest).toMatchObject({ computed: true, total_cents: '0' });
    expect(onTime.interest?.lines[0]).toMatchObject({ interest_cents: '0', due_on: '2026-04-04' });
    const facts = narrativeFacts(onTime);
    expect(facts.dates.has('2026-04-04')).toBe(false);
    expect(facts.amounts.has('0')).toBe(false);
    expect(verifyNarrative('Prompt-pay interest of $0.00 is stated as its own line [4].', facts, []).passed).toBe(false);
    // The rule's own figures stay: its release, its days and its rate.
    expect(facts.numbers.has('33')).toBe(true);
    expect(facts.percents.has('9')).toBe(true);
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

  it('takes each figure from the part of the version that holds it, even where no other part repeats it', () => {
    const received = { receivedOn: '2026-03-02', paidOn: '2026-05-01' };
    const content = assemblePacket(
      assemblyInput({ asOf: '2026-05-01', lines: [line(1, received), line(2, received), line(3, received)], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } }),
    );
    const facts = narrativeFacts(content);
    const [first, ...rest] = content.lines;
    const interest = content.interest;
    if (first === undefined || interest === null) {
      throw new Error('three lines with interest');
    }
    const [interestFirst, ...interestRest] = interest.lines;
    if (interestFirst === undefined) {
      throw new Error('interest lines');
    }
    // Each value below is held by the one part named and by no other part of the version.
    const holds = (changed: PacketContentV2) => narrativeFacts(changed);
    // The schedule's count of lines, when the pattern counts otherwise.
    expect(facts.numbers.has('41')).toBe(false);
    const recounted = holds({ ...content, pattern: { ...content.pattern, lines: 41, claims: 41, patients: 41, codes: content.pattern.codes.map((code) => ({ ...code, lines: 41 })) } });
    expect(recounted.numbers.has('3')).toBe(true);
    expect(recounted.numbers.has('41')).toBe(true);
    // The pattern's first and last service dates, its percentages (as plain decimals) and each code it summarizes.
    const pattern = holds({ ...content, pattern: { ...content.pattern, first_service_date: '2019-01-02', last_service_date: '2019-01-03', contract_percentages: ['61.50'], codes: content.pattern.codes.map((code) => ({ ...code, procedure_code: '97999' })) } });
    expect(['2019-01-02', '2019-01-03'].map((date) => [facts.dates.has(date), pattern.dates.has(date)])).toEqual([
      [false, true],
      [false, true],
    ]);
    expect([facts.percents.has('61.5'), pattern.percents.has('61.5'), pattern.percents.has('61.50')]).toEqual([false, true, false]);
    expect([facts.codes.has('97999'), pattern.codes.has('97999'), pattern.codes.has('97110')]).toEqual([false, true, true]);
    // A line's own code, the last day of its deadline at the first level and each step of its calculation.
    const lineParts = holds({
      ...content,
      lines: [{ ...first, procedure_code: '97998', deadline: { ...first.deadline, ends_on: '2036-09-09' }, calculation: { ...first.calculation, steps: [{ step: 'unit', amount_cents: '5101' }, ...first.calculation.steps] } }, ...rest],
    });
    expect([facts.codes.has('97998'), lineParts.codes.has('97998')]).toEqual([false, true]);
    expect([facts.dates.has('2036-09-09'), lineParts.dates.has('2036-09-09')]).toEqual([false, true]);
    expect([facts.amounts.has('5101'), lineParts.amounts.has('5101')]).toEqual([false, true]);
    // The dates an interest line states: when the payer received the claim and when it paid.
    const interestDates = holds({ ...content, interest: { ...interest, lines: [{ ...interestFirst, received_on: '2025-11-11', paid_on: '2025-11-12' }, ...interestRest] } });
    expect(['2025-11-11', '2025-11-12'].map((date) => [facts.dates.has(date), interestDates.dates.has(date)])).toEqual([
      [false, true],
      [false, true],
    ]);
  });

  it('holds a contract window’s days as days whether or not its clause repeats them, and no days the window does not state', () => {
    const quiet = 'Disputes are raised within the contract window.';
    const days = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: 45, page: 7, quote: quiet })] })));
    expect([...days.dayCounts]).toStrictEqual(['45']);
    expect([...days.pages]).toStrictEqual(['7']);
    expect(days.numbers.has('45')).toBe(false);
    // A window with no day count states none, and its clause holds none either.
    const none = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: null, quote: quiet })] })));
    expect([...none.dayCounts]).toStrictEqual([]);
    expect([...none.pages]).toStrictEqual(['1']);
    // A release record is no contract window: no days and no page of its own.
    const release = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [{ kind: 'release_record', release_no: 900001, sha256: SHA, program: 'medicare', level: 'L2' }] })));
    expect(release.dayCounts.size + release.pages.size).toBe(0);
  });

  it('holds only whole cents of a calculation, and nothing for a rounding, a patient share or a rule the version does not state', () => {
    const content = assemblePacket(assemblyInput({ interest: { state: 'QQ', releaseNo: 900001, record: null } }));
    const [first, ...rest] = content.lines;
    if (first === undefined) {
      throw new Error('three lines');
    }
    const amounts = (changed: PacketContentV2) => [...narrativeFacts(changed).amounts].sort();
    const before = amounts(content);
    // A rounded amount is a figure; its unrounded amount with a fraction of a cent is not, nor is any part of it.
    const fraction = amounts({ ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: { rule: 'HALF_UP_CENT', unrounded_cents: '12345.6789', rounded_cents: '12346' } } }, ...rest] });
    expect(fraction).toStrictEqual([...before, '12346'].sort());
    // A whole unrounded amount, a negative one included, is a figure.
    const whole = amounts({ ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: { rule: 'HALF_UP_CENT', unrounded_cents: '-250', rounded_cents: '-250' } } }, ...rest] });
    expect(whole).toStrictEqual([...before, '-250'].sort());
    // No rounding and no patient share: no figure for either, and nothing else changes.
    const without = narrativeFacts({ ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: null, patient_share_cents: null } }, ...rest] });
    expect([...without.amounts].sort()).toStrictEqual(before);
    // The release has no prompt-pay record for the state: the section states no rule's days, rate or statute.
    expect(content.interest).toMatchObject({ days_to_pay: null, annual_rate_percent: null, statute: null, total_cents: null });
    const facts = narrativeFacts(content);
    expect([...facts.numbers].every((value) => /^\d+(\.\d+)?$/.test(value))).toBe(true);
    expect([...facts.percents]).toStrictEqual([]);
  });

  it('reads a key a stored version leaves out as the null it stands for', () => {
    const content = assemblePacket(
      assemblyInput({ asOf: '2026-05-01', lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' })], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } }),
    );
    const stored = JSON.parse(JSON.stringify(content)) as PacketContentV2;
    const nulled = JSON.parse(JSON.stringify(content)) as { pattern: { codes: Record<string, unknown>[] }; lines: Record<string, unknown>[]; interest: Record<string, unknown> };
    const absent = JSON.parse(JSON.stringify(content)) as typeof nulled;
    for (const [target, key] of [
      [(value: typeof nulled) => value.pattern.codes[0], 'contract_amount_cents'],
      [(value: typeof nulled) => value.lines[0], 'received_on'],
      [(value: typeof nulled) => value.interest, 'days_to_pay'],
    ] as const) {
      const inNulled = target(nulled);
      const inAbsent = target(absent);
      if (inNulled === undefined || inAbsent === undefined) {
        throw new Error('the stored version holds the part');
      }
      inNulled[key] = null;
      delete inAbsent[key];
    }
    const read = (value: unknown) => sorted(narrativeFacts(value as PacketContentV2));
    expect(read(absent)).toStrictEqual(read(nulled));
    expect(read(nulled)).not.toStrictEqual(read(stored));
    expect(read(absent).amounts.every((value) => typeof value === 'string')).toBe(true);
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
