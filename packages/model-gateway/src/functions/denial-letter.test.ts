import { DENIAL_CATEGORIES } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FlagRow } from '../flags';
import { BARRIER, dateForms, datesIn, fold, holdsIdentifier, identifierCandidates, redactLetter, redactLetterForScreen, redactionForms } from '../redact';
import { SYNTHETIC_IDS, SYNTHETIC_LETTER, localGateway, registerOutput, syntheticLetterInput, syntheticLetterOutput, syntheticRecords } from '../testing';
import { type DenialLetterInput, type DenialLetterOutput, denialLetterSpec, verifyDenialLetter } from './denial-letter';
import { mentionsIdentifier } from './narrative';

/**
 * readDenialLetter (PRD 14, v1.5): PHI minimized before the call (one patient's material only; names,
 * dates of birth, member IDs and claim numbers replaced by placeholders), and a verifier that keeps
 * only what the letter says. Synthetic letters only.
 */

const input = syntheticLetterInput();
const prepared = () => denialLetterSpec.prepare(input);
const verify = (output: DenialLetterOutput) => verifyDenialLetter(input, output, prepared().context);

describe('PHI minimization before the call', () => {
  it('sends the letter with the patient’s name, date of birth and member ID and the claim number replaced', () => {
    const { user, context, inputHashes } = prepared();
    for (const identifier of ['JANE', 'ZEPHYRA', '03/14/1980', 'SYNMEMBER0042', 'SYNCLAIM0001']) {
      expect(user).not.toContain(identifier);
    }
    expect(user).toContain('RE: Patient [PATIENT_NAME], DOB [DATE_OF_BIRTH], Member ID [MEMBER_ID]');
    expect(user).toContain('Claim number [CLAIM_1]');
    // What the task needs stays: the payer, the reference, the dates the letter writes.
    expect(user).toContain('SYNTHETIC PAYER Q');
    expect(user).toContain('REF-SYN-77');
    expect(user).toContain('May 30, 2026');
    expect(context.claims.get('[CLAIM_1]')).toBe(SYNTHETIC_IDS.claimOne);
    expect(inputHashes).toEqual([input.documentSha256]);
  });

  it('never sends more than one patient’s material in one call', () => {
    const claims = [...input.claims, { claimId: SYNTHETIC_IDS.claimTwo, patientPseudonym: 'synthetic-patient-2', claimNumbers: ['SYNCLAIM0002'] }];
    expect(() => denialLetterSpec.prepare({ ...input, claims })).toThrow(expect.objectContaining({ code: 'more_than_one_patient' }));
  });

  it('refuses a letter it cannot identify or that holds no text', () => {
    expect(() => denialLetterSpec.prepare({ ...input, documentId: 'x' })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    expect(() => denialLetterSpec.prepare({ ...input, documentSha256: 'x' })).toThrow(expect.objectContaining({ code: 'input_invalid' }));
    expect(() => denialLetterSpec.prepare({ ...input, text: ' \n ' })).toThrow(expect.objectContaining({ code: 'no_text' }));
  });

  it('replaces every whole-word occurrence without regard to case, and the date of birth in every form a letter writes it', () => {
    for (const form of dateForms('1980-03-14')) {
      const text = `DOB ${form}. jane zephyra, Zephyra Jane; member synmember0042`;
      const redacted = redactLetter(text, input.patient, input.claims);
      expect(redacted.text, form).toBe('DOB [DATE_OF_BIRTH]. [PATIENT_NAME] [PATIENT_NAME], [PATIENT_NAME] [PATIENT_NAME]; member [MEMBER_ID]');
      expect(holdsIdentifier(redacted.text, input.patient, input.claims)).toBe(false);
    }
    expect(dateForms('not a date')).toEqual([]);
    // A word that merely contains a name is not the name.
    expect(redactLetter('JANET ZEPHYRAS', input.patient, input.claims).text).toBe('JANET ZEPHYRAS');
  });

  it('refuses to send a letter that still holds an identifier after redaction (the guard, on a hand-made redacted text)', () => {
    // Redaction is complete (MOD-13), so no letter reaches the guard; it stays as defence in depth and is tested on its own.
    expect(holdsIdentifier('RE: Patient [PATIENT_NAME], Zephyra', input.patient, input.claims)).toBe(true);
    expect(holdsIdentifier('Claim number [CLAIM_1] SYN CLAIM 0001', input.patient, input.claims)).toBe(true);
    expect(holdsIdentifier('RE: Patient [PATIENT_NAME], DOB [DATE_OF_BIRTH], Member ID [MEMBER_ID], claim [CLAIM_1]', input.patient, input.claims)).toBe(false);
    // A name its own placeholder spells is redacted like any other, and the letter is read (section 1, A2).
    const patient = { ...input.patient, names: ['PATIENT_NAME'] };
    expect(denialLetterSpec.prepare({ ...input, patient, text: 'Re: PATIENT_NAME' }).user).toContain('Re: [PATIENT_NAME]');
  });

  it('leaves no identifier in any letter, whatever its synthetic names and numbers (property)', () => {
    const word = fc.stringMatching(/^[A-Z][a-z]{2,9}$/);
    const number = fc.stringMatching(/^SYN[0-9]{6,10}$/);
    fc.assert(
      fc.property(word, word, number, number, fc.date({ min: new Date('1930-01-01T00:00:00Z'), max: new Date('2020-12-31T00:00:00Z'), noInvalidDate: true }), (first, last, member, claim, birth) => {
        const dob = birth.toISOString().slice(0, 10);
        const patient = { pseudonym: 'p', names: [`${first} ${last}`], datesOfBirth: [dob], memberIds: [member] };
        const claims = [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'p', claimNumbers: [claim] }];
        const forms = dateForms(dob);
        const text = `Re: ${last.toUpperCase()}, ${first} (born ${forms[4] ?? ''}, ${forms[1] ?? ''}) member ${member} claim ${claim}. Dear ${first} ${last}: claim ${claim.toLowerCase()} is denied.`;
        const redacted = redactLetter(text, patient, claims);
        return !holdsIdentifier(redacted.text, patient, claims) && redacted.replaced >= 8 && redactionForms(patient, claims).length > 0;
      }),
    );
  });
});

