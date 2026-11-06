import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { checkTemplate } from './check';
import { factCatalog } from './fact-catalog';
import { FACT_CONTENTS, type FactContent } from './fact-contents.test-support';
import { narrativeFacts } from './facts';
import { VERIFIER_FORMAT, VERIFIER_FORMAT_V3, type PacketContent } from './format';
import { renderFacts } from './render';
import { CURRENCY_WORDS, MULTIPLES, MULTIPLIERS, ORDINALS, SCALES, STRICT_NUMBER_WORDS, STRICT_PLURALS, TEENS, TENS, UNITS } from './scan';
import { assemblyInput, contractCitation, contractWindowSource } from './test-support';
import { type Mismatch, type VerifierReportV3, verifyAtFormat, verifyNarrative, verifyTemplate } from './verifier';

/**
 * Verifier format tp-packet-verifier/3, pass 1 (design lane-b-packet-figure-placeholders, section 4; docs/adr/0089; test
 * matrix CAS-52 and CAS-53): a template's free text holds no figure, its fact tokens name facts the version's catalog
 * holds by their canonical ids, and its report adds the rendered text's hash. Reached only by asking for the format:
 * VERIFIER_FORMAT stays /2, and /2 fails any fact token. All data SYNTHETIC.
 */

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const content = (name: FactContent): PacketContent => FACT_CONTENTS[name]();
const verify = (template: string, of: PacketContent = content('base'), identifiers: readonly string[] = []) => verifyTemplate(template, of, identifiers);
/** Each mismatch as [code, kind, the template's text at its span]. */
const found = (template: string, report: { readonly mismatches: readonly Mismatch[] }) => report.mismatches.map((mismatch) => [mismatch.code, mismatch.kind, template.slice(mismatch.start, mismatch.end)]);
/** A template that passes but for what is put in it. */
const around = (inserted: string) => `The remittances show {{fact:pattern.allowed}} ${inserted} here [1].`;

describe('format /3 is reached only by asking for it', () => {
  it('keeps VERIFIER_FORMAT at /2, and verifyAtFormat at /2 is verifyNarrative over the content’s facts, byte for byte', () => {
    expect(VERIFIER_FORMAT).toBe('tp-packet-verifier/2');
    expect(VERIFIER_FORMAT_V3).toBe('tp-packet-verifier/3');
    const of = content('base');
    for (const narrative of ['The payer allowed $70.00 per line [1].', 'There were 3650 claims [3].', 'For {{patient_name:1}}, see [2].', '']) {
      expect(JSON.stringify(verifyAtFormat(VERIFIER_FORMAT, narrative, of, ['Synthetic Person']))).toBe(JSON.stringify(verifyNarrative(narrative, narrativeFacts(of), ['Synthetic Person'])));
    }
    expect(verifyAtFormat(VERIFIER_FORMAT_V3, around(''), of, [])).toEqual(verifyTemplate(around(''), of, []));
  });

  it('fails a fact token at /2, at its span, as a placeholder naming nothing, and any stray brace (fail closed)', () => {
    const of = content('base');
    const narrative = 'The remittances show {{fact:pattern.allowed}} [1].';
    const report = verifyAtFormat(VERIFIER_FORMAT, narrative, of, []);
    expect(report.passed).toBe(false);
    expect(found(narrative, report)).toEqual([['unknown_placeholder', 'placeholder', '{{fact:pattern.allowed}}']]);
    for (const text of ['A {{ stray [1].', 'A }} stray [1].', 'A {{fact:code.97110}} [1].', 'A {{Patient_name:1}} [1].']) {
      const failed = verifyAtFormat(VERIFIER_FORMAT, text, of, []);
      expect(failed.passed, text).toBe(false);
      expect(failed.mismatches.map((mismatch) => mismatch.code), text).toContain('unknown_placeholder');
    }
    // A stray beside an identifier placeholder of the schedule still fails, at its own span.
    const beside = 'For {{patient_name:1}} and }} here, see [1].';
    expect(found(beside, verifyAtFormat(VERIFIER_FORMAT, beside, of, []))).toEqual([['unknown_placeholder', 'placeholder', '}}']]);
    // An identifier placeholder of the schedule still passes there.
    expect(verifyAtFormat(VERIFIER_FORMAT, 'Line one of {{patient_name:1}} is cited [1].', of, []).passed).toBe(true);
  });
});

