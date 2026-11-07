import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
import { CURRENCY_WORDS, MULTIPLES, MULTIPLIERS, ORDINALS, SCALES, STRICT_NUMBER_WORDS, STRICT_PLURALS, TEENS, TENS, UNITS, scanText } from './scan';
import { REGULATION, SHA, assemblyInput, contractCitation, line, promptPayRecord, roleContents } from './test-support';
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

/**
 * Contents at the draft's edges, each a branch no other named content reaches: a fixed schedule or a per-visit rate with
 * no amount, a percentage of Medicare with no locked year or no percentage, a regulation with no rule release, with two
 * (the draft cites the last, as /2 does) or with a reference in braces (no reference fact), a pattern of off-shape codes
 * only (no code token), and interest computed at $0.00 because every line was paid on time (nothing said of interest:
 * the founder's ruling of 2026-10-20, Q4 (a); interestStated()).
 */
const EDGES = {
  fixedNoRate: () => assemblePacket(assemblyInput({ citation: contractCitation({ parameters: {} }) })),
  perVisitNoRate: () => assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PER_VISIT', parameters: {} }) })),
  percentNoYear: () => assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5' } }) })),
  percentNone: () => assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: {} }) })),
  regulationNoRelease: () => assemblePacket(assemblyInput({ citation: REGULATION, releases: [] })),
  regulationTwoReleases: () =>
    assemblePacket(
      assemblyInput({
        citation: REGULATION,
        releases: [
          { release_no: 900001, manifest_sha256: SHA },
          { release_no: 900002, manifest_sha256: SHA },
        ],
      }),
    ),
  regulationBraced: () => assemblePacket(assemblyInput({ citation: { ...REGULATION, reference: '42 CFR {{422.214}}' } })),
  offShapeOnly: () => assemblePacket(assemblyInput({ lines: [line(1, { procedureCode: '9701' }), line(2, { procedureCode: '9701' })] })),
  interestZero: () =>
    assemblePacket(
      assemblyInput({
        asOf: '2026-03-10',
        lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-03-09' })],
        interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      }),
    ),
} as const;