describe('PHI minimization reads every form a letter writes an identifier in (PRD 14; MOD cases for the letter reader)', () => {
  // A SYNTHETIC patient, written the ways letters write people.
  const patient = { pseudonym: 'synthetic-patient-9', names: ['ORLA Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
  const claims = [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-9', claimNumbers: ['SYNCLM-55501'] }];

  it.each([
    ['DOB', '03/03/61'],
    ['DOB', '3/3/61'],
    ['born', '3-3-1961'],
    ['born on', '03-03-61'],
    ['birth date', '19610303'],
    ['birth date', '03031961'],
    ['birth date', '030361'],
    ['Date of birth:', 'March 03, 1961'],
    ['Date of birth:', 'March 3rd, 1961'],
    ['Date of birth:', '3rd of March 1961'],
    ['D.O.B.', '03-MAR-1961'],
    ['D.O.B.', '3-Mar-61'],
    ['D.O.B.', '1961.03.03'],
    ['DOB:', '03.03.1961'],
    ['Patient', 'Mar 3 1961'],
    ['DOB', '03–03–1961'],
    ['DOB', '03−03−1961'],
    ['DOB', '03 03 1961'],
    ['DOB', 'Mar 3 ’61'],
    ['DOB', '3/Mar/1961'],
    ['DOB', '03/Mar/61'],
  ])('replaces the date of birth written as “%s %s”', (label, written) => {
    const redacted = redactLetter(`SYNTHETIC: ${label} ${written}. Service on 2026-03-05.`, patient, claims);
    expect(redacted.text).toBe(`SYNTHETIC: ${label} [DATE_OF_BIRTH]. Service on 2026-03-05.`);
    expect(holdsIdentifier(redacted.text, patient, claims)).toBe(false);
    expect(holdsIdentifier(`SYNTHETIC: ${label} ${written}.`, patient, claims)).toBe(true);
  });

  it('replaces a date a birth label introduces even when the records hold no date of birth, and leaves other dates', () => {
    const redacted = redactLetter('SYNTHETIC: DOB 07/08/1959; seen 2026-03-05; appeal by 05/30/2026.', { ...patient, datesOfBirth: [] }, claims);
    expect(redacted.text).toBe('SYNTHETIC: DOB [DATE_OF_BIRTH]; seen 2026-03-05; appeal by 05/30/2026.');
  });

  it('replaces a labeled date of birth the records do not hold however it is written: any dash, spaces alone, an apostrophe, slashes with a month word', () => {
    for (const written of ['07–08–1959', '07\u221208\u22121959', '07 08 1959', 'Jul 8 ’59', '8/Jul/1959', '08/Jul/59', '02/30/1959']) {
      expect(redactLetter(`SYNTHETIC: DOB: ${written}. Appeal by 05/30/2026.`, { ...patient, datesOfBirth: [] }, claims).text, written).toBe('SYNTHETIC: DOB: [DATE_OF_BIRTH]. Appeal by 05/30/2026.');
    }
  });

  it('reads every date form with each calendar date it can be', () => {
    expect(datesIn('on 03/04/61').map((span) => span.dates)).toEqual([['1961-03-04', '2061-03-04', '1961-04-03', '2061-04-03']]);
    expect(datesIn('31/12/2026 and 2/30/2026').map((span) => span.dates)).toEqual([['2026-12-31'], []]);
    // Separated (a slash, a backslash, a period, a dash, "_", "|" or a month word) or not (spaces alone, compact): only a separated date is kept as written.
    expect(datesIn('1961–03–04; 1961 03 04; 19610304; Mar 4 ’61').map((span) => [span.dates, span.separated])).toEqual([
      [['1961-03-04'], true],
      [['1961-03-04'], false],
      [['1961-03-04'], false],
      [['1961-03-04', '2061-03-04'], true],
    ]);
  });

  it('replaces a member ID or claim number however the letter spaces or hyphenates it', () => {
    for (const written of ['ZZ1234567', 'ZZ 1234567', 'zz-1234567', 'ZZ 123 4567', 'Z Z 1234567']) {
      const redacted = redactLetter(`SYNTHETIC: member ${written}, claim SYNCLM 55501 and synclm55501.`, patient, claims);
      expect(redacted.text, written).toBe('SYNTHETIC: member [MEMBER_ID], claim [CLAIM_1] and [CLAIM_1].');
    }
    // A longer number holding the ID is not the ID.
    expect(redactLetter('SYNTHETIC: account ZZ12345678', patient, claims).text).toBe('SYNTHETIC: account ZZ12345678');
  });

  it('refuses a call with no patient identifier or no claim to strip: with nothing to strip, the letter would go as it is', () => {
    const input = syntheticLetterInput();
    const refused = (change: Partial<DenialLetterInput>) => () => denialLetterSpec.prepare({ ...input, ...change });
    expect(refused({ patient: { ...input.patient, names: [], memberIds: [], datesOfBirth: [] } })).toThrow(expect.objectContaining({ code: 'identifiers_missing' }));
    expect(refused({ patient: { ...input.patient, names: [' '] } })).toThrow(expect.objectContaining({ code: 'identifiers_missing' }));
    expect(refused({ patient: { ...input.patient, memberIds: [] } })).toThrow(expect.objectContaining({ code: 'identifiers_missing' }));
    expect(refused({ claims: [] })).toThrow(expect.objectContaining({ code: 'identifiers_missing' }));
    expect(refused({ claims: [{ ...(input.claims[0] as DenialLetterInput['claims'][number]), claimNumbers: ['-'] }] })).toThrow(expect.objectContaining({ code: 'identifiers_missing' }));
    // A date of birth the records do not hold is not required: a labeled one is still replaced.
    expect(denialLetterSpec.prepare({ ...input, patient: { ...input.patient, datesOfBirth: [] } }).user).toContain('DOB [DATE_OF_BIRTH]');
  });

  it('offers the records check every run that could be another patient’s identifier, never a placeholder', () => {
    expect(identifierCandidates('member ZZ 1234567; claim [CLAIM_1]; ref REF-SYN-77 on 2026-03-05; Dear [PATIENT_NAME]')).toEqual(
      expect.arrayContaining(['ZZ1234567', '1234567', 'REFSYN77', 'SYN77', '20260305']),
    );
    expect(identifierCandidates('[CLAIM_1] [MEMBER_ID] [DATE_OF_BIRTH]')).toEqual([]);
    expect(identifierCandidates('no figures at all')).toEqual([]);
  });
});

describe('one pass over one folded view: every placeholder survives and no identifier does (MOD-13; docs/adr/0054, amendment of 2026-10-27)', () => {
  // SYNTHETIC patients only. Each row of the design's section 1 table, then each input of its review.
  const claim = (...claimNumbers: string[]) => [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-7', claimNumbers }];
  const patient = (names: string[], memberIds: string[] = ['ZZ1234567'], datesOfBirth: string[] = ['1961-03-03']) => ({ pseudonym: 'synthetic-patient-7', names, datesOfBirth, memberIds });
  const redact = (names: string[], text: string, claimNumbers: string[] = ['SYN555001'], memberIds?: string[], datesOfBirth?: string[]) => {
    const who = patient(names, memberIds, datesOfBirth);
    const redacted = redactLetter(text, who, claim(...claimNumbers));
    expect(holdsIdentifier(redacted.text, who, claim(...claimNumbers)), text).toBe(false);
    return redacted.text;
  };

  it.each([
    ['A1: name parts equal to placeholder words', ['CLAIM DATE'], 'Claim SYN555001 for Date, DOB 03/03/1961', '[PATIENT_NAME] [CLAIM_1] for [PATIENT_NAME], DOB [DATE_OF_BIRTH]'],
    ['A2: name parts NAME and ID (the letter is read, not refused)', ['NAME ID'], 'member ZZ1234567', 'member [MEMBER_ID]'],
    ['B1: diacritics in the letter', ['JOSE GARCIA'], 'Dear José García', 'Dear [PATIENT_NAME]'],
    ['B1: diacritics in the records', ['JOSÉ GARCÍA'], 'Dear Jose Garcia', 'Dear [PATIENT_NAME]'],
    ['B2: a typographic apostrophe', ["MARY O'BRIEN"], 'Ms. O’Brien', 'Ms. [PATIENT_NAME]'],
    ['B3: one half of a hyphenated surname', ['ANA SMITH-JONES'], 'Ms. Jones', 'Ms. [PATIENT_NAME]'],
    ['B4: a dash, a space or a minus sign for the hyphen', ['ANA SMITH-JONES'], 'Smith–Jones, Smith Jones, Smith−Jones, Smith⁃Jones', '[PATIENT_NAME], [PATIENT_NAME], [PATIENT_NAME], [PATIENT_NAME]'],
    ['B5: a soft hyphen inside a name', ['JANE VANTREE'], 'Ms. Van\u00ADtree', 'Ms. [PATIENT_NAME]'],
    ['B6: a space inside a part', ['JOANN VANTREE'], 'Jo Ann Vantree; Jo Ann', '[PATIENT_NAME]; [PATIENT_NAME]'],
    ['B7: full case folding', ['STRAUSS'], 'Ms. Strauß', 'Ms. [PATIENT_NAME]'],
    ['B7: a capital sharp s in the records', ['STRAUẞ'], 'Ms. Strauss', 'Ms. [PATIENT_NAME]'],
    ['B8: initials', ['JANE Q VANTREE'], 'Jane Q. Vantree, J. Vantree', '[PATIENT_NAME], [PATIENT_NAME]. [PATIENT_NAME]'],
    ['C1: an underscore or a period next to a letter', ['JANE VANTREE'], 'ZZ_1234567, SYN.555001', '[MEMBER_ID], [CLAIM_1]'],
    ['C2: a zero-width space or a minus sign inside an ID', ['JANE VANTREE'], 'ZZ\u200B1234567 and ZZ−1234567', '[MEMBER_ID] and [MEMBER_ID]'],
  ])('%s', (_row, names, text, sent) => {
    expect(redact(names, text)).toBe(sent);
  });

  it('D1: offers the screen another patient’s ID however the letter writes it, and never a placeholder', () => {
    for (const written of ['ZZ_7654321', 'ZZ\u200B7654321', '[ZZ_7654321]', 'ID:ZZ7654321', 'REF\u200BZZ7654321', 'ZZ.7654321', 'ZZ 765 4321', 'ZZ-7654321']) {
      expect(identifierCandidates(`SYNTHETIC: also ${written}.`), written).toContain('ZZ7654321');
    }
    expect(identifierCandidates('YY\u200B7654321')).toContain('YY7654321');
    expect(identifierCandidates('[CLAIM_1] [CLAIM_12] [MEMBER_ID] [DATE_OF_BIRTH] [PATIENT_NAME]')).toEqual([]);
  });

  it('keeps a word boundary where a zero-width space or a blank stands between words', () => {
    expect(redact(['JANE VANTREE'], 'Dear\u200BJane\u200BVantree, your claim')).toBe('Dear\u200B[PATIENT_NAME], your claim');
    expect(redact(['JANE VANTREE'], 'Member\u200BZZ1234567')).toBe('Member\u200B[MEMBER_ID]');
    expect(redact(['JANE VANTREE'], 'DOB 03/03/1961\u200B2')).toBe('DOB [DATE_OF_BIRTH]\u200B2');
    expect(redact(['JANE VANTREE'], 'Dear\u3164Jane and Dear\uFFA0Jane')).toBe('Dear\u1160[PATIENT_NAME] and Dear\u1160[PATIENT_NAME]');
  });

  it('never makes a name of common words: a space inside a part needs capitalized pieces of two letters or more', () => {
    expect(redact(['INA VANTREE'], 'records in a timely manner')).toBe('records in a timely manner');
    expect(redact(['ISA VANTREE'], 'This is a request')).toBe('This is a request');
    expect(redact(['ASA VANTREE'], 'resubmitted as a new claim')).toBe('resubmitted as a new claim');
    expect(redact(['TOBE VANTREE'], 'sent to be reviewed')).toBe('sent to be reviewed');
    expect(redact(['IDA VANTREE'], "I'd a question")).toBe("I'd a question");
    // The whole name still matches across its own parts, whatever its case.
    expect(redact(['INA VANTREE'], 'ina vantree, Ina')).toBe('[PATIENT_NAME], [PATIENT_NAME]');
  });

  it('never makes a number of an amount or of a date written with its separators', () => {
    expect(redact(['JANE VANTREE'], 'We paid $150.00 of the billed amount; claim 15000.', ['15000'])).toBe('We paid $150.00 of the billed amount; claim [CLAIM_1].');
    expect(redact(['JANE VANTREE'], 'Appeal by 2027-03-15. Claim 20270315.', ['20270315'])).toBe('Appeal by 2027-03-15. Claim [CLAIM_1].');
    expect(redact(['JANE VANTREE'], 'Our reference is REF-SYN-77.')).toBe('Our reference is REF-SYN-77.');
  });

  it('gives an overlap of a claim’s number and a name the claim’s placeholder', () => {
    expect(redact(['JANE VANTREE'], 'Re: Jane Vantree 01 was denied', ['VANTREE01'])).toBe('Re: [CLAIM_1] was denied');
  });

  it('keeps a deadline whose month is the patient’s name, and never a date of birth', () => {
    expect(redact(['JUNE VANTREE'], 'Dear June, your appeal is due June 30, 2027. DOB June 3, 1961', undefined, undefined, ['1961-06-03'])).toBe(
      'Dear [PATIENT_NAME], your appeal is due June 30, 2027. DOB [DATE_OF_BIRTH]',
    );
  });

  it.each([
    ['J.Vantree', '[PATIENT_NAME].[PATIENT_NAME]'],
    ['J.Q. Vantree', '[PATIENT_NAME].[PATIENT_NAME]. [PATIENT_NAME]'],
    ['Vantree, J.', '[PATIENT_NAME], [PATIENT_NAME].'],
    ['Vantree, J Q', '[PATIENT_NAME], [PATIENT_NAME] [PATIENT_NAME]'],
    ['j. vantree', '[PATIENT_NAME]. [PATIENT_NAME]'],
    ['Q-Vantree', '[PATIENT_NAME]-[PATIENT_NAME]'],
  ])('takes the initials in “%s”', (written, sent) => {
    expect(redact(['JANE Q VANTREE'], written)).toBe(sent);
  });

  it('takes an initial before an apostrophe, and no word that only looks like an initial', () => {
    expect(redact(["MARY O'BRIEN"], 'O’Brien, M.')).toBe('[PATIENT_NAME], [PATIENT_NAME].');
    expect(redact(['IVY VANTREE'], 'Dear Ivy Vantree, I am writing')).toBe('Dear [PATIENT_NAME], I am writing');
    expect(redact(['ANA VANTREE'], 'Dear Ana, A claim was denied')).toBe('Dear [PATIENT_NAME], A claim was denied');
  });

  it('folds astral letters with case and leaves an emoji next to a name', () => {
    expect(redact(['𐐔𐐯𐑅𐐨𐑉𐐯𐐻 VANTREE'], 'Dear 𐐼𐐯𐑅𐐨𐑉𐐯𐐻 Vantree 😀Vantree😀')).toBe('Dear [PATIENT_NAME] 😀[PATIENT_NAME]😀');
    // A spaced astral name the spacing rule turns down moves the search past the whole code point (it once looped there).
    expect(redact(['𐐔𐐯𐑅𐐨𐑉𐐯𐐻 VANTREE'], 'Dear 𐐼𐐯 𐑅𐐨𐑉𐐯𐐻, 𐐔𐐯 𐐝𐐨𐑉𐐯𐐻')).toBe('Dear 𐐼𐐯 𐑅𐐨𐑉𐐯𐐻, [PATIENT_NAME]');
  });

  it('masks a placeholder with a barrier the fold keeps, so no match reaches across it', () => {
    expect(fold(BARRIER)).toBe(BARRIER);
    expect(holdsIdentifier('[CLAIM_1]_1', patient(['CLAIM DATE']), claim('SYN555001'))).toBe(false);
  });

  // The fix round's reproductions (design section 7), each by its review finding.
  it('replaces a digits-only ID with an invisible character inside, even where the digits read as a date (an invisible character is no separator)', () => {
    expect(redact(['JANE VANTREE'], 'Claim 1234​5678 was denied', ['12345678'])).toBe('Claim [CLAIM_1] was denied');
    expect(redact(['JANE VANTREE'], 'Claim 1234­5678 was denied', ['12345678'])).toBe('Claim [CLAIM_1] was denied');
    expect(redact(['JANE VANTREE'], 'Member 123​456', undefined, ['123456'])).toBe('Member [MEMBER_ID]');
    // A real calendar date written with an invisible character is still the ID's digits.
    expect(redact(['JANE VANTREE'], 'Claim 2027​0315; appeal by 2027-03-15', ['20270315'])).toBe('Claim [CLAIM_1]; appeal by 2027-03-15');
    expect(mentionsIdentifier('claim 1234​5678', { names: [], numbers: ['12345678'] })).toBe(true);
  });

  it('replaces a digits-only ID written like a date no calendar holds; keeps only a real date written with its dashes', () => {
    expect(redact(['JANE VANTREE'], 'Member 12-34-56', undefined, ['123456'])).toBe('Member [MEMBER_ID]');
    expect(redact(['JANE VANTREE'], 'Member 12-34-5678', undefined, ['12345678'])).toBe('Member [MEMBER_ID]');
    expect(redact(['JANE VANTREE'], 'Claim 1234-56-78; Claim 8765-43-21', ['12345678', '87654321'])).toBe('Claim [CLAIM_1]; Claim [CLAIM_1]');
    expect(redact(['JANE VANTREE'], 'Patient acct 44-55-66', undefined, ['445566'])).toBe('Patient acct [MEMBER_ID]');
    // Spaces alone are how an ID is spaced, never a kept date.
    expect(redact(['JANE VANTREE'], 'Member 03 15 61', undefined, ['031561'])).toBe('Member [MEMBER_ID]');
    // The recorded residual: a digits-only ID that is a real calendar date written with dashes reads as that date.
    expect(redact(['JANE VANTREE'], 'Appeal by 03-15-61.', undefined, ['031561'])).toBe('Appeal by 03-15-61.');
  });

  it('takes a month word in a date no calendar holds as the name it is', () => {
    expect(redact(['MAY VANTREE'], 'see May 45, 2027; due May 30, 2027')).toBe('see [PATIENT_NAME] 45, 2027; due May 30, 2027');
  });

  it.each([
    ['the whole name and its lower-case part start together', ['AA, PATIENT'], 'Dear p. aa, Patient:', 'Dear [PATIENT_NAME]. [PATIENT_NAME]:'],
    ['the whole name and its lower-case part end together', ['PATIENT CLAIM'], 'RE: Patient claim, p. was seen.', 'RE: [PATIENT_NAME], [PATIENT_NAME]. was seen.'],
  ])('reads a lower-case initial against the nearest part of a name: %s', (_case, names, text, sent) => {
    expect(redact(names, text)).toBe(sent);
  });

  it('takes a long run of initials next to a name on either side, in time linear in the run', () => {
    const run = 'A '.repeat(20_000);
    expect(redact(['IVY ANNA VANTREE'], `Vantree ${run}`)).toBe(`[PATIENT_NAME] ${'[PATIENT_NAME] '.repeat(20_000)}`);
    expect(redact(['IVY ANNA VANTREE'], `${run}Vantree`)).toBe(`${'[PATIENT_NAME] '.repeat(20_000)}[PATIENT_NAME]`);
  });

  // The second fix round's reproductions (design section 7): a payer's letter crafted to make redaction slow.
  // Each took seconds to minutes before; each is linear now, and its budget leaves room for a loaded runner.
  const N = 100_000;
  const fill = (unit: string) => unit.repeat(Math.floor(N / unit.length));
  it.each([
    ['a long gap after a name and many initials past it (97 s before)', ['JANE Q VANTREE'], `Vantree${' '.repeat(2_000)}x${' J'.repeat(49_000)}`, ['SYN555001']],
    ['a gap after a name as long as the letter (4.6 s before)', ['JANE Q VANTREE'], `Vantree${' '.repeat(N - 20)}x J`, ['SYN555001']],
    ['dates written with slashes, one after another (2.6 s before)', ['JANE Q VANTREE'], fill('1/1/11 '), ['SYN555001']],
    ['dates written with spaces alone (4.7 s before)', ['JANE Q VANTREE'], fill('1 1 11 '), ['SYN555001']],
    ['dates with a claim’s digits between them (5.0 s before)', ['JANE VANTREE'], fill('1-1-11 555001 '), ['555001']],
    // Social Security and phone numbers by pattern (docs/adr/0054, amendment of 2026-11-04; twins NPA-555-01xx, 9xx).
    ['phones back to back', ['JANE Q VANTREE'], fill('(202) 555-0123 '), ['SYN555001']],
    ['SSNs back to back', ['JANE Q VANTREE'], fill('900-12-3456 '), ['SYN555001']],
    ['spaced phone chains', ['JANE Q VANTREE'], fill('202 555 0123 '), ['SYN555001']],
    ['a 100 k digit run', ['JANE Q VANTREE'], '9'.repeat(N), ['SYN555001']],
    ['a digit and a dash, repeated', ['JANE Q VANTREE'], fill('5-'), ['SYN555001']],
    ['a digit and a zero-width space, repeated (quadratic in the folded view before)', ['JANE Q VANTREE'], fill('5\u200B'), ['SYN555001']],
    ['nine-digit runs back to back', ['JANE Q VANTREE'], fill('900123456 '), ['SYN555001']],
    ['a phone label before nine digits, repeated', ['JANE Q VANTREE'], fill('Phone 900123456 '), ['SYN555001']],
    ['a digit and an indented line break, repeated', ['JANE Q VANTREE'], fill('5\n    '), ['SYN555001']],
    ['a digit, two dashes and a line break, repeated', ['JANE Q VANTREE'], fill('5--\n  '), ['SYN555001']],
    ['an amount before a date, repeated', ['JANE Q VANTREE'], fill('$150.00 2026-11-01 '), ['SYN555001']],
  ])('redacts a letter crafted to be slow in time linear in its length: %s', (_case, names, text, claimNumbers) => {
    const who = patient(names);
    const started = performance.now();
    const redacted = redactLetter(text, who, claim(...claimNumbers));
    expect(holdsIdentifier(redacted.text, who, claim(...claimNumbers))).toBe(false);
    expect(mentionsIdentifier(redacted.text, { names, numbers: [...who.memberIds, ...claimNumbers] })).toBe(false);
    const seconds = (performance.now() - started) / 1000;
    expect(seconds, `redacted and checked ${String(text.length)} characters in ${seconds.toFixed(2)} s`).toBeLessThan(3);
  });

  it.each([
    ['Vantree J.Q.', '[PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME].'],
    ['Vantree J. Q.', '[PATIENT_NAME] [PATIENT_NAME]. [PATIENT_NAME].'],
    ['Vantree, J.Q.', '[PATIENT_NAME], [PATIENT_NAME].[PATIENT_NAME].'],
    ['Vantree Q.J.', '[PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME].'],
    ['Vantree J.Q', '[PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME]'],
    ['Jane Vantree Q.', '[PATIENT_NAME] [PATIENT_NAME] [PATIENT_NAME].'],
  ])('takes every initial of a dotted chain after the name: “%s”', (written, sent) => {
    expect(redact(['JANE Q VANTREE'], `Dear ${written}, your appeal`)).toBe(`Dear ${sent}, your appeal`);
  });

  it('reads a claim’s digits as an amount only after a currency sign and with cents, and a member ID never', () => {
    expect(redact(['JANE VANTREE'], 'Claim 555001.01 denied; Claims 555001,12 denied; Claim $555001 denied; paid $555001.00', ['555001'])).toBe(
      'Claim [CLAIM_1].01 denied; Claims [CLAIM_1],12 denied; Claim $[CLAIM_1] denied; paid $555001.00',
    );
    expect(redact(['JANE VANTREE'], 'We paid $150.00 for claim 15000; $15000.00 in all', ['15000'])).toBe('We paid $150.00 for claim [CLAIM_1]; $15000.00 in all');
    expect(redact(['JANE VANTREE'], 'member $12345678; member $12345678.00; Claim 87654321.00', ['87654321'], ['12345678'])).toBe('member $[MEMBER_ID]; member $[MEMBER_ID].00; Claim [CLAIM_1].00');
    expect(mentionsIdentifier('paid $12345678', { names: [], numbers: ['12345678'] })).toBe(true);
  });

  it('joins a name hyphenated at a line break, whatever the case of its pieces', () => {
    expect(redact(['IVY VANTREE'], 'Ms. Van-\ntree, Vantr-\nee, Van–\r\n  tree')).toBe('Ms. [PATIENT_NAME], [PATIENT_NAME], [PATIENT_NAME]');
    expect(redact(['JOANN VANTREE'], 'Dear Jo-\nann,')).toBe('Dear [PATIENT_NAME],');
    // The recorded residual: a part written in lower case with a space inside it ("jo ann") is not a name.
    expect(redact(['JOANN VANTREE'], 'jo ann')).toBe('jo ann');
  });

  it('joins a number with a slash or a colon next to a letter, and between digits only after an identifier label', () => {
    expect(redact(['JANE VANTREE'], 'Member ZZ/1234567, ZZ:1234567; claim SYN/555001')).toBe('Member [MEMBER_ID], [MEMBER_ID]; claim [CLAIM_1]');
    // The recorded residual: digits-only with a slash or a period between digits (a date's or an amount's writing) and no label.
    expect(redact(['JANE VANTREE'], 'Seen 1234.5678 and 12/34/5678', ['12345678'])).toBe('Seen 1234.5678 and 12/34/5678');
    // After an identifier label they are the number (review finding R5-2).
    expect(redact(['JANE VANTREE'], 'Ref 1234.5678 and claim 12/34/5678', ['12345678'])).toBe('Ref [CLAIM_1] and claim [CLAIM_1]');
    expect(identifierCandidates('also ZZ/7654321')).toContain('ZZ7654321');
  });

  it('joins a number with "#" or "(" next to a letter, and reads a date written with "_", "\\" or "|"', () => {
    expect(redact(['JANE VANTREE'], 'Member ZZ#1234567, ZZ(1234567); claim SYN#555001')).toBe('Member [MEMBER_ID], [MEMBER_ID]); claim [CLAIM_1]');
    expect(redact(['JANE VANTREE'], 'Born 03_03_1961, 03\\03\\1961, 03|03|1961; seen 2026_03_05')).toBe(
      'Born [DATE_OF_BIRTH], [DATE_OF_BIRTH], [DATE_OF_BIRTH]; seen 2026_03_05',
    );
    expect(redact(['JANE VANTREE'], 'DOB: 07_08_1959', undefined, undefined, [])).toBe('DOB: [DATE_OF_BIRTH]');
    expect(datesIn('03_04_1961; 03\\04\\1961; 03|04|1961').map((span) => span.separated)).toEqual([true, true, true]);
    expect(identifierCandidates('also ZZ#7654321 and ZZ(7654321)')).toEqual(expect.arrayContaining(['7654321', 'ZZ7654321']));
  });

  it('sends no square bracket of the letter’s own, so text shaped like a placeholder is never cited as a claim', () => {
    const who = patient(['JANE VANTREE']);
    const redacted = redactLetter('See [CLAIM_1] and [claim_2] and ［MEMBER_ID］; claim SYN555001', who, claim('SYN555001'));
    expect(redacted.text).toBe('See (CLAIM_1) and (claim_2) and (MEMBER_ID); claim [CLAIM_1]');
    expect(redacted.replaced).toBe(1);
  });

  it('offers the screen the digits of a claim placeholder past the call’s claims, and checks them against the patient', () => {
    expect(identifierCandidates('also [CLAIM_7654321] here')).toContain('7654321');
    expect(identifierCandidates('[CLAIM_1] [CLAIM_12] [CLAIM_99]')).toEqual([]);
    expect(holdsIdentifier('Claim [CLAIM_555001]', patient(['JANE VANTREE']), claim('555001'))).toBe(true);
    expect(holdsIdentifier('Claim [CLAIM_1]', patient(['JANE VANTREE']), claim('555001'))).toBe(false);
  });
});

describe('a letter that names a second patient is never sent (PRD 14: one patient’s material per call)', () => {
  const ON: FlagRow = { key: 'model.read_denial_letter', scope: 'global', scopeId: null, value: true };
  const SECOND = [SYNTHETIC_LETTER, 'Also reviewed: patient OSKAR VELL, DOB 11/12/1955, Member ID SYN MEMBER 0099, claim SYNCLAIM-0099.'].join('\n');

  it('refuses before the call when the practice’s records hold another patient’s member ID or claim number in the letter', async () => {
    const records = syntheticRecords(['SYNMEMBER0099', 'SYNCLAIM0099']);
    const input = syntheticLetterInput({ text: SECOND, otherPatients: records });
    const { gateway, local, store } = localGateway({ flags: [ON] });
    registerOutput(local, 'readDenialLetter', input, syntheticLetterOutput());
    await expect(gateway.readDenialLetter({ practiceId: SYNTHETIC_IDS.practice, requestKey: 'letter-two-patients' }, input)).rejects.toMatchObject({ code: 'more_than_one_patient' });
    expect(local.requests).toEqual([]);
    expect(store.calls).toEqual([]);
    // The check was asked about the runs of the redacted letter, compacted: the second patient's among them, the first's never.
    expect(records.asked[0]).toEqual(expect.arrayContaining(['SYNMEMBER0099', 'SYNCLAIM0099']));
    expect(records.asked.flat().some((candidate) => candidate.includes('SYNMEMBER0042') || candidate.includes('SYNCLAIM0001'))).toBe(false);
  });

  it('sends the letter, redacted, when the records hold none of its runs for another patient', async () => {
    const input = syntheticLetterInput({ otherPatients: syntheticRecords([]) });
    const { gateway, local } = localGateway({ flags: [ON] });
    registerOutput(local, 'readDenialLetter', input, syntheticLetterOutput());
    await expect(gateway.readDenialLetter({ practiceId: SYNTHETIC_IDS.practice, requestKey: 'letter-one-patient' }, input)).resolves.toMatchObject({ passed: true });
    expect(local.requests).toHaveLength(1);
    expect(local.requests[0]?.user).not.toMatch(/SYNMEMBER0042|SYNCLAIM0001|ZEPHYRA|03\/14\/1980/);
  });
});

describe('the verifier', () => {
  it('keeps what the letter says: the payer, the claim by its placeholder, the reference, the category, the deadline and the documents', () => {
    const { proposal, passed, citations } = verify(syntheticLetterOutput());
    expect(passed).toBe(true);
    expect(proposal).toMatchObject({
      payer: 'SYNTHETIC PAYER Q',
      claims: [{ claimId: SYNTHETIC_IDS.claimOne }, { reference: 'REF-SYN-77' }],
      reasonCategory: 'authorization',
      deadlineOn: '2026-05-30',
      requestedDocuments: ['the authorization approval letter', 'the plan of care'],
    });
    expect(citations.every((citation) => citation.quote_sha256 !== undefined && citation.field !== undefined)).toBe(true);
    expect(JSON.stringify(citations)).not.toContain('authorization');
  });

  it('rejects a deadline or a reference that is only a fragment of a longer figure in its quote (MOD-02)', () => {
    const letter = syntheticLetterInput({ text: `${SYNTHETIC_LETTER}\nA second level of appeal is due 11/30/2026 under REF-SYN-778.` });
    const context = denialLetterSpec.prepare(letter).context;
    const reviewed = verifyDenialLetter(letter, { ...syntheticLetterOutput(), deadline: { written: '1/30/2026', quote: 'A second level of appeal is due 11/30/2026' }, claim_references: [{ written: 'REF-SYN-77', quote: 'under REF-SYN-778.' }] }, context);
    expect(reviewed.proposal.fields.find((field) => field.field === 'deadline')?.problems).toEqual(['not_in_quote']);
    expect(reviewed.proposal.fields.find((field) => field.field === 'claim_references[0]')?.problems).toEqual(['not_in_quote']);
    expect(reviewed.proposal.deadlineOn).toBeNull();
    const whole = verifyDenialLetter(letter, { ...syntheticLetterOutput(), deadline: { written: '11/30/2026', quote: 'A second level of appeal is due 11/30/2026' } }, context);
    expect(whole.proposal.deadlineOn).toBe('2026-11-30');
  });

  it('rejects a date the letter does not write, and a date code cannot read', () => {
    const notInLetter = verify({ ...syntheticLetterOutput(), deadline: { written: 'June 29, 2026', quote: 'submit a written request by June 29, 2026' } });
    expect(notInLetter.passed).toBe(false);
    expect(notInLetter.proposal.deadlineOn).toBeNull();
    expect(notInLetter.proposal.fields.find((field) => field.field === 'deadline')?.problems).toEqual(['quote_not_in_letter']);
    const computed = verify({ ...syntheticLetterOutput(), deadline: { written: '30 days', quote: 'To appeal, submit a written request' } });
    expect(computed.proposal.fields.find((field) => field.field === 'deadline')?.problems).toEqual(['not_in_quote', 'unreadable']);
  });

  it('rejects a reference the letter does not write and a placeholder no claim of the call has', () => {
    const output = {
      ...syntheticLetterOutput(),
      claim_references: [
        { written: 'SYNCLAIM0001', quote: 'Claim number SYNCLAIM0001' },
        { written: '[CLAIM_2]', quote: 'Claim number [CLAIM_1]' },
        { written: '[PATIENT_NAME]', quote: 'RE: Patient [PATIENT_NAME]' },
      ],
    };
    const { proposal, passed } = verify(output);
    expect(passed).toBe(false);
    expect(proposal.claims).toEqual([]);
    expect(proposal.fields.filter((field) => field.field.startsWith('claim_references')).map((field) => field.problems)).toEqual([['quote_not_in_letter'], ['not_in_quote', 'unknown_claim'], ['unknown_claim']]);
  });

  it('validates the category against the denial-category code list', () => {
    for (const category of DENIAL_CATEGORIES) {
      expect(verify({ ...syntheticLetterOutput(), reason_category: category }).proposal.reasonCategory).toBe(category);
    }
    const unknown = verify({ ...syntheticLetterOutput(), reason_category: 'paid_in_full' });
    expect(unknown.passed).toBe(false);
    expect(unknown.proposal.reasonCategory).toBeNull();
    expect(unknown.proposal.fields.find((field) => field.field === 'reason_category')?.problems).toEqual(['unknown_category']);
    const unquoted = verify({ ...syntheticLetterOutput(), reason_quote: 'The claim is approved.' });
    expect(unquoted.proposal.reasonCategory).toBeNull();
  });

  it('leaves out a payer or a document the letter does not write, and reports nothing for a field left null', () => {
    const { proposal } = verify({
      ...syntheticLetterOutput(),
      payer: { written: 'ANOTHER PAYER', quote: 'ANOTHER PAYER' },
      requested_documents: [{ written: 'the visit notes', quote: 'with the visit notes' }],
    });
    expect(proposal.payer).toBeNull();
    expect(proposal.requestedDocuments).toEqual([]);
    const empty = verify({ ...syntheticLetterOutput(), payer: null, deadline: null, claim_references: [], requested_documents: [] });
    expect(empty.passed).toBe(true);
    expect(empty.proposal.fields.map((field) => field.field)).toEqual(['reason_category']);
  });

  it('reads the redacted text only (the original letter is never compared or returned)', () => {
    expect(SYNTHETIC_LETTER).toContain('SYNCLAIM0001');
    expect(JSON.stringify(verify(syntheticLetterOutput()).proposal)).not.toMatch(/SYNCLAIM0001|SYNMEMBER0042|ZEPHYRA/);
  });
});

describe('Social Security and phone numbers by pattern (MOD-15, MOD-16; docs/adr/0054, amendment of 2026-11-04)', () => {
  // SYNTHETIC twins only: SSNs in the 9xx area (never issued), phones NPA-555-01xx. Patient A's identifiers are ordinary;
  // patient B's member ID is SSN-shaped and its claims phone-shaped (the O rows), so a pattern span that is the call's own
  // keeps the call's placeholder (design section 4.2).
  const Z = '\u200B';
  const A = { pseudonym: 'synthetic-patient-15', names: ['ZEPHYRA Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
  const AC = [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-15', claimNumbers: ['SYNCLAIM0001'] }];
  const B = { pseudonym: 'synthetic-patient-16', names: ['ORLA J STRAUSS'], datesOfBirth: ['1955-07-14'], memberIds: ['900-12-3456'] };
  const BC = [
    { claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-16', claimNumbers: ['202-555-0123'] },
    { claimId: 'synthetic-claim-16-2', patientPseudonym: 'synthetic-patient-16', claimNumbers: ['9001234567'] },
  ];
  const who = (row: 'A' | 'B') => (row === 'A' ? { patient: A, claims: AC } : { patient: B, claims: BC });

  // [row, patient, letter, sent, offered to the screen (each must be a candidate)]
  const rows: readonly (readonly [string, 'A' | 'B', string, string, readonly string[]])[] = [
    // Social Security numbers (S rows)
    ['S1', 'A', 'Subscriber 900-12-3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S2', 'A', 'Subscriber 900 12 3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S3 U+2010', 'A', 'Subscriber 900‐12‐3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S4 U+2011', 'A', 'Subscriber 900‑12‑3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S5 U+2012', 'A', 'Subscriber 900‒12‒3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S6 en dash', 'A', 'Subscriber 900–12–3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S7 em dash', 'A', 'Subscriber 900—12—3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S8 minus sign', 'A', 'Subscriber 900−12−3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S9 ZWSP inside', 'A', `Subscriber 900-1${Z}2-34${Z}56 on file.`, 'Subscriber [SSN] on file.', ['900123456']],
    ['S10 soft hyphen inside', 'A', 'Subscriber 900-1\u00AD2-3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S11 word joiner', 'A', 'Subscriber 900-12\u2060-3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S12 byte-order mark', 'A', 'Subscriber 9\uFEFF00-12-3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S13 full width', 'A', 'Subscriber ９００-１２-３４５６ on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S14 periods', 'A', 'Subscriber 900.12.3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S14b Arabic-Indic', 'A', 'Subscriber ٩٠٠-١٢-٣٤٥٦ on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['S15', 'A', 'SSN: 900123456', 'SSN: [SSN]', ['900123456']],
    ['S16', 'A', 'Social Security No. 900123456', 'Social Security No. [SSN]', ['900123456']],
    ['S17', 'A', 'SS#900123456', 'SS#[SSN]', ['900123456']],
    ['S18 keep-noun', 'A', 'Reference 900123456 applies.', 'Reference 900123456 applies.', ['900123456']],
    ['S19 HICN', 'A', 'HICN 900123456A', 'HICN [SSN]', ['900123456A', '900123456']],
    ['S20 HICN dashed', 'A', 'Medicare no. 900-12-3456-A', 'Medicare no. [SSN]', ['900123456A', '900123456']],
    ['S21 masked', 'A', 'SSN ending in 3456, xxx-xx-3456', 'SSN ending in 3456, [SSN]', []],
    // Phone numbers (P rows)
    ['P1', 'A', 'Call (202) 555-0123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P2', 'A', 'Call 202-555-0123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P3', 'A', 'Call 202.555.0123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P4', 'A', 'Call +1 202 555 0123 today.', 'Call [PHONE] today.', ['2025550123', '12025550123']],
    ['P5', 'A', 'Call 1-800-555-0100 today.', 'Call [PHONE] today.', ['8005550100', '18005550100']],
    ['P6', 'A', 'Call 202-555-0123 x123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P7', 'A', 'Call 202-555-0123 ext. 45 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P8', 'A', 'Call 202-555-0123 extension 6789 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P9', 'A', 'Call 202-555-0123 #12 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P10', 'A', 'Phone: 2025550123', 'Phone: [PHONE]', ['2025550123']],
    ['P11', 'A', 'Fax 2025550124', 'Fax [PHONE]', ['2025550124']],
    ['P12 TTY', 'A', 'TTY users call 711 or 1-800-555-0199 (TTY).', 'TTY users call 711 or [PHONE] (TTY).', ['8005550199']],
    ['P13 en dash', 'A', 'Call 202–555–0123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P14 full width', 'A', 'Call ２０２-５５５-０１２３ today.', 'Call [PHONE] today.', ['2025550123']],
    ['P15 ZWSP', 'A', `Call 202-55${Z}5-0123 today.`, 'Call [PHONE] today.', ['2025550123']],
    ['P16 vanity', 'A', 'Call 1-800-555-SYNP.', 'Call 1-800-555-SYNP.', []],
    ['P17 keep-noun', 'A', 'Reference 2025550123 applies.', 'Reference 2025550123 applies.', ['2025550123']],
    ['P18 plus and ten', 'A', 'Call +12025550123 today.', 'Call [PHONE] today.', ['2025550123']],
    ['P19 one and parentheses', 'A', 'Call 1 (800) 555-0100 today.', 'Call [PHONE] today.', ['8005550100']],
    // The call's own identifiers in SSN and phone shapes (O rows, patient B)
    ['O1', 'B', 'Member ID 900-12-3456', 'Member ID [MEMBER_ID]', []],
    ['O2', 'B', 'Member ID 900123456', 'Member ID [MEMBER_ID]', []],
    ['O3', 'B', 'Member ID 900 12 3456', 'Member ID [MEMBER_ID]', []],
    ['O4', 'B', 'Member ID 900–12–3456', 'Member ID [MEMBER_ID]', []],
    ['O5', 'B', 'Claim 202-555-0123', 'Claim [CLAIM_1]', []],
    ['O6', 'B', 'Claim (202) 555-0123', 'Claim [CLAIM_1]', []],
    ['O6u', 'B', 'Seen (202) 555-0123', 'Seen [CLAIM_1]', []],
    ['O7', 'B', 'Claim 202.555.0123', 'Claim [CLAIM_1]', []],
    ['O7u', 'B', 'Seen 202.555.0123', 'Seen [CLAIM_1]', []],
    ['O8', 'B', 'Claim 2025550123', 'Claim [CLAIM_1]', []],
    ['O9', 'B', 'Claim 900-123-4567', 'Claim [CLAIM_2]', []],
    ['O10', 'B', 'Claim +1 202 555 0123', 'Claim [CLAIM_1]', []],
    ['O11', 'B', 'Member 900.12.3456 on file', 'Member [MEMBER_ID] on file', []],
    ['O13', 'B', 'Member 900_12_3456 on file', 'Member [MEMBER_ID] on file', []],
    ['O14', 'B', 'Member 900·12·3456 on file', 'Member [MEMBER_ID] on file', []],
    ['O15 HICN suffix', 'B', 'Member 900-12-3456-A on file', 'Member [MEMBER_ID] on file', []],
    // Another patient's (X rows): redacted, and offered to the one-patient screen
    ['X1', 'A', 'Also member 900-55-1234 (SYN OTHER).', 'Also member [SSN] (SYN OTHER).', ['900551234']],
    ['X2', 'A', 'Also member 900551234.', 'Also member [SSN].', ['900551234']],
    ['X3', 'A', 'Also claim 2025550198.', 'Also claim 2025550198.', ['2025550198']],
    ['X4', 'A', 'Also claim 202-555-0198.', 'Also claim [PHONE].', ['2025550198']],
    ['X5', 'A', 'Also claim (202) 555-0198.', 'Also claim [PHONE].', ['2025550198']],
    ['X6 a prefix, four tokens', 'A', 'Also ZZ-202-555-0198.', 'Also ZZ-[PHONE].', ['ZZ2025550198', '2025550198']],
    ['X7 a dependent suffix', 'A', 'Also member 900-55-1234-01.', 'Also member [SSN]-01.', ['90055123401', '900551234']],
    ['X8 a prefix in parentheses', 'A', 'Claim SYN (202) 555-0198', 'Claim SYN [PHONE]', ['SYN2025550198', '2025550198']],
    // What must stay (K, D, N, C, Z, T, I, E, R rows)
    ['K1', 'A', 'Billed $1,234.56 today.', 'Billed $1,234.56 today.', []],
    ['K2', 'A', 'Billed 1,234,567.00 today.', 'Billed 1,234,567.00 today.', []],
    ['K3', 'A', 'Billed $123-45 today.', 'Billed $123-45 today.', []],
    ['K4', 'A', 'Billed $900,123,456.00 today.', 'Billed $900,123,456.00 today.', []],
    ['D1', 'A', 'Appeal by 2026-11-01.', 'Appeal by 2026-11-01.', []],
    ['D2', 'A', 'Appeal by 11/01/2026.', 'Appeal by 11/01/2026.', []],
    ['D3', 'A', 'Appeal by 11-01-2026.', 'Appeal by 11-01-2026.', []],
    ['D4', 'A', 'Appeal by 01.11.2026.', 'Appeal by 01.11.2026.', []],
    ['D5', 'A', 'Appeal by 2026 11 01.', 'Appeal by 2026 11 01.', []],
    ['D6', 'A', 'Appeal by 11 01 2026.', 'Appeal by 11 01 2026.', []],
    ['D7', 'A', 'Appeal by 20261101.', 'Appeal by 20261101.', []],
    ['D8', 'A', 'Appeal by 110126.', 'Appeal by 110126.', []],
    ['D9', 'A', 'Appeal by November 1, 2026.', 'Appeal by November 1, 2026.', []],
    ['D10', 'A', "Appeal by Nov 1st '26.", "Appeal by Nov 1st '26.", []],
    ['D11', 'A', 'Appeal by 01-NOV-26.', 'Appeal by 01-NOV-26.', []],
    ['D12', 'A', 'Appeal by 11/30/26.', 'Appeal by 11/30/26.', []],
    ['D13', 'A', 'Remitted 2026-10-28, serviced 10/01/2026, appeal by 12/31/2026.', 'Remitted 2026-10-28, serviced 10/01/2026, appeal by 12/31/2026.', []],
    ['D14 the date of birth, by its own rule', 'A', 'DOB 03/03/1961.', 'DOB [DATE_OF_BIRTH].', []],
    ['N1', 'A', 'NPI 1234567893.', 'NPI 1234567893.', []],
    ['N2', 'A', 'Rendering NPI 2345678900.', 'Rendering NPI 2345678900.', []],
    ['N3', 'A', 'Provider 1234567893.', 'Provider 1234567893.', []],
    ['N4 an unlabeled ten that passes the NPI check', 'A', 'Provider 2025550106.', 'Provider 2025550106.', []],
    ['C1', 'A', 'CPT 97110 and 97140.', 'CPT 97110 and 97140.', []],
    ['C2', 'A', 'HCPCS G0283, A4556.', 'HCPCS G0283, A4556.', []],
    ['C3', 'A', 'CARC CO-45, RARC N130.', 'CARC CO-45, RARC N130.', []],
    ['C4', 'A', 'ICD-10 M54.50.', 'ICD-10 M54.50.', []],
    ['C5', 'A', 'Line 97110-GP-59.', 'Line 97110-GP-59.', []],
    ['Z1', 'A', 'Los Synth, CA 90001.', 'Los Synth, CA 90001.', []],
    ['Z2', 'A', 'Los Synth, CA 90001-1234.', 'Los Synth, CA 90001-1234.', []],
    ['Z3 a bare ZIP+4 (15.14)', 'A', 'Los Synth, CA 900011234.', 'Los Synth, CA [SSN].', ['900011234']],
    ['T1', 'A', 'TIN 90-0123456.', 'TIN 90-0123456.', []],
    ['T2', 'A', 'TIN 900123457.', 'TIN 900123457.', []],
    ['I1', 'A', 'ICN 12345678901.', 'ICN 12345678901.', []],
    ['I2', 'A', 'ICN 1234567890123.', 'ICN 1234567890123.', []],
    ['I3', 'A', 'Control 12345678901234.', 'Control 12345678901234.', []],
    ['E1', 'A', 'EFT 1900123456, check 000555012.', 'EFT 1900123456, check 000555012.', []],
    ['E2', 'A', 'TRN*1*SYN20261101*1900000001~', 'TRN*1*SYN20261101*1900000001~', []],
    ['R1', 'A', 'Reference 2026-1101-0001.', 'Reference 2026-1101-0001.', []],
    ['R2', 'A', 'Appeal SYN-APL-555-0123; call 1-800-555-0100.', 'Appeal SYN-APL-555-0123; call [PHONE].', ['8005550100']],
    ['R3', 'A', 'Group 900123 plan 55501, REF-SYN-77.', 'Group 900123 plan 55501, REF-SYN-77.', []],
    ['R4', 'A', 'Hours 8:00-5:00, 555-0100 local.', 'Hours 8:00-5:00, 555-0100 local.', []],
    ['R5', 'A', 'Page 1 of 2', 'Page 1 of 2', []],
    ['R14 a date-shaped claim number with an implausible year, not the call’s', 'A', 'Claim 0023-04-26 on file.', 'Claim 0023-04-26 on file.', ['00230426']],
    // Section 17, R1: amounts and dates are never read across a period and white space
    ['R1-1', 'A', 'Billed $150.00 2026-11-01', 'Billed $150.00 2026-11-01', []],
    ['R1-2', 'A', '150.00 1200.00', '150.00 1200.00', []],
    ['R1-3', 'A', 'Total 1,250.00 2026', 'Total 1,250.00 2026', []],
    ['R1-4', 'A', 'Row 250 10 1500.00', 'Row 250 10 1500.00', []],
    ['R1-5', 'A', 'Row 250 100 1500.00', 'Row 250 100 1500.00', []],
    ['R1-6', 'A', 'Paid 150.00\n2026-11-01', 'Paid 150.00\n2026-11-01', []],
    ['R1-7 period then dash', 'A', 'Call 202.555-0123', 'Call [PHONE]', ['2025550123']],
    ['R1-8 dash then period', 'A', 'Call 202-555.0123', 'Call [PHONE]', ['2025550123']],
    ['R1-9 a comma list of SSNs', 'A', '900-12-3456,900-55-1234', '[SSN],[SSN]', ['900123456', '900551234']],
    ['R1-10 a comma list of phones', 'A', '202-555-0123,202-555-0198', '[PHONE],[PHONE]', ['2025550123', '2025550198']],
    ['R1-11 a table row of small numbers (15.10)', 'A', 'Line 001 02 1500', 'Line [SSN]', []],
    // R2: a line break, with indentation, inside or between groups
    ['R2-1', 'A', 'SSN 900-12-34\n56', 'SSN [SSN]', ['900123456']],
    ['R2-2', 'A', 'SSN 900-12-34-\n56', 'SSN [SSN]', ['900123456']],
    ['R2-3', 'A', 'Call 202-555-01\n23', 'Call [PHONE]', ['2025550123']],
    ['R2-4', 'A', 'SSN 900-\r\n    12-3456', 'SSN [SSN]', ['900123456']],
    ['R2-5', 'A', 'SSN 900\n    12 3456', 'SSN [SSN]', ['900123456']],
    ['R2-6', 'A', 'Call (202)\n    555-0123', 'Call [PHONE]', ['2025550123']],
    ['R2-7', 'A', 'Call 202 - \r\n 555-0123', 'Call [PHONE]', ['2025550123']],
    ['R2-8 NEL', 'A', '900\u008512\u00853456', '[SSN]', ['900123456']],
    ['R2-9', 'A', '900--12--3456', '[SSN]', ['900123456']],
    ['R2-10', 'A', '202‐‐555-0123', '[PHONE]', ['2025550123']],
    ['R2-11 a phone before a numbered line', 'A', 'Call 202-555-0123\n2. Submit the form', 'Call [PHONE]\n2. Submit the form', ['2025550123']],
    ['R2-12', 'A', 'Billed 20261101\n1', 'Billed 20261101\n1', []],
    ['R2-13', 'A', '97110\n1500 units', '97110\n1500 units', []],
    ['R2-14 a labeled nine wrapped across a line', 'A', 'SSN 90012\n3456', 'SSN [SSN]', ['900123456']],
    // R3: digit values
    ['R3-1 Arabic-Indic', 'A', 'Call ٢٠٢-٥٥٥-٠١٢٣', 'Call [PHONE]', ['2025550123']],
    ['R3-2', 'A', 'Call (٢٠٢) ٥٥٥-٠١٢٣', 'Call [PHONE]', ['2025550123']],
    ['R3-3 Devanagari', 'A', 'Call २०२-५५५-०१२३', 'Call [PHONE]', ['2025550123']],
    ['R3-4', 'A', 'Subscriber ٢٠٢٥٥٥٠١٢٣', 'Subscriber [PHONE]', ['2025550123']],
    // R4: a digit and an invisible run before the number
    ['R4-1', 'A', `On 11/01/2026${Z}202-555-0123`, `On 11/01/2026${Z}[PHONE]`, ['2025550123']],
    ['R4-2', 'A', `Claim 12345${Z}900-12-3456`, `Claim 12345${Z}[SSN]`, ['900123456']],
    ['R4-3', 'A', `DOB 03/03/1961${Z}2025550198`, `DOB [DATE_OF_BIRTH]${Z}[PHONE]`, ['2025550198']],
    // R5: labels and keep-nouns (with step 0's A7 and A8)
    ['R5-1', 'A', 'Please contact us regarding member 900551234', 'Please contact us regarding member [SSN]', ['900551234']],
    ['R5-2', 'A', 'Call about subscriber 900551234', 'Call about subscriber [SSN]', ['900551234']],
    ['R5-3', 'A', 'Phone/SSN: 2025550123', 'Phone/SSN: [SSN]', ['2025550123']],
    ['R5-4', 'A', 'Medicare 3456789012', 'Medicare [PHONE]', ['3456789012']],
    ['R5-5', 'A', 'Phone on file for claim: 2025550123', 'Phone on file for claim: [PHONE]', ['2025550123']],
    ['R5-6', 'A', 'Member SSN or claim 900551234', 'Member SSN or claim [SSN]', ['900551234']],
    ['R5-7', 'A', 'Case manager reachable at 2025550123', 'Case manager reachable at [PHONE]', ['2025550123']],
    ['R5-8', 'A', 'Group subscriber 900123456', 'Group subscriber [SSN]', ['900123456']],
    ['R5-9', 'A', 'Please call regarding claim 2025550123', 'Please call regarding claim [PHONE]', ['2025550123']],
    ['R5-10', 'A', 'Medicare provider NPI 1234567893', 'Medicare provider NPI 1234567893', []],
    ['R5-11', 'A', 'Contact your provider, NPI 2025550106', 'Contact your provider, NPI 2025550106', []],
    ['R5-12', 'A', 'Medicare Advantage TIN 900123457', 'Medicare Advantage TIN 900123457', []],
    ['R5-13', 'A', 'Medicare Advantage claim 1900123456', 'Medicare Advantage claim 1900123456', []],
    ['R5-14', 'A', 'Reference no.: 2025550123', 'Reference no.: 2025550123', []],
    ['R5-15', 'A', 'Tax ID number 900123457', 'Tax ID number 900123457', []],
    // Review round 1, corr-ssn-3: a shape after a currency sign is an amount (R1b's currency guard, on every shaped match).
    ['K-c1 a currency sign before a phone shape', 'A', 'Paid $202-555-0123 in full.', 'Paid $202-555-0123 in full.', []],
    ['K-c2 spaced', 'A', 'Billed $202 555 0123 total', 'Billed $202 555 0123 total', []],
    ['K-c3 an SSN shape', 'A', 'Paid $900 12 3456 total', 'Paid $900 12 3456 total', []],
    ['K-c4 a space after the sign', 'A', 'Paid $ 900 12 3456 total', 'Paid $ 900 12 3456 total', []],
    ['K-c5 the euro sign and periods', 'A', 'Paid \u20AC202.555.0123', 'Paid \u20AC202.555.0123', []],
    ['R5-15a the IRS’s wording (review round 1, corr-ssn-4)', 'A', 'Tax identification number 900123457', 'Tax identification number 900123457', []],
    ['R5-15b', 'A', 'Federal tax identification number: 900123457', 'Federal tax identification number: 900123457', []],
    ['R5-16', 'A', 'Claim #: 900123456', 'Claim #: 900123456', []],
    ['R5-17 (15.15)', 'A', 'Claim number is 2025550123', 'Claim number is [PHONE]', ['2025550123']],
    ['R5-18 a keep-noun across a sentence end (A7)', 'A', 'See our claim. 900551234 is the subscriber number.', 'See our claim. [SSN] is the subscriber number.', ['900551234']],
    ['R5-19 (A7)', 'A', 'Claim. ID 900551234', 'Claim. ID [SSN]', ['900551234']],
    ['R5-20 an abbreviation’s full stop (A7)', 'A', 'Ref. No. 2025550123', 'Ref. No. 2025550123', []],
    ['R5-21 a wrapped label (A7)', 'A', 'Claim\nNumber: 900123456', 'Claim\nNumber: 900123456', []],
    ['R5-22 Markdown bold (A8)', 'A', '**Claim:** 900123456', '**Claim:** 900123456', []],
    ['R5-23 a comma (A8)', 'A', 'Claim, 900123456', 'Claim, 900123456', []],
    ['R5-24 an opening quote (A8)', 'A', 'Claim: “2025550123”', 'Claim: “2025550123”', []],
    ['R5-25 an equals sign (A8)', 'A', 'Claim = 2025550123', 'Claim = 2025550123', []],
    ['R5-26 a phone label never keeps a nine', 'A', 'Call 900551234', 'Call [SSN]', ['900551234']],
    // R12: rare forms
    ['R12-1', 'A', 'SSN ###-##-3456', 'SSN [SSN]', []],
    ['R12-2', 'A', 'SSN ___-__-3456', 'SSN [SSN]', []],
    ['R12-3', 'A', 'SSNXXX-XX-3456', 'SSN[SSN]', []],
    ['R12-4', 'A', 'SSN *****3456', 'SSN [SSN]', []],
    ['R12-s1 residual: 1 and ten as one run', 'A', 'Patient 12025550123', 'Patient 12025550123', []],
    ['R12-s2 residual: a digit in a local number’s window', 'A', 'Phone 1: 555-0100', 'Phone 1: 555-0100', []],
    ['R12-s3 residual: two phones with nothing between', 'A', '202-555-0123202-555-0124', '202-555-0123202-555-0124', []],
    // A1: the number joiners the call's own number reads, in a shape
    ['A1-1 bullets', 'A', 'Call 202•555•0123', 'Call [PHONE]', ['2025550123']],
    ['A1-2 middle dots', 'A', '900·12·3456', '[SSN]', ['900123456']],
    ['A1-3 underscores', 'A', '900_12_3456', '[SSN]', ['900123456']],
    // Glued, labeled
    ['G1', 'A', 'Tel202-555-0123', 'Tel[PHONE]', ['2025550123']],
    ['G2', 'A', 'SSN900-12-3456', 'SSN[SSN]', ['900123456']],
    ['L-1 a label across one line break', 'A', 'Fax\n2025550124', 'Fax\n[PHONE]', ['2025550124']],
    ['L-2 a labeled local number', 'A', 'Call 555-0100', 'Call [PHONE]', []],
    ['L-3', 'A', 'Patient ID 900551234', 'Patient ID [SSN]', ['900551234']],
    ['L-4', 'A', 'ID: 900.55.1234', 'ID: [SSN]', ['900551234']],
    // Review round 1, SEC-3: a form feed (pdftotext's page break) and a vertical tab are line breaks, U+1680 is a space.
    ['SEC3-1 form feeds', 'A', 'Subscriber 900\f12\f3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC3-2 form feeds', 'A', 'Tel 202\f555\f0123 on file.', 'Tel [PHONE] on file.', ['2025550123']],
    ['SEC3-3 vertical tabs', 'A', 'Subscriber 900\v12\v3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC3-4 U+1680', 'A', 'Subscriber 900\u168012\u16803456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC3-5 U+1680', 'A', 'Tel 202\u1680555\u16800123 on file.', 'Tel [PHONE] on file.', ['2025550123']],
    ['SEC3-6 a page break after a dash', 'A', 'Subscriber 900-12-\f3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC3-7 a page break and a dash', 'A', 'Subscriber 900\f12-3456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC3-8 a page break inside a phone', 'A', 'Phone 202-555-\f0123 on file.', 'Phone [PHONE] on file.', ['2025550123']],
    ['SEC3-9 U+1680 and a dash', 'A', 'Subscriber 900-12\u16803456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    // Review round 1, SEC-6: the braille blank (U+2800) is a blank.
    ['SEC6-1 braille blanks', 'A', 'Subscriber 900\u280012\u28003456 on file.', 'Subscriber [SSN] on file.', ['900123456']],
    ['SEC6-2 braille blanks', 'A', 'Tel 202\u2800555\u28000123 on file.', 'Tel [PHONE] on file.', ['2025550123']],
  ];

  it.each(rows)('%s: sends %j as expected, refuses none, and offers the screen what it must (patient %s)', (_row, row, letter, sent, offered) => {
    const { patient, claims } = who(row);
    const redacted = redactLetterForScreen(letter, patient, claims);
    expect(redacted.text).toBe(sent);
    expect(redactLetter(letter, patient, claims).text).toBe(sent);
    expect(holdsIdentifier(redacted.text, patient, claims)).toBe(false);
    for (const candidate of offered) {
      expect(redacted.candidates).toContain(candidate);
    }
    // The call's own identifiers are never offered.
    for (const own of [...patient.memberIds, ...claims.flatMap((claim) => claim.claimNumbers)]) {
      expect(redacted.candidates).not.toContain(own.replace(/[^\p{L}\p{N}]/gu, ''));
    }
    // A placeholder's word is never offered as part of a run of the sent text.
    if (!/SSN|PHONE/i.test(letter)) {
      expect(identifierCandidates(redacted.text).filter((candidate) => /SSN|PHONE/.test(candidate))).toEqual([]);
    }
  });

  it('pins the call’s own claim when a phone shape is written against a token of it, and a short claim inside another patient’s number lends no placeholder (R6)', () => {
    const claims = [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-15', claimNumbers: ['SYN2025550123'] }];
    expect(redactLetter('Claim SYN (202) 555-0123', A, claims).text).toBe('Claim [CLAIM_1]');
    const short = [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-15', claimNumbers: ['1234'] }];
    const screened = redactLetterForScreen('Also member 900-55-1234.', A, short);
    expect(screened.text).toBe('Also member [SSN].');
    expect(screened.candidates).toContain('900551234');
    expect(holdsIdentifier(screened.text, A, short)).toBe(false);
  });

  // The survivor scan (R7, with step 0's A2 and A3): a 9- to 11-digit chain no pattern read is refused, never sent.
  it.each([
    ['an OCR space inside a group', 'SSN 900-12-34 56'],
    ['a period and a space', 'Phone 202.555 0123'],
    ['a slash', 'Call 202/555-0123'],
    ['a closing parenthesis', 'Call 202)555-0123'],
    ['four groups, a date’s last six (A3)', 'SSN 900-12-03-56'],
    ['four groups with periods (A3)', 'SSN 900.12.03.56'],
    ['four groups, a date-shaped tail (A3)', 'SSN 900-11-20-26'],
    ['an amount-shaped tail (A3)', 'SSN 900-12-34.56'],
    ['a 3-3-3 reference', 'Ref 900 551 234'],
    ['a semicolon with no space after it (A2)', 'SSN 900;12;3456'],
    ['a spaced nine in a comma list', 'SSN 900 12 3456,900 55 1234'],
    ['a digit and an invisible run before a number with one inside it (read on neither reading)', 'Claim 12345\u200B900-1\u200B2-3456'],
    // Review round 1 (SEC-1, corr-ssn-1, SEC-4, SEC-5): a labeled chain, whatever its grouping.
    ['a labeled 3-7 phone (SEC-1)', 'Phone: 202-5550123'],
    ['a labeled 5-4 SSN (corr-ssn-1)', 'SSN 90012-3456'],
    ['a labeled 3-6 SSN (corr-ssn-1)', 'SSN 900-123456'],
    ['a labeled SSN digit by digit (SEC-4)', 'SSN 9 0 0 1 2 3 4 5 6'],
    ['a labeled phone in five pairs (SEC-4)', 'phone 20 25 55 01 23'],
    ['a labeled SSN with a period and a space (SEC-5)', 'SSN 900.12 3456'],
    ['four spaces between groups (SEC-2)', 'SSN 900    12    3456'],
    ['eight spaces between groups (SEC-2)', 'Tel 202        555        0123'],
    ['tabs between groups (SEC-2)', 'SSN 900\t\t\t\t12 3456'],
    ['katakana prolonged sound marks (SEC-6)', 'SSN 900\u30FC12\u30FC3456'],
    ['division slashes (SEC-6)', 'SSN 900\u221512\u22153456'],
    ['ideographic commas (SEC-6)', 'Tel 202\u3001555\u30010123'],
  ])('refuses a letter in which a chain survives: %s', (_case, letter) => {
    const redacted = redactLetter(letter, A, AC);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(true);
    let message = '';
    try {
      denialLetterSpec.prepare({ ...syntheticLetterInput(), patient: A, claims: AC, text: letter });
    } catch (error) {
      expect(error).toMatchObject({ code: 'identifier_left' });
      message = (error as Error).message;
    }
    expect(message).toBe('the letter still holds an identifier after redaction; it is not sent');
    expect(message).not.toMatch(/\p{Nd}/u);
  });

  it.each([
    ['a service-line row', '97110   1   1200.00'],
    ['a page number and a row', 'Page 1 of 2   97110 1   150.00'],
    ['numbered lines', 'Claim lines 1 2 3 4 5 6 7 8 9'],
    ['an amount before a date', 'Paid $150.00 2026-11-01'],
    ['a slashed date before a code', 'DOS 11/01/2026 97110 GP 1'],
    ['an amount and a date on two lines', 'Billed 150.00\n2026-11-01'],
    ['a compact date and a unit', '20261101\n1'],
    ['a code and units on two lines', '97110\n1500 units'],
    ['codes in a row', 'Codes 97110 97140 97530 G0283'],
    ['a CPT range', 'CPT range 97110-97546'],
    ['two dates', '2026-10-28 2026-11-01'],
    ['a list', 'Lines 101; 102; 103'],
    ['a ZIP+4', 'CA 90001-1234'],
    ['a TIN', 'TIN 90-0123456'],
    ['an ICN', 'ICN 12345678901'],
    ['an EFT trace', 'EFT 1900123456'],
    ['an NPI', 'NPI 2345678900'],
    ['a column-aligned service-line row (SEC-2)', '97110        1        1200.00'],
    ['a column-aligned ZIP+4 (SEC-2)', 'CA 90001        1234'],
  ])('refuses no letter of what must stay: %s', (_case, letter) => {
    const redacted = redactLetter(letter, A, AC);
    expect(redacted.text).toBe(letter);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(false);
  });

  it('refuses a hand-made redacted text that holds a surviving form, and a letter that glues the patient’s name to one (identifier_left, a fixed message with no number)', () => {
    for (const text of ['Call [CLAIM_1] at 202-555-0123', 'SSN 900 12 3456', 'Phone: 2025550123', 'xxx-xx-3456']) {
      expect(holdsIdentifier(text, A, AC), text).toBe(true);
    }
    expect(() => denialLetterSpec.prepare({ ...syntheticLetterInput(), patient: A, claims: AC, text: 'RE: Vantree900-12-3456' })).toThrow(expect.objectContaining({ code: 'identifier_left', message: 'the letter still holds an identifier after redaction; it is not sent' }));
  });

  it('rejects a claim reference that holds a placeholder without being one of the call’s claims (R10b)', () => {
    const letter = syntheticLetterInput({ text: `${SYNTHETIC_LETTER}\nCall 202-555-0123 or ZZ-900-55-1234.` });
    const context = denialLetterSpec.prepare(letter).context;
    expect(context.text).toContain('Call [PHONE] or ZZ-[SSN].');
    const reviewed = verifyDenialLetter(letter, { ...syntheticLetterOutput(), claim_references: [{ written: 'ZZ-[SSN]', quote: 'ZZ-[SSN]' }, { written: '[PHONE]', quote: 'Call [PHONE]' }] }, context);
    expect(reviewed.proposal.fields.filter((field) => field.field.startsWith('claim_references')).map((field) => field.problems)).toEqual([['unknown_claim'], ['unknown_claim']]);
    expect(reviewed.proposal.claims).toEqual([]);
  });

  it('refuses before the call a letter that writes another patient’s member ID SSN-shaped, and asks the records about it, never the call’s own', async () => {
    const ON: FlagRow = { key: 'model.read_denial_letter', scope: 'global', scopeId: null, value: true };
    const text = `${SYNTHETIC_LETTER}\nAlso member 900-55-1234.`;
    const records = syntheticRecords(['900551234']);
    const refused = syntheticLetterInput({ text, otherPatients: records });
    const { gateway, local, store } = localGateway({ flags: [ON] });
    registerOutput(local, 'readDenialLetter', refused, syntheticLetterOutput());
    await expect(gateway.readDenialLetter({ practiceId: SYNTHETIC_IDS.practice, requestKey: 'letter-ssn-other' }, refused)).rejects.toMatchObject({ code: 'more_than_one_patient' });
    expect(local.requests).toEqual([]);
    expect(store.calls).toEqual([]);
    expect(records.asked.flat()).toContain('900551234');
    expect(records.asked.flat().some((candidate) => candidate.includes('SYNMEMBER0042') || candidate.includes('SYNCLAIM0001'))).toBe(false);
    // The same letter with records that hold none of it is sent with [SSN] and no digit of the number.
    const sent = syntheticLetterInput({ text, otherPatients: syntheticRecords([]) });
    const second = localGateway({ flags: [ON] });
    registerOutput(second.local, 'readDenialLetter', sent, syntheticLetterOutput());
    await expect(second.gateway.readDenialLetter({ practiceId: SYNTHETIC_IDS.practice, requestKey: 'letter-ssn-sent' }, sent)).resolves.toMatchObject({ passed: true });
    expect(second.local.requests[0]?.user).toContain('Also member [SSN].');
    expect(second.local.requests[0]?.user).not.toMatch(/900-55|551234/);
  });
});
