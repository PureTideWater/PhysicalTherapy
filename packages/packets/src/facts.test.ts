import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { type NarrativeFacts, heldRoles, narrativeFacts } from './facts';
import type { PacketContentV1, PacketContentV2, RegulationCitation } from './format';
import { verifyNarrative } from './verifier';
import { IDS, SHA, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

/**
 * The inputs a narrative may state (./facts.ts): exactly the figures the version's own content holds, each in the
 * roles its record gives it, each source once, and nothing else; and each quoted text as its words, never as an input
 * of a role (docs/adr/0086). Every figure below is written by hand from the SYNTHETIC inputs, each source given a
 * value no other source holds, so a source that went missing, a figure that came from nowhere, or a figure in the
 * wrong role changes what is held.
 */

const sorted = (facts: NarrativeFacts) => ({
  roles: Object.fromEntries(
    [...facts.roles]
      .map(([key, roles]) => [key, [...roles].sort().join(' ')] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  ),
  businessDays: facts.businessDays,
  codes: [...facts.codes].sort(),
  modifiers: [...facts.modifiers].sort(),
  identifiers: [...facts.identifiers].sort(),
  quotes: facts.quotes.map((quote) => quote.join(' ')),
  rows: facts.rows,
  markers: [...facts.markers].sort((a, b) => a - b),
});

/** The values of a kind the inputs hold, in any role. */
const values = (facts: NarrativeFacts, kind: string) =>
  [...facts.roles.keys()]
    .filter((key) => key.startsWith(`${kind}:`))
    .map((key) => key.slice(kind.length + 1))
    .sort();
/** Whether a quoted text holds a token (a figure as `n:64`, a word as `w:plan`). */
const quotes = (facts: NarrativeFacts, token: string) => facts.quotes.some((quote) => quote.includes(token));
const roles = (facts: NarrativeFacts, kind: Parameters<typeof heldRoles>[1], value: string) => [...heldRoles(facts, kind, value)].sort();

describe('narrativeFacts', () => {
  it('holds every figure of a contract-cited version with interest, from each of its sources, each in its role, and nothing else', () => {
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
      roles: {
        'amount:-300': 'expected', // parameters: tiers[1].cap_cents
        'amount:10000': 'calculation expected variance', // lines 1 and 3 expected and their calculation's step; the pattern's variance
        'amount:1200': 'expected', // parameters: tiers[0].floor_cents
        'amount:12000': 'calculation expected', // line 2 expected (and 97140's) and its calculation's step
        'amount:131': 'interest', // interest, row 1: 30.00 at 9% for 177 days
        'amount:1400': 'patient_share', // lines 1 and 3: the calculation's patient share (tp-packet/2)
        'amount:14000': 'allowed', // 97110 observed
        'amount:1600': 'patient_share', // line 2: the calculation's patient share
        'amount:174': 'interest', // interest, row 2: 40.00 at 9% for 176 days
        'amount:20000': 'expected', // 97110 expected
        'amount:22000': 'allowed', // the pattern's observed
        'amount:3000': 'variance', // lines 1 and 3 variance
        'amount:305': 'interest', // interest total
        'amount:32000': 'expected', // the pattern's expected
        'amount:4000': 'variance', // line 2 variance (and 97140's)
        'amount:5000': 'expected', // parameters: amount_cents (each code's contract amount)
        'amount:5600': 'paid', // lines 1 and 3 paid
        'amount:6000': 'variance', // 97110 variance
        'amount:6400': 'paid', // line 2 paid
        'amount:7000': 'allowed', // lines 1 and 3 observed
        'amount:8000': 'allowed', // line 2 observed (and 97140's)
        'date:2025-07-01': 'effective_date',
        'date:2026-03-05': 'service_date',
        'date:2026-03-06': 'service_date',
        'date:2026-03-07': 'service_date',
        'date:2026-03-20': 'received_date',
        'date:2026-03-21': 'received_date',
        'date:2026-04-08': 'paid_date',
        'date:2026-04-09': 'paid_date',
        'date:2026-04-22': 'due_date', // interest due
        'date:2026-04-23': 'due_date',
        'date:2026-10-16': 'as_of_date',
        'date:2027-01-15': 'deadline', // the next level's window (tp-packet/2's deadline at dispute level 5)
        'date:2027-06-30': 'effective_date',
        // Not the lines' first-level windows (2036-04-05, 2036-04-06): above the first level the copy states the
        // level's own window alone. Each date's month, day of the month and year carry its role.
        'month:2025-07': 'effective_date',
        'month:2026-03': 'received_date service_date',
        'month:2026-04': 'due_date paid_date',
        'month:2026-10': 'as_of_date',
        'month:2027-01': 'deadline',
        'month:2027-06': 'effective_date',
        'month_day:01-15': 'deadline',
        'month_day:03-05': 'service_date',
        'month_day:03-06': 'service_date',
        'month_day:03-07': 'service_date',
        'month_day:03-20': 'received_date',
        'month_day:03-21': 'received_date',
        'month_day:04-08': 'paid_date',
        'month_day:04-09': 'paid_date',
        'month_day:04-22': 'due_date',
        'month_day:04-23': 'due_date',
        'month_day:06-30': 'effective_date',
        'month_day:07-01': 'effective_date',
        'month_day:10-16': 'as_of_date',
        'number:0': 'days_late', // interest: days late
        'number:1': 'claim_row lines patient_row row', // 97140's lines; the first row, claim and patient
        'number:10': 'line_units units', // line 3's units
        'number:11': 'citation_page',
        'number:17': 'units', // 97110's units
        'number:176': 'days_late', // interest: days unpaid
        'number:177': 'days_late',
        'number:2': 'claim_row lines patient_row row', // 97110's lines; the second row, claim and patient
        'number:25': 'units', // the pattern's units
        'number:3': 'claim_row claims lines patient_row patients row', // the schedule's lines, claims and patients
        'number:33': 'days_to_pay',
        'number:5': 'level',
        'number:6': 'version',
        'number:7': 'line_units units', // line 1's units
        'number:8': 'line_units units', // line 2's units (and 97140's)
        'number:900001': 'release',
        'number:900002': 'release', // the rule releases
        'number:900003': 'release', // the interest's release
        'percent:12.75': 'contract_percent', // tiers[2].percentage
        'percent:80': 'contract_percent', // tiers[0].percent
        'percent:9': 'interest_rate',
        'percent:95.5': 'contract_percent', // the contract adjustment
        'year:2023': 'schedule_year', // the contract's locked year
        'year:2025': 'effective_date',
        'year:2026': 'as_of_date due_date paid_date received_date service_date',
        'year:2027': 'deadline effective_date',
      },
      businessDays: false,
      codes: ['97110', '97140', '97530'], // the lines' codes and the quote's
      modifiers: ['59', 'GO', 'GP'], // line 1's and the quote's
      // The statute and the quote; not the plan's key, since the payer's copy names the plan by its name.
      identifiers: ['1-2-3', '7-8-9'],
      // Every quoted text as its words, so its figures (45.50, 85%, 90, May 2026, June 3, 2025-08-15, 2024, 61, 62,
      // 64) are repeated only beside them, never in a role.
      quotes: [
        'w:section n:4.2 | n:97530 m:GO w:is w:paid a:4550 w:per w:unit | w:or p:85 w:of w:billed | w:within n:90 w:days w:of d:month:2026-05 | w:starting d:month_day:06-03 w:and d:date:2025-08-15 | w:under w:synthetic i:7-8-9',
        'w:synthetic w:agreement n:2024',
        'w:synthetic w:therapy w:group n:61',
        'w:synthetic w:payer n:62',
        'w:plan w:synthetic w:plan n:64',
        'w:synthetic w:statute w:zz i:1-2-3',
      ],
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
    expect(quotes(named, 'n:64')).toBe(true);
    expect([...named.identifiers].filter((value) => value.includes('SYNPLAN') || value.includes('SYNPAYER'))).toEqual([]);
    expect(verifyNarrative('The plan identifier is SYNPLAN-63 [1].', named, []).passed).toBe(false);
    // The name's 64 is repeated beside its words, never as a count.
    expect(verifyNarrative('The claims were paid under SYNTHETIC PLAN 64 [1].', named, []).passed).toBe(true);
    expect(verifyNarrative('There were 64 claims [3].', named, []).passed).toBe(false);
  });

  it('holds a plan known only by its claim filing indicator as the copy prints it, its type in words, never the code (the founder’s ruling of 2026-10-21)', () => {
    const payer = { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'XV:SYNPAYERXV', plan_id: IDS.plan, plan_key: 'CLP06:12', plan_name: null };
    const typed = narrativeFacts(assemblePacket(assemblyInput({ payer })));
    const failed = (facts: NarrativeFacts, narrative: string) => verifyNarrative(narrative, facts, []).mismatches.map((mismatch) => [mismatch.code, mismatch.kind, narrative.slice(mismatch.start, mismatch.end)]);
    // The code is no figure of the plan's, so 12 is no input at all here: "plan identifier 12" states a number from nowhere.
    expect(roles(typed, 'number', '12')).toEqual([]);
    expect(quotes(typed, 'n:12')).toBe(false);
    expect(typed.identifiers.has('12')).toBe(false);
    expect(failed(typed, 'The claims were paid by SYNTHETIC PAYER Q under plan type Preferred Provider Organization (PPO) [1].')).toEqual([]);
    expect(failed(typed, 'The claims were paid by SYNTHETIC PAYER Q under plan identifier 12 [1].')).toEqual([['figure_not_in_input', 'number', '12']]);
    expect(failed(typed, 'The claims were paid under plan CLP06:12 [1].')).toEqual([['figure_not_in_input', 'identifier', 'CLP06:12']]);
    // ZZ names no type and an indicator with no words is printed by no copy: neither quotes anything, so neither is a figure.
    for (const plan_key of ['CLP06:ZZ', 'CLP06:Q9']) {
      const left = narrativeFacts(assemblePacket(assemblyInput({ payer: { ...payer, plan_key } })));
      expect(sorted(left), plan_key).toEqual({ ...sorted(typed), quotes: sorted(typed).quotes.filter((quote) => !quote.startsWith('w:plan w:type')) });
      expect(failed(left, 'The claims were paid under plan identifier 12 [1].'), plan_key).toEqual([['figure_not_in_input', 'number', '12']]);
    }
    // A plan whose quoted text holds a figure is held to it as printed: a named plan's 64, never the indicator's 12.
    const named = narrativeFacts(assemblePacket(assemblyInput({ payer: { ...payer, plan_name: 'SYNTHETIC PLAN 64' } })));
    expect(quotes(named, 'n:64')).toBe(true);
    expect(quotes(named, 'n:12')).toBe(false);
  });

  it('fails a remittance key in a narrative, digit or not, as a figure no input holds (the verification of 2026-10-21)', () => {
    const facts = narrativeFacts(assemblePacket(assemblyInput()));
    const failed = (narrative: string) => verifyNarrative(narrative, facts, []).mismatches.map((mismatch) => [mismatch.code, mismatch.kind]);
    // The content's own keys, another payer's, an ERA export's, and the loaders' longer qualifiers: no input holds one.
    for (const key of ['CE:SYNPLAN-FIX-ONE', '2U:SYNPAYERQ', 'XV:SYNPAYERXV', 'NAME:SYNTHETIC', 'PLAN:SYNTHETIC', 'TRN03:SYNPAYER', 'CLP06:HM']) {
      expect(failed(`The claims were paid under plan ${key} [1].`), key).toEqual([['figure_not_in_input', 'identifier']]);
    }
    // Read whole, so no part of it passes as a figure an input holds ("CE:3" is no count of 3 lines).
    expect(roles(facts, 'number', '3')).toContain('lines');
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
    // The contract window, its days as the window's days and its page as the window's page, and each line's window,
    // at the first level.
    expect(roles(narrativeFacts(first), 'date', '2036-04-05')).toEqual(['deadline']);
    expect(roles(narrativeFacts(first), 'number', '3650')).toEqual(['window_days']);
    expect(roles(narrativeFacts(first), 'number', '1')).toContain('window_page');
    expect(narrativeFacts(first).quotes).toContainEqual(['w:disputes', 'w:are', 'w:raised', 'w:within', 'n:3650', 'w:days', 'w:of', 'w:the', 'w:payment', 'w:date', '|']);
    // Above it, the level's own window alone; the line's first-level window and its clause are no figure.
    const above = narrativeFacts(second);
    expect(roles(above, 'date', '2026-12-01')).toEqual(['deadline']);
    expect(roles(above, 'date', '2036-04-05')).toEqual([]);
    expect([...above.roles.values()].some((held) => held.has('window_days') || held.has('window_page'))).toBe(false);
    expect(quotes(above, 'n:3650')).toBe(false);
    const window = 'Each line’s dispute window ends on 2036-04-05 [3].';
    expect(verifyNarrative(window, narrativeFacts(first), []).passed).toBe(true);
    expect(verifyNarrative(window, above, []).passed).toBe(false);
    expect(verifyNarrative('The contract’s dispute window is 3650 days [1].', above, []).passed).toBe(false);
    expect(verifyNarrative('The window for this level ends on 2026-12-01 [3].', above, []).passed).toBe(true);
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
    expect(onTime.interest?.lines[0]).toMatchObject({ interest_cents: '0', due_on: '2026-04-04', days_late: 0 });
    const facts = narrativeFacts(onTime);
    expect(roles(facts, 'date', '2026-04-04')).toEqual([]);
    expect(roles(facts, 'amount', '0')).toEqual([]);
    expect(roles(facts, 'number', '0')).toEqual([]);
    expect(verifyNarrative('Prompt-pay interest of $0.00 is stated as its own line [4].', facts, []).passed).toBe(false);
    // The rule's own figures stay: its release, its days and its rate.
    expect(roles(facts, 'number', '33')).toEqual(['days_to_pay']);
    expect(roles(facts, 'percent', '9')).toEqual(['interest_rate']);
  });

  it('holds a prompt-pay rule’s day counts as business days only where it counts business days', () => {
    const late = (day_basis: string) =>
      narrativeFacts(
        assemblePacket(
          assemblyInput({ asOf: '2026-10-16', lines: [line(1, { receivedOn: '2026-02-10' })], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ day_basis }) } }),
        ),
      );
    expect(late('calendar').businessDays).toBe(false);
    // A packet with no prompt-pay rule counts no business days.
    expect(narrativeFacts(assemblePacket(assemblyInput({ asOf: '2026-10-16', lines: [line(1)] }))).businessDays).toBe(false);
    const business = late('business');
    // A business-day rule computes no interest (interest_business_days), so only its days to pay are stated.
    expect(business.businessDays).toBe(true);
    expect(verifyNarrative('Disputes are raised within 3650 business days [1].', business, []).passed).toBe(false);
    expect(verifyNarrative('The payer has 33 business days to pay [4].', business, []).passed).toBe(true);
    expect(verifyNarrative('The payer has 33 business days to pay [4].', late('calendar'), []).passed).toBe(false);
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
      roles: {
        'amount:10000': 'calculation expected',
        'amount:1400': 'patient_share', // the calculations' patient share besides the schedule's figures
        'amount:21000': 'allowed',
        'amount:3000': 'variance',
        'amount:30000': 'expected',
        'amount:5600': 'paid',
        'amount:7000': 'allowed',
        'amount:9000': 'variance',
        'date:2026-03-05': 'service_date',
        'date:2026-03-06': 'service_date',
        'date:2026-03-07': 'service_date',
        'date:2026-04-08': 'paid_date',
        'date:2026-10-16': 'as_of_date',
        'date:2036-04-05': 'deadline',
        'month:2026-03': 'service_date',
        'month:2026-04': 'paid_date',
        'month:2026-10': 'as_of_date',
        'month:2036-04': 'deadline',
        'month_day:03-05': 'service_date',
        'month_day:03-06': 'service_date',
        'month_day:03-07': 'service_date',
        'month_day:04-05': 'deadline',
        'month_day:04-08': 'paid_date',
        'month_day:10-16': 'as_of_date',
        'number:1': 'claim_row level patient_row row',
        'number:2': 'claim_row line_units patient_row row units',
        'number:3': 'claim_row claims lines patient_row patients row',
        'number:33': 'days_to_pay',
        'number:6': 'units',
        'number:900001': 'release',
        'year:2026': 'as_of_date paid_date service_date',
        'year:2036': 'deadline',
        // No rate, so no interest is computed: no percentage, due date, day late or interest amount.
      },
      businessDays: false,
      codes: ['97110'],
      modifiers: [],
      identifiers: ['1-2-3'],
      // The regulation's 71 and 72 are its words', never a count or a day count of the record's.
      quotes: [
        'w:synthetic w:rule n:71',
        'w:synthetic | w:a w:plan w:pays w:within n:72 w:days |',
        'w:synthetic w:therapy w:group n:1',
        'w:synthetic w:payer w:q',
        'w:plan w:identifier w:synplan w:fix w:one',
        'w:synthetic w:statute w:zz i:1-2-3',
      ],
      rows: 3,
      markers: [1, 2, 3, 4, 5, 6],
    });
  });

  it('never holds a quoted figure as an input of a role, and takes codes and modifiers from the clause and the statement alone (docs/adr/0086)', () => {
    const clause = narrativeFacts(
      assemblePacket(
        assemblyInput({
          practice: { practice_id: IDS.practice, name: 'SYNTHETIC PT 12345 GROUP 77', npi: null, tax_id_last4: null },
          citation: contractCitation({ quote: 'A level 2 appeal is raised within 90 days on page 9; 97530-GO is paid 45.50 per unit up to 12 units, 4 claims a year, 85% after 2025-01-01' }),
        }),
      ),
    );
    // The clause's words give 2 a level, 90 days, 9 a page, 12 units and 4 claims: none is the record's.
    expect(roles(clause, 'number', '2')).not.toContain('level');
    for (const value of ['90', '9', '12', '4']) {
      expect(roles(clause, 'number', value), value).toEqual([]);
    }
    expect(roles(clause, 'amount', '4550')).toEqual([]);
    expect(roles(clause, 'percent', '85')).toEqual([]);
    expect(roles(clause, 'date', '2025-01-01')).toEqual([]);
    // Its code and modifier are codes; the practice's 12345 is a number of its name, no code.
    expect([...clause.codes].sort()).toEqual(['97110', '97530']);
    expect([...clause.modifiers]).toEqual(['GO']);
    expect(quotes(clause, 'n:12345')).toBe(true);
    // The regulation's statement names codes too; its reference does not.
    const statement = narrativeFacts(assemblePacket(assemblyInput({ citation: { kind: 'regulation', method: 'MA_NONCONTRACTED', reference: 'SYNTHETIC RULE 97999', statement: 'It pays 97530-KX at the Medicare rate.' } })));
    expect([...statement.codes].sort()).toEqual(['97110', '97530']);
    expect([...statement.modifiers]).toEqual(['KX']);
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
    // The schedule's count of lines, when the pattern counts otherwise; and the pattern's own counts, each in its role.
    expect(roles(facts, 'number', '41')).toEqual([]);
    const recounted = holds({ ...content, pattern: { ...content.pattern, lines: 41, claims: 42, patients: 43, codes: content.pattern.codes.map((code) => ({ ...code, lines: 44 })) } });
    expect(roles(recounted, 'number', '3')).toEqual(['claim_row', 'lines', 'patient_row', 'row']);
    expect(roles(recounted, 'number', '41')).toEqual(['claim_row', 'lines', 'patient_row']);
    expect(roles(recounted, 'number', '42')).toEqual(['claim_row', 'claims', 'patient_row']);
    expect(roles(recounted, 'number', '43')).toEqual(['patient_row', 'patients']);
    expect(roles(recounted, 'number', '44')).toEqual(['lines']);
    // The pattern's first and last service dates, its percentages (as plain decimals) and each code it summarizes.
    const pattern = holds({ ...content, pattern: { ...content.pattern, first_service_date: '2019-01-02', last_service_date: '2019-01-03', contract_percentages: ['61.50'], codes: content.pattern.codes.map((code) => ({ ...code, procedure_code: '97999' })) } });
    expect(['2019-01-02', '2019-01-03'].map((date) => [roles(facts, 'date', date), roles(pattern, 'date', date)])).toEqual([
      [[], ['service_date']],
      [[], ['service_date']],
    ]);
    expect([roles(facts, 'percent', '61.5'), roles(pattern, 'percent', '61.5'), roles(pattern, 'percent', '61.50')]).toEqual([[], ['contract_percent'], []]);
    expect([facts.codes.has('97999'), pattern.codes.has('97999'), pattern.codes.has('97110')]).toEqual([false, true, true]);
    // A line's own code, the last day of its deadline at the first level and each step of its calculation.
    const lineParts = holds({
      ...content,
      lines: [{ ...first, procedure_code: '97998', deadline: { ...first.deadline, ends_on: '2036-09-09' }, calculation: { ...first.calculation, steps: [{ step: 'unit', amount_cents: '5101' }, ...first.calculation.steps] } }, ...rest],
    });
    expect([facts.codes.has('97998'), lineParts.codes.has('97998')]).toEqual([false, true]);
    expect([roles(facts, 'date', '2036-09-09'), roles(lineParts, 'date', '2036-09-09')]).toEqual([[], ['deadline']]);
    expect([roles(facts, 'amount', '5101'), roles(lineParts, 'amount', '5101')]).toEqual([[], ['calculation']]);
    // The dates an interest line states: when the payer received the claim and when it paid.
    const interestDates = holds({ ...content, interest: { ...interest, lines: [{ ...interestFirst, received_on: '2025-11-11', paid_on: '2025-11-12' }, ...interestRest] } });
    expect(['2025-11-11', '2025-11-12'].map((date) => [roles(facts, 'date', date), roles(interestDates, 'date', date)])).toEqual([
      [[], ['received_date']],
      [[], ['paid_date']],
    ]);
  });

  it('holds a contract window’s days as the window’s days whether or not its clause repeats them, and no days the window does not state', () => {
    const quiet = 'Disputes are raised within the contract window.';
    const days = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: 45, page: 7, quote: quiet })] })));
    expect(roles(days, 'number', '45')).toEqual(['window_days']);
    expect(roles(days, 'number', '7')).toEqual(['window_page']);
    // A window with no day count states none, and its clause holds none either.
    const none = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: null, quote: quiet })] })));
    expect([...none.roles.values()].some((held) => held.has('window_days'))).toBe(false);
    expect(roles(none, 'number', '1')).toContain('window_page');
    // A release record is no contract window: no days and no page of its own.
    const release = narrativeFacts(assemblePacket(assemblyInput({ deadlineSources: [{ kind: 'release_record', release_no: 900001, sha256: SHA, program: 'medicare', level: 'L2' }] })));
    expect([...release.roles.values()].some((held) => held.has('window_days') || held.has('window_page'))).toBe(false);
  });

  it('holds only whole cents of a calculation, and nothing for a rounding, a patient share or a rule the version does not state', () => {
    const content = assemblePacket(assemblyInput({ interest: { state: 'QQ', releaseNo: 900001, record: null } }));
    const [first, ...rest] = content.lines;
    if (first === undefined) {
      throw new Error('three lines');
    }
    const amounts = (changed: PacketContentV2) => values(narrativeFacts(changed), 'amount');
    const before = amounts(content);
    // A rounded amount is a figure; its unrounded amount with a fraction of a cent is not, nor is any part of it.
    const fraction = { ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: { rule: 'HALF_UP_CENT', unrounded_cents: '12345.6789', rounded_cents: '12346' } } }, ...rest] };
    expect(amounts(fraction)).toStrictEqual([...before, '12346'].sort());
    expect(roles(narrativeFacts(fraction), 'amount', '12346')).toEqual(['calculation']);
    // A whole unrounded amount, a negative one included, is a figure.
    const whole = amounts({ ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: { rule: 'HALF_UP_CENT', unrounded_cents: '-250', rounded_cents: '-250' } } }, ...rest] });
    expect(whole).toStrictEqual([...before, '-250'].sort());
    // No rounding and no patient share: no figure for either, and nothing else changes.
    const without = narrativeFacts({ ...content, lines: [{ ...first, calculation: { ...first.calculation, rounding: null, patient_share_cents: null } }, ...rest] });
    expect(values(without, 'amount')).toStrictEqual(before);
    // The release has no prompt-pay record for the state: the section states no rule's days, rate or statute.
    expect(content.interest).toMatchObject({ days_to_pay: null, annual_rate_percent: null, statute: null, total_cents: null });
    const facts = narrativeFacts(content);
    expect(values(facts, 'number').every((value) => /^\d+(\.\d+)?$/.test(value))).toBe(true);
    expect(values(facts, 'percent')).toStrictEqual([]);
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
      [(value: typeof nulled) => value.interest, 'statute'],
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
    expect(Object.keys(read(absent).roles).every((key) => !key.endsWith(':undefined') && !key.endsWith(':null'))).toBe(true);
  });

  it('holds none of the deadline and calculation figures for a tp-packet/1 version, which states none', () => {
    const current = assemblePacket(assemblyInput());
    const { deadline: _deadline, lines, ...rest } = current;
    const earlier: PacketContentV1 = { ...rest, format: 'tp-packet/1', lines: lines.map(({ deadline: _line, calculation: _calculation, ...item }) => item) };
    const facts = narrativeFacts(earlier);
    expect(roles(facts, 'amount', '1400')).toEqual([]);
    expect(roles(facts, 'number', '3650')).toEqual([]);
    expect([...facts.roles.values()].some((held) => held.has('window_days') || held.has('window_page') || held.has('calculation'))).toBe(false);
    expect(roles(narrativeFacts(current), 'amount', '1400')).toEqual(['patient_share']);
    // A tp-packet/2 version's window days are the window's days only, never a number of any other role.
    expect(roles(narrativeFacts(current), 'number', '3650')).toEqual(['window_days']);
    expect(values(facts, 'date')).toEqual(values(narrativeFacts(current), 'date'));
  });
});