/** Every content the packets tests name: the facts' and the role reader's, and the draft's edges. */
const named = (): PacketContent[] => [
  ...Object.values(FACT_CONTENTS).map((make) => make()),
  ...Object.values(roleContents()),
  twoCodes(),
  ...Object.values(EDGES).map((make) => make()),
];

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

  it('writes these /3 templates, word for word, for the requirement of each method and edge', () => {
    const pattern = 'The pattern is {{fact:pattern.lines}} on {{fact:pattern.claims}} with {{fact:pattern.service_dates}} [3]. The remittances show {{fact:pattern.allowed}} [3].';
    const contract = `${pattern} Under the contract those lines come to {{fact:pattern.expected}}, and the difference is {{fact:pattern.variance}} [3].`;
    const medicare = `${pattern} At the Original Medicare amount those lines come to {{fact:pattern.expected}}, and the difference is {{fact:pattern.variance}} [3].`;
    const forCode = 'That rate is for {{fact:code.97110}} [1].';
    const cases: readonly [PacketContent, string][] = [
      [FACT_CONTENTS.base(), `{{fact:citation.version}} sets {{fact:contract.rate}} [1]. ${forCode} ${contract}`],
      [
        FACT_CONTENTS.severalCodes(),
        `{{fact:citation.version}} sets {{fact:contract.rate}} [1]. That rate is for {{fact:code.0275t}}, {{fact:code.97110}} and {{fact:code.g0283}} [1]. ${contract} This packet states {{fact:interest.total}} as its own line, and it is not part of the shortfall [4].`,
      ],
      [twoCodes(), `{{fact:citation.version}} sets {{fact:contract.rate}} [1]. That rate is for {{fact:code.97110}} and {{fact:code.97112}} [1]. ${contract}`],
      [FACT_CONTENTS.percent(), `{{fact:citation.version}} sets {{fact:contract.percent.1}} of the Medicare fee schedule [1]. That schedule is {{fact:contract.year.1}} [1]. ${forCode} ${contract}`],
      [EDGES.percentNoYear(), `{{fact:citation.version}} sets {{fact:contract.percent.1}} of the Medicare fee schedule [1]. ${forCode} ${contract}`],
      [EDGES.percentNone(), `{{fact:citation.version}} pays a percentage of the Medicare fee schedule [1]. ${forCode} ${contract}`],
      [FACT_CONTENTS.lesserOf(), `{{fact:citation.version}} pays the lesser of the billed charge and the schedule cited on {{fact:citation.page}} [1]. ${forCode} ${contract}`],
      [EDGES.fixedNoRate(), `{{fact:citation.version}} sets the rate in the clause cited on {{fact:citation.page}} [1]. ${forCode} ${contract}`],
      [EDGES.perVisitNoRate(), `{{fact:citation.version}} sets the rate in the clause cited on {{fact:citation.page}} [1]. ${forCode} ${contract}`],
      [EDGES.offShapeOnly(), `{{fact:citation.version}} sets {{fact:contract.rate}} [1]. ${contract}`],
      [
        FACT_CONTENTS.regulation(),
        `The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay under {{fact:citation.reference}} [1]. The Medicare fee schedule in effect for those service dates, {{fact:release.no.1}}, sets that amount [2]. ${medicare}`,
      ],
      [
        EDGES.regulationBraced(),
        `The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay [1]. The Medicare fee schedule in effect for those service dates, {{fact:release.no.1}}, sets that amount [2]. ${medicare}`,
      ],
      [
        EDGES.regulationTwoReleases(),
        `The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay under {{fact:citation.reference}} [1]. The Medicare fee schedule in effect for those service dates, {{fact:release.no.2}}, sets that amount [2]. ${medicare}`,
      ],
      [EDGES.regulationNoRelease(), `The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay under {{fact:citation.reference}} [1]. ${medicare}`],
    ];
    for (const [content, expected] of cases) {
      expect(draftNarrative(content, V3)).toBe(expected);
    }
  });

  it('says nothing of interest computed at $0.00 (every line paid on time), at /2 or at /3', () => {
    const content = EDGES.interestZero();
    expect(content.interest?.total_cents).toBe('0');
    expect(draftNarrative(content)).not.toContain('interest');
    expect(draftNarrative(content, V3)).not.toContain('interest');
  });

  it('leaves the disjunction this case kills out of the interest guard’s equivalent records (docs/adr/0089)', () => {
    const records = JSON.parse(readFileSync(fileURLToPath(new URL('../../../tools/stryker/equivalent/packets.json', import.meta.url)), 'utf8')) as {
      file: string;
      mutator: string;
      original: string;
      reason: string;
      reviewedBy: string;
      reviewedOn: string;
    }[];
    // The full gate refuses an unsigned record of a package that ran in full, and the per-visit sentence's optional chain
    // is killed by the no-codes case, so it has no record (review round 2 of 2026-11-07).
    const drafts = records.filter((record) => record.file === 'packages/packets/src/draft.ts');
    expect(drafts.filter((record) => record.reviewedBy === '' || record.reviewedOn === '')).toEqual([]);
    expect(drafts.filter((record) => record.mutator === 'OptionalChaining')).toEqual([]);
    const guard =records.filter((record) => record.file === 'packages/packets/src/draft.ts' && record.original.includes('interest'));
    expect(guard.map((record) => [record.mutator, record.original])).toEqual([
      ['ConditionalExpression', 'interest !== null && interest.total_cents !== null'],
      ['ConditionalExpression', 'interest.total_cents !== null'],
    ]);
    for (const record of guard) {
      expect(record.reason, record.original).not.toMatch(/disjunction/);
    }
  });

  it('cites the last of two rule releases at /3, as /2 does', () => {
    const content = EDGES.regulationTwoReleases();
    expect(draftNarrative(content)).toContain('release 900002');
    const rendered = renderFacts(draftNarrative(content, V3), content);
    expect(rendered.ok && rendered.text).toContain('release 900002');
    expect(rendered.ok && rendered.text).not.toContain('900001');
  });

  it('drafts the per-visit sentence for a per-visit content with no codes, at /2 and /3, without throwing', () => {
    // An empty pattern.codes is a value of the declared type, though assemblePacket never builds one: the /2 draft reads
    // no first code's amount and cites the rate's page instead (review round 2 of 2026-11-07).
    const perVisit = FACT_CONTENTS.perVisit();
    const content = { ...perVisit, pattern: { ...perVisit.pattern, codes: [] } };
    expect(draftNarrative(content)).toMatch(/^The contract, version \d+, pays a visit at the rate cited on page \d+ \[1\]\. /);
    expect(draftNarrative(content, V3)).toMatch(/^\{\{fact:citation\.version\}\} /);
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

/** The amounts a text writes out, as written ("$210.00"). */
const amounts = (text: string): string[] => [...text.matchAll(/\$[\d,]+\.\d{2}/g)].map((match) => match[0].replaceAll(',', ''));

/**
 * Every figure other than an amount a text writes, as its kind and its text as written: the contract's version, a page,
 * a percentage and a fee-schedule year, a regulation's reference, a rule release, the counts and the service dates. A
 * percentage is read in the renderer's words ("112.5%" as "112.5 percent"), the one deliberate rewording.
 */
const figuresAsWritten = (text: string): Set<string> =>
  new Set(
    scanText(text)
      .figures.filter((figure) => figure.kind !== 'amount')
      .map((figure) => `${figure.kind}:${text.slice(figure.start, figure.end).replace(/%$/u, ' percent')}`),
  );

/**
 * The /3 draft states what the /2 draft states: rendered, it holds every amount the /2 draft writes (the pattern's
 * totals, and interest exactly where /2 states it), every procedure code /2 names, and every other figure /2 writes
 * (figuresAsWritten: the version, page, percentage, year, reference, release, counts and dates), but a code of another
 * shape or a regulation's reference in braces, which have no fact (CAS-53); a contract draft lists every code token the catalog holds for the pattern.
 */
function statesWhatV2States(content: PacketContent): void {
  const before = outcome(() => draftNarrative(content));
  if (before.startsWith('threw ')) {
    return;
  }
  const template = draftNarrative(content, V3);
  const rendered = renderFacts(template, content);
  expect(rendered.ok, template).toBe(true);
  const text = rendered.ok ? rendered.text : '';
  const statesInterest = before.includes('Prompt-pay interest of');
  expect(template.includes('{{fact:interest.total}}'), template).toBe(statesInterest);
  const v2Amounts = content.citation.kind === 'contract' && content.citation.method === 'FIXED_SCHEDULE' ? amounts(before).slice(-3 - (statesInterest ? 1 : 0)) : amounts(before);
  const v3Amounts = new Set(amounts(text));
  for (const amount of v2Amounts) {
    expect(v3Amounts.has(amount), `${amount} in ${text}`).toBe(true);
  }
  // A code the catalog holds (an off-shape code has no fact, CAS-53): named in /3 wherever /2 names it, and listed in
  // every contract draft.
  const catalog = factCatalog(content);
  const factless = new Set(content.pattern.codes.map((each) => each.procedure_code).filter((each) => !catalog.byId.has(`code.${each.toLowerCase()}`)));
  const v3Figures = figuresAsWritten(text);
  // A regulation's reference in braces has no fact either (CAS-53): /3 leaves it out, so its figures are not held.
  const unheld = content.citation.kind === 'regulation' && !catalog.byId.has('citation.reference') ? content.citation.reference : '';
  for (const figure of figuresAsWritten(before)) {
    const written = figure.slice(figure.indexOf(':') + 1);
    if (!factless.has(written) && !unheld.includes(written)) {
      expect(v3Figures.has(figure), `${figure} in ${text}`).toBe(true);
    }
  }
  for (const code of content.pattern.codes.map((each) => each.procedure_code).filter((each) => catalog.byId.has(`code.${each.toLowerCase()}`))) {
    if (new RegExp(`\\b${code}\\b`).test(before)) {
      expect(text, code).toMatch(new RegExp(`\\b${code}\\b`));
    }
    if (content.citation.kind === 'contract') {
      expect(template, code).toContain(`{{fact:code.${code.toLowerCase()}}}`);
    }
  }
}

describe('the /3 code draft states the facts the /2 draft states', () => {
  it('on every named content', () => {
    for (const content of named()) {
      statesWhatV2States(content);
    }
  });

  it('on every generated pattern', () => {
    fc.assert(fc.property(factPackets, statesWhatV2States), { numRuns: 40 });
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

  it('fails a sign, a point or a letter typed right against any token of the draft, at that token’s span', () => {
    const before = ['-', '−', '+', '±', '~', '.', ',', '/', 'x', '×', 'G', '$'];
    const after = ['-', '−', '+', '±', '~', '/', 'x', '×', 'T', 'I', 'G'];
    fc.assert(
      fc.property(factPackets, fc.boolean(), fc.nat(), fc.nat(), (content, ahead, pick, char) => {
        const draft = draftNarrative(content, V3);
        const tokens = [...draft.matchAll(/\{\{fact:[^}]+\}\}/g)];
        const token = tokens[pick % tokens.length] as RegExpMatchArray & { index: number };
        const typed = ahead ? (before[char % before.length] as string) : (after[char % after.length] as string);
        const at = ahead ? token.index : token.index + token[0].length;
        const template = `${draft.slice(0, at)}${typed}${draft.slice(at)}`;
        const start = ahead ? token.index + 1 : token.index;
        const report = verifyTemplate(template, content, []);
        expect(report.passed, template).toBe(false);
        expect(
          report.mismatches.some((mismatch) => mismatch.code === 'fact_not_separated' && mismatch.start === start && mismatch.end === start + token[0].length),
          template,
        ).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it('fails a sign or a sign’s word set off before any token of the draft, at that token’s span', () => {
    const signs = ['- ', '−(', '+ "', '$ ', 'negative ', 'minus (', 'Negative “'];
    fc.assert(
      fc.property(factPackets, fc.nat(), fc.nat(), (content, pick, char) => {
        const draft = draftNarrative(content, V3);
        const tokens = [...draft.matchAll(/\{\{fact:[^}]+\}\}/g)];
        const token = tokens[pick % tokens.length] as RegExpMatchArray & { index: number };
        const typed = signs[char % signs.length] as string;
        const template = `${draft.slice(0, token.index)}${typed}${draft.slice(token.index)}`;
        const start = token.index + typed.length;
        const report = verifyTemplate(template, content, []);
        expect(report.passed, template).toBe(false);
        expect(
          report.mismatches.some((mismatch) => mismatch.code === 'fact_not_separated' && mismatch.start === start && mismatch.end === start + token[0].length),
          template,
        ).toBe(true);
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
