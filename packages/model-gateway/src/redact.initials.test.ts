import { describe, expect, it } from 'vitest';

import { type LetterClaim, type PatientIdentifiers, checkWorkOf, holdsIdentifier, redactLetterForScreen } from '@tp/redact';

/**
 * Queues item 41, stage 2 (docs/adr/0054): the initials beside a name.
 *
 *  - S-5: an initial's period may come after a run of characters nobody sees (`\p{Cc}`, `\p{Cf}`), and "/", ":", "·"
 *    and "。" join an initial to the name or to the initial beside it, as a space, a dash or an apostrophe does.
 *  - Ruling (f)'s partial fix: "Name.X." is taken when X has its own period (another period follows), and an undotted
 *    capital after an initial already taken is taken before a lower-case word, except A, I and O.
 *
 * SYNTHETIC patients only. An unseen character is written as an escape, never as the character.
 */

const REFUSED = null;

function sentOrRefused(letter: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): string | null {
  const screened = redactLetterForScreen(letter, patient, claims);
  return holdsIdentifier(screened.text, patient, claims, checkWorkOf(screened)) ? REFUSED : screened.text;
}

const JANE = { who: { pseudonym: 'synthetic-patient-s5', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['30072299'] }, numbers: [{ claimId: 'synthetic-claim-s5', patientPseudonym: 'synthetic-patient-s5', claimNumbers: ['SYNCLAIM0001'] }] };
const ANNA = { who: { pseudonym: 'synthetic-patient-f', names: ['ANNA I OKAFOR'], datesOfBirth: ['1979-02-11'], memberIds: ['40081177'] }, numbers: [{ claimId: 'synthetic-claim-f', patientPseudonym: 'synthetic-patient-f', claimNumbers: ['SYNCLAIM0002'] }] };

/** Whether an initial of JANE Q ZEPHYRA, J or Q, stands alone in what is sent. */
const initialInClear = (sent: string | null) => sent !== REFUSED && /(?<!\p{L})[JQ](?!\p{L})/u.test(sent);

