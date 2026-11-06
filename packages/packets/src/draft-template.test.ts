import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { draftNarrative } from './draft';
import { factPackets } from './fact-arbitrary.test-support';
import { type FactEntry, canonicalFactId, factCatalog } from './fact-catalog';
import { FACT_CONTENTS } from './fact-contents.test-support';
import { VERIFIER_FORMAT, VERIFIER_FORMAT_V3, type PacketContent } from './format';
import { legacyDraftNarrative } from './legacy-draft.test-support';
import { factPlaceholder, placeholder } from './placeholders';
import { renderFacts } from './render';
import { totalCues } from './roles-reader/cues';
import { CURRENCY_WORDS, MULTIPLES, MULTIPLIERS, ORDINALS, SCALES, STRICT_NUMBER_WORDS, STRICT_PLURALS, TEENS, TENS, UNITS } from './scan';
import { assemblyInput, line, roleContents } from './test-support';
import { type Mismatch, verifyTemplate } from './verifier';

/**
 * The code draft at format /3 and pass 2 of the template check (design lane-b-packet-figure-placeholders, sections 2.1,
 * 4 and 8; docs/adr/0089; test matrix CAS-52 and CAS-54). The draft's default is format /2, byte for byte the text it
 * wrote before tokens (held against a copy of that function); asked for /3 it writes fact tokens and passes /3 for every
 * generated pattern. Pass 2 fails a token its sentence contradicts, in both directions, and only there. Each property's
 * run count is pinned; its seed is the repo's convention (docs/adr/0066): fast-check's own in a unit run, MUTATION_SEED
 * in a mutation run. All data SYNTHETIC.
 */

const V3 = { format: VERIFIER_FORMAT_V3 } as const;
/** A draft, or the error drafting it threw (a fraction of a cent the /2 draft cannot write out, as before). */
const outcome = (draft: () => string): string => {
  try {
    return draft();
  } catch (error) {
    return `threw ${String(error)}`;
  }
};
const contradicted = (template: string, report: { readonly mismatches: readonly Mismatch[] }) =>
  report.mismatches.filter((mismatch) => mismatch.code === 'fact_contradicted').map((mismatch) => template.slice(mismatch.start, mismatch.end));

/** Two codes, two lines each, four claims: the part-naming tokens of both codes together cover every line. */
const twoCodes = (): PacketContent =>
  assemblePacket(assemblyInput({ lines: [line(1), line(2), line(3, { procedureCode: '97112' }), line(4, { procedureCode: '97112' })] }));

/** Every content the packets tests name: the facts' and the role reader's. */
const named = (): PacketContent[] => [...Object.values(FACT_CONTENTS).map((make) => make()), ...Object.values(roleContents()), twoCodes()];

describe('the code draft', () => {
  it('writes format /2 by default, byte for byte the text it wrote before tokens, on every named content', () => {
    for (const content of named()) {
      const before = outcome(() => legacyDraftNarrative(content));
      expect(outcome(() => draftNarrative(content))).toBe(before);
      expect(outcome(() => draftNarrative(content, { format: VERIFIER_FORMAT }))).toBe(before);
      expect(outcome(() => draftNarrative(content, {}))).toBe(before);
    }
  });

  it('writes format /2 by default, byte for byte, on every generated pattern', () => {
    fc.assert(
      fc.property(factPackets, (content) => {
        expect(outcome(() => draftNarrative(content))).toBe(outcome(() => legacyDraftNarrative(content)));
      }),
      { numRuns: 40 },
    );
  });

  it('writes fact tokens at /3, every id one a model may use, and passes /3 on every named content', () => {
    for (const content of named()) {
      const template = draftNarrative(content, V3);
      const report = verifyTemplate(template, content, []);
      expect(report.mismatches, template).toEqual([]);
      expect(report.passed).toBe(true);
      const catalog = factCatalog(content);
      const ids = [...template.matchAll(/\{\{fact:([^}]+)\}\}/g)].map((match) => match[1] as string);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => catalog.byId.get(id)?.model === true)).toBe(true);
      // No figure, sign or digit outside a token or a marker.
      expect(/\d/.test(template.replace(/\{\{fact:[^}]+\}\}/g, '').replace(/\[\d+\]/g, ''))).toBe(false);
    }
  });

  it('passes /3 on every generated pattern', () => {
    fc.assert(
      fc.property(factPackets, (content) => {
        const report = verifyTemplate(draftNarrative(content, V3), content, []);
        expect(report.mismatches).toEqual([]);
      }),
      { numRuns: 40 },
    );
  });

  it('renders its tokens with the figures the /2 draft states', () => {
    const content = FACT_CONTENTS.base();
    const rendered = renderFacts(draftNarrative(content, V3), content);
    expect(rendered.ok).toBe(true);
    const text = rendered.ok ? rendered.text : '';
    expect(text).toContain('The remittances show the allowed amount of $210.00 in total for the 3 lines [3].');
    expect(text).toContain('a shortfall of $90.00 in total for the 3 lines [3].');
  });
});

