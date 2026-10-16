import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fc from 'fast-check';
import { cents, formatCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { type AssemblyLine, assemblePacket } from './assemble';
import { draftNarrative } from './draft';
import { narrativeFacts } from './facts';
import type { PacketContent } from './format';
import { scanText } from './scan';
import { assemblyInput, contractCitation, line } from './test-support';
import { type VerifierReport, identifierForms, verifyNarrative } from './verifier';
import { identifierSpans } from './verifier/mismatches';

/**
 * The verifier (PRD 12; PRD 14, draftPacketNarrative's verifier; test matrix CAS-08): every figure of
 * the narrative must be among the version's inputs, every sentence must carry a citation marker, and
 * nothing in its report repeats the narrative's text.
 */

const CAS08 = readFileSync(fileURLToPath(new URL('../../../fixtures/synthetic/CAS-08/narrative-draft.txt', import.meta.url)), 'utf8');
const EXPECTED = JSON.parse(readFileSync(fileURLToPath(new URL('../../../fixtures/synthetic/CAS-08/expected.json', import.meta.url)), 'utf8')) as {
  readonly outcome: { readonly verifier: { readonly fails: readonly string[]; readonly passes: readonly string[] } };
};

const content = assemblePacket(assemblyInput());
const facts = narrativeFacts(content);
const verify = (narrative: string, of: PacketContent = content, identifiers: readonly string[] = []) => verifyNarrative(narrative, narrativeFacts(of), identifiers);
const codes = (report: VerifierReport) => report.mismatches.map((mismatch) => mismatch.code);

/** The figures the report flags, as the narrative writes them. */
const flagged = (narrative: string, report: VerifierReport) => report.mismatches.filter((item) => item.code === 'figure_not_in_input').map((item) => narrative.slice(item.start, item.end));

describe('the CAS-08 narrative (a figure in no input record)', () => {
  it('fails on 1234.56 and on nothing else it states, and its uncited sentences fail too', () => {
    const report = verify(CAS08);
    expect(report.passed).toBe(false);
    expect(flagged(CAS08, report)).toEqual(EXPECTED.outcome.verifier.fails);
    const matched = scanText(CAS08)
      .figures.filter((figure) => !flagged(CAS08, report).includes(CAS08.slice(figure.start, figure.end)))
      .map((figure) => CAS08.slice(figure.start, figure.end).toLowerCase());
    for (const passes of EXPECTED.outcome.verifier.passes) {
      expect(matched).toContain(passes === '3' ? 'three' : passes);
    }
    // The draft has no citation markers, so each of its four sentences fails on that as well.
    expect(codes(report).filter((code) => code === 'sentence_without_citation')).toHaveLength(4);
  });

  it('passes once the invented figure is gone and every sentence cites its source', () => {
    const cited = CAS08.replace('SYNTHETIC packet narrative draft (no real patient, payer or claim).', 'SYNTHETIC packet narrative draft [1].')
      .replace('per unit.', 'per unit [1].')
      .replace('a shortfall of 90.00.', 'a shortfall of 90.00 [3].')
      .replace('The payer also withheld 1234.56 on these claims.\n', '');
    expect(verify(cited)).toMatchObject({ passed: true, mismatches: [] });
  });
});

describe('verifyNarrative', () => {
  it('fails a sentence without a marker, a marker naming no source and a placeholder naming no row', () => {
    expect(codes(verify('The lines were paid short.'))).toEqual(['sentence_without_citation']);
    expect(codes(verify('The lines were paid short [9].'))).toEqual(['unknown_citation']);
    expect(codes(verify('Claim {{claim_control_number:4}} was paid short [3].'))).toEqual(['unknown_placeholder']);
    expect(codes(verify('Claim {{date_of_birth:1}} was paid short [3].'))).toEqual(['unknown_placeholder']);
    expect(verify('Claim {{claim_control_number:3}} for {{patient_name:1}} was paid short [3].').passed).toBe(true);
  });

  it('fails an empty narrative', () => {
    expect(codes(verify(''))).toEqual(['empty_narrative']);
    expect(codes(verify('  \n\n ')).includes('empty_narrative')).toBe(true);
  });

  it('fails each kind of figure that is not in the input', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['The line on 2026-03-09 was short [3].', 'date'],
      ['It was paid in July 2026 [3].', 'month'],
      ['It was billed on March 20 [3].', 'month_day'],
      ['The 97530 lines were short [3].', 'code'],
      ['The 97110-KX lines were short [3].', 'modifier'],
      ['It billed 7 units [3].', 'number'],
      ['Eleven claims were short [3].', 'number'],
      ['It pays 85% of Medicare [1].', 'percent'],
      ['The shortfall is $91.00 [3].', 'amount'],
      ['Member SYN0042 was short [3].', 'identifier'],
    ];
    for (const [narrative, kind] of cases) {
      const report = verify(narrative);
      expect(report.mismatches.map((item) => [item.code, item.kind]), narrative).toEqual([['figure_not_in_input', kind]]);
    }
  });

  it('accepts every figure the inputs hold, in each form it can be written', () => {
    const narrative = [
      'The contract, version 1, page 2, effective January 1, 2026, pays 97110 at $50.00 per unit [1].',
      'Rule release 900001 priced the lines [2].',
      'Three claims of 97110 x 2 on March 5, 2026, 2026-03-06 and 3/7/2026 were allowed 70.00 each, $210.00 in all [3].',
      'They expected $300.00, a shortfall of 90.00 over 6 units in March 2026, paid on April 8 [3].',
    ].join(' ');
    expect(verify(narrative)).toMatchObject({ passed: true, mismatches: [] });
  });

  it('accepts figures the quoted clause and the statute hold as they hold them', () => {
    const quoted = assemblePacket(assemblyInput({ citation: { ...content.citation, quote: 'Section 4.2: 97110 is paid 50.00 per unit within 90 days under G.S. 58-3-225' } as PacketContent['citation'] }));
    expect(verify('Section 4.2 pays within 90 days under G.S. 58-3-225 [1].', quoted).passed).toBe(true);
    expect(verify('Section 4.3 pays within 91 days [1].', quoted).passed).toBe(false);
  });

  it('reports codes and positions only, never the narrative', () => {
    const narrative = 'Jane Synthetic paid short by 1234.56 on claim SYNCLAIM9 [3]. No citation here.';
    const report = verify(narrative);
    const stored = JSON.stringify(report);
    for (const word of ['Jane', 'Synthetic', '1234.56', 'SYNCLAIM9', 'citation here']) {
      expect(stored).not.toContain(word);
    }
    expect(Object.keys(report).sort()).toEqual(['checked', 'format', 'mismatches', 'narrative_sha256', 'passed', 'sentences']);
  });
});