describe('the /3 report', () => {
  it('holds /2’s keys and rendered_sha256: the template’s hash, and the rendered text’s with identifier placeholders unfilled', () => {
    const of = content('severalCodes');
    const template = 'The contract requires {{fact:claim.5.expected}} for {{patient_name:5}} [1].';
    const report = verify(template, of);
    const rendered = renderFacts(template, of);
    expect(Object.keys(report).sort()).toEqual(['checked', 'format', 'mismatches', 'narrative_sha256', 'passed', 'rendered_sha256', 'sentences']);
    expect(report).toEqual<VerifierReportV3>({
      format: 'tp-packet-verifier/3',
      passed: true,
      narrative_sha256: sha(template),
      rendered_sha256: sha(rendered.ok ? rendered.text : 'never'),
      sentences: 1,
      checked: 3,
      mismatches: [],
    });
    expect(rendered.ok && rendered.text).toContain('{{patient_name:5}}');
    expect(rendered.ok && rendered.text).toContain('{{claim_control_number:5}}');
  });

  it('hashes no text for a template a token of which renders nothing, and fails it', () => {
    const report = verify('The remittances show {{fact:line.7.paid}} [1].');
    expect(report.passed).toBe(false);
    expect(report.rendered_sha256).toBe(sha(''));
  });

  it('is the same for the same template and content, and checkTemplate’s check is the stored one without identifiers', () => {
    const of = content('oneCode');
    const template = 'The remittances show {{fact:claim.1.paid}} [3]. In all, {{fact:pattern.variance}} [1].';
    expect(verify(template, of)).toEqual(verify(template, of));
    const reading = checkTemplate(template, of);
    expect(reading.check).toEqual({ passed: true, sentences: 2, checked: 4, mismatches: [] });
    expect(checkTemplate(template, factCatalog(of)).rendered?.text).toBe(reading.rendered?.text);
  });
});

