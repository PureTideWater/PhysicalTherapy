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
import { assemblyInput, line } from './test-support';
import { type VerifierReport, verifyNarrative } from './verifier';

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
const verify = (narrative: string, of: PacketContent = content) => verifyNarrative(narrative, narrativeFacts(of));
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