// ---------------------------------------------------------------------------------------------------
// What a figure looks like, not how it is coded (the review's probes). Every non-ASCII character is
// written as a code point.
// ---------------------------------------------------------------------------------------------------

const cp = (...points: number[]) => String.fromCodePoint(...points);
/** Digits of `text` in the alphabet whose zero is `zero` (superscripts are not contiguous). */
const SUPERSCRIPT = [0x2070, 0xb9, 0xb2, 0xb3, 0x2074, 0x2075, 0x2076, 0x2077, 0x2078, 0x2079];
const inDigits = (zero: number | 'superscript', text: string) =>
  [...text].map((char) => (/\d/.test(char) ? cp(zero === 'superscript' ? (SUPERSCRIPT[Number.parseInt(char, 10)] ?? 0) : zero + Number.parseInt(char, 10)) : char)).join('');
/** Alphabets NFKC reads as 0 to 9 (fullwidth, mathematical bold, double-struck, monospace, subscript, superscript). */
const READ_ALPHABETS = [0xff10, 0x1d7ce, 0x1d7d8, 0x1d7f6, 0x2080, 'superscript'] as const;
/** Alphabets it does not (Arabic-Indic, extended Arabic-Indic, Devanagari, Bengali, Thai). */
const OTHER_ALPHABETS = [0x660, 0x6f0, 0x966, 0x9e6, 0xe50] as const;
const HIDDEN = [0x200b, 0x200c, 0x200d, 0x2060, 0xad, 0xfeff, 0x202a, 0x202e, 0x2066, 0x2069, 0x180e, 0x034f, 0xfe0f, 0xe000, 0x7, 0x2029] as const;

