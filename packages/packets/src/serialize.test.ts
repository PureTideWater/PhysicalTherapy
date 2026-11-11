import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { draftNarrative } from './draft';
import { FACT_CONTENTS } from './fact-contents.test-support';
import { VERIFIER_FORMAT_V3 } from './format';
import { MARKER_PATTERN } from './scan';
import { type DraftOutput, type DraftSegment, type DraftSentence, serializeDraft, serializeSentence } from './serialize';
import { NO_CASE_IDENTIFIERS, templateSentenceSpans, verifyTemplate } from './verifier';

/**
 * serializeDraft (design lane-b-packet-figure-placeholders, section 2.3; docs/adr/0089; test matrix CAS-52): a drafted narrative's segments
 * and sources written as the template the verifier reads, one drafted sentence one verifier sentence, each carrying its
 * own markers. The property's run count is pinned; its seed is the repo's convention (docs/adr/0066). All data
 * SYNTHETIC.
 */

const text = (value: string): DraftSegment => ({ text: value });
const fact = (id: string): DraftSegment => ({ fact: id });
const sentence = (segments: readonly DraftSegment[], sources: readonly number[]): DraftSentence => ({ segments, sources });

describe('serializeSentence', () => {
  it('writes the markers before a text segment’s final mark, in the order given', () => {
    expect(serializeSentence(sentence([text('The remittances show '), fact('pattern.allowed'), text(' for these services.')], [3]))).toBe('The remittances show {{fact:pattern.allowed}} for these services [3].');
    expect(serializeSentence(sentence([text('Is that the contract’s rate?')], [1, 2]))).toBe('Is that the contract’s rate [1] [2]?');
    expect(serializeSentence(sentence([text('Pay it now!')], [4]))).toBe('Pay it now [4]!');
  });

  it('follows a sentence ending in a fact, or in text with no final mark, with a period after its markers', () => {
    expect(serializeSentence(sentence([text('The remittances show '), fact('pattern.allowed')], [3]))).toBe('The remittances show {{fact:pattern.allowed}} [3].');
    expect(serializeSentence(sentence([fact('pattern.variance')], [3, 1]))).toBe('{{fact:pattern.variance}} [3] [1].');
    expect(serializeSentence(sentence([text('The contract governs')], [1]))).toBe('The contract governs [1].');
    // A final mark in a text segment before a fact is not the sentence's: only the last segment's is.
    expect(serializeSentence(sentence([text('See. '), fact('citation.page')], [1]))).toBe('See. {{fact:citation.page}} [1].');
  });

  it('writes segments as they stand, a fact segment as its token', () => {
    expect(serializeSentence(sentence([fact('code.97110'), text(' and '), fact('code.g0283'), text(' are cited.')], [1]))).toBe('{{fact:code.97110}} and {{fact:code.g0283}} are cited [1].');
    expect(serializeSentence(sentence([text('  spaced  '), fact('pattern.lines')], []))).toBe('  spaced  {{fact:pattern.lines}}.');
  });
});

describe('serializeDraft', () => {
  it('joins sentences by one space and paragraphs by a blank line', () => {
    const output: DraftOutput = {
      paragraphs: [
        { sentences: [sentence([text('The contract sets '), fact('contract.rate'), text('.')], [1]), sentence([text('That rate is for '), fact('code.97110')], [1])] },
        { sentences: [sentence([text('The remittances show '), fact('pattern.allowed'), text('.')], [3])] },
      ],
    };
    expect(serializeDraft(output)).toBe('The contract sets {{fact:contract.rate}} [1]. That rate is for {{fact:code.97110}} [1].\n\nThe remittances show {{fact:pattern.allowed}} [3].');
  });

  it('writes the code draft’s statement as the code draft does, and it passes /3', () => {
    const content = FACT_CONTENTS.base();
    const output: DraftOutput = {
      paragraphs: [
        {
          sentences: [
            sentence([text('The pattern is '), fact('pattern.lines'), text(' on '), fact('pattern.claims'), text(' with '), fact('pattern.service_dates'), text('.')], [3]),
            sentence([text('The remittances show '), fact('pattern.allowed')], [3]),
          ],
        },
      ],
    };
    const template = serializeDraft(output);
    expect(draftNarrative(content, { format: VERIFIER_FORMAT_V3 })).toContain(template);
    expect(verifyTemplate(template, content, NO_CASE_IDENTIFIERS).mismatches).toEqual([]);
  });
});

/** Words with no sentence-ending mark and no abbreviation: a drafted text segment's, under the schema's rule. */
const WORDS = ['the', 'payer', 'remittances', 'show', 'contract', 'sets', 'and', 'for', 'these', 'services', 'under', 'that', 'rate', 'is', 'cited', 'here'] as const;
const words = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 5 }).map((list) => list.join(' '));
const ids = fc.constantFrom('pattern.allowed', 'pattern.variance', 'code.97110', 'lines.1+2.variance', 'citation.page', 'contract.rate', 'deadline.ends_on');

/** A sentence's segments: text and facts, never two facts side by side, the last text ending in a mark or not. */
const segments = fc
  .record({
    first: fc.boolean(),
    pieces: fc.array(fc.tuple(words, ids), { minLength: 1, maxLength: 6 }),
    tail: fc.option(words, { nil: undefined }),
    end: fc.constantFrom('', '.', '!', '?'),
    comma: fc.boolean(),
  })
  .map(({ first, pieces, tail, end, comma }) => {
    const out: DraftSegment[] = [];
    pieces.forEach(([before, id], index) => {
      if (index > 0 || first) {
        out.push(text(`${index === 0 ? '' : ' '}${before}${comma ? ',' : ''} `));
      }
      out.push(fact(id));
    });
    if (tail !== undefined) {
      out.push(text(` ${tail}${end}`));
    }
    return out;
  });
const sources = fc.uniqueArray(fc.integer({ min: 1, max: 999 }), { minLength: 1, maxLength: 3 });
const drafts = fc.array(fc.record({ sentences: fc.array(fc.record({ segments, sources }), { minLength: 1, maxLength: 8 }) }), { minLength: 1, maxLength: 3 });

describe('properties of serializeDraft (section 8)', () => {
  it('keeps the drafted sentence count, and every verifier sentence carries its own markers, in order', () => {
    fc.assert(
      fc.property(drafts, (paragraphs) => {
        const template = serializeDraft({ paragraphs });
        const drafted = paragraphs.flatMap((paragraph) => paragraph.sentences);
        const spans = templateSentenceSpans(template);
        expect(spans).toHaveLength(drafted.length);
        spans.forEach((span, index) => {
          const markers = [...template.slice(span.start, span.end).matchAll(new RegExp(MARKER_PATTERN.source, 'g'))].map((match) => match[1]);
          expect(markers).toEqual((drafted[index] as DraftSentence).sources.map(String));
        });
      }),
      { numRuns: 60 },
    );
  });
});
