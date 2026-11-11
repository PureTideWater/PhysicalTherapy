import { BARRIER, holdsNameOrNumber } from '@tp/redact';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { draftNarrative } from './draft';
import { FACT_CONTENTS } from './fact-contents.test-support';
import { narrativeFacts } from './facts';
import { readableText } from './readable';
import { scanText } from './scan';
import { assemblyInput } from './test-support';
import { type CaseIdentifiers, NO_CASE_IDENTIFIERS, identifierReader, readsNoIdentifier, verifyNarrative, verifyTemplate } from './verifier';
import { SHORTEST_PART, joinedSpans } from './verifier/identifiers';
import { DATED, type IdentifierSkip, identifierForms, identifierSpans } from './verifier/mismatches';

/**
 * The verifier's reading of a narrative for the case's own identifiers (docs/adr/0047, amendment of 2026-11-11; test
 * matrix MOD-19 and MOD-20): every form the letter reader's redaction reads fails the narrative, beside the whole-word
 * reading it always had, and nothing a narrative is meant to say (an amount, a date, a code, an NPI, a citation
 * marker, a placeholder, a fact's plan identifier) is read as one. Every identifier here is invented.
 */

const content = assemblePacket(assemblyInput());
const facts = narrativeFacts(content);
const draft = draftNarrative(content);
const names = (...values: string[]): CaseIdentifiers => ({ names: values, numbers: [] });
const numbers = (...values: string[]): CaseIdentifiers => ({ names: [], numbers: values });

/** The passing draft with one more sentence, which says `written` and holds a citation marker. */
const telling = (written: string) => `${draft} The payer told ${written} so [3].`;
/** Every mismatch of a narrative as [code, its text]. */
const mismatches = (narrative: string, identifiers: CaseIdentifiers) => verifyNarrative(narrative, facts, identifiers).mismatches.map((item) => [item.code, narrative.slice(item.start, item.end)]);
/** The texts the verifier reports as identifiers, in text order. */
const flagged = (narrative: string, identifiers: CaseIdentifiers) =>
  mismatches(narrative, identifiers)
    .filter(([code]) => code === 'identifier_in_narrative')
    .map(([, text]) => text);

/** What the check skips in a text, as readNarrative builds it: the tokens, and the figures that name a date. */
const skipOf = (text: string): IdentifierSkip => {
  const scan = scanText(text);
  return { tokens: [...scan.placeholders, ...scan.markers], dated: scan.figures.filter((figure) => DATED.has(figure.kind)) };
};
/** The reading alone, over a text as it shows: the texts it finds. */
const read = (text: string, identifiers: CaseIdentifiers, skip: IdentifierSkip = skipOf(text)) => identifierReader(identifiers)(text, skip).map((span) => text.slice(span.start, span.end));