describe('figures in other characters', () => {
  it('fails every probe of the review: other digits, hidden characters, and figures in words', () => {
    const probes: readonly (readonly [string, string])[] = [
      [`The payer withheld $${inDigits(0xff10, '1,234.56')} [3].`, 'figure_not_in_input'],
      [`It affected ${inDigits(0xff10, '47')} claims [3].`, 'figure_not_in_input'],
      [`It affected ${inDigits(0x660, '47')} claims [3].`, 'unreadable_figure'],
      [`It affected ${inDigits('superscript', '47')} claims [3].`, 'figure_not_in_input'],
      [`It affected ${inDigits(0x1d7ce, '47')} claims [3].`, 'figure_not_in_input'],
      [`It affected 1${cp(0x200b)}11 claims [3].`, 'hidden_character'],
      [`It affected 1${cp(0xad)}1 claims [3].`, 'hidden_character'],
      ['It affected a dozen claims [3].', 'figure_not_in_input'],
      ['This is the fifth dispute [3].', 'figure_not_in_input'],
      ['It was billed on March ninth [3].', 'figure_not_in_input'],
      ['A score of claims were short [3].', 'figure_not_in_input'],
      ['It paid half the contract rate [1].', 'figure_not_in_input'],
      ['This is a level IV appeal [1].', 'figure_not_in_input'],
      [`It paid ${cp(0xbd)} the contract rate [1].`, 'figure_not_in_input'],
    ];
    for (const [narrative, code] of probes) {
      const report = verify(narrative);
      expect(report.passed, narrative).toBe(false);
      expect(codes(report), narrative).toContain(code);
    }
    // Read, a figure in words is checked like any other: twice is 2 (each line's units) and March fifth
    // a service date, both of which this content holds.
    expect(verify('Each line billed twice [3].').passed).toBe(true);
    expect(verify('A line was billed on March fifth [3].').passed).toBe(true);
  });

  it('reads a figure the input holds in compatibility digits as that figure, and says where a hidden one is', () => {
    expect(verify(`The shortfall is $${inDigits(0xff10, '90.00')} on ${inDigits(0x1d7ce, '3')} claims [3].`).passed).toBe(true);
    const split = `The shortfall is $9${cp(0x200b)}0.00 [3].`;
    const report = verify(split);
    expect(report.mismatches.map((item) => [item.code, split.slice(item.start, item.end)])).toEqual([['hidden_character', cp(0x200b)]]);
    const arabic = `The shortfall is ${inDigits(0x660, '90')} dollars [3].`;
    expect(verify(arabic).mismatches.map((item) => [item.code, item.sentence, arabic.slice(item.start, item.end)])).toEqual([['unreadable_figure', 0, inDigits(0x660, '90')]]);
  });
});

