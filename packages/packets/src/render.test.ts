import { formatUsd, formatUsdPlain, parseCents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { ExplainShapeError, type Segment, formatFigure, segmentText } from './explain/figures';
import { type FactEntry, factCatalog } from './fact-catalog';
import { FACT_CONTENTS } from './fact-contents.test-support';
import { factWords } from './fact-words';
import type { PacketContent } from './format';
import { factPlaceholder } from './placeholders';
import { type RenderedFacts, renderFact, renderFacts } from './render';
import { assemblyInput, contractCitation, contractWindowSource, line } from './test-support';

/**
 * The renderer of a narrative's fact tokens (design lane-b-packet-figure-placeholders, section 5; test matrix CAS-55,
 * the render half): each token becomes its fact's phrase with its value printed by code, amounts by formatUsdPlain
 * (equal to formatUsd en-US), the pattern's and codes' totals as stored, a set of rows' sums as code computes them in
 * bigint cents and decimal units; identifier placeholders stay for the export to fill; anything else in braces renders
 * nothing; the span map places every piece; rendering is idempotent.
 */

const rendered = (template: string, content: PacketContent): string => {
  const result = renderFacts(template, content);
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.problems)}`);
  }
  return result.text;
};
/**
 * What a figure's source names, printed in its form: the value at its path in the content; for a path read in each of
 * its rows (`#`), the lines at those rows (form `count`) or the one value they all hold; amounts by formatUsdPlain.
 * Null for a sum code made over the rows (an amount, units), which the property test holds equal to the rows' own sum.
 */
function resolved(content: PacketContent, entry: FactEntry, segment: Extract<Segment, { figure: string }>): string | null {
  const { path, form, rows } = segment.source;
  const at = (value: unknown, keys: readonly (string | number)[]): unknown => keys.reduce<unknown>((item, key) => (item as Record<string | number, unknown>)[key], value);
  const hash = path.indexOf('#');
  let value: unknown;
  if (hash === -1) {
    value = at(content, path);
  } else {
    const lines = (rows ?? []).map((row) => content.lines.find((item) => item.row === row));
    expect(lines.every((item) => item !== undefined) && lines.length > 0, JSON.stringify(rows)).toBe(true);
    const read = lines.map((item) => at(item, path.slice(hash + 1)));
    if (form === 'count' && hash === path.length - 1) {
      value = read;
    } else if (!(entry.summed && form !== 'verbatim') && new Set(read.map((item) => JSON.stringify(item))).size === 1) {
      value = read[0];
    } else {
      return null;
    }
  }
  return form === 'dollars' ? formatUsdPlain(parseCents(value as string)) : formatFigure(value, form);
}
const phrase = (id: string, content: PacketContent) => rendered(factPlaceholder(id), content);
const problems = (template: string, content: PacketContent) => {
  const result = renderFacts(template, content);
  return result.ok ? [] : result.problems;
};

/** Two codes: 97110 on rows 1 and 2, 97112 on row 3; rows 1 and 3 one claim; units 2, 2.5 and 1. */
const twoCodes = () =>
  assemblePacket(
    assemblyInput({
      lines: [
        line(1, { claimId: 'claim-a' }),
        line(2, { units: '2.5', claimId: 'claim-b' }),
        line(3, { procedureCode: '97112', units: '1', claimId: 'claim-a', modifiers: ['GP', 'KX'] }),
      ],
    }),
  );

/**
 * CAS-55's render half, each a named example: the template, the packet and what the payer reads, word for word.
 */