describe('MOD-19: a narrative that writes one of the case’s identifiers in a form redaction reads fails', () => {
  it('passes the draft itself, and the sentence added to it, when the case has no such identifier', () => {
    expect(mismatches(draft, NO_CASE_IDENTIFIERS)).toEqual([]);
    expect(mismatches(telling('Zoe'), NO_CASE_IDENTIFIERS)).toEqual([]);
    expect(mismatches(telling('Zoe'), names('QUARRINGTON'))).toEqual([]);
  });

  it.each([
    ['a mark left off', 'ZOË', 'Zoe'],
    ['a mark left off in capitals', 'ZOË', 'ZOE'],
    ['a mark added', 'QUARRINGTON', 'Quärrington'],
    ['a mark written as its own character', 'ZOË', 'Zoë'],
    ['a ring left off', 'STÅLQUILL', 'Stalquill'],
    ['a sharp s written out', 'GROßQUILL', 'GROSSQUILL'],
    ['a typographic apostrophe', "O'QUILL", 'O’Quill'],
    ['an opening quote for the apostrophe', "O'QUILL", 'O‘Quill'],
    ['a backtick for the apostrophe', "O'QUILL", 'O`Quill'],
    ['the apostrophe left out', "O'QUILL", 'OQuill'],
    ['an en dash', 'VAN-TREEBY', 'Van–Treeby'],
    ['an em dash', 'VAN-TREEBY', 'Van—Treeby'],
    ['a minus sign', 'VAN-TREEBY', 'Van−Treeby'],
    ['the dash left out', 'VAN-TREEBY', 'VanTreeby'],
    ['a space for the dash', 'VAN-TREEBY', 'Van Treeby'],
    ['a part of four letters or more alone', 'VAN-TREEBY', 'Treeby'],
    ['a part of exactly four letters alone', 'JEAN-LUC', 'Jean'],
    ['a word of two letters alone', 'JO QUARRINGTON', 'Jo'],
    ['its short parts together', 'HYE-IN', 'Hye In'],
    ['its short parts together in lower case with their dash', 'HYE-IN', 'hye-in'],
    ['a dash the records do not hold', 'VANTREEBY', 'Van-Treeby'],
    ['capitalized pieces', 'JOANNQUILL', 'Jo Annquill'],
    ['its words as the records order them, with a comma', 'ZOË QUARRINGTON', 'Zoe, Quarrington'],
  ])('a name with %s', (_what, record, written) => {
    const narrative = telling(written);
    expect(mismatches(narrative, names(record))).toEqual([['identifier_in_narrative', written]]);
    expect(verifyNarrative(narrative, facts, names(record)).passed).toBe(false);
  });

  it('a name hyphenated at the end of a line', () => {
    expect(flagged(telling('Quar-\nrington'), names('QUARRINGTON'))).toEqual(['Quar-\nrington']);
    expect(flagged(telling('Quar-\r\n  rington'), names('QUARRINGTON'))).toEqual(['Quar-\r\n  rington']);
  });

  it('each name of the case where it is written, in text order, a whole name as one', () => {
    const identifiers = names('ZOË', 'QUARRINGTON', 'VAN-TREEBY');
    expect(flagged(telling('Zoe and Quarrington and Treeby'), identifiers)).toEqual(['Zoe', 'Quarrington', 'Treeby']);
    expect(flagged(telling('Quarrington, Zoe'), identifiers)).toEqual(['Quarrington', 'Zoe']);
    // A name right against a marker is still a word of its own, on either side.
    expect(flagged(`${draft} The payer told Zoe[3] so.`, identifiers)).toEqual(['Zoe']);
    expect(flagged(`${draft} [3]Zoe was told so.`, identifiers)).toEqual(['Zoe']);
  });

  it.each([
    ['dashes', 'ZZ1234567', 'ZZ-123-4567'],
    ['a space', 'ZZ1234567', 'ZZ 1234567'],
    ['an underscore', 'ZZ1234567', 'ZZ_1234567'],
    ['an en dash', 'ZZ1234567', 'ZZ–1234567'],
    ['periods beside its letters', 'SYNCCN0001', 'SYN.CCN.0001'],
    ['a number sign beside its letters', 'ZZ1234567', 'ZZ#1234567'],
    ['a slash beside its letters', 'QQRSTUVW', 'QQRS/TUVW'],
    ['the shape of a Social Security number, being the case’s own', '900551234', '900-55-1234'],
    ['spaces, having no digit', 'QQRSTUVW', 'QQ RSTUVW'],
    ['a dash, having no digit', 'QQRSTUVW', 'QQ-RSTUVW'],
  ])('a number with %s', (_what, record, written) => {
    const narrative = telling(written);
    expect(flagged(narrative, numbers(record))).toEqual([written]);
    expect(verifyNarrative(narrative, facts, numbers(record)).passed).toBe(false);
  });

  it('a number glued to its label, and its digits written as a date after a label that says they are the number', () => {
    expect(flagged(`${draft} ICNSYNCCN0001 was paid short [3].`, numbers('SYNCCN0001'))).toEqual(['SYNCCN0001']);
    expect(flagged(`${draft} Claim 2026-03-05 was paid short [3].`, numbers('20260305'))).toEqual(['2026-03-05']);
    expect(flagged(`${draft} Member ID 2026-03-05 was paid short [3].`, numbers('20260305'))).toEqual(['2026-03-05']);
    expect(flagged(`${draft} Claim 2026/03/05 was paid short [3].`, numbers('20260305'))).toEqual(['2026/03/05']);
  });

  it('an identifier written across a citation marker or a placeholder, the token in its span', () => {
    const identifiers: CaseIdentifiers = { names: ['QUARRINGTON'], numbers: ['QQRSTUVW'] };
    for (const written of ['Quar[1]rington', 'Quar[1]-rington', 'Quar{{patient_name:1}}rington', 'Qu[1]ar[2]rington', 'QQRS[1]TUVW', 'QQRS[1] TUVW', 'QQRS{{member_id:1}}-TUVW']) {
      expect(flagged(telling(written), identifiers), written).toEqual([written]);
      expect(flagged(telling(written), NO_CASE_IDENTIFIERS), written).toEqual([]);
    }
    // Right against other text on its far side, the name is still a word of its own.
    expect(read('x[1]Quar[2]rington [3].', identifiers)).toEqual(['Quar[2]rington']);
    // A token's own length does not move a span: tokens of every length before it and inside it.
    expect(read('{{patient_name:1}} told Quar[12]rington so, and {{claim_control_number:2}} QQ[3]RS{{member_id:1}}TUVW too [4].', identifiers)).toEqual(['Quar[12]rington', 'QQ[3]RS{{member_id:1}}TUVW']);
    // At the very start and the very end of a text, and with tokens given in any order or twice.
    expect(read('Quar[1]rington', identifiers)).toEqual(['Quar[1]rington']);
    expect(read('[1]Quar[2]rington[3]', identifiers)).toEqual(['Quar[2]rington']);
    const text = 'So Quar[1]rington and QQRS[22]TUVW.';
    const tokens = [
      { start: 27, end: 30 },
      { start: 7, end: 10 },
      { start: 7, end: 10 },
      { start: 26, end: 28 },
    ];
    expect(read(text, identifiers, { tokens, dated: [] })).toEqual(['Quar[1]rington', 'QQRS[22]TUVW']);
  });

  it('a name and a number each as the records hold them: a number is not read as a name, nor a name as a number', () => {
    // A space joins a number's characters anywhere; a name's only between capitalized pieces.
    expect(flagged(telling('in a'), numbers('INA'))).toEqual(['in a']);
    expect(flagged(telling('in a'), names('INA'))).toEqual([]);
    // A value in both lists is read both ways.
    expect(flagged(telling('in a'), { names: ['INA'], numbers: ['INA'] })).toEqual(['in a']);
  });

  it('says where, never what: no report holds an identifier or the form it was written in', () => {
    for (const [identifiers, written] of [
      [names('ZOË QUARRINGTON'), 'Quarrington, Zoe'],
      [names('VAN-TREEBY'), 'Van–Treeby'],
      [numbers('ZZ1234567'), 'ZZ-123-4567'],
    ] as const) {
      const report = JSON.stringify(verifyNarrative(telling(written), facts, identifiers)).toLowerCase();
      for (const text of [written, ...written.split(/[^\p{L}\p{N}]+/u), ...identifiers.names, ...identifiers.numbers]) {
        expect(report).not.toContain(text.toLowerCase());
      }
    }
  });

  it('a template of format /3 too: in its free text, never in a fact token that spells the same word', () => {
    const template = 'The remittances show {{fact:pattern.allowed}} for Allowed and Zoe [1].';
    const report = verifyTemplate(template, FACT_CONTENTS.base(), names('ÁLLOWED', 'ZOË'));
    expect(report.mismatches.map((item) => [item.code, template.slice(item.start, item.end), item.start])).toEqual([
      ['identifier_in_narrative', 'Allowed', template.lastIndexOf('Allowed')],
      ['identifier_in_narrative', 'Zoe', template.indexOf('Zoe')],
    ]);
  });

  it('a template of format /3 reads nothing inside a placeholder, a citation marker or a stray run in braces', () => {
    const template = 'For {{patient_name:1}} and {{member_id:2}} the remittances show {{fact:pattern.allowed}} and {{Zoe}} [13].';
    const report = verifyTemplate(template, FACT_CONTENTS.base(), { names: ['PATIENT', 'NÁME', 'MEMBER', 'ZOË'], numbers: ['ID2', '13'] });
    // The stray and the marker of no source fail as themselves, and nothing in a token is read as an identifier.
    expect(report.mismatches.map((item) => [item.code, template.slice(item.start, item.end)])).toEqual([
      ['unknown_fact', '{{Zoe}}'],
      ['unknown_citation', '[13]'],
    ]);
  });

  // The generator is the oracle: it writes the identifier, so it knows where every letter and digit of it is. These
  // read one short sentence through the reading itself, not the whole draft through the verifier, and take few runs
  // each: a mutation run gives a test five seconds on a machine every runner shares, and a test that runs out of them
  // fails whatever the mutant (it "killed" six recorded equivalents on this change's first CI run). The rows above hold
  // the verifier's own wiring, and every run of the unit job draws new cases.
  const said = (written: string) => `The payer told ${written} so [3].`;
  /** The reading over a narrative as the check gives it one (the text as it shows, each span mapped back): the texts it finds. */
  const found = (narrative: string, identifiers: CaseIdentifiers) => {
    const readable = readableText(narrative);
    return identifierReader(identifiers)(readable.text, skipOf(readable.text)).map((span) => {
      const original = readable.original(span.start, span.end);
      return narrative.slice(original.start, original.end);
    });
  };
  const consonants = fc.string({ unit: fc.constantFrom(...'BCDFGHJKLMNPQRSTVWXZ'), minLength: 2, maxLength: 6 }).map((letters) => `QZ${letters}`);
  const MARKS = ['́', '̈', '̌'];
  /** A part as a narrative might write it: each letter in either case, some with a mark on it. */
  const writtenPart = (part: string) =>
    fc
      .array(fc.tuple(fc.boolean(), fc.option(fc.constantFrom(...MARKS), { nil: '', freq: 4 })), { minLength: part.length, maxLength: part.length })
      .map((choices) => [...part].map((letter, at) => `${choices[at]?.[0] === true ? letter.toLowerCase() : letter}${choices[at]?.[1] ?? ''}`).join(''));
  const NAME_GAPS = ['-', '–', '—', '−', "'", '’', '‘', '`', '_', '', ' ', ', ', '. '];

  // Each way the generator joins a name's parts, for each way the records join them, as a row of its own: one run of
  // the property below draws only some of the gaps, and three of them (an underscore, an apostrophe where the records
  // hold a dash, a period and a space) no other row writes.
  it.each(['-', "'", ' '].flatMap((join) => NAME_GAPS.map((gap) => [join, gap] as const)))('a name the records join with %j, its parts written with %j between them', (join, gap) => {
    const written = `Qzbc\u0301d${gap}qzFGH`;
    expect(found(said(written), names(`QZBCD${join}QZFGH`))).toEqual([written]);
  });

  it('any name of two to four parts, its parts written in any case with any marks and joined any way, or one part alone', () => {
    const name = fc.array(consonants, { minLength: 2, maxLength: 4 }).chain((parts) =>
      fc.record({
        record: fc.array(fc.constantFrom('-', "'", ' '), { minLength: parts.length - 1, maxLength: parts.length - 1 }).map((joins) => parts.map((part, at) => `${part}${joins[at] ?? ''}`).join('')),
        whole: fc
          .tuple(fc.tuple(...parts.map(writtenPart)), fc.array(fc.constantFrom(...NAME_GAPS), { minLength: parts.length - 1, maxLength: parts.length - 1 }))
          .map(([written, gaps]) => written.map((part, at) => `${part}${gaps[at] ?? ''}`).join('')),
        alone: fc.nat({ max: parts.length - 1 }).chain((at) => writtenPart(parts[at] ?? '')),
      }),
    );
    fc.assert(
      fc.property(name, ({ record, whole, alone }) => {
        expect(found(said(whole), names(record)), `${record}: ${whole}`).toEqual([whole]);
        expect(found(said(alone), names(record)), `${record}: ${alone}`).toEqual([alone]);
      }),
      { numRuns: 30 },
    );
    // One of them through the verifier, end to end.
    expect(flagged(telling('qzbcd\u0301–QZFGH’qzjkl'), names("QZBCD-QZFGH'QZJKL"))).toEqual(['qzbcd\u0301–QZFGH’qzjkl']);
  });

  it('any number, its characters joined any way a number is', () => {
    const NUMBER_GAPS = ['', '', '', ' ', '-', '–', '_'];
    const number = fc
      .oneof(
        fc.string({ unit: fc.constantFrom(...'0123456789'), minLength: 8, maxLength: 10 }).map((digits) => `9${digits}`),
        fc.string({ unit: fc.constantFrom(...'0123456789'), minLength: 5, maxLength: 9 }).map((digits) => `ZQ${digits}`),
      )
      .chain((record) =>
        fc.record({
          record: fc.constant(record),
          written: fc.array(fc.constantFrom(...NUMBER_GAPS), { minLength: record.length - 1, maxLength: record.length - 1 }).map((gaps) => [...record].map((character, at) => `${character}${gaps[at] ?? ''}`).join('')),
        }),
      );
    fc.assert(
      fc.property(number, ({ record, written }) => {
        expect(found(said(written), numbers(record)), `${record}: ${written}`).toEqual([written]);
      }),
      { numRuns: 30 },
    );
    expect(flagged(telling('9-12 345_678–9'), numbers('9123456789'))).toEqual(['9-12 345_678–9']);
  });
});