describe('the case’s own identifiers', () => {
  const identifiers = ['SYNTHETIC', 'JANE', 'ABCDEFGH', 'SYNCCN0001', 'SYNPCN0001', 'APRIL'];

  it('fails a narrative that names a patient, a member ID or a claim, whatever its case, and says only where', () => {
    for (const narrative of ['Jane Synthetic, a member of the plan, was underpaid [1].', 'Member ABCDEFGH was underpaid [1].', 'Claim syncCn0001 was paid short [3].', 'APRIL asked for the review [1].']) {
      const report = verify(narrative, content, identifiers);
      expect(report.passed, narrative).toBe(false);
      expect(codes(report).filter((code) => code === 'identifier_in_narrative').length, narrative).toBeGreaterThan(0);
      for (const identifier of identifiers) {
        expect(JSON.stringify(report).toLowerCase()).not.toContain(identifier.toLowerCase());
      }
    }
    const named = 'Jane Synthetic was underpaid [1].';
    expect(verify(named, content, identifiers).mismatches.filter((item) => item.code === 'identifier_in_narrative').map((item) => named.slice(item.start, item.end))).toEqual(['Jane', 'Synthetic']);
    expect(verify(named, content, ['JANE SYNTHETIC']).mismatches.filter((item) => item.code === 'identifier_in_narrative').map((item) => named.slice(item.start, item.end))).toEqual(['Jane Synthetic']);
  });

  it('matches whole words only, leaves a month of a date alone, and ignores placeholders and one-letter parts', () => {
    expect(verify('The synthetics were reviewed [1].', content, identifiers).passed).toBe(true);
    expect(verify('It was paid in April 2026 [3].', content, identifiers).passed).toBe(true);
    expect(verify('Claim {{claim_control_number:1}} for {{patient_name:1}} was paid short [3].', content, identifiers).passed).toBe(true);
    expect(verify('The plan paid short [1].', content, ['Q', 'A.', '']).passed).toBe(true);
    expect(verify(`J${cp(0xff41)}ne was underpaid [1].`, content, ['JANE']).passed).toBe(false);
  });
});