const CAS_55_RENDER: readonly { readonly id: string; readonly content: () => PacketContent; readonly template: string; readonly reads: string }[] = [
  { id: 'CAS55-R01 the pattern’s stored total, in dollars by code', content: FACT_CONTENTS.base, template: 'The remittances show {{fact:pattern.allowed}} [3].', reads: 'The remittances show the allowed amount of $210.00 in total for the 3 lines [3].' },
  { id: 'CAS55-R02 one value every line holds', content: FACT_CONTENTS.base, template: '{{fact:pattern.allowed_each}}', reads: 'the allowed amount of $70.00 per line on each of the 3 lines' },
  { id: 'CAS55-R03 a code’s stored total with its lines named', content: twoCodes, template: 'The payer owes {{fact:code.97110.variance}} [3].', reads: 'The payer owes a shortfall of $60.00 in total for the 2 lines of 97110 [3].' },
  { id: 'CAS55-R04 a set of rows summed in cents', content: FACT_CONTENTS.severalCodes, template: '{{fact:lines.1+2+6.paid}}', reads: 'payment of $98.00 in total for lines 1, 2 and 6' },
  { id: 'CAS55-R05 a claim named by its first row’s placeholder', content: FACT_CONTENTS.severalCodes, template: '{{fact:claim.5.expected}}', reads: 'the contract amount of $240.00 in total for the 2 lines of claim {{claim_control_number:5}}' },
  { id: 'CAS55-R06 units as an exact decimal', content: twoCodes, template: '{{fact:pattern.units}}', reads: '5.5 units in total for the 3 lines' },
  { id: 'CAS55-R07 units summed over a set of rows', content: twoCodes, template: '{{fact:lines.2+3.units}}', reads: '3.5 units in total for lines 2 and 3' },
  { id: 'CAS55-R08 a fixed schedule’s rate per unit', content: FACT_CONTENTS.base, template: '{{fact:contract.rate}}', reads: 'the contract’s fee-schedule amount of $50.00 per unit' },
  { id: 'CAS55-R09 a per-visit rate', content: FACT_CONTENTS.perVisit, template: '{{fact:contract.rate}}', reads: 'the contract’s amount of $90.00 per visit' },
  {
    id: 'CAS55-R10 a lesser-of rule’s schedule side',
    content: FACT_CONTENTS.lesserOf,
    template: '{{fact:contract.rate}}',
    reads: 'the contract’s fee-schedule amount of $60.00 per unit, the schedule side of the contract’s lesser-of rule',
  },
  { id: 'CAS55-R11 the service dates', content: FACT_CONTENTS.severalCodes, template: '{{fact:pattern.service_dates}}', reads: 'service dates from 2026-03-02 to 2026-03-10' },
  { id: 'CAS55-R12 one service date', content: FACT_CONTENTS.oneLine, template: '{{fact:pattern.service_dates}}', reads: 'the service date 2026-03-05' },
  { id: 'CAS55-R13 modifiers from the content', content: twoCodes, template: '{{fact:code.97112.modifiers}}', reads: 'modifiers GP and KX' },
  { id: 'CAS55-R14 a code from the content, never from its id', content: FACT_CONTENTS.severalCodes, template: '{{fact:code.g0283}} and {{fact:code.0275t}}', reads: 'G0283 and 0275T' },
  { id: 'CAS55-R15 one line, singular', content: FACT_CONTENTS.severalCodes, template: '{{fact:code.g0283.units}}', reads: '1 unit in total for the 1 line of G0283' },
  { id: 'CAS55-R16 a day count, grouped', content: FACT_CONTENTS.base, template: '{{fact:deadline.window_days}}', reads: 'the contract’s dispute window of 3,650 days' },
  { id: 'CAS55-R17 a line’s own date', content: FACT_CONTENTS.severalCodes, template: '{{fact:line.2.received_on}}', reads: 'the date 2026-02-10 the payer received the claim of line 2' },
  { id: 'CAS55-R18 identifier placeholders stay for the export', content: FACT_CONTENTS.base, template: 'For {{patient_name:2}}: {{fact:line.2.paid}} [3].', reads: 'For {{patient_name:2}}: payment of $56.00 for line 2 [3].' },
  { id: 'CAS55-R19 no token: the text as written', content: FACT_CONTENTS.base, template: 'The payer paid $56.00 on 3 lines [3].', reads: 'The payer paid $56.00 on 3 lines [3].' },
  { id: 'CAS55-R20 prompt-pay interest where stated', content: FACT_CONTENTS.severalCodes, template: '{{fact:interest.total}}', reads: 'prompt-pay interest of $12.56 in total for the 6 lines it is stated on' },
];