/** A sentence is the template's free text where a word may go: each space outside a token or a marker. */
function freeSpaces(template: string): number[] {
  const taken = [...template.matchAll(/\{\{[^}]*\}\}|\[[^\]]*\]/g)].map((match) => [match.index, match.index + match[0].length] as const);
  return [...template.matchAll(/ /g)].map((match) => match.index).filter((at) => !taken.some(([start, end]) => start <= at && at < end));
}

const TABLE_WORDS = [
  ...Object.keys(UNITS),
  ...Object.keys(TEENS),
  ...Object.keys(TENS),
  ...Object.keys(MULTIPLIERS),
  ...Object.keys(SCALES),
  ...Object.keys(ORDINALS),
  ...Object.keys(MULTIPLES),
  ...Object.keys(STRICT_NUMBER_WORDS),
  ...Object.keys(STRICT_PLURALS),
  ...CURRENCY_WORDS,
];

describe('properties of format /3 (section 8)', () => {
  it('fails a digit or a word of the scanner’s own tables put into any free text of the draft, at its span', () => {
    fc.assert(
      fc.property(factPackets, fc.oneof(fc.integer({ min: 0, max: 99_999 }).map(String), fc.constantFrom(...TABLE_WORDS)), fc.nat(), (content, inserted, pick) => {
        const draft = draftNarrative(content, V3);
        const spaces = freeSpaces(draft);
        const at = (spaces[pick % spaces.length] as number) + 1;
        const template = `${draft.slice(0, at)}${inserted} ${draft.slice(at)}`;
        const report = verifyTemplate(template, content, []);
        expect(report.passed).toBe(false);
        const figures = report.mismatches.filter((mismatch) => mismatch.code === 'free_figure' || mismatch.code === 'number_word');
        expect(figures.some((mismatch) => mismatch.start <= at && at + inserted.length <= mismatch.end)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('fails an all-lines fact in a sentence with a part-naming token, unless the part-naming tokens cover every line', () => {
    const parts = (content: PacketContent) => {
      const catalog = factCatalog(content);
      const entries = catalog.entries.filter((entry) => ['code', 'claim', 'line'].includes(entry.subject));
      return { catalog, entries };
    };
    const tokenDraw = fc.record({ picks: fc.array(fc.nat(), { minLength: 1, maxLength: 4 }), kinds: fc.array(fc.constantFrom('fact', 'set', 'identifier'), { minLength: 4, maxLength: 4 }) });
    fc.assert(
      fc.property(factPackets, tokenDraw, (content, draw) => {
        const { catalog, entries } = parts(content);
        const rows = content.lines.map((each) => each.row);
        const tokens: { readonly token: string; readonly rows: readonly number[] }[] = draw.picks.flatMap((pick, index) => {
          const kind = draw.kinds[index];
          if (kind === 'identifier') {
            const row = rows[pick % rows.length] as number;
            return [{ token: placeholder('patient_name', row), rows: [row] }];
          }
          if (kind === 'set') {
            const set = rows.filter((_, at) => ((pick >> at) & 1) === 1);
            const id = canonicalFactId(catalog, set, 'variance');
            const entry = id === null ? undefined : catalog.byId.get(id) ?? (id.startsWith('lines.') ? ({ rows: set } as Pick<FactEntry, 'rows'>) : undefined);
            return id === null || id.startsWith('pattern.') || entry === undefined ? [] : [{ token: factPlaceholder(id), rows: entry.rows }];
          }
          const entry = entries[pick % Math.max(entries.length, 1)];
          return entry === undefined ? [] : [{ token: factPlaceholder(entry.id), rows: entry.rows }];
        });
        fc.pre(tokens.length > 0);
        const fact = factPlaceholder('pattern.allowed');
        const template = `For ${tokens.map((each) => each.token).join(' and ')}, the remittances show ${fact} [3].`;
        const covered = new Set(tokens.flatMap((each) => each.rows));
        const covering = rows.every((row) => covered.has(row));
        expect(contradicted(template, verifyTemplate(template, content, [])).includes(fact)).toBe(!covering);
      }),
      { numRuns: 60 },
    );
  });

  it('fails a part fact in a sentence with a total cue, and passes it without one', () => {
    const cues = totalCues();
    fc.assert(
      fc.property(factPackets, fc.nat(), fc.nat(), fc.constantFrom(...cues), fc.boolean(), (content, pick, subset, cue, first) => {
        const catalog = factCatalog(content);
        const rows = content.lines.map((each) => each.row);
        const set = canonicalFactId(
          catalog,
          rows.filter((_, at) => ((subset >> at) & 1) === 1),
          'variance',
        );
        const ids = [
          ...catalog.entries.filter((entry) => ['code', 'claim', 'line'].includes(entry.subject) && ['amount', 'units', 'count'].includes(entry.kind)).map((entry) => entry.id),
          ...(set === null || set.startsWith('pattern.') ? [] : [set]),
        ];
        fc.pre(ids.length > 0);
        const fact = factPlaceholder(ids[pick % ids.length] as string);
        const plain = `The schedule states ${fact} here [3].`;
        expect(contradicted(plain, verifyTemplate(plain, content, []))).toEqual([]);
        const template = first ? `${cue[0]?.toUpperCase() ?? ''}${cue.slice(1)}, the schedule states ${fact} here [3].` : `The schedule states ${fact} here, ${cue} [3].`;
        expect(contradicted(template, verifyTemplate(template, content, []))).toEqual([fact]);
      }),
      { numRuns: 60 },
    );
  });
});

describe('pass 2: contradiction, both directions (CAS-54)', () => {
  const several = FACT_CONTENTS.severalCodes();
  const check = (template: string, content: PacketContent = several) => verifyTemplate(template, content, []);

  it('fails a free-text role cue that names a role the fact does not hold, and passes one that names its own', () => {
    for (const [template, content] of [
      ['The payer paid {{fact:pattern.allowed}} [1].', FACT_CONTENTS.base()],
      ['The payer allowed {{fact:pattern.paid}} [1].', several],
      ['The shortfall is {{fact:pattern.expected}} [1].', several],
      ['The contract requires {{fact:code.97110.variance}} [1].', several],
      ['Interest of {{fact:pattern.paid}} is owed [1].', several],
    ] as const) {
      expect(contradicted(template, check(template, content)), template).toHaveLength(1);
    }
    for (const template of [
      'The remittances show {{fact:pattern.allowed}} [1].',
      'The payer paid {{fact:pattern.paid}} [1].',
      'The contract requires {{fact:pattern.expected}}, and the difference is {{fact:pattern.variance}} [1].',
      'The schedule states {{fact:citation.quote}} [1].',
    ]) {
      expect(check(template).mismatches, template).toEqual([]);
    }
  });

  it('fails an all-lines fact beside a closed-list trigger or a part-naming token, and reports at the token’s span', () => {
    for (const template of [
      'On the remaining lines the payer owes {{fact:pattern.variance}} [1].',
      'For some lines the payer owes {{fact:pattern.variance}} [1].',
      'For the claim the payer owes {{fact:pattern.variance}} [1].',
      'The payer owes {{fact:pattern.variance}} per line [1].',
      'For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1].',
      'For {{fact:code.g0283.modifiers}}, the payer owes {{fact:pattern.variance}} [1].',
      'For {{fact:claim.5.lines}}, the payer owes {{fact:pattern.variance}} [1].',
      'For {{fact:lines.1+3.units}}, the payer owes {{fact:pattern.variance}} [1].',
      'For {{patient_name:2}}, the payer owes {{fact:pattern.variance}} [1].',
      'The payer owes {{fact:pattern.variance}} on {{fact:line.6.service_date}} [1].',
    ]) {
      const report = check(template);
      expect(report.mismatches.map((mismatch) => [mismatch.code, mismatch.kind, template.slice(mismatch.start, mismatch.end)]), template).toEqual([['fact_contradicted', 'fact', '{{fact:pattern.variance}}']]);
    }
  });

  it('passes part-naming tokens that together cover every line, and a one-code pattern’s code', () => {
    const two = twoCodes();
    expect(check('For {{fact:code.97110}} and {{fact:code.97112}}, the payer owes {{fact:pattern.variance}} [1].', two).mismatches).toEqual([]);
    expect(contradicted('For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1].', check('For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1].', two))).toHaveLength(1);
    expect(check('For {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1].', FACT_CONTENTS.oneCode()).mismatches).toEqual([]);
    const covering = 'For {{fact:code.97110}}, {{fact:code.g0283}}, {{fact:code.0275t}} and {{fact:line.6.units}}, the payer owes {{fact:pattern.variance}} [1].';
    expect(contradicted(covering, check(covering))).toEqual([]);
  });

  it('fails a part fact beside a total or all-lines word, and passes a part fact beside a part trigger', () => {
    for (const template of [
      'The total the payer owes is {{fact:lines.1+2.variance}} [1].',
      'In all, the payer owes {{fact:code.97110.variance}} [1].',
      'The payer owes {{fact:claim.5.variance}} altogether [1].',
      'Overall the payer owes {{fact:line.6.variance}} [1].',
      'Across all the lines the payer owes {{fact:code.97110.variance}} [1].',
      'On every line the payer owes {{fact:code.97110.variance}} [1].',
      'The schedule states {{fact:code.97110.units}} in total [1].',
      'The schedule states {{fact:code.97110.lines}} across the lines [1].',
    ]) {
      expect(contradicted(template, check(template)), template).toHaveLength(1);
    }
    for (const template of ['For {{fact:code.97110}}, the payer owes {{fact:code.97110.variance}} [1].', 'On the remaining lines the payer owes {{fact:lines.1+2.variance}} [1].', 'In total the payer owes {{fact:pattern.variance}} [1].']) {
      expect(check(template).mismatches, template).toEqual([]);
    }
  });

  it('renders ADR 0086’s known-limit sentences with the set stated by code, and fails each beside a part-naming token or a listed trigger', () => {
    // Words the closed list does not hold no longer change what the payer reads: the figure prints its own set.
    for (const template of [
      'On a subset of the lines, the payer owes {{fact:pattern.variance}} [1].',
      'The payer owes {{fact:pattern.variance}} apiece [1].',
      'For her, the payer owes {{fact:pattern.variance}} [1].',
    ]) {
      const report = check(template);
      expect(report.mismatches, template).toEqual([]);
      const rendered = renderFacts(template, several);
      expect(rendered.ok && rendered.text.includes('a shortfall of $202.50 in total for the 6 lines')).toBe(true);
    }
    for (const template of [
      'On a subset of the lines, for {{fact:code.97110}}, the payer owes {{fact:pattern.variance}} [1].',
      'The payer owes {{fact:pattern.variance}} apiece on the other lines [1].',
      'For her claim, the payer owes {{fact:pattern.variance}} [1].',
      'For {{patient_name:1}}, the payer owes {{fact:pattern.variance}} apiece [1].',
    ]) {
      expect(contradicted(template, check(template)), template).toEqual(['{{fact:pattern.variance}}']);
    }
  });

  it('numbers a contradiction in its template sentence, after a sentence holding a long token', () => {
    const template = 'The schedule states {{fact:lines.1+2+3+4+5.variance}} [1]. The payer paid {{fact:pattern.allowed}} [2].';
    const [mismatch] = check(template).mismatches;
    expect(mismatch).toMatchObject({ code: 'fact_contradicted', kind: 'fact', sentence: 1, start: template.indexOf('{{fact:pattern.allowed}}') });
  });
});