describe('the edges of the check', () => {
  const at = (narrative: string, report: VerifierReport) => report.mismatches.map((item) => [item.code, item.sentence, narrative.slice(item.start, item.end)]);

  it('says where each mismatch is, in the order the narrative holds them', () => {
    expect(verify('').mismatches).toEqual([{ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: 0 }]);
    expect(verify('  \n\n ').mismatches).toEqual([{ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: 5 }]);
    const second = 'The lines were paid short [3]. 1234.56 was withheld [3].';
    expect(at(second, verify(second))).toEqual([['figure_not_in_input', 1, '1234.56']]);
    // A hidden character is found before the figures are read, and still reported after an earlier figure.
    const hidden = `Paid 1234.56 short${cp(0x200b)} [3].`;
    expect(at(hidden, verify(hidden))).toEqual([
      ['figure_not_in_input', 0, '1234.56'],
      ['hidden_character', 0, cp(0x200b)],
    ]);
    // A figure and its uncited sentence start together: the shorter span first.
    const uncited = '1234.56 was withheld.';
    expect(at(uncited, verify(uncited))).toEqual([
      ['figure_not_in_input', 0, '1234.56'],
      ['sentence_without_citation', 0, uncited],
    ]);
  });

  it('takes a marker at a sentence’s start as its citation, and fails any marker naming a source the version lacks', () => {
    expect(verify('[3] The lines were paid short.').passed).toBe(true);
    expect(codes(verify('The lines were paid short [1, 9].'))).toEqual(['unknown_citation']);
    expect(codes(verify('The lines were paid short [1, 13].'))).toEqual(['unknown_citation']);
    expect(codes(verify('The lines were paid short [12].'))).toEqual(['unknown_citation']);
    for (const marker of ['[1, 3]', '[1 ,3]', '[1,  3]', '[1,3]']) {
      expect(verify(`The lines were paid short ${marker}.`).passed, marker).toBe(true);
    }
    expect(codes(verify('Claim {{patient_name:0}} was paid short [3].'))).toEqual(['unknown_placeholder']);
  });

  it('names the kind of each mismatch, and counts the figures, placeholders and markers it checked', () => {
    const narrative = 'Claim {{patient_name:9}} of Jane was paid 1234.56 short [9].';
    const report = verify(narrative, content, ['JANE']);
    expect(report.mismatches.map((item) => [item.code, item.kind, narrative.slice(item.start, item.end)])).toEqual([
      ['unknown_placeholder', 'placeholder', '{{patient_name:9}}'],
      ['identifier_in_narrative', 'identifier', 'Jane'],
      ['figure_not_in_input', 'amount', '1234.56'],
      ['unknown_citation', 'citation', '[9]'],
    ]);
    expect(report.checked).toBe(3);
    expect(verify('Claim {{patient_name:1}} and {{member_id:2}} were paid 70.00 and 90.00 short [1] [3].').checked).toBe(6);
  });

  it('orders mismatches that start together by where they end', () => {
    const narrative = 'Claim 12345-678 was paid short [3].';
    const report = verify(narrative, content, ['12345']);
    expect(report.mismatches.map((item) => [item.code, narrative.slice(item.start, item.end)])).toEqual([
      ['identifier_in_narrative', '12345'],
      ['figure_not_in_input', '12345-678'],
    ]);
    expect(identifierSpans('Jo and Jane Synthetic', ['JANE SYNTHETIC', 'JO'], [])).toEqual([
      { start: 0, end: 2 },
      { start: 7, end: 21 },
    ]);
  });

  it('accepts a five-digit figure read as a code when the inputs hold it as a number', () => {
    const paged = assemblePacket(assemblyInput({ citation: contractCitation({ page: 12345 }) }));
    expect(verify('The clause is on page 12345 [1].', paged).passed).toBe(true);
    expect(verify('The clause is on page 12345 [1].').mismatches.map((item) => [item.code, item.kind])).toEqual([['figure_not_in_input', 'code']]);
  });

  it('compares each identifier whole and word by word, in NFKC, longest first', () => {
    expect(identifierForms([' Synthetic, Jane ', 'Jo', 'AB/CD;EF', 'Q R'])).toEqual(['Synthetic, Jane', 'Synthetic', 'AB/CD;EF', 'Jane', 'Q R', 'AB', 'CD', 'EF', 'Jo']);
    expect(identifierForms([cp(0xff2a, 0xff21, 0xff2e, 0xff25)])).toEqual(['JANE']);
    const spans = (narrative: string, identifiers: readonly string[]) =>
      verify(narrative, content, identifiers)
        .mismatches.filter((item) => item.code === 'identifier_in_narrative')
        .map((item) => narrative.slice(item.start, item.end));
    expect(spans('Jane Synthetic was underpaid [1].', ['JANE  SYNTHETIC'])).toEqual(['Jane Synthetic']);
    expect(spans('Jane   Synthetic was underpaid [1].', ['JANE SYNTHETIC'])).toEqual(['Jane   Synthetic']);
    expect(spans('Synthetic, Jane was underpaid [1].', ['SYNTHETIC, JANE'])).toEqual(['Synthetic, Jane']);
    expect(spans('Jo was underpaid [1].', ['JO SYNTHETIC'])).toEqual(['Jo']);
    // Right beside a marker it is still a word of its own.
    expect(spans('The lines of Jane[3] were paid short.', ['JANE'])).toEqual(['Jane']);
    expect(spans('[3]Jane was paid short.', ['JANE'])).toEqual(['Jane']);
    // A month's name in any date is the date.
    expect(verify('A line was billed on March 5 [3].', content, ['MARCH']).passed).toBe(true);
    expect(verify('A line was billed on March 5, 2026 [3].', content, ['MARCH']).passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------------------------------

const CODES = ['97110', '97112', '97140', '97530', 'G0283'] as const;
const MODIFIERS = ['GP', '59', 'KX'] as const;

const lineArbitrary = fc
  .record({
    code: fc.constantFrom(...CODES),
    modifiers: fc.subarray([...MODIFIERS]),
    units: fc.integer({ min: 1, max: 4 }),
    perUnit: fc.integer({ min: 1000, max: 20_000 }),
    short: fc.integer({ min: 1, max: 999 }),
    day: fc.integer({ min: 1, max: 28 }),
    month: fc.integer({ min: 1, max: 9 }),
    claim: fc.integer({ min: 1, max: 4 }),
  })
  .map(
    (draw): Omit<AssemblyLine, 'serviceLineId' | 'pricedLineId'> => {
      const expected = BigInt(draw.perUnit * draw.units);
      const observed = expected - BigInt(draw.short * draw.units);
      return {
        claimId: `20000000-0000-4000-8000-${draw.claim.toString(16).padStart(12, '0')}`,
        pricingRunId: '00000000-0000-4000-8000-000000000009',
        patientKey: `40000000-0000-4000-8000-${draw.claim.toString(16).padStart(12, '0')}`,
        serviceDate: `2026-${String(draw.month).padStart(2, '0')}-${String(draw.day).padStart(2, '0')}`,
        procedureCode: draw.code,
        modifiers: draw.modifiers,
        units: String(draw.units),
        expectedCents: cents(expected),
        observedCents: cents(observed),
        varianceCents: cents(expected - observed),
        paidCents: cents((observed * 8n) / 10n),
        paidOn: '2026-10-01',
        receivedOn: null,
        windowEndsOn: '2027-03-01',
      };
    },
  );

const contentArbitrary = fc.array(lineArbitrary, { minLength: 1, maxLength: 8 }).map((lines) =>
  assemblePacket(
    assemblyInput({
      lines: lines.map((item, index) => ({
        ...line(index + 1),
        ...item,
        serviceLineId: `10000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
        pricedLineId: `30000000-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
      })),
    }),
  ),
);

const FILLER = ['the', 'payer', 'paid', 'these', 'lines', 'under', 'its', 'contract', 'short', 'of', 'what', 'it', 'requires', 'and'] as const;

describe('properties of the verifier', () => {
  it('passes the code-built draft of any pattern', () => {
    fc.assert(
      fc.property(contentArbitrary, (generated) => {
        const report = verify(draftNarrative(generated), generated);
        expect(report.mismatches).toEqual([]);
        expect(report.passed).toBe(true);
      }),
    );
  });

  it('fails a draft into which any amount not in the input is written', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.bigInt({ min: 1n, max: 10_000_000n }), fc.boolean(), (generated, amount, sign) => {
        fc.pre(!narrativeFacts(generated).amounts.has(amount.toString()));
        const written = `${sign ? '$' : ''}${formatCents(cents(amount))}`;
        const narrative = `${draftNarrative(generated)} The payer kept ${written} [3].`;
        const report = verify(narrative, generated);
        expect(report.passed).toBe(false);
        expect(flagged(narrative, report)).toEqual([written]);
      }),
    );
  });

  it('fails a draft into which any count not in the input is written', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.integer({ min: 2, max: 100_000 }), (generated, count) => {
        fc.pre(!narrativeFacts(generated).numbers.has(String(count)));
        const narrative = `${draftNarrative(generated)} It affected ${String(count)} visits [3].`;
        expect(flagged(narrative, verify(narrative, generated))).toEqual([String(count)]);
      }),
    );
  });

  it('fails a draft one of whose sentences loses its marker', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.nat(), (generated, pick) => {
        const sentences = draftNarrative(generated).split(/(?<=\])\. /);
        const index = pick % sentences.length;
        const stripped = sentences.map((sentence, at) => (at === index ? sentence.replace(/ \[\d+\]/g, '') : sentence)).join('. ');
        expect(codes(verify(stripped, generated))).toContain('sentence_without_citation');
      }),
    );
  });

  it('passes any narrative made of the inputs’ own figures, prose and markers', () => {
    fc.assert(
      fc.property(
        contentArbitrary,
        fc.array(fc.tuple(fc.array(fc.constantFrom(...FILLER), { minLength: 1, maxLength: 4 }), fc.nat(), fc.constantFrom(1, 2, 3)), { minLength: 1, maxLength: 6 }),
        (generated, sentences) => {
          const own = narrativeFacts(generated);
          const pool = [
            ...[...own.amounts].filter((amount) => !amount.startsWith('-')).map((amount) => `$${formatCents(cents(BigInt(amount)))}`),
            ...[...own.dates],
            ...[...own.codes],
            ...[...own.numbers].filter((number) => /^\d+$/.test(number)),
          ];
          const narrative = sentences
            .map(([words, pick, marker]) => `${words.join(' ')} ${pool[pick % pool.length] ?? ''} [${String(marker)}].`)
            .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
            .join(' ');
          expect(verify(narrative, generated).mismatches).toEqual([]);
        },
      ),
    );
  });

  it('fails a draft into which a count not in the input is written in any other digits', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.integer({ min: 2, max: 100_000 }), fc.constantFrom(...READ_ALPHABETS, ...OTHER_ALPHABETS), (generated, count, alphabet) => {
        fc.pre(!narrativeFacts(generated).numbers.has(String(count)));
        const report = verify(`${draftNarrative(generated)} It affected ${inDigits(alphabet, String(count))} visits [3].`, generated);
        expect(report.passed).toBe(false);
        expect(codes(report)).toContain((OTHER_ALPHABETS as readonly (number | string)[]).includes(alphabet) ? 'unreadable_figure' : 'figure_not_in_input');
      }),
    );
  });

  it('fails a passing draft into which any hidden character is put anywhere', () => {
    fc.assert(
      fc.property(contentArbitrary, fc.constantFrom(...HIDDEN), fc.nat(), (generated, hidden, pick) => {
        const draft = draftNarrative(generated);
        const index = pick % (draft.length + 1);
        const report = verify(`${draft.slice(0, index)}${cp(hidden)}${draft.slice(index)}`, generated);
        expect(report.passed).toBe(false);
        // The span is the character's cluster: a joiner or a selector belongs to the character before it.
        const spans = report.mismatches.filter((item) => item.code === 'hidden_character');
        expect(spans).toHaveLength(1);
        expect(spans[0]?.start).toBeLessThanOrEqual(index);
        expect(spans[0]?.end).toBeGreaterThanOrEqual(index + cp(hidden).length);
      }),
    );
  });

  it('fails a passing draft into which any of the case’s identifiers is written, in any case', () => {
    const name = fc.string({ unit: fc.constantFrom(...'BCDFGHJKLMNPQRSTVWXZ'), minLength: 4, maxLength: 12 }).map((letters) => `QZ${letters}`);
    fc.assert(
      fc.property(contentArbitrary, name, fc.array(fc.boolean(), { minLength: 14, maxLength: 14 }), (generated, identifier, lower) => {
        const written = [...identifier].map((char, at) => (lower[at] === true ? char.toLowerCase() : char)).join('');
        const draft = draftNarrative(generated);
        expect(verify(draft, generated, [identifier]).passed).toBe(true);
        const narrative = `${draft} The payer told ${written} so [3].`;
        const report = verify(narrative, generated, [identifier]);
        expect(report.mismatches.map((item) => [item.code, narrative.slice(item.start, item.end)])).toEqual([['identifier_in_narrative', written]]);
      }),
    );
  });

  it('is deterministic and hashes the narrative it read', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (narrative) => {
        expect(verify(narrative)).toEqual(verify(narrative));
        expect(verify(narrative).narrative_sha256).toMatch(/^[0-9a-f]{64}$/);
      }),
    );
  });
});

it('holds the facts of the CAS-08 content', () => {
  expect([...facts.amounts]).toEqual(expect.arrayContaining(['5000', '21000', '30000', '9000']));
  expect(facts.amounts.has('123456')).toBe(false);
});