describe('CAS-55, the render half', () => {
  for (const example of CAS_55_RENDER) {
    it(example.id, () => {
      const content = example.content();
      expect(rendered(example.template, content)).toBe(example.reads);
      // Idempotent: rendering the rendered text again changes nothing.
      expect(rendered(rendered(example.template, content), content)).toBe(example.reads);
    });
  }

  it('prints every amount as formatUsd en-US prints it', () => {
    for (const make of Object.values(FACT_CONTENTS)) {
      const content = make();
      for (const entry of factCatalog(content).entries.filter((item) => item.kind === 'amount')) {
        const figures = renderFact(content, entry).filter((segment) => 'figure' in segment && segment.source.form === 'dollars');
        expect(figures.map(segmentText), entry.id).toEqual([formatUsd(parseCents(entry.value as string), 'en-US')]);
      }
    }
  });
});

describe('a fact’s phrase', () => {
  it('holds no digit outside its slots, and names only slots the renderer fills', () => {
    for (const [key, words] of Object.entries(factWords().phrases) as [string, string][]) {
      expect(/\d/.test(words.replace(/<[a-z]+>/g, '')), key).toBe(false);
      for (const slot of words.match(/<[a-z]+>/g) ?? []) {
        expect(['<amount>', '<units>', '<lines>', '<claims>', '<patients>', '<days>', '<number>', '<percent>', '<text>', '<date>', '<from>', '<to>', '<code>', '<modifiers>', '<row>', '<rows>', '<claim>'], key).toContain(slot);
      }
    }
  });

  it('is rendered for every fact of every named packet, each value from the content at its path', () => {
    for (const make of Object.values(FACT_CONTENTS)) {
      const content = make();
      for (const entry of factCatalog(content).entries) {
        const segments = renderFact(content, entry);
        expect(segments.length, entry.id).toBeGreaterThan(0);
        for (const segment of segments) {
          if ('text' in segment) {
            expect(segment.text, entry.id).not.toBe('');
            expect(/\d/.test(segment.text.replace(/\{\{claim_control_number:\d+\}\}/g, '')), `${entry.id}: ${segment.text}`).toBe(false);
          }
          if ('figure' in segment) {
            expect(segment.source).toMatchObject({ from: 'content', slot: entry.id });
            expect(entry.paths.concat([['lines', '#']]).some((path) => JSON.stringify(path) === JSON.stringify(segment.source.path)), entry.id).toBe(true);
            expect('rows' in segment.source, entry.id).toBe(segment.source.path.includes('#'));
            const named = resolved(content, entry, segment);
            if (named !== null) {
              expect(named, `${entry.id}: ${JSON.stringify(segment.source)}`).toBe(segment.figure);
            }
          }
        }
      }
    }
  });

  it('marks a figure read in each of a set of rows with those rows', () => {
    const content = FACT_CONTENTS.severalCodes();
    const [figure] = renderFact(content, factCatalog(content).byId.get('claim.5.paid') as never).filter((segment) => 'figure' in segment);
    expect(figure).toEqual({ figure: '$120.00', source: { from: 'content', path: ['lines', '#', 'paid_cents'], form: 'dollars', slot: 'claim.5.paid', rows: [5, 6] } });
    const [stored] = renderFact(content, factCatalog(content).byId.get('pattern.expected') as never);
    expect(stored).toEqual({ text: 'the contract amount of ' });
  });

  it('sets codes and modifiers as codes, rows as row labels, and the claim as its placeholder', () => {
    const content = FACT_CONTENTS.severalCodes();
    const catalog = factCatalog(content);
    const segments = (id: string): readonly Segment[] => {
      const result = renderFacts(factPlaceholder(id), catalog) as Extract<RenderedFacts, { ok: true }>;
      return result.segments;
    };
    expect(segments('code.g0283.modifiers')).toEqual([{ text: 'modifiers ' }, { code: 'GP' }, { text: ' and ' }, { code: 'KX' }]);
    expect(segments('code.0275t.modifiers')).toEqual([{ text: 'modifier ' }, { code: '59' }]);
    expect(segments('code.g0283')).toEqual([{ code: 'G0283' }]);
    expect(segments('line.4.paid')).toEqual([
      { text: 'payment of ' },
      { figure: '$84.00', source: { from: 'content', path: ['lines', 3, 'paid_cents'], form: 'dollars', slot: 'line.4.paid' } },
      { text: ' for line ' },
      { label: '4', of: 'row' },
    ]);
    expect(segments('lines.1+2+6.units').slice(-6)).toEqual([{ text: ' units in total for lines ' }, { label: '1', of: 'row' }, { text: ', ' }, { label: '2', of: 'row' }, { text: ' and ' }, { label: '6', of: 'row' }]);
    expect(segments('claim.5.lines')).toEqual([
      { text: 'the ' },
      { figure: '2', source: { from: 'content', path: ['lines', '#'], form: 'count', slot: 'claim.5.lines', rows: [5, 6] } },
      { text: ' lines of claim {{claim_control_number:5}}' },
    ]);
    expect(segments('pattern.claims')).toEqual([{ text: 'the ' }, { figure: '3', source: { from: 'content', path: ['pattern', 'claims'], form: 'integer', slot: 'pattern.claims' } }, { text: ' claims of the schedule' }]);
    expect(segments('pattern.patients')[1]).toMatchObject({ figure: '3', source: { path: ['pattern', 'patients'] } });
    expect(segments('code.97110.units').slice(0, 2)).toEqual([{ figure: '6.5', source: { from: 'content', path: ['pattern', 'codes', 2, 'units'], form: 'units', slot: 'code.97110.units' } }, { text: ' units in total for the ' }]);
    expect(segments('code.97110.lines')).toEqual([
      { text: 'the ' },
      { figure: '3', source: { from: 'content', path: ['pattern', 'codes', 2, 'lines'], form: 'integer', slot: 'code.97110.lines' } },
      { text: ' lines of ' },
      { code: '97110' },
    ]);
    expect(segments('code.97110.variance').at(-1)).toEqual({ code: '97110' });
    expect(segments('pattern.service_dates')).toEqual([
      { text: 'service dates from ' },
      { figure: '2026-03-02', source: { from: 'content', path: ['pattern', 'first_service_date'], form: 'verbatim', slot: 'pattern.service_dates' } },
      { text: ' to ' },
      { figure: '2026-03-10', source: { from: 'content', path: ['pattern', 'last_service_date'], form: 'verbatim', slot: 'pattern.service_dates' } },
    ]);
  });

  it('prints each kind in its form, its noun singular for one', () => {
    const base = FACT_CONTENTS.base();
    expect(phrase('citation.version', base)).toBe('version 1 of the contract');
    expect(phrase('citation.page', base)).toBe('page 2 of the contract');
    expect(phrase('citation.effective', base)).toBe('the contract version in effect from 2026-01-01');
    expect(phrase('citation.effective', FACT_CONTENTS.perVisit())).toBe('the contract version in effect from 2026-01-01 to 2026-12-31');
    expect(phrase('citation.quote', base)).toBe('“97110 is paid 50.00 per unit”');
    expect(phrase('citation.reference', FACT_CONTENTS.regulation())).toBe('42 CFR 422.214');
    expect(phrase('release.no.1', base)).toBe('rule release 900001');
    expect(phrase('packet.level', FACT_CONTENTS.perVisit())).toBe('dispute level 2');
    expect(phrase('packet.as_of', base)).toBe('the packet date 2026-10-16');
    expect(phrase('deadline.ends_on', base)).toBe('the dispute deadline 2036-04-05');
    expect(phrase('deadline.window_page', base)).toBe('page 1 of the contract’s dispute window clause');
    expect(phrase('contract.percent.1', FACT_CONTENTS.percent())).toBe('the contract’s percentage of 112.5 percent');
    expect(phrase('contract.year.1', FACT_CONTENTS.percent())).toBe('the contract’s fee-schedule year 2025');
    expect(phrase('pattern.lines', base)).toBe('the 3 lines of the schedule');
    expect(phrase('pattern.lines', FACT_CONTENTS.oneLine())).toBe('the 1 line of the schedule');
    expect(phrase('pattern.claims', FACT_CONTENTS.oneLine())).toBe('the 1 claim of the schedule');
    expect(phrase('pattern.patients', FACT_CONTENTS.oneLine())).toBe('the 1 patient of the schedule');
    expect(phrase('pattern.units', FACT_CONTENTS.oneLine())).toBe('2 units in total for the 1 line');
    expect(phrase('pattern.units_each', base)).toBe('2 units per line on each of the 3 lines');
    expect(phrase('code.97112.units', twoCodes())).toBe('1 unit in total for the 1 line of 97112');
    expect(phrase('line.1.units', assemblePacket(assemblyInput({ lines: [line(1, { units: '1' }), line(2)] })))).toBe('1 unit for line 1');
    expect(phrase('line.2.units', twoCodes())).toBe('2.5 units for line 2');
    expect(phrase('line.1.service_date', base)).toBe('the service date 2026-03-05 of line 1');
    expect(phrase('line.1.paid_on', base)).toBe('the payment date 2026-04-08 of line 1');
    expect(phrase('line.1.window_ends_on', base)).toBe('the dispute window ending 2036-04-05 for line 1');
    expect(phrase('line.1.code', base)).toBe('97110');
    expect(phrase('line.1.patient_share', base)).toBe('the patient share of $14.00 for line 1');
    expect(phrase('interest.rate', FACT_CONTENTS.severalCodes())).toBe('the prompt-pay interest rate of 9 percent a year');
    expect(phrase('interest.days_to_pay', FACT_CONTENTS.severalCodes())).toBe('the prompt-pay rule’s 33 days to pay');
    expect(phrase('interest.release', FACT_CONTENTS.severalCodes())).toBe('the prompt-pay rule of rule release 900001');
    const oneDay = assemblePacket(assemblyInput({ deadlineSources: [contractWindowSource({ days: 1 })] }));
    expect(phrase('deadline.window_days', oneDay)).toBe('the contract’s dispute window of 1 day');
    const large = assemblePacket(assemblyInput({ citation: contractCitation({ parameters: { amount_cents: '123456789012' } }) }));
    expect(phrase('contract.rate', large)).toBe('the contract’s fee-schedule amount of $1,234,567,890.12 per unit');
    expect(phrase('code.0275t.service_dates', FACT_CONTENTS.severalCodes())).toBe('the service date 2026-03-06 for the 1 line of 0275T');
    expect(phrase('claim.5.service_dates', FACT_CONTENTS.severalCodes())).toBe('service dates from 2026-03-06 to 2026-03-10 for the 2 lines of claim {{claim_control_number:5}}');
    expect(phrase('lines.2+3.service_dates', FACT_CONTENTS.severalCodes())).toBe('service dates from 2026-03-03 to 2026-03-04 for lines 2 and 3');
  });
});