describe('MOD-20: what a narrative is meant to say is never read as an identifier', () => {
  it('reads no part of a date as a number of the case, and no month’s name in a date as a name', () => {
    const dated = `${draft} Service dates from 2026-03-05 were paid short in April 2026 and on March 5, 2026 [3].`;
    expect(flagged(dated, numbers('20260305', '2026', '0305', '03', '05', '052026'))).toEqual([]);
    // A name the records write with a mark, which only the letter reader's matcher reads as the month's word.
    expect(flagged(dated, names('APRÍL', 'MÄRCH'))).toEqual([]);
    expect(flagged(`${draft} April asked for the review [3].`, names('APRÍL'))).toEqual(['April']);
    // Whatever the case's numbers, no span of the draft's own dates is read as one of them.
    const figures = scanText(draft).figures.filter((figure) => DATED.has(figure.kind));
    expect(figures.length).toBeGreaterThan(0);
    const parts = [...new Set(figures.flatMap((figure) => draft.slice(figure.start, figure.end).split(/\P{N}+/u)).filter((part) => part.length >= 2))];
    expect(flagged(draft, numbers(...parts, ...parts.flatMap((a) => parts.map((b) => `${a}${b}`))))).toEqual([]);
  });

  it('reads a number over a dated figure only when it holds the whole figure', () => {
    const text = 'From 2026-03-05 2026-03-06 on.';
    const skip: IdentifierSkip = { tokens: [], dated: [{ start: 5, end: 15 }, { start: 16, end: 26 }] };
    // Part of the first date and the whole of the second: the part is the date.
    expect(read(text, numbers('0520260306'), skip)).toEqual([]);
    expect(read(text, numbers('2026030520260306'), skip)).toEqual(['2026-03-05 2026-03-06']);
    expect(read(text, numbers('2026030520260306'), { tokens: [], dated: [{ start: 4, end: 15 }] })).toEqual([]);
    expect(read(text, numbers('2026030520260306'), { tokens: [], dated: [{ start: 16, end: 27 }] })).toEqual([]);
    expect(read(text, numbers('0520260306'), { tokens: [], dated: [] })).toEqual(['05 2026-03-06']);
  });

  it('reads no part of a name’s word under four letters by itself: the words no narrative is written without', () => {
    expect(SHORTEST_PART).toBe(4);
    // "in", "on", "the", "to", "van", "de" and "la" are each a part of one of these names, and words of the draft.
    const identifiers = names('HYE-IN', 'ON-YU', 'THE-ANH', 'TO-UYEN', 'VAN-TREEBY', 'DE-LA-QUILL', "O'QUILL", 'J.R.');
    expect(draft).toMatch(/\bin\b/);
    expect(draft).toMatch(/\bto\b/);
    expect(draft).toMatch(/\bThe\b/);
    expect(mismatches(draft, identifiers)).toEqual([]);
    expect(flagged(`${draft} The plan paid on a van in de la Hye to Yu and Anh [3].`, identifiers)).toEqual([]);
    // The whole name still fails in every form, its short parts within it, and so does a part of four letters or more.
    expect(flagged(telling('Hye-In and to uyen and The Anh'), identifiers)).toEqual(['Hye-In', 'to uyen', 'The Anh']);
    expect(flagged(telling('Treeby, Uyen and Quill'), identifiers)).toEqual(['Treeby', 'Uyen', 'Quill']);
    expect(flagged(telling('Hy[1]e-In'), identifiers)).toEqual(['Hy[1]e-In']);
    // The reading across a token holds the same floor: a short part written across one is no more the name than beside one.
    expect(read('The payer told i[3]n so [4].', identifiers)).toEqual([]);
    expect(read('The payer told Tr[3]eeby so [4].', identifiers)).toEqual(['Tr[3]eeby']);
  });

  it('still fails a word a name is, at any length and in any form: a name that folds to a word of the text (docs/adr/0047, the person rephrases)', () => {
    // A whole name or a whole word of one counts from two letters, so a patient named To, or Thế, fails "to" and "the";
    // a part of four letters or more that is a word of the text fails it too.
    expect(flagged(draft, names('TO')).length).toBeGreaterThan(0);
    expect(flagged(draft, names('THẾ')).length).toBeGreaterThan(0);
    expect(flagged(draft, names('TO UYEN')).length).toBeGreaterThan(0);
    expect(flagged(telling('page 2'), names('PAGE-SMITH'))).toEqual(['page']);
  });

  it('reads nothing in a placeholder or a citation marker, and everything right against one', () => {
    const tokens = `${draft} For {{patient_name:1}} and {{member_id:2}} the plan paid short [3].`;
    expect(flagged(tokens, { names: ['PATIENT', 'NÁME', 'MEMBER'], numbers: ['ID2', '3'] })).toEqual([]);
    expect(read('See [13] and 13.', numbers('13'))).toEqual(['13']);
    expect(read('Zoe[3] and [3]Zoe.', names('ZOË'))).toEqual(['Zoe', 'Zoe']);
    // A token the scan did not read is prose.
    expect(read('See [13] and 13.', numbers('13'), { tokens: [], dated: [] })).toEqual(['13', '13']);
  });

  it('reads the words around a token as they are written: a label is no number’s label through a token', () => {
    expect(read('Member ID {{member_id:1}} 2026-03-05 was paid short [3].', numbers('20260305'))).toEqual([]);
    expect(read('Claim [1] 2026-03-05 was paid short [3].', numbers('20260305'))).toEqual([]);
    expect(read('Claim 2026-03-05 was paid short [3].', numbers('20260305'))).toEqual(['2026-03-05']);
    // The number itself written across a marker is the number.
    expect(read('Claim 2026-03[1]-05 was paid short [3].', numbers('20260305'))).toEqual(['2026-03[1]-05']);
  });

  it('holds a match across a token to the same rules for dated figures', () => {
    const text = 'Quar[1]rington and 12[2]34.';
    const tokens = [
      { start: 4, end: 7 },
      { start: 21, end: 24 },
    ];
    const identifiers: CaseIdentifiers = { names: ['QUARRINGTON'], numbers: ['1234'] };
    expect(read(text, identifiers, { tokens, dated: [] })).toEqual(['Quar[1]rington', '12[2]34']);
    // A match stays over a dated figure only when it holds the whole figure, a name's as a number's.
    expect(read(text, identifiers, { tokens, dated: [{ start: 0, end: 4 }] })).toEqual(['Quar[1]rington', '12[2]34']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 2, end: 16 }] })).toEqual(['12[2]34']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 0, end: 15 }] })).toEqual(['12[2]34']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 19, end: 21 }] })).toEqual(['Quar[1]rington', '12[2]34']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 19, end: 26 }] })).toEqual(['Quar[1]rington', '12[2]34']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 18, end: 21 }] })).toEqual(['Quar[1]rington']);
    expect(read(text, identifiers, { tokens, dated: [{ start: 24, end: 27 }] })).toEqual(['Quar[1]rington']);
  });

  it.each([
    ['an amount whose digits past the period would make the number', 'The payer allowed $1234.50 [3].', numbers('123450')],
    ['another person’s Social Security and phone numbers', 'Call 212-555-0199 or see 900-66-4321 [3].', numbers('ZZ1234567', '9006643')],
    ['a plan identifier the facts hold', 'The plan identifier is SYNPLAN-63 [1].', numbers('ZZ1234567', 'SYNPLAN6')],
    ['an NPI and a code a number of the case lies inside', 'The NPI is 1234567893 and the code is 97110 [3].', numbers('234567', '9711', '7110')],
    ['units and a modifier', 'Code 97110 with modifier GP was billed for 2 units [3].', { names: ['GPX', 'UNIT'], numbers: ['ZZ1234567'] }],
    ['two lower-case words that spell a name', 'It was paid in a lump [3].', names('INA', 'ALUMP')],
    ['a longer word that begins with a name', 'The synthetics were reviewed [1].', names('SYNTHETIC', 'SYNTHÉTIC')],
  ])('keeps %s', (_what, sentence, identifiers) => {
    expect(read(sentence, identifiers)).toEqual([]);
  });

  it('does not read what the matcher does not (docs/adr/0054, "Still not covered"): a change here changes which stored narratives fail', () => {
    // A character that joins no name, a lower-case piece after a space or a period, letters spaced one by one, and a
    // name glued to other letters. "[x]" is prose: no citation marker, so no token to read across.
    for (const written of ['Quar·rington', 'Quar*rington', 'Quar{rington', 'Quar[x]rington', 'Quar/rington', 'Quarring ton', 'Quar.rington', 'Q u a r r i n g t o n', 'DearQuarrington']) {
      expect(flagged(telling(written), names('QUARRINGTON')), written).toEqual([]);
    }
    for (const written of ['QQRS*TUVW', 'QQRS{TUVW', 'QQRS[x]TUVW']) {
      expect(flagged(telling(written), numbers('QQRSTUVW')), written).toEqual([]);
    }
  });

  it('reads a number through its joiners, wherever it is written (docs/adr/0047: the cost of the safer reading)', () => {
    expect(read('See lines 12-34 of the schedule [3].', numbers('1234'))).toEqual(['12-34']);
    expect(read('The plan identifier is SYN-1 [1].', numbers('SYN1'))).toEqual(['SYN-1']);
    expect(read('The payer allowed $300.00 [3].', numbers('300'))).toEqual(['300']);
  });

  it('passes the code’s own draft for any case whose identifiers it does not hold', () => {
    const name = fc.string({ unit: fc.constantFrom(...'BCDFGHJKLMNPQRSTVWXZ'), minLength: 3, maxLength: 9 }).map((letters) => `QZ${letters}`);
    const number = fc.string({ unit: fc.constantFrom(...'0123456789'), minLength: 4, maxLength: 9 }).map((digits) => `ZQ${digits}`);
    fc.assert(
      fc.property(fc.array(name, { maxLength: 4 }), fc.array(number, { maxLength: 4 }), (caseNames, caseNumbers) => {
        expect(read(draft, { names: caseNames, numbers: caseNumbers })).toEqual([]);
      }),
      { numRuns: 50 },
    );
    // And through the verifier, for one such case: the draft passes whole.
    expect(verifyNarrative(draft, facts, { names: ['QZBCDFG', 'QZHJ-KLMNP'], numbers: ['ZQ12345', 'ZQ987654321'] }).mismatches).toEqual([]);
  });

  // The differential: the verifier's reading against the two it is made of, each asked directly. Whatever the letter
  // reader's matcher comes to read, the verifier reads, and it reads nothing neither of them does. The matcher is
  // asked plainly here (holdsNameOrNumber, the drafter's check: every identifier, every form), while the verifier asks
  // where, of the identifiers the text can hold; no name of these cases has a part under SHORTEST_PART letters, the
  // one thing the verifier leaves the plain check.
  const PIECES = [
    ...['Zoe', 'ZOË', 'Zoey', 'Vann–Treeby', 'Vann', 'Treeby', 'Treebys', 'O’Quill', 'OQuill', 'Quill', 'Jo Ann', 'jo ann', 'in a'],
    ...['ZZ-123-4567', 'ZZ 1234567', 'ZZ-123-4568', 'SYN.CCN.0001', 'ICNSYNCCN0001', 'SYN.CCN.0002', '13', '1 3', '63'],
    ...['$70.00', '97110', '2 units', '80%', '1234567893', 'SYNPLAN-63', 'page 2', '{{patient_name:1}}', '{{claim_control_number:2}}', '{{member_id:1}}', '[1]', '[13]', '[2, 3]'],
    ...[' ', ' ', ', ', '. ', ': ', '#', '-', ' the payer told ', ' was paid ', ' Claim ', ' Member ID ', '\n', 'Tree', 'by', 'ZZ', '1234567', 'Quar', 'rington'],
  ];
  const CASES: readonly CaseIdentifiers[] = [
    { names: ['ZOË', 'VANN-TREEBY', "O'QUILL", 'JOANN', 'QUARRINGTON'], numbers: ['ZZ1234567', 'SYNCCN0001'] },
    { names: ['PATIENT', 'NAME', 'INA'], numbers: ['13', '63', 'ID1'] },
    { names: ['QUILL'], numbers: ['INA', '1234567893'] },
  ];
  /** The text with each token made the matcher's barrier, character for character: nothing is read in a token or across one. */
  const prose = (text: string, skip: IdentifierSkip) => skip.tokens.reduce((out, token) => `${out.slice(0, token.start)}${BARRIER.repeat(token.end - token.start)}${out.slice(token.end)}`, text);
  /** The text with each token made one invisible character: an identifier written across a token is read. */
  const proseAcross = (text: string, skip: IdentifierSkip) => [...skip.tokens].sort((a, b) => b.start - a.start).reduce((out, token) => `${out.slice(0, token.start)}\u00AD${out.slice(token.end)}`, text);

  it('flags an identifier whenever its whole-word reading or the letter reader’s matcher holds one, and never when neither does', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...PIECES), { minLength: 1, maxLength: 16 }), fc.constantFrom(...CASES), (pieces, identifiers) => {
        const text = pieces.join('');
        fc.pre(readableText(text).text === text);
        const skip = skipOf(text);
        fc.pre(skip.dated.length === 0);
        const spans = identifierReader(identifiers)(text, skip);
        const wholeWords = identifierSpans(text, [...identifiers.names, ...identifiers.numbers], skip.tokens);
        const asWritten = wholeWords.length > 0 || holdsNameOrNumber(prose(text, skip), identifiers);
        if (asWritten) {
          expect(spans.length, text).toBeGreaterThan(0);
        }
        if (spans.length > 0) {
          expect(asWritten || holdsNameOrNumber(proseAcross(text, skip), identifiers), text).toBe(true);
        }
        // It never finds less than the whole-word reading, and no span holds a token.
        for (const word of wholeWords) {
          expect(spans.some((span) => span.start <= word.start && word.end <= span.end), text).toBe(true);
        }
        // A span holds a token only when the identifier is written across it: it then starts and ends outside every token.
        for (const span of spans) {
          expect(skip.tokens.some((token) => (token.start <= span.start && span.start < token.end) || (token.start < span.end && span.end <= token.end)), text).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('the whole-word reading by itself (docs/adr/0047), which the matcher’s now stands beside', () => {
  it('is what reads an identifier written as the records hold it, where they hold a character the matcher joins nothing over', () => {
    // A slash, a period, a comma or a plus sign between two digits, a plus sign in a name, and one word of a number the
    // records hold in two. The matcher reads none of these (the drafter's check holds none); the verifier fails each, as
    // it did before the matcher stood beside this reading. A row the matcher comes to read no longer shows that: give
    // it another such identifier.
    for (const [identifiers, written] of [
      [numbers('ZZ12345/01'), 'ZZ12345/01'],
      [numbers('ZZ12345.01'), 'ZZ12345.01'],
      [numbers('ZZ12345,01'), 'ZZ12345,01'],
      [numbers('ZZ12345+01'), 'ZZ12345+01'],
      [numbers('ZZ12345 01'), 'ZZ12345'],
      [names('QUILL+TREEBY'), 'Quill+Treeby'],
    ] as const) {
      const sentence = `The payer told ${written} so [3].`;
      expect(holdsNameOrNumber(sentence, identifiers), written).toBe(false);
      expect(read(sentence, identifiers), written).toEqual([written]);
    }
    // One number and the name through the verifier, end to end.
    expect(flagged(telling('ZZ12345/01'), numbers('ZZ12345/01'))).toEqual(['ZZ12345/01']);
    expect(flagged(telling('Quill+Treeby'), names('QUILL+TREEBY'))).toEqual(['Quill+Treeby']);
    expect(verifyNarrative(telling('ZZ12345/01'), facts, numbers('ZZ12345/01')).passed).toBe(false);
  });

  // What follows the verifier's report no longer shows by itself: the matcher's reading finds the same text. The
  // whole-word reading is still half of the union, so it is held here directly.
  it('counts a form by its letters and digits, of which it needs two', () => {
    expect(identifierForms(['12', 'A.', '7', '.-', 'Q R'])).toEqual(['Q R', '12']);
  });

  it('matches a form with its punctuation as written and its white space of any length', () => {
    expect(identifierSpans('St. Synthetic was paid.', ['ST. SYNTHETIC'], [])).toEqual([{ start: 0, end: 13 }]);
    expect(identifierSpans('StX Synthetic was paid.', ['ST. SYNTHETIC'], [])).toEqual([{ start: 4, end: 13 }]);
    expect(identifierSpans('Jane Synthetic was paid.', ['JANE  SYNTHETIC'], [])).toEqual([{ start: 0, end: 14 }]);
    expect(identifierSpans('Jane \n Synthetic was paid.', ['JANE SYNTHETIC'], [])).toEqual([{ start: 0, end: 16 }]);
  });

  it('skips a form inside a span to skip, and keeps one that only touches it on either side', () => {
    expect(identifierSpans('Jane[3] and [3]Jane.', ['JANE'], [{ start: 4, end: 7 }, { start: 12, end: 15 }])).toEqual([
      { start: 0, end: 4 },
      { start: 15, end: 19 },
    ]);
    expect(identifierSpans('Jane[3] and [3]Jane.', ['JANE'], [{ start: 3, end: 7 }, { start: 12, end: 16 }])).toEqual([]);
    expect(identifierSpans('See [13] and 13.', ['13'], [{ start: 4, end: 8 }])).toEqual([{ start: 13, end: 15 }]);
  });
});

describe('the reading itself', () => {
  it('is none at all for a case with no identifier, and the browser’s finds nothing', () => {
    expect(identifierReader(NO_CASE_IDENTIFIERS)).toBe(readsNoIdentifier);
    expect(identifierReader({ names: [], numbers: [] })).toBe(readsNoIdentifier);
    expect(identifierReader(names('ZOË'))).not.toBe(readsNoIdentifier);
    expect(readsNoIdentifier('Zoe wrote.', { tokens: [], dated: [] })).toEqual([]);
    expect(NO_CASE_IDENTIFIERS).toEqual({ names: [], numbers: [] });
    // Blank and one-character values are no identifier.
    expect(read('A Q was told so.', { names: ['Q', '', ' '], numbers: ['A', ''] })).toEqual([]);
  });

  it('gives its spans in text order, a run of overlapping ones as one, two that touch as two', () => {
    expect(joinedSpans([])).toEqual([]);
    expect(
      joinedSpans([
        { start: 9, end: 12 },
        { start: 0, end: 3 },
        { start: 2, end: 5 },
        { start: 5, end: 7 },
        { start: 9, end: 20 },
        { start: 10, end: 11 },
      ]),
    ).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 7 },
      { start: 9, end: 20 },
    ]);
    // The longer form is found first; the spans come back as the text has them.
    expect(read('Zoe saw Quarrington.', names('QUARRINGTON', 'ZOË'))).toEqual(['Zoe', 'Quarrington']);
    expect(read('Quarrington, Zoe and Van–Treeby.', names('ZOË QUARRINGTON', 'VAN-TREEBY'))).toEqual(['Quarrington', 'Zoe', 'Van–Treeby']);
    expect(read('Zoe Quarrington and Van–Treeby.', names('ZOË QUARRINGTON', 'VAN-TREEBY'))).toEqual(['Zoe Quarrington', 'Van–Treeby']);
  });
});