describe('CAS-52: free text holds no figure; tokens, a person’s markers and identifier placeholders pass', () => {
  it('passes fact tokens, a person’s markers and identifier placeholders of the schedule', () => {
    const template = 'For {{patient_name:1}}, the remittances show {{fact:line.1.allowed}} [3].\n\nThe contract sets {{fact:contract.rate}} [1, 2].';
    expect(verify(template)).toMatchObject({ passed: true, sentences: 2, mismatches: [] });
  });

  it('fails each figure written in symbols at its span (free_figure), with its kind', () => {
    const cases: readonly [string, Mismatch['kind'], string][] = [
      ['of $70.00', 'amount', '$70.00'],
      ['of 70.00', 'amount', '70.00'],
      ['for 3 lines', 'number', '3'],
      ['at 120%', 'percent', '120%'],
      ['on 2026-03-02', 'date', '2026-03-02'],
      ['on March fifth', 'month_day', 'March fifth'],
      ['for 97110', 'code', '97110'],
      ['at level II', 'number', 'II'],
      ['under 58-3-225', 'identifier', '58-3-225'],
      ['under CE:SYNPLAN-ONE', 'identifier', 'CE:SYNPLAN-ONE'],
      ['in $ terms', 'identifier', '$'],
      ['by §', 'identifier', '§'],
      ['by #', 'identifier', '#'],
      ['in ¢', 'identifier', '¢'],
      ['by %', 'identifier', '%'],
    ];
    for (const [inserted, kind, figure] of cases) {
      const template = around(inserted);
      const report = verify(template);
      expect(found(template, report), inserted).toEqual([['free_figure', kind, figure]]);
      expect(report.mismatches[0]?.start, inserted).toBe(template.indexOf(figure, template.indexOf('}}')));
    }
  });

  it('fails a number in other digits as unreadable and as a free figure', () => {
    const template = around('for ٣ lines');
    expect(found(template, verify(template))).toEqual([
      ['free_figure', 'identifier', '٣'],
      ['unreadable_figure', null, '٣'],
    ]);
  });

  it('fails each number written in words at its span (number_word): “one”, “zero”, “thousands”, “paid nothing”, a percent in words', () => {
    const cases: readonly [string, Mismatch['kind'], string][] = [
      ['on one of the lines', 'number', 'one'],
      ['and zero more', 'number', 'zero'],
      ['of thousands', 'number', 'thousands'],
      ['after the payer paid nothing', 'amount', 'paid nothing'],
      ['though the payer made no payment', 'amount', 'made no payment'],
      ['at twenty percent', 'percent', 'twenty percent'],
      ['at level one', 'number', 'one'],
      ['for the first time', 'number', 'first'],
      ['once', 'number', 'once'],
      ['in dollars', 'number', 'dollars'],
    ];
    for (const [inserted, kind, words] of cases) {
      const template = around(inserted);
      // Pass 1's finding; "one of the lines" and "first" also name a part beside an all-lines fact (pass 2, CAS-54).
      expect(found(template, verify(template)).filter(([code]) => code !== 'fact_contradicted'), inserted).toEqual([['number_word', kind, words]]);
    }
  });

  it('fails every word of the scanner’s tables, the strict-only ones too, at its span', () => {
    const words = [
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
    for (const word of words) {
      const template = around(`and ${word}`);
      const report = verify(template);
      expect(found(template, report), word).toEqual([['number_word', 'number', word]]);
      expect(report.mismatches[0]?.start, word).toBe(template.lastIndexOf(word));
    }
  });

  it('reads no digit or word inside a token: ids, placeholders and markers are masked first', () => {
    const of = content('severalCodes');
    const template = 'For {{fact:code.0275t}}, the remittances show {{fact:code.0275t.paid}} and {{fact:lines.1+2.paid}} [7].';
    expect(verify(template, of).mismatches).toEqual([]);
  });

  it('fails a case’s identifier in free text but not a fact id that spells the same word', () => {
    const template = 'The remittances show {{fact:pattern.allowed}} for Allowed [1].';
    const report = verify(template, content('base'), ['Allowed Quill']);
    expect(found(template, report)).toEqual([['identifier_in_narrative', 'identifier', 'Allowed']]);
    expect(report.mismatches[0]?.start).toBe(template.lastIndexOf('Allowed'));
  });

  it('keeps /2’s rules: hidden characters, sentences without a marker, unknown markers and placeholders, an empty template', () => {
    expect(found('', verify(''))).toEqual([['empty_narrative', null, '']]);
    const template = 'The remittances show {{fact:pattern.paid}}. The contract sets {{fact:contract.rate}} [9]. For {{patient_name:4}} too [1].';
    expect(found(template, verify(template))).toEqual([
      ['sentence_without_citation', null, 'The remittances show {{fact:pattern.paid}}.'],
      ['unknown_citation', 'citation', '[9]'],
      ['unknown_placeholder', 'placeholder', '{{patient_name:4}}'],
    ]);
    const hidden = 'The remittances​ show {{fact:pattern.paid}} [1].';
    expect(found(hidden, verify(hidden))).toEqual([['hidden_character', null, '​']]);
  });

  it('takes a token standing alone as a sentence, and never ends one at the dots of an id', () => {
    expect(verify('{{fact:pattern.allowed}} [1]. {{fact:pattern.paid}} [1].')).toMatchObject({ passed: true, sentences: 2 });
    expect(verify('{{fact:pattern.allowed}}.')).toMatchObject({ passed: false, sentences: 1, mismatches: [{ code: 'sentence_without_citation' }] });
  });
});

/** CAS-53's other cases are later slices': a typed subset sum opening the picker (the web, slice 5) and schedule_changed (the write path, slice 4). */
describe('CAS-53: fact ids', () => {
  it('passes and renders every id of every catalog, for its content', () => {
    for (const name of Object.keys(FACT_CONTENTS) as FactContent[]) {
      const of = content(name);
      for (const entry of factCatalog(of).entries) {
        const template = `The figure is {{fact:${entry.id}}} [1].`;
        const reading = checkTemplate(template, of);
        expect(reading.check.mismatches, `${name} ${entry.id}`).toEqual([]);
        expect(reading.rendered?.text.includes('{{fact:'), `${name} ${entry.id}`).toBe(false);
      }
    }
  });

  it('fails an id the content lacks, and a stray brace, at its span (unknown_fact), never echoing it', () => {
    const twoCounts = assemblePacket(
      assemblyInput({ deadlineSources: [contractWindowSource(), contractWindowSource({ contract_version_id: '00000000-0000-4000-8000-0000000000c1', days: 180, page: 9 })] }),
    );
    const fractional = assemblePacket(assemblyInput({ citation: contractCitation({ parameters: { amount_cents: '5000.5' } }) }));
    const cases: readonly [string, PacketContent, string][] = [
      ['a row out of range', content('base'), '{{fact:line.7.paid}}'],
      ['interest not stated', content('regulation'), '{{fact:interest.total}}'],
      ['a code not in the pattern', content('severalCodes'), '{{fact:code.97112.variance}}'],
      ['an off-shape code (no id)', content('severalCodes'), '{{fact:code.9701}}'],
      ['window days with two counts', twoCounts, '{{fact:deadline.window_days}}'],
      ['a window above the first level', content('perVisit'), '{{fact:line.1.window_ends_on}}'],
      ['a fractional contract amount', fractional, '{{fact:contract.rate}}'],
      ['a percentage method’s rate', content('percent'), '{{fact:contract.rate}}'],
      ['an unknown subject', content('base'), '{{fact:patient.1.paid}}'],
      ['an id outside the grammar', content('base'), '{{fact:Pattern.paid}}'],
      ['an id with a space', content('base'), '{{fact: pattern.paid}}'],
      ['a lone {{', content('base'), '{{'],
      ['a lone }}', content('base'), '}}'],
      ['a run in braces', content('base'), '{{ amount }}'],
      ['an id in fullwidth braces', content('base'), '｛｛fact:pattern.paid｝｝'],
    ];
    for (const [name, of, token] of cases) {
      const template = `The remittances show ${token} [1].`;
      const report = verify(template, of);
      expect(found(template, report), name).toEqual([['unknown_fact', 'fact', token]]);
      expect(report.mismatches[0], name).not.toHaveProperty('canonical');
      const inner = token.replace(/^\{\{|\}\}$/g, '');
      if (inner !== '') {
        expect(JSON.stringify(report), name).not.toContain(inner);
      }
    }
  });

  it('fails a non-canonical id at its span (fact_not_canonical) and names the canonical id', () => {
    const cases: readonly [string, FactContent, string, string][] = [
      ['rows out of order', 'severalCodes', 'lines.2+1.paid', 'lines.1+2.paid'],
      ['a row repeated', 'severalCodes', 'lines.1+1+2.paid', 'lines.1+2.paid'],
      ['a claim named by a row not its first', 'severalCodes', 'claim.6.variance', 'claim.5.variance'],
      ['a one-line claim', 'oneCode', 'claim.3.variance', 'line.3.variance'],
      ['lines equal to a code’s rows', 'severalCodes', 'lines.1+2+4.variance', 'code.97110.variance'],
      ['a claim equal to a code’s rows', 'severalCodes', 'claim.1.variance', 'code.97110.variance'],
      ['a code id in a one-code pattern', 'base', 'code.97110.variance', 'pattern.variance'],
      ['lines over every row', 'base', 'lines.1+2+3.paid', 'pattern.paid'],
      ['lines of one row', 'base', 'lines.2.paid', 'line.2.paid'],
    ];
    for (const [name, of, id, canonical] of cases) {
      const template = `The remittances show {{fact:${id}}} [1].`;
      const report = verify(template, content(of));
      expect(found(template, report), name).toEqual([['fact_not_canonical', 'fact', `{{fact:${id}}}`]]);
      expect(report.mismatches[0]?.canonical, name).toBe(canonical);
      // In words that name no role, so the role a shortfall's or a payment's fact holds is contradicted by none (pass 2).
      expect(verify(`The schedule states {{fact:${canonical}}} [1].`, content(of)).passed, name).toBe(true);
    }
  });

  it('renders codes G0283, 0275T and 97110 and a modifier from the content', () => {
    const of = content('severalCodes');
    const template = 'For {{fact:code.g0283}} with {{fact:code.g0283.modifiers}}, {{fact:code.0275t}} and {{fact:code.97110}} [7].';
    const reading = checkTemplate(template, of);
    expect(reading.check.passed).toBe(true);
    for (const shown of ['G0283', 'GP and KX', '0275T', '97110']) {
      expect(reading.rendered?.text, shown).toContain(shown);
    }
  });

  it('fails a hidden character inside a token as hidden and the token as unknown', () => {
    const template = 'The remittances show {{fact:pattern.​paid}} [1].';
    expect(found(template, verify(template))).toEqual([
      ['unknown_fact', 'fact', '{{fact:pattern.​paid}}'],
      ['hidden_character', null, '​'],
    ]);
  });
});

describe('pass 1 at its edges', () => {
  const of = () => content('severalCodes');
  const codes = (template: string, identifiers: readonly string[] = []) => found(template, verify(template, of(), identifiers));

  it('reads every id through the renderer, in a sentence with no marker too, and marks each token once', () => {
    expect(codes('The schedule states {{fact:line.99.paid}}.')).toEqual([
      ['sentence_without_citation', null, 'The schedule states {{fact:line.99.paid}}.'],
      ['unknown_fact', 'fact', '{{fact:line.99.paid}}'],
    ]);
    expect(codes('A }} here [1]. The schedule states {{fact:line.99.paid}} [1].')).toEqual([
      ['unknown_fact', 'fact', '}}'],
      ['unknown_fact', 'fact', '{{fact:line.99.paid}}'],
    ]);
    expect(codes('The schedule states {{fact:line.99.paid}} [1]. A }} here [1].')).toEqual([
      ['unknown_fact', 'fact', '{{fact:line.99.paid}}'],
      ['unknown_fact', 'fact', '}}'],
    ]);
    const hidden = 'The schedule states {{fact:pattern.​lines}} [1].';
    expect(found(hidden, verify(hidden, of())).filter(([code]) => code === 'unknown_fact')).toEqual([['unknown_fact', 'fact', '{{fact:pattern.​lines}}']]);
    // A lone fullwidth brace: a stray to the reader, though the renderer reads none.
    expect(codes('The schedule states {{fact:pattern.lines}} ｝｝ [1].')).toEqual([['unknown_fact', 'fact', '｝｝']]);
  });

  it('carries a canonical id on fact_not_canonical alone', () => {
    const [unknown] = verify('The schedule states {{fact:line.99.paid}} [1].', of()).mismatches;
    expect(unknown !== undefined && 'canonical' in unknown).toBe(false);
    const [alias] = verify('The schedule states {{fact:lines.2+1.paid}} [1].', of()).mismatches;
    expect(alias).toMatchObject({ code: 'fact_not_canonical', canonical: 'lines.1+2.paid' });
  });

  it('counts a sentence of a stray alone, and numbers an empty template’s mismatch -1', () => {
    expect(verify('The schedule states {{fact:pattern.lines}} [1]. {{ [2].', of()).sentences).toBe(2);
    expect(verify('', of()).mismatches).toEqual([{ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: 0 }]);
  });

  it('fails an identifier written in digits as the case’s identifier too, and a marker naming any source the version lacks', () => {
    expect(codes('Member 4455667 is named [1].', ['4455667'])).toEqual([
      ['free_figure', 'number', '4455667'],
      ['identifier_in_narrative', 'identifier', '4455667'],
    ]);
    expect(codes('The schedule states {{fact:pattern.lines}} [1, 99].')).toEqual([['unknown_citation', 'citation', '[1, 99]']]);
  });

  it('takes a marker at a sentence’s start as its marker, and counts what it checked', () => {
    expect(verify('[1] The schedule states {{fact:pattern.lines}}.', of()).mismatches).toEqual([]);
    expect(verify('The schedule states {{fact:pattern.lines}} for {{patient_name:1}} [1].', of()).checked).toBe(3);
    expect(verify('A 5 }} [1].', of()).checked).toBe(3);
    expect(codes('The schedule states {{fact:pattern.lines}} [1]. The schedule states {{fact:pattern.claims}}.')).toEqual([
      ['sentence_without_citation', null, 'The schedule states {{fact:pattern.claims}}.'],
    ]);
  });

  it('never reads a date as the case’s identifier: a date is a figure, never a name or a number of the case', () => {
    expect(codes('Seen on 2026-03-02 here [1].', ['2026-03-02'])).toEqual([['free_figure', 'date', '2026-03-02']]);
  });
});