describe('renderFacts', () => {
  const base = FACT_CONTENTS.base();

  it('renders nothing for a token the catalog does not hold or names by a lower subject, or any other braced run', () => {
    const template = 'A {{fact:line.9.paid}} b {{fact:pattern.paid}} c {{fact:code.97110.variance}}.';
    const at = (token: string) => [template.indexOf(token), template.indexOf(token) + token.length];
    expect(problems(template, base)).toEqual([
      { code: 'unknown_fact', span: at('{{fact:line.9.paid}}'), id: 'line.9.paid', canonical: null },
      { code: 'fact_not_canonical', span: at('{{fact:code.97110.variance}}'), id: 'code.97110.variance', canonical: 'pattern.variance' },
    ]);
    expect(problems('{{fact:Pattern.paid}}', base)).toEqual([{ code: 'unknown_fact', span: [0, 21], id: 'Pattern.paid', canonical: null }]);
    expect(problems('{{ fact }} and {{}}', base)).toEqual([
      { code: 'unknown_fact', span: [0, 10], id: null, canonical: null },
      { code: 'unknown_fact', span: [15, 19], id: null, canonical: null },
    ]);
    expect(problems('a {{ b', base)).toEqual([{ code: 'unknown_fact', span: [2, 4], id: null, canonical: null }]);
    expect(problems('a }} b', base)).toEqual([{ code: 'unknown_fact', span: [2, 4], id: null, canonical: null }]);
    expect(problems('{{{fact:pattern.paid}}', base)).toEqual([
      { code: 'unknown_fact', span: [0, 2], id: null, canonical: null },
      { code: 'unknown_fact', span: [20, 22], id: null, canonical: null },
    ]);
    expect(problems('{a} {b}', base)).toEqual([]);
    expect(problems('{{note:pattern.paid}}', base)).toEqual([{ code: 'unknown_fact', span: [0, 21], id: null, canonical: null }]);
    expect(problems(`{{fact:pattern.${'a'.repeat(96)}}}`, base)).toEqual([{ code: 'unknown_fact', span: [0, 113], id: `pattern.${'a'.repeat(96)}`, canonical: null }]);
    expect(problems('{{claim_control_number:3}} {{member_id:1}} {{patient_name:12}} {{member_id:123456}}', base)).toEqual([]);
    expect(problems('{{member_id:1234567}} {{member_id:}} {{:1}}', base)).toEqual([
      { code: 'unknown_fact', span: [0, 21], id: null, canonical: null },
      { code: 'unknown_fact', span: [22, 36], id: null, canonical: null },
      { code: 'unknown_fact', span: [37, 43], id: null, canonical: null },
    ]);
  });

  it('maps each piece of the template to the text it became', () => {
    const pieces = ['Under ', '{{fact:contract.rate}}', ', the payer owes ', '{{fact:pattern.variance}}', ' for {{member_id:2}} [1].'];
    const phrases = ['Under ', 'the contract’s fee-schedule amount of $50.00 per unit', ', the payer owes ', 'a shortfall of $90.00 in total for the 3 lines', ' for {{member_id:2}} [1].'];
    const template = pieces.join('');
    const result = renderFacts(template, base) as Extract<RenderedFacts, { ok: true }>;
    expect(result.text).toBe(phrases.join(''));
    const offsets = (parts: readonly string[]) => parts.map((_part, index) => parts.slice(0, index).join('').length);
    expect(result.spans).toEqual(
      pieces.map((piece, index) => ({
        template: [offsets(pieces)[index], (offsets(pieces)[index] ?? 0) + piece.length],
        rendered: [offsets(phrases)[index], (offsets(phrases)[index] ?? 0) + (phrases[index] ?? '').length],
        fact: index === 1 ? 'contract.rate' : index === 3 ? 'pattern.variance' : null,
      })),
    );
    expect(result.facts.map((entry) => entry.id)).toEqual(['contract.rate', 'pattern.variance']);
    expect(result.segments.map(segmentText).join('')).toBe(result.text);
    expect(result.segments[0]).toEqual({ text: 'Under the contract’s fee-schedule amount of ' });
  });

  it('renders an empty template and one of tokens alone, and takes a catalog in place of the content', () => {
    expect(renderFacts('', base)).toEqual({ ok: true, segments: [], text: '', spans: [], facts: [] });
    const catalog = factCatalog(base);
    const alone = renderFacts('{{fact:code.97110}}', catalog) as Extract<RenderedFacts, { ok: true }>;
    expect(alone).toEqual({ ok: true, segments: [{ code: '97110' }], text: '97110', spans: [{ template: [0, 19], rendered: [0, 5], fact: 'code.97110' }], facts: [catalog.byId.get('code.97110')] });
    expect(renderFacts('{{fact:code.97110}}{{fact:code.97110}}', catalog)).toMatchObject({ ok: true, text: '9711097110' });
  });

  it('throws on a phrase slot it does not know', () => {
    const entry = { ...(factCatalog(base).byId.get('pattern.paid') as NonNullable<ReturnType<ReturnType<typeof factCatalog>['byId']['get']>>), phrase: 'nothing' as never };
    const words = factWords();
    expect(() => renderFact(base, entry, { ...words, phrases: { ...words.phrases, nothing: 'a <nothing>' } as never })).toThrow("a fact's phrase has no slot <nothing>");
  });
});

describe('the units form', () => {
  it('prints a count of units as its exact decimal, and refuses any other text', () => {
    for (const units of ['0', '1', '4.5', '12.25', '0.125', '100']) {
      expect(formatFigure(units, 'units'), units).toBe(units);
    }
    for (const units of ['4.50', '01', '.5', '4.', '-1', '1,000', '1e3', ' 1', '1 ', '']) {
      expect(() => formatFigure(units, 'units'), units).toThrow(new ExplainShapeError('a count of units is an exact decimal'));
    }
    expect(() => formatFigure(2, 'units')).toThrow(ExplainShapeError);
  });
});