describe('Queues item 41, S-5: the initials beside a name, their periods after an unseen character or joined by "/", ":", "·" or "。"', () => {
  // The design note's 540 forms: the name five ways; J and Q with eight unseen characters before the period, or one of
  // four joiners; three frames. U+0085, U+200B, U+00AD, U+2060, U+0000, U+0092, U+0080, U+0096.
  const UNSEEN = ['\u0085', '​', '­', '⁠', '\u0000', '\u0092', '\u0080', '\u0096'];
  const JOINERS = ['/', ':', '·', '。'];
  const NAMES = ['Zephyra', 'Zephyr A', 'ZEPHYRA', 'Zephyra,', 'ZEPH YRA'];
  const FRAMES = (written: string) => [`Dear ${written}, your claim was paid.`, `Patient ${written} was seen on 01/05/2026.`, `Re: ${written}\nPaid 150.00`];
  const unseenForms = NAMES.flatMap((name) => UNSEEN.flatMap((u) => [`${name} J${u}.Q${u}.`, `${name} J${u}. Q${u}.`, `J${u}. Q${u}. ${name}`]));
  const joinerForms = NAMES.flatMap((name) => JOINERS.flatMap((j) => [`${name} J${j}Q${j}`, `${name}${j}J${j}Q`, `J${j}Q${j}${name}`]));
  const letters = [...unseenForms, ...joinerForms].flatMap(FRAMES);
  const shown = (letter: string) => JSON.stringify(letter).replace(/[\u0080-\u009f​­⁠]/gu, (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);

  it('the set is the note’s 540 forms', () => {
    expect(letters).toHaveLength(540);
  });

  it('no letter of the set whose initials each have a period after an unseen character sends J or Q', () => {
    const clear = unseenForms.flatMap(FRAMES).filter((letter) => initialInClear(sentOrRefused(letter, JANE.who, JANE.numbers)));
    expect(clear.map(shown)).toEqual([]);
  });

  it('a joiner between the name and its initials hides them, in every frame', () => {
    expect(sentOrRefused('Dear Zephyra J/Q/, your claim was paid.', JANE.who, JANE.numbers)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME]/[PATIENT_NAME]/, your claim was paid.');
    expect(sentOrRefused('Re: J:Q:Zephyra\nPaid 150.00', JANE.who, JANE.numbers)).toBe('Re: [PATIENT_NAME]:[PATIENT_NAME]:[PATIENT_NAME]\nPaid 150.00');
    expect(sentOrRefused('Dear Zephyra·J·Q, your claim was paid.', JANE.who, JANE.numbers)).toBe('Dear [PATIENT_NAME]·[PATIENT_NAME]·[PATIENT_NAME], your claim was paid.');
  });

  // What is left, named: a comma and then a joiner between the name and its initials ("Zephyra,/J/Q"), which no gap
  // of the reader's joins. Twelve letters of the 540 (four joiners, three frames); every other form is hidden.
  it('hides every form but the twelve with a comma and then a joiner after the name, which stay a recorded residual', () => {
    const clear = letters.filter((letter) => initialInClear(sentOrRefused(letter, JANE.who, JANE.numbers)));
    expect(clear).toHaveLength(12);
    for (const letter of clear) {
      expect(letter).toMatch(/Zephyra,[/:·。]J/u);
    }
    expect(letters.filter((letter) => sentOrRefused(letter, JANE.who, JANE.numbers) === REFUSED)).toEqual([]);
  });
});

describe('Queues item 41, ruling (f): "Name.X." with a period of its own, and an undotted capital after an initial already taken', () => {
  // The design note's 25 sentence-start forms, each written "Re: <form> today.": ten change, each hiding an initial
  // of the patient's; fifteen are sent as item 40 sends them.
  const CHANGED: readonly (readonly [string, typeof JANE, string])[] = [
    ['Zephyra.J.Q. was seen', JANE, 'Re: [PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]. was seen today.'],
    ['Zephyra.J. was seen', JANE, 'Re: [PATIENT_NAME].[PATIENT_NAME]. was seen today.'],
    ['Zephyra J.Q was seen', JANE, 'Re: [PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME] was seen today.'],
    ['Zephyra, J.Q was seen', JANE, 'Re: [PATIENT_NAME], [PATIENT_NAME].[PATIENT_NAME] was seen today.'],
    ['Zephyra.J.Smith called', JANE, 'Re: [PATIENT_NAME].[PATIENT_NAME].Smith called today.'],
    ['Okafor.A.I. was seen', ANNA, 'Re: [PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]. was seen today.'],
    ['Okafor.A. was seen', ANNA, 'Re: [PATIENT_NAME].[PATIENT_NAME]. was seen today.'],
    ['Okafor.I.A. paid', ANNA, 'Re: [PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]. paid today.'],
  ];
  // NAMED COSTS: the two sentence starts that over-redact. The letter hidden may be another person's initial ("J. Smith")
  // or a word of the sentence ("Q is the code"); nothing of the patient's is shown, and the letter is sent.
  const OVER_REDACTED: readonly (readonly [string, typeof JANE, string])[] = [
    ['Zephyra. J. Smith called', JANE, 'Re: [PATIENT_NAME]. [PATIENT_NAME]. Smith called today.'],
    ['Zephyra J. Q is the code', JANE, 'Re: [PATIENT_NAME] [PATIENT_NAME]. [PATIENT_NAME] is the code today.'],
  ];
  const UNCHANGED: readonly (readonly [string, typeof JANE, string])[] = [
    ['Zephyra.Q was seen', JANE, 'Re: [PATIENT_NAME].Q was seen today.'],
    ['J. Zephyra. Q was seen', JANE, 'Re: [PATIENT_NAME]. [PATIENT_NAME]. Q was seen today.'],
    ['Zephyra.Z is the plan', JANE, 'Re: [PATIENT_NAME].Z is the plan today.'],
    ['Zephyra J.Q.R. was seen', JANE, 'Re: [PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME].R. was seen today.'],
    ['Zephyra, J. Q. paid', JANE, 'Re: [PATIENT_NAME], [PATIENT_NAME]. [PATIENT_NAME]. paid today.'],
    ['Okafor.I am writing', ANNA, 'Re: [PATIENT_NAME].I am writing today.'],
    ['Okafor.A claim was', ANNA, 'Re: [PATIENT_NAME].A claim was today.'],
    ['Okafor.O the plan', ANNA, 'Re: [PATIENT_NAME].O the plan today.'],
    ['Okafor. I am writing', ANNA, 'Re: [PATIENT_NAME]. I am writing today.'],
    ['Okafor A.I was seen', ANNA, 'Re: [PATIENT_NAME] [PATIENT_NAME].I was seen today.'],
    ['Okafor, A. I am', ANNA, 'Re: [PATIENT_NAME], [PATIENT_NAME]. I am today.'],
    ['Okafor A. A claim was', ANNA, 'Re: [PATIENT_NAME] [PATIENT_NAME]. A claim was today.'],
    ['Okafor A.I. A claim was', ANNA, 'Re: [PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME]. A claim was today.'],
    ['Okafor, A.I. I am', ANNA, 'Re: [PATIENT_NAME], [PATIENT_NAME].[PATIENT_NAME]. I am today.'],
    ['A. Okafor. I am', ANNA, 'Re: [PATIENT_NAME]. [PATIENT_NAME]. I am today.'],
  ];

  it('the three lists are the note’s 25 forms: ten change, fifteen do not', () => {
    expect(CHANGED.length + OVER_REDACTED.length).toBe(10);
    expect(UNCHANGED).toHaveLength(15);
  });

  it.each(CHANGED)('"Re: %s today." hides the patient’s initial', (form, call, sent) => {
    expect(sentOrRefused(`Re: ${form} today.`, call.who, call.numbers)).toBe(sent);
  });

  it.each(OVER_REDACTED)('named cost: "Re: %s today." hides a letter that may not be the patient’s, and is sent', (form, call, sent) => {
    expect(sentOrRefused(`Re: ${form} today.`, call.who, call.numbers)).toBe(sent);
  });

  it.each(UNCHANGED)('"Re: %s today." is sent as before', (form, call, sent) => {
    expect(sentOrRefused(`Re: ${form} today.`, call.who, call.numbers)).toBe(sent);
  });

  it('A, I and O after a name’s period stand: the article, the pronoun and the interjection start a sentence', () => {
    expect(sentOrRefused('Okafor.I am writing', ANNA.who, ANNA.numbers)).toBe('[PATIENT_NAME].I am writing');
    expect(sentOrRefused('Dear Okafor A. I am writing', ANNA.who, ANNA.numbers)).toBe('Dear [PATIENT_NAME] [PATIENT_NAME]. I am writing');
    expect(sentOrRefused('Zephyra. I am', JANE.who, JANE.numbers)).toBe('[PATIENT_NAME]. I am');
  });
});
