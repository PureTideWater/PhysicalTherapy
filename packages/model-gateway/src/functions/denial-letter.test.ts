import { DENIAL_CATEGORIES } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FlagRow } from '../flags';
import { BARRIER, type LetterClaim, type PatientIdentifiers, dateForms, datesIn, fold, holdsIdentifier, identifierCandidates, redactLetter, redactLetterForScreen, redactionForms } from '../redact';
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
    // A longer number holding the ID is not the ID to redaction (another identifier, which the screen reads); the check
    // refuses it, since the ID glued to another number by a lost space has no boundary to read (review PHI2-1).
    expect(redactLetter('SYNTHETIC: account ZZ12345678', patient, claims).text).toBe('SYNTHETIC: account ZZ12345678');
    expect(holdsIdentifier('SYNTHETIC: account ZZ12345678', patient, claims)).toBe(true);
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
  const half = (unit: string) => unit.repeat(Math.floor(N / 2 / unit.length));
  /** MOD-16's CI counterexample: a letter whose chain only the range fix's barriers hold (cc3dd7f6 refused it for the range's digits). */
  const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
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
    // Review round 1, corr-ssn-2: every digit a wrapped candidate (about 10 to 30 times base 00fd2906's time before the fix).
    ['a digit and a bare line break, repeated', ['JANE Q VANTREE'], fill('5\n'), ['SYN555001']],
    ['a digit and a CRLF, repeated', ['JANE Q VANTREE'], fill('1\r\n'), ['SYN555001']],
    ['a digit, a dash and a bare line break, repeated', ['JANE Q VANTREE'], fill('5-\n'), ['SYN555001']],
    ['an amount before a date, repeated', ['JANE Q VANTREE'], fill('$150.00 2026-11-01 '), ['SYN555001']],
    // Review round 2: a date or amount range, and a list a keep-noun names (each followed back LIST_REACH numbers at most).
    ['date ranges joined by a hyphen, repeated', ['JANE Q VANTREE'], fill('10/01/2026-10/15/2026 '), ['SYN555001']],
    ['amount ranges joined by a hyphen, repeated', ['JANE Q VANTREE'], fill('150.00-120.00 '), ['SYN555001']],
    ['a list after a keep-noun as long as the letter', ['JANE Q VANTREE'], `Claims 900123456${fill(' and 900123457')}`, ['SYN555001']],
    // MOD-16 seed 1034253323: date ranges glued to the next word, and one word as long as the letter glued to a digit.
    ['date ranges glued to the next word, repeated', ['JANE Q VANTREE'], fill('Service 01/01/2020-01/02/2020Paid '), ['SYN555001']],
    ['one word as long as the letter, glued to a digit', ['JANE Q VANTREE'], `${'a'.repeat(N - 2)}1a`, ['SYN555001']],
    // Review GATEWAY1-1 and GATEWAY1-2: the third reading, and SEC-5's label read over the numbers before an amount.
    ['date ranges glued to an ordinal-like word after the year, repeated', ['JANE Q VANTREE'], fill('Service 01/01/2020-01/02/2020St. '), ['SYN555001']],
  ])('redacts a letter crafted to be slow in time linear in its length: %s', (_case, names, text, claimNumbers) => {
    const who = patient(names);
    const started = performance.now();
    // The path prepare runs: redaction, the screen's candidates, then the check (review GATEWAYJ1-5).
    const redacted = redactLetterForScreen(text, who, claim(...claimNumbers));
    expect(holdsIdentifier(redacted.text, who, claim(...claimNumbers))).toBe(false);
    expect(mentionsIdentifier(redacted.text, { names, numbers: [...who.memberIds, ...claimNumbers] })).toBe(false);
    const seconds = (performance.now() - started) / 1000;
    expect(seconds, `redacted and checked ${String(text.length)} characters in ${seconds.toFixed(2)} s`).toBeLessThan(3);
  });

  // Review round 3 (GATEWAY3-3): the check's own paths, a letter it refuses included, in time linear in its length.
  it.each([
    // The call's identifiers glued to text (ownIdentifierGlued): a run of letters a digit touches, read once per part.
    ['a run of one letter a digit touches, for names of short repeated parts', ['ZZ ZZZ ZZZZ ZZZZZ', 'ZZ-ZZ ZZZ', 'ZZZZZZ ZZ'], `1${'Z'.repeat(N)}1`, true],
    ['the same run for names none of whose parts it holds', ['ZQ ZZQ ZZZQ', 'QZ'], `1${'Z'.repeat(N)}1`, false],
    ['an alternating camel-case run a digit touches', ['AB BA'], `1${fill('aB')}`, false],
    ['month words at the ends of runs before digits (a date of birth glued to a word)', ['MAY MARCH'], fill('xMar 3, 1961'), true],
    ['dates of birth glued to amounts', ['JANE Q VANTREE'], fill('3/3/61150.00 '), true],
    // The scan's held ranges, each walked once for what stands beside it.
    ['ranges of a date and an amount joined by white space', ['JANE Q VANTREE'], fill('01/01/2020-150.00 '), false],
    ['ranges glued to a short part of the name', ['JA Q ZE'], fill('1/1/20-1.00Ja '), false],
    // Review GATEWAY1-2's read over the numbers before each amount: an amount after a range's end may be an identifier's
    // other part, so the letter is refused, as at cc3dd7f6.
    ['amounts after a range, each read for a label over the numbers before it', ['JANE Q VANTREE'], fill('Billed 01/01/2020-150.00-120.00 1.00 '), true],
    ['ranges then an SSN label glued to a word', ['JANE Q VANTREE'], fill('01/01/2020-150.00-PaidSSN 9 '), true],
    // The judge's review round 1: with a held chain, every run read for a part anywhere and the letter read blind to its
    // separators; a held range's end glued to a run of mask characters; heads of parts before the name's placeholder.
    ['held letters, every run read for a part of the name anywhere (PHIJ1-1)', ['AL MAY Q'], fill('Seen 01/01/2020-150.00Paid in full '), false],
    ['held letters, read blind to their separators for the call’s identifiers (PHIJ1-3)', ['JANE Q VANTREE'], fill('Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 1 2 '), false],
    ['a held range’s end glued to a word as long as the letter, then a dash and a digit (PHIJ1-5)', ['JANE Q VANTREE'], `Seen 01/01/2020-150.00Paid${'X'.repeat(N - 30)}-a1`, false],
    ['a held range’s end glued to lower-case letters as long as the letter (PHIJ1-5)', ['JANE Q VANTREE'], `Seen 01/01/2020-150.00${'x'.repeat(N - 30)}-a1`, false],
    ['runs glued to a digit before the name, each read as a part’s head (GATEWAYJ1-4)', ['DANIELLE LE'], fill('1Daniel Le '), true],
    ['runs glued to a digit before the name, a head whose rest is no part (GATEWAYJ2-2)', ['DANIELLE LE'], fill('1Dan Le '), false],
    ['birth labels in a held letter, each read for a date redaction did not take (PHIJ1-3)', ['JANE Q VANTREE'], fill('DOB on file 01/01/2020-150.00 '), true],
    // The judge's review round 2: the date of birth's month words and its years far apart in a held letter, read in one walk
    // of both lists (PHIJ2-4: 772 ms at 100 kB and 8.8 s at 400 kB before); a short part's letters each alone and the date
    // of birth's two-digit-year forms, near misses all (GATEWAYJ2-3, PHIJ2-2).
    ['held letters, the date of birth’s month words, then its years far from them (PHIJ2-4)', ['JANE Q VANTREE'], `${HELD}${half('Mar. ')} filler words here and there. ${half('1961/')}`, false],
    ['held letters, the date of birth’s years, then its month words far from them (PHIJ2-4)', ['JANE Q VANTREE'], `${HELD}${half('1961/')} filler words here and there. ${half('March ')}`, false],
    // Since co-001/redact-ssn-phone-leaks a held letter's chains are read with groups of five to seven digits as parts, so
    // this row's and the next row's numbers stand with a word between them ("on"): side by side they chained to nine or ten
    // digits and the letter was refused. The near misses are the same, and so is the path they take.
    ['held letters, a short part’s letters each alone and two-digit-year dates, near misses (GATEWAYJ2-3, PHIJ2-2)', ['AL Q VANTREE'], `${HELD}${fill('A Lx 61-03-0 on 6103034 ')}`, false],
    // The judge's review round 3: the date of birth's parts read as runs in one pass, each compared with the two before it,
    // and its placeholder read for a part beside it (PHIJ3-1, PHIJ3-2), near misses all; glued birth labels, each read.
    ['held letters, the date of birth’s numbers, compacts and month words, near misses (PHIJ3-1)', ['JANE Q VANTREE'], `${HELD}${fill('61 03 04 Mar 6104 on 610304 on ')}`, false],
    ['held letters, the date of birth redacted again and again with another number beside it (PHIJ3-1)', ['JANE Q VANTREE'], `${HELD}${fill('03/03/1961 5 ')}`, false],
    ['held letters, birth labels glued to the words beside them, no date after them (PHIJ3-2)', ['JANE Q VANTREE'], `${HELD}${fill('PaidDOBon file, see the enclosed record. ')}`, false],
    // The judge's review round 4: the date of birth's parts with gaps of any length of white space and separators, each gap
    // read once, and every run of letters read against the name's initials, near misses all (PHIJ4-1, PHIJ4-2); a number's
    // own letters before the name, each read for a range's first end, an hour, a unit or a code (GATEWAYJ4-1).
    ['held letters, the date of birth’s parts with wide gaps and runs of letters near the initials, near misses (PHIJ4-1, PHIJ4-2)', ['JANE Q VANTREE'], `${HELD}${fill('JX QQ VXJ 61  /  03  /  04 Mar     6104     ')}`, false],
    // Review round 5: every stretch of the initials' own letters inside a longer run is read in windows no longer than the
    // name has parts, near misses all (PHI5-1).
    ['held letters, long runs of the initials’ own letters with no two of them together, near misses (PHI5-1)', ['JANE Q VANTREE'], `${HELD}${fill('JJJJJJJJ QQQQXVVVVVV XJXQXVX ')}`, false],
    ['held letters, the date of birth redacted again and again, another number past a wide gap beside it (PHIJ4-1)', ['JANE Q VANTREE'], `${HELD}${fill('03/03/1961  /     5     ')}`, false],
    ['times, ordinals, units and codes glued before a part read as the name (GATEWAYJ4-1)', ['AMAL AL HASSAN'], fill('9-10am Al 3rd-4th 30min Al 97110AM Al '), false],
    // Review round 5: one held range of many ends, each chain of its groups asking whether the range stands: settled once
    // per range (F3: 4.5 s at 20 kB and 122 s at 100 kB before).
    ['one held range of dates and amounts as long as the letter (F3)', ['JANE Q VANTREE'], `Service 01/01/2020${fill('-150.00-01/01/2020')}`, false],
    ['one held range of dates and amounts as long as the letter, its last date glued to a word (F3)', ['JANE Q VANTREE'], `${fill('01/01/2020-150.00-')}01/01/2020Paid`, false],
    // co-001/redact-ssn-phone-leaks (MOD-22): in a held letter or not, every run of letters and digits is read at every
    // place for each of the call's own name parts and numbers written with a digit for a letter or a letter for a digit.
    // One run as long as the letter, every stretch of it a near miss (a form with one letter that is no look-alike), for a
    // patient with six name parts, a member ID and a claim number; and the same run ending in one form, which is refused.
    ['a held letter of one run of letters and digits, near misses of the own identifiers’ digit-for-letter forms (MOD-22)', ['SIMONE VANTREE', 'ZEPHYRA BELLO', 'JUNE ORLANDO'], `${HELD}${fill('S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1')}`, false],
    ['the same run with one digit-for-letter form at its end (MOD-22)', ['SIMONE VANTREE', 'ZEPHYRA BELLO', 'JUNE ORLANDO'], `${HELD}${fill('S1MONXVANTR3XZ3PHYRXB3LLXORLANDXZZ12345X7SYN5550X1')}S1MONE`, true],
    // And the date of birth's writings no rule reads, read in a held letter (MOD-22): its month as a Roman numeral, its
    // month's word with a day and no year, its year in words, and its two-digit year, month and day run together at the
    // start or the end of a run of digits. Near misses all (another day, another year, a compact one digit off); and the
    // same letter ending in the date of birth with a Roman month, which is refused.
    ['a held letter of month words, Roman numerals and runs of four and five digits, near misses of the date of birth (MOD-22)', ['JANE Q VANTREE'], `${HELD}${fill('Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on file, March nineteen sixty-two. ')}`, false],
    ['the same letter with the date of birth written with a Roman month at its end (MOD-22)', ['JANE Q VANTREE'], `${HELD}${fill('Seen 3-III-1962 and III/13/1962, March the 13th, 4th of March; ref 6134 and 61304 on file, March nineteen sixty-two. ')}3-III-1961`, true],
  ] as const)('checks a letter crafted to be slow in time linear in its length: %s', (_case, names, text, refused) => {
    const who = patient([...names]);
    const started = performance.now();
    const redacted = redactLetterForScreen(text, who, claim('SYN555001'));
    expect(holdsIdentifier(redacted.text, who, claim('SYN555001'))).toBe(refused);
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
    ['D15 a service period joined by a hyphen (review round 2, finding 2)', 'A', 'Service 10/01/2026-10/15/2026.', 'Service 10/01/2026-10/15/2026.', []],
    ['D16', 'A', 'DOS 10/01/2026-10/15/2026 97110', 'DOS 10/01/2026-10/15/2026 97110', []],
    ['D17', 'A', 'Coverage 01/01/2026-12/31/2026.', 'Coverage 01/01/2026-12/31/2026.', []],
    ['D18', 'A', 'Eligibility 1/1/2026-12/31/2026 confirmed.', 'Eligibility 1/1/2026-12/31/2026 confirmed.', []],
    ['D19', 'A', 'Service period: 11/1/2026-11/15/2026.', 'Service period: 11/1/2026-11/15/2026.', []],
    ['D20', 'A', 'DOS 11/01/2026-11/01/2026', 'DOS 11/01/2026-11/01/2026', []],
    ['D21 ISO dates', 'A', 'From 2026-10-01-2026-10-15.', 'From 2026-10-01-2026-10-15.', []],
    ['D22 dashed dates', 'A', 'Service 10-01-2026-10-15-2026.', 'Service 10-01-2026-10-15-2026.', []],
    ['D23 an en dash', 'A', 'Service 10/01/2026–10/15/2026.', 'Service 10/01/2026–10/15/2026.', []],
    ['D24 two-digit years', 'A', 'Service 11/01/26-11/15/26.', 'Service 11/01/26-11/15/26.', []],
    ['K5 amounts joined by a hyphen (review round 2, finding 2)', 'A', 'Billed 150.00-120.00 allowed.', 'Billed 150.00-120.00 allowed.', []],
    ['K6', 'A', 'Range 123.45-67.89.', 'Range 123.45-67.89.', []],
    ['K7 comma thousands', 'A', 'Billed 1,250.00-980.00 allowed.', 'Billed 1,250.00-980.00 allowed.', []],
    ['N1', 'A', 'NPI 1234567893.', 'NPI 1234567893.', []],
    ['N2', 'A', 'Rendering NPI 2340178906.', 'Rendering NPI 2340178906.', []],
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
    ['I1', 'A', 'ICN 10012345678.', 'ICN 10012345678.', []],
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
    ['R1-11 a table row of small numbers (15.10)', 'A', 'Line 000 02 1500', 'Line [SSN]', []],
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
    ['R5-4', 'A', 'Medicare 2025550142', 'Medicare [PHONE]', ['2025550142']],
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
    ['R5-27 a list after a keep-noun (review round 2, finding 3)', 'A', 'Claim number(s) 900123456 and 900123457.', 'Claim number(s) 900123456 and 900123457.', []],
    ['R5-28', 'A', 'Reference numbers 2025550123, 2025550124.', 'Reference numbers 2025550123, 2025550124.', []],
    ['R5-29 three, with a comma and “and”', 'A', 'Claims 900123456, 900123457, and 2025550124.', 'Claims 900123456, 900123457, and 2025550124.', []],
    ['R5-30 “or”', 'A', 'Reference 2025550123 or 2025550124.', 'Reference 2025550123 or 2025550124.', []],
    ['R5-31 a label inside the list decides', 'A', 'Claim 900123456 and SSN 900551234', 'Claim 900123456 and SSN [SSN]', ['900551234']],
    ['R5-32 a word that is no list’s joiner', 'A', 'Claim 900123456 and member 900551234', 'Claim 900123456 and member [SSN]', ['900551234']],
    ['R5-33 a sentence end ends the list', 'A', 'Claim 900123456. 900551234 is on file.', 'Claim 900123456. [SSN] is on file.', ['900551234']],
    ['R5-34 a list after a phone label', 'A', 'Call 2025550123 or 2025550124.', 'Call [PHONE] or [PHONE].', ['2025550123', '2025550124']],
    ['R5-35 a list after an SSN label', 'A', 'SSN 900551234 and 900123456', 'SSN [SSN] and [SSN]', ['900551234', '900123456']],
    ['R5-36 a list after the call’s own claim', 'A', 'Claim SYNCLAIM0001 and 900123457.', 'Claim [CLAIM_1] and 900123457.', []],
    // R12: rare forms
    ['R12-1', 'A', 'SSN ###-##-3456', 'SSN [SSN]', []],
    ['R12-2', 'A', 'SSN ___-__-3456', 'SSN [SSN]', []],
    ['R12-3', 'A', 'SSNXXX-XX-3456', 'SSN[SSN]', []],
    ['R12-4', 'A', 'SSN *****3456', 'SSN [SSN]', []],
    ['R12-s1 residual: 1 and ten as one run', 'A', 'Patient 12025550123', 'Patient 12025550123', []],
    // R12-s2 and R12-s3 were residuals, each sent unchanged, until co-001/redact-ssn-phone-leaks (MOD-21; docs/adr/0054, its
    // amendment) closed them: a label is read through its own list number, so the local number after "Phone 1:" is
    // redacted (G5); and two phones with nothing between are refused (G1), so that row now stands with the letters in which
    // a chain survives, below.
    ['R12-s2 a label’s own list number before a local number (a residual until co-001/redact-ssn-phone-leaks closed it)', 'A', 'Phone 1: 555-0100', 'Phone 1: [PHONE]', []],
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
    // Review round 2, finding 2: dates or amounts joined by a hyphen are a range only when the range is joined to nothing else.
    ['a date range joined to a further group', 'Seen 10/01/2026-10/15/2026-0123'],
    ['an amount range joined to a further group', 'Ref 12.34-56.78-901'],
    // Review GATEWAY1-2: SEC-5's label is read over the numbers before an amount-shaped SSN or phone, and before its range's
    // first end, so a date, an amount, a currency amount or a range between them shields nothing.
    ['a labeled amount-shaped SSN after a date and a hyphen', 'SSN: 01/01/2020-900.12 3456'],
    ['after a date with a month word', 'SSN January 1, 2020-900.12 3456'],
    ['after a cents-less currency amount', 'SSN $10-900.12 3456'],
    ['with a comma, after an en dash', 'SSN 01/01/2020\u2013900,12 3456'],
    ['in 3.1 5', 'SSN 01/01/2020-900.1 23456'],
    ['in 1.2 2 4', 'SSN 01/01/2020-9.00 12 3456'],
    ['a labeled amount-shaped phone after a date', 'Phone 01/01/2020-202.55 50123'],
    ['after an amount and a hyphen', 'SSN 10.00-900.12 3456'],
    ['after a date and a space', 'SSN 01/01/2020 900.12 3456'],
    ['after a currency amount and a space', 'SSN $10.00 900.12 3456'],
    ['after an amount and a space', 'SSN 150.00 900.12 3456'],
    ['after a range whose later end follows a currency end', 'SSN: 8,281.35\u2013$57--990.53 6728'],
    ['a phone after two currency amounts', 'Phone $45-$97\u2212985.37 8257'],
    ['a phone after a range and a space', 'Phone 2023-04-10-130.80 912.90 2128'],
    ['a phone after a range ending in a currency amount', 'Contact us about 507.75\u2013$39-9.78 59 4246'],
    // Re-review GATEWAY1-1: a plain number in the amount's own run, before any word or span, is still read over.
    ['a labeled SSN whose amount follows a group of it', 'SSN 9001 2.34 56'],
    ['after a number in parentheses', 'SSN (2) 900.12 3456'],
    ['after words and a number', 'SSN of member 2: 900.12 3456'],
    ['after a number that starts its range', 'SSN 2: 01/01/2020-900.12 3456'],
    ['a phone after the phone word\u2019s own number', 'Phone 711 900.12 3456'],
    // A spaced SSN glued digit to digit to an amount after its label (review GATEWAY1-3), refused only because some run of
    // its groups under the label holds 9 or 10 digits (3456150 and the cents 00; 900, 12 and 34561): with other lengths
    // the class is a recorded residual, pinned below (re-review GATEWAY1-2).
    ['a labeled SSN glued to an amount, nine digits in a run under the label', 'SSN 900 12 3456150.00'],
    ['a labeled SSN glued to an amount that starts a range, nine digits in a run', 'SSN 900 12 3456150.00-01/02/2020'],
    ['a labeled SSN glued to a one-digit amount, ten digits in a run', 'SSN 900 12 34561.00'],
    // The labeled twin of an unlabeled amount-shaped phone at the start of a range, which is sent (re-review PHI1-1).
    ['a labeled amount-shaped phone that starts a range to a date', 'Phone 202 555 01.23-1/3/20'],
    // The twin with the label set apart from the word before it (review PHI2-3).
    ['an amount-shaped SSN at a range’s end after "Patient SSN"', 'Patient SSN 01/01/2020-900.12 3456'],
    // Review GATEWAY2-1: a labeled SSN or phone split with a group of five digits or more and an amount-shaped piece is
    // still one chain under its label (only a units column, a group under five digits, before the amount ends it).
    ['a labeled SSN of a five-digit group and cents', 'SSN 90012 34.56'],
    ['a labeled SSN of a five-digit group and an amount of four digits', 'SSN 90012 3456.00'],
    ['a labeled SSN with a five-digit group in the middle', 'SSN 900 12345 6.00'],
    ['a labeled phone with a five-digit group and cents', 'Phone 202 55501 23.45'],
    ['a labeled phone of a five-digit group and an amount', 'Phone 20255 501.23'],
    ['a labeled fax number of a five-digit group and an amount', 'Fax: 95274 588.97 1234'],
    // R12-s3, a residual (sent unchanged) until co-001/redact-ssn-phone-leaks closed it: another number's digits glued to a
    // phone's own shape (G1).
    ['two phones with nothing between (R12-s3, closed by co-001/redact-ssn-phone-leaks)', '202-555-0123202-555-0124'],
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
    ['an ICN', 'ICN 10012345678'],
    ['an EFT trace', 'EFT 1900123456'],
    ['an NPI', 'NPI 2340178906'],
    ['a column-aligned service-line row (SEC-2)', '97110        1        1200.00'],
    ['a column-aligned ZIP+4 (SEC-2)', 'CA 90001        1234'],
    ['a date glued to the next word after an amount (MOD-16 seed 20276943)', 'Billed $500-50 2020-01-01Paid $0,000.00'],
    ['a service period joined by a hyphen (review round 2, finding 2)', 'Service 10/01/2026-10/15/2026.'],
    ['a coverage period, unpadded', 'Eligibility 1/1/2026-12/31/2026 confirmed.'],
    ['ISO dates joined by a hyphen', 'From 2026-10-01-2026-10-15.'],
    ['dashed dates joined by a hyphen', 'Service 10-01-2026-10-15-2026.'],
    ['amounts joined by a hyphen', 'Billed 150.00-120.00 allowed.'],
    ['amounts joined by a hyphen, no word after', 'Range 123.45-67.89.'],
    ['a service period glued to the next word after an amount and a full stop (MOD-16 seed 1034253323)', 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00'],
    // Its class: a range glued to a word on either side or after a full stop with no space, of dates or amounts or one of
    // each, with any dash the scan joins over, a month word at an end, or an invisible character beside the dash.
    ['a service period glued to words on both sides', 'Service01/01/2020-01/02/2020Paid'],
    ['a service period after an amount and a full stop with no space', 'Paid $0,000.00.Service 01/01/2020-01/02/2020Paid $0,000.00'],
    ['an ISO period glued to the next word', 'From 2020-01-01-2020-01-02Paid'],
    ['a period of dashed dates glued to the next word', 'Service 01-01-2020-01-02-2020Paid'],
    ['a period ending in a month word, glued to the next word', 'Service 2020-01-01-2 January 2020Paid'],
    ['a period joined by an en dash, glued', 'Service 01/01/2020–01/02/2020Paid'],
    ['a period joined by an em dash, glued', 'Service 01/01/2020—01/02/2020Paid'],
    ['a period joined by the minus sign, glued', 'Service 01/01/2020−01/02/2020Paid'],
    ['a period joined by the hyphen bullet', 'Service 2020-01-01⁃2020-01-02.Paid'],
    ['a period joined by two hyphens, glued', 'Service 01/01/2020--01/02/2020Paid'],
    ['a period with a zero-width space before the dash, glued', 'Service 01/01/2020​-01/02/2020Paid'],
    ['a period joined by "to" with no spaces', 'Service 01/01/2020to01/02/2020Paid'],
    ['a range from a date to an amount', 'Service 01/01/2020-150.00 billed'],
    ['a range from an amount to one with a currency sign, glued', 'Billed 150.00-$120.00Paid'],
    ['an amount range after an amount with a currency sign and a full stop', 'Paid $0,000.00.$0,000.00-150.00 1234'],
    ['an amount range glued to the next word', 'Billed 0,000.00-9,999.00Paid'],
    // Review GATEWAY1-1: a range glued to a word that starts like an ordinal suffix after its year ("St.", "Rd.", "TH",
    // "nd"), or after a two-digit year; and ordinal dates at both ends, still read.
    ['a service period glued to "St." after its year', 'Service 10/01/2026-10/15/2026St. Joseph Medical Center'],
    ['an ISO period glued to "St."', "Service 2020-01-01-2020-01-02St. Luke's Hospital"],
    ['a period glued to "Rd."', 'Seen 01/01/2020-01/02/2020Rd. 9'],
    ['a period glued to "TH"', 'Seen 01/01/2020-01/02/2020TH'],
    ['a period glued to "St" and a space', 'Seen 01/01/2020-01/02/2020St Mary'],
    ['an ISO period glued to "nd"', 'Seen 2020-01-01-2020-01-02nd floor'],
    ['a period with two-digit years glued to "St."', 'Seen 01/01/2020-01/02/20St. Mary'],
    ['a period with a two-digit year glued to "Rd"', 'Service 01/01/2020-01/02/20Rd'],
    ['a period of ordinal dates glued to the next word', 'Service March 3rd, 2020-March 4th, 2020Paid'],
    ['a period of ordinal dates, day first, glued', 'Service 3rd of March, 2020-4th of March, 2020Paid'],
    // Review GATEWAY2-2: a day-first ordinal second end glued after its four-digit year to a word that starts like an
    // ordinal suffix, read on the glued reading that keeps only a day's suffix (cc3dd7f6 and 6fc88092 refused these).
    ['a day-first ordinal second end glued to "St."', 'Service 01/01/2020-4th of March, 2020St. Mary'],
    ['a day-first ordinal second end with no "of" glued to "St."', 'Service 01/01/2020-14th March 2020St. Mary'],
    ['an ISO first end and a first-of-month end glued to "TH"', 'Service 2020-03-04-1st of March, 2020TH'],
    ['a day-first ordinal second end glued to "Rd." after an en dash', 'Service 03/04/2020\u20133rd of March, 2020Rd. 9'],
    ['a day-first ordinal second end in capitals glued to "ST."', 'SERVICE 01/01/2020-4TH OF MARCH, 2020ST. MARY'],
    // Re-review GATEWAY1-1: SEC-5's label is read over a plain number only in the amount's own run, so a phone word's own
    // number ("TTY 711", "Fax 2") followed by words, a date or an amount ends the read, as a digit ends every label window.
    ['an amount before a year after a TTY sentence', 'TTY 711. Paid 150.00 2026'],
    ['amounts after a TTY line', 'TTY users call 711.\nBilled 150.00 120.00'],
    ['amounts in a list after a call sentence', 'Call 711. Billed 150.00, 120.00'],
    ['amounts after a fax line', 'Fax 3 pages: 150.00 120.00'],
    ['a row of amounts on the line after "TTY 711"', 'TTY 711\n150.00 120.00 30.00'],
    ['a row of amounts after "TTY 711" and a space', 'TTY 711 150.00 120.00'],
    ['a row with a currency amount on the line after "TTY 711"', 'TTY 711\n$150.00 120.00 30.00'],
    ['a row of small amounts after "TTY 711"', 'TTY 711\n150.00 12.00 3.00'],
    ['a date and amounts on the line after "Call 711"', 'Call 711\n01/02/2026 150.00 120.00'],
    ['a date and amounts after a fax line', 'Fax 2; 03/19/2026 150.00 120.00'],
    // Review GATEWAY2-1: a service-line row's code column and units column before its amount, after a phone or contact
    // sentence, end the own-run read's chain at the amount (cc3dd7f6 sent these; 435f0a68 to 6fc88092 refused them).
    ['a code and units row after a contact sentence', 'If you have questions, please contact us.\n97110 1 150.00 120.00'],
    ['a code and units row after a call sentence', 'Questions? Call us.\n97110 2 150.00'],
    ['a code and units row after a toll-free line', 'Call us toll free.\n97161 3 34.20'],
    ['a code and units row after "Contact us." on one line', 'Contact us. 97110 1 150.00'],
  ])('refuses no letter of what must stay: %s', (_case, letter) => {
    const redacted = redactLetter(letter, A, AC);
    expect(redacted.text).toBe(letter);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(false);
  });

  // A range is a barrier only as a whole: an SSN or phone beside one, inside one or glued to one is still redacted, or the
  // letter refused (MOD-15 with MOD-16 seed 1034253323's barriers).
  it.each([
    ['an SSN after a date and a dash', 'Seen 01/01/2020-900-12-3456', 'Seen 01/01/2020-[SSN]'],
    ['a phone after an amount and a dash', 'Paid $10.00-555-012-3456', 'Paid $10.00-[PHONE]'],
    ['an SSN before a date and a dash', 'Seen 900-12-3456-01/01/2020', 'Seen [SSN]-01/01/2020'],
    ['a phone before an amount and a dash', 'Paid 555-012-3456-$10.00', 'Paid [PHONE]-$10.00'],
    ['an SSN glued to a word before a glued range', 'Paid900-12-3456-01/01/2020-01/02/2020Paid', 'Paid[SSN]-01/01/2020-01/02/2020Paid'],
    ['an SSN joined to a range and glued to the next word', 'Service 01/01/2020-01/02/2020-900-12-3456Paid', 'Service 01/01/2020-01/02/2020-[SSN]Paid'],
    ['a phone inside a range', 'Service 01/01/2020-555-012-3456-01/02/2020Paid', 'Service 01/01/2020-[PHONE]-01/02/2020Paid'],
    ['an SSN glued to the word after a range', 'Service 01/01/2020-01/02/2020Paid900-12-3456', 'Service 01/01/2020-01/02/2020Paid[SSN]'],
    ['a phone joined to a range by en dashes', 'Service 01/01/2020–01/02/2020–555–012–3456', 'Service 01/01/2020–01/02/2020–[PHONE]'],
    ['a spaced SSN joined to an ISO range', 'Service 2020-01-01-2020-01-02-900 12 3456', 'Service 2020-01-01-2020-01-02-[SSN]'],
    ['a phone joined to an amount range', 'Billed 150.00-120.00-555-012-3456Paid', 'Billed 150.00-120.00-[PHONE]Paid'],
    ['an SSN joined to a range of a date and an amount', 'Service 01/01/2020-150.00-900-12-3456', 'Service 01/01/2020-150.00-[SSN]'],
    ['a phone glued to its label after a glued range', 'Service 01/01/2020-01/02/2020Phone5550123456', 'Service 01/01/2020-01/02/2020Phone[PHONE]'],
    ['an SSN glued to "St" after a glued range (review GATEWAY1-1)', 'Seen 01/01/2020-01/02/2020St900-12-3456', 'Seen 01/01/2020-01/02/2020St[SSN]'],
  ])('redacts an SSN or phone beside a range: %s', (_case, letter, sent) => {
    const redacted = redactLetter(letter, A, AC);
    expect(redacted.text).toBe(sent);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(false);
  });

  it('pins a recorded residual: a day-first ordinal second end with a two-digit year glued to "St." is refused, its "St" read as a day’s suffix (review GATEWAY2-2)', () => {
    for (const letter of ['Service 01/01/2020-4th March, 20St. Mary', "Service 01/01/2020-4th of March, '20St. Mary"]) {
      expect(holdsIdentifier(redactLetter(letter, A, AC).text, A, AC), letter).toBe(true);
    }
  });

  it('refuses a letter whose SSN joined to a date has no shape a pattern reads (the range is no barrier)', () => {
    expect(holdsIdentifier(redactLetter('Seen 01/01/2020-900-1-2-3456', A, AC).text, A, AC)).toBe(true);
    expect(holdsIdentifier(redactLetter('Seen 01/01/2020-01/02/2020-900-1-2-3456Paid', A, AC).text, A, AC)).toBe(true);
  });

  it('refuses amounts a phone label is nearest, read over the numbers before them, as SEC-5 refuses "Call us about 150.00 1234" (review GATEWAY1-2, re-review GATEWAY1-1, review GATEWAY2-1: the fail-safe side)', () => {
    // The chain's first group under the label, or an amount right after the phone word's own number with nothing between.
    // cc3dd7f6 refused only the first; it sent the others, which 435f0a68's read over the numbers before an amount refuses
    // (docs/adr/0054 gives the measured share).
    for (const letter of ['Call us about 150.00 1234', 'Call us about 150.00-120.00', 'Call us about 150.00 120.00', 'TTY 711\n150.00 1234', 'Contact us. 150.00-120.00 total']) {
      expect(holdsIdentifier(redactLetter(letter, A, AC).text, A, AC), letter).toBe(true);
    }
    // Refused by design, as an SSN's five-digit first group would be (review GATEWAY2-1): a code right before the amount
    // with no units column, a units number after the label's own number, an HCPCS letter code (a letter ends the chain's
    // code column, so the units and the amount chain from the label).
    for (const letter of ['Calls are free.\nLine 1 97110 600.50', 'Hearing impaired: TTY 711\n1 150.00 0.00', 'Questions? Call us.\nG0283 1 150.00']) {
      expect(holdsIdentifier(redactLetter(letter, A, AC).text, A, AC), letter).toBe(true);
    }
  });

  // Recorded residuals (docs/adr/0054), pinned so a change to them is seen. cc3dd7f6 sent each of them, or refused it only
  // because a date or amount then joined the next group (A3), where MOD-16 now needs a barrier.
  it.each([
    // An unlabeled amount-shaped SSN or phone is read as an amount, as R1 keeps "150.00 1234": alone, after white space
    // or at an end of a range of two amounts, which cc3dd7f6 read as a barrier too (re-review PHI1-1). The must-stay rows
    // that force it are "Paid 900.12 3456 units" (redact.property.test.ts) and "Paid $0,000.00.$0,000.00-150.00 1234"
    // above; under a label it is refused.
    ['an unlabeled amount-shaped SSN at the end of a range of two amounts (since review round 2)', 'Paid 150.00-900.12 3456', 'Paid 150.00-900.12 3456'],
    // A phone label glued to the word before it by a lost space is no label, so the amount-shaped number is read as
    // unlabeled and sent, as at cc3dd7f6 (review PHI2-3): words end in the phone labels ("Fairfax", "smartphone"), so they
    // are not read glued. The Social Security label glued so is read since co-001/redact-ssn-phone-leaks (the rows it
    // closed, below), and next to a range cc3dd7f6 refused either glued label is read (below).
    ['an amount-shaped phone after a phone label glued to the word before it', 'PaidPhone 202 555 01.23', 'PaidPhone 202 555 01.23'],
    // A spaced SSN or phone glued digit to digit to an amount after its label, which the scan reads as one long group
    // (review GATEWAY1-3): refused only where a run of its groups from the label's first group, or from the amount the
    // label reaches, holds 9 or 10 digits (re-review GATEWAY1-2, review PHI2-6). Sent at cc3dd7f6 too. In its own shape,
    // its groups joined with no white space, it is refused since co-001/redact-ssn-phone-leaks (the rows it closed, below).
    ['a spaced labeled SSN glued to a two-digit amount', 'SSN 900 12 345615.00', 'SSN 900 12 345615.00'],
    ['a spaced labeled SSN glued to an amount with one decimal', 'SSN 900 12 3456150.0', 'SSN 900 12 3456150.0'],
    ['a spaced labeled phone glued to a two-digit amount', 'Phone 202 555 012315.00', 'Phone 202 555 012315.00'],
    ['a spaced labeled phone glued to a one-digit amount', 'Phone 202 555 01231.00', 'Phone 202 555 01231.00'],
    // An amount-shaped SSN whose first group reads as a date with the number before it ("10-9.00"; sent at cc3dd7f6 too).
    ['an amount-shaped SSN whose first group a date reading joins to the number before it', 'SSN $10-9.00 12 3456', 'SSN $10-9.00 12 3456'],
    // A labeled SSN or phone split five, one, then an amount with one decimal digit before the cents: the units column
    // before a money amount ends the chain, as a service-line row's does (review GATEWAY2-1; cc3dd7f6 sent it too).
    ['a labeled SSN split five, one and an amount', 'Soc Sec 93798 4 1.46', 'Soc Sec 93798 4 1.46'],
    // An amount followed by a dash and a year-first date, read as [SSN]: over-redaction, never a leak (review GATEWAY1-5).
    ['an amount and a year-first date joined by a hyphen', 'Service 150.00-2020-04-05 billed', 'Service [SSN]-04-05 billed'],
  ])('pins a recorded residual: %s', (_case, letter, sent) => {
    const redacted = redactLetter(letter, A, AC);
    expect(redacted.text).toBe(sent);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(false);
  });

  // Residuals pinned in the table above until co-001/redact-ssn-phone-leaks (MOD-21; docs/adr/0054, its amendment) closed
  // them. Each was sent at cc3dd7f6, and from the range fix on, as its row's last column says; each is refused now.
  it.each([
    // A Social Security label glued to the word before it by a lost space is the label to the scan (G3).
    ['an amount-shaped SSN after an SSN label glued to the word before it', 'PatientSSN 900.12 3456', 'PatientSSN 900.12 3456'],
    // An SSN or phone label is read through the call's own identifier to the number on its line (G4).
    ['an amount-shaped SSN after its label and the patient’s name', 'SSN Vantree 900.12 3456', 'SSN [PATIENT_NAME] 900.12 3456'],
    ['an SSN of a five-digit group after its label and the patient’s name', 'SSN for Zephyra Vantree: 90012-3456', 'SSN for [PATIENT_NAME] [PATIENT_NAME]: 90012-3456'],
    // Another number's digits glued to an SSN's own shape, after it or before it (G1).
    ['an SSN in a shape glued to an amount after its label', 'SSN 900-12-3456150.00', 'SSN 900-12-3456150.00'],
    ['an SSN in a shape glued to a year after its label', 'SSN 01/01/2020900-12-3456', 'SSN 01/01/2020900-12-3456'],
    // The scan's read over the numbers before an amount goes through a label's own list number, as "Phone 1: 555-0100" is
    // read through it (G5).
    ['an amount-shaped SSN after the label’s number and an amount', 'TTY 1: 7,439.10 942.77 3098', 'TTY 1: 7,439.10 942.77 3098'],
  ])('refuses what was a recorded residual until co-001/redact-ssn-phone-leaks closed it: %s (%j, sent until then as %j)', (_case, letter) => {
    const redacted = redactLetter(letter, A, AC);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(true);
    expect(() => denialLetterSpec.prepare({ ...syntheticLetterInput(), patient: A, claims: AC, text: letter })).toThrow(expect.objectContaining({ code: 'identifier_left', message: 'the letter still holds an identifier after redaction; it is not sent' }));
  });

  it.each([
    // A range the range fix reads as a barrier and cc3dd7f6 did not (a date or a currency amount to an amount, a date read
    // only with a glued word blanked, a range joined by another dash) holds a chain whole only where nothing that may be
    // the rest of an identifier stands beside it; where a range's end cannot be told from an identifier's fragment, the
    // letter is refused as cc3dd7f6 refused it (the orchestrator's ruling of 2026-11-07). Each row was sent from 6fc88092
    // to the head of review round 3 and pinned there as a residual (re-review PHI1-1, PHI1-2, GATEWAY1-2; review PHI2-3,
    // PHI2-4).
    ['an unlabeled amount-shaped SSN at the end of a range from a date', 'Paid 01/01/2020-900.12 3456'],
    ['an unlabeled amount-shaped SSN at the end of a range from a currency amount with no cents', 'Paid $1-900.12 3456'],
    ['an unlabeled amount-shaped phone at the start of a range to a date', 'Paid 202 555 01.23-1/3/20'],
    ['an amount-shaped SSN at a range’s end after a glued SSN label', 'PatientSSN 01/01/2020-900.12 3456'],
    ['an amount-shaped phone starting a range after a glued phone label', 'PaidPhone 202 555 01.23-1/3/20'],
    // An amount without cents or a date of two separators is no range's end ("0,900-12-19.85" is an SSN's digits).
    ['an SSN read as an amount and a date after its label', 'SSN 1,900-12-19.85'],
    ['an SSN read as an amount and a date', 'Paid 0,900-12-19.85'],
    ['an SSN read as an amount and a date that starts a range', 'SSN 2,900-12-19.85-1/3/20'],
    ['an amount-shaped phone whose last group and the next number read as a date starting a range', 'Call 202 555 01.23-12-150.00'],
    // A masked SSN, or a word, glued after a range's end, and the digits after it.
    ['a masked SSN glued after a range’s end', '01/01/2020-150.00XXX-XX-3456Paid'],
    ['an SSN of a five-digit group glued by a word after a range’s end', 'Re: 01/01/2020-1st Jan 2020th90012-3456'],
    ['a spaced labeled SSN glued to an amount that starts a range', 'SSN 900 12 345615.00-01/02/2020'],
    ['a labeled SSN fused to an amount that starts a range', 'SSN 900123456120.00-01/02/2020'],
    ['a labeled phone fused to an amount that starts a range', 'Phone: 2025550123150.00-01/03/2020'],
    ['a labeled phone in a shape glued to a date that starts a range', 'Tel: 202-555-01231 January 2020-150.00'],
    ['a labeled SSN whose last six read as a date that starts a range', 'SSN 9 01-12-1985-150.00'],
    ['an amount-shaped phone after a range and spaces, its label out of reach', 'Phone March 11, 2029\u22122,866.66  960.58 4433'],
    ['an SSN glued to an amount after the label’s number, a word and a range', 'Phone 1: is 2/5/26-545.68 936 90 8080172.00'],
    ['an amount-shaped SSN after the label’s number, a word and a range', 'SSN 1: is 01/01/2020-900.12 3456'],
    // Review round 3 (PHI3-5): a day-first ordinal range glued to "St" after an SSN label, the label more than 24
    // characters back, and an amount-shaped SSN or phone after a range whose label the reach is counted to.
    ['a labeled SSN after a day-first ordinal range glued to "St" (PHI3-5 i)', 'Re: SSN 01/01/2020-1st Jan 2020St 90012-3456'],
    ['a labeled SSN after a day-first ordinal range glued to "St", with "of" (PHI3-5 i)', 'SSN 01/01/2020-4th of March, 2020St 900.12 3456'],
    ['a labeled phone after a currency amount and an ordinal date (PHI3-5 ii)', 'SSN $10-1st Jan 2020 202 555 01.23'],
    // An amount joined to a range's end as a chain joins, a currency amount's digits too (cc3dd7f6 refused this period after
    // an amount and a full stop with no space for the range's own digits; with a word between, it is sent, above).
    ['a period starting with a month word after an amount and a full stop', 'Paid $0,000.00.January 1, 2020-2020-01-02Paid'],
    // A label glued to the word before it is read next to a range cc3dd7f6 refused.
    ['an amount-shaped SSN after a glued SSN label after a range', '01/01/2020-150.00-PaidSSN 900 12 34.56 Paid'],
    ['a local phone after a glued SSN label after a range', '150.00-01/02/2020-PaidSSN 555-0123Paid'],
  ])('refuses, as cc3dd7f6 did, a letter in which a range’s end may be an identifier’s fragment: %s', (_case, letter) => {
    const redacted = redactLetter(letter, A, AC);
    expect(holdsIdentifier(redacted.text, A, AC)).toBe(true);
    expect(() => denialLetterSpec.prepare({ ...syntheticLetterInput(), patient: A, claims: AC, text: letter })).toThrow(expect.objectContaining({ code: 'identifier_left', message: 'the letter still holds an identifier after redaction; it is not sent' }));
  });

  // Review round 3 of the range fix (2026-11-07): the glued reading of round 2 cut SSN and phone labels (PHI3-1, PHI3-2,
  // PHI3-3) and took codes, modifiers and units after the patient's name (GATEWAY3-1, GATEWAY3-2). With it reverted, each
  // finding's input is redacted or refused exactly as at cc3dd7f6 (null: refused).
  const round3 = (names: string[]) => ({ pseudonym: 'synthetic-patient-15', names, datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] });
  it.each([
    // PHI3-1: the patient's name glued or in camel case between an SSN or phone label and the number.
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'Please call MsZephyra at 555-0123.', 'Please call MsZephyra at [PHONE].'],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'Phone for JaneZephyra: 555-0123', 'Phone for JaneZephyra: [PHONE]'],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'Re: Fax DrJane 555-0123', 'Re: Fax DrJane [PHONE]'],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'SSN of MsZephyra: 90012-3456', null],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'Social Security number of MsZephyra: 900.12 3456', null],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'SSN DearJane 900.12 3456', null],
    ['PHI3-1', ['JANE Q ZEPHYRA'], 'SSN ZEPHYRAJane 900.12 3456', null],
    // PHI3-2: a lone ten starting 0 or 1 after the glued name, and a word between the name and the number. Its first
    // input, "Re: SSN MsZephyra0900123456", is no longer handled as cc3dd7f6 handled it: the test after this table.
    ['PHI3-2', ['JANE Q ZEPHYRA'], 'Re: SSN Zephyra1900123456', null],
    ['PHI3-2', ['JANE Q ZEPHYRA'], 'Re: SSN for Zephyra1900123456', null],
    ['PHI3-2', ['JANE Q ZEPHYRA'], 'Re: Fax ZephyraPaid900.12 3456', null],
    ['PHI3-2', ['JANE Q ZEPHYRA'], 'Re: SSN ZephyraPaid900,12 3456', null],
    // PHI3-3: a short part that spells the end of an SSN label glued to its number.
    ['PHI3-3', ['TY Q ZEPHYRA'], 'Re: Social Security900.12 3456', null],
    ['PHI3-3', ['TY Q ZEPHYRA'], 'SOCIAL SECURITY90012-3456', null],
    ['PHI3-3', ['TY Q ZEPHYRA'], 'Member Ty Zephyra, Social Security900,12 3456', null],
    ['PHI3-3', ['SN VANTREE'], 'SSN900.12 3456', null],
    // PHI3-5 (iii): the call's own identifier between a phone label and an SSN next to a range.
    ['PHI3-5', ['JANE Q ZEPHYRA'], 'DOS Tel: ZZ7654321: 900 12 34.56-01/03/2020', null],
    // GATEWAY3-1: a code whose letter is an initial of the patient, right after the name.
    ['GATEWAY3-1', ['MARIA MARTINEZ'], 'MARTINEZ, MARIA M54.50 97110 1 150.00', '[PATIENT_NAME], [PATIENT_NAME] M54.50 97110 1 150.00'],
    ['GATEWAY3-1', ['GEORGE ZEPHYRA'], 'Patient GEORGE ZEPHYRA G0283 denied.', 'Patient [PATIENT_NAME] G0283 denied.'],
    ['GATEWAY3-1', ['GEORGE ZEPHYRA'], 'Patient George Zephyra Z96.651 on file', 'Patient [PATIENT_NAME] Z96.651 on file'],
    ['GATEWAY3-1', ['JANE Q ZEPHYRA'], 'Patient: JANE Q ZEPHYRA\nJ3301 1 150.00', 'Patient: [PATIENT_NAME]\nJ3301 1 150.00'],
    // GATEWAY3-2: remark codes, a modifier, minute units and words that a two- or three-letter part spells.
    ['GATEWAY3-2', ['QIANG MA'], 'Remark: MA130 applies.', 'Remark: MA130 applies.'],
    ['GATEWAY3-2', ['QIANG MA'], 'Re: QIANG MA\nMA04', 'Re: [PATIENT_NAME]\nMA04'],
    ['GATEWAY3-2', ['MIN XU'], 'CPT 97110XU denied', 'CPT 97110XU denied'],
    ['GATEWAY3-2', ['MIN XU'], 'Total time 45min.', 'Total time 45min.'],
    ['GATEWAY3-2', ['MIN XU'], 'Total time 30MIN.', 'Total time 30MIN.'],
    ['GATEWAY3-2', ['ANN LIN'], 'Line1 97110 150.00', 'Line1 97110 150.00'],
    ['GATEWAY3-2', ['ANN LIN'], 'Paid 150.00Annual', 'Paid 150.00Annual'],
    ['GATEWAY3-2', ['AL Q ZEPHYRA'], 'See ALJ2 decision.', 'See ALJ2 decision.'],
    ['GATEWAY3-2', ['ED Q ZEPHYRA'], 'Edit1 applies.', 'Edit1 applies.'],
  ] as const)('handles review round 3’s input as cc3dd7f6 did (%s): %s %s', (_finding, names, letter, sent) => {
    const who = round3([...names]);
    const redacted = redactLetter(letter, who, AC);
    expect(holdsIdentifier(redacted.text, who, AC)).toBe(sent === null);
    if (sent !== null) {
      expect(redacted.text).toBe(sent);
    }
  });

  // PHI3-2's first input was sent at cc3dd7f6, and until co-001/redact-ssn-phone-leaks, as "Re: SSN MsZephyra[SSN]": the
  // patient's name glued to the number's placeholder. A pattern's placeholder is a number to what is glued to it (MOD-21,
  // G7), so the name stands glued to a digit there, as in "Re: SSN Zephyra1900123456" above, and the letter is refused.
  it('refuses review round 3’s input with the name glued to an SSN’s placeholder, which cc3dd7f6 sent (PHI3-2; closed by co-001/redact-ssn-phone-leaks)', () => {
    const who = round3(['JANE Q ZEPHYRA']);
    const redacted = redactLetter('Re: SSN MsZephyra0900123456', who, AC);
    expect(redacted.text).toBe('Re: SSN MsZephyra[SSN]');
    expect(holdsIdentifier(redacted.text, who, AC)).toBe(true);
  });

  // The judge's review round 1 of the range fix (2026-11-07): each finding's input, refused (null) or sent as written here.
  // cc3dd7f6 refused every row refused here but GATEWAYJ1-1's three fail-safe rows (sent unchanged there), GATEWAYJ1-4's last
  // and GATEWAYJ1-3's last three (sent there with a fragment of the name or an initial in clear), and sent every other row
  // as written here.
  const judge1 = (names: string[], more: { readonly datesOfBirth?: readonly string[]; readonly memberIds?: readonly string[]; readonly claimNumbers?: readonly string[] }) => ({
    patient: { pseudonym: 'synthetic-patient-15', names, datesOfBirth: [...(more.datesOfBirth ?? ['1980-03-14'])], memberIds: [...(more.memberIds ?? ['SYNMEMBER0042', 'ZZ7654321'])] },
    claims: [{ claimId: SYNTHETIC_IDS.claimOne, patientPseudonym: 'synthetic-patient-15', claimNumbers: [...(more.claimNumbers ?? ['SYNCLAIM0001', 'C2026000417'])] }],
  });
  it.each([
    // PHIJ1-1: in a letter whose chain only the range fix's barriers hold (cc3dd7f6 refused it for the range's own digits), a
    // part of the name of any length anywhere in a run of letters, and an initial at a run's end before the name, a part,
    // another initial or a full stop.
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 DEARAL,', null, {}],
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Seen 01/01/2020-150.00 ALPAID in full.', null, {}],
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Service 2020-01-01-150.00 Paid. dearal.', null, {}],
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Seen 01/01/2020-150.00 DEARALPAID', null, {}],
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 DEARQ ZEPHYRA', null, {}],
    ['PHIJ1-1', ['AL Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 DEARQ.', null, {}],
    ['PHIJ1-1', ['JUNE Q VANTREE'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00 DEARJUNE,', null, {}],
    ['PHIJ1-1', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DEARJ. ZEPHYRA', null, {}],
    ['PHIJ1-1', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Patient JQ ZEPHYRA', null, {}],
    // PHIJ1-3: the shapes cc3dd7f6 sends with no range (docs/adr/0054's residuals), in such a letter, read blind to their
    // separators: a member ID or claim number, a part of four letters or more, the name's initials, a date of birth's eight
    // digits, its month's word beside its year, and a birth label whose date redaction did not read.
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DOB 1961 March 3 Thank you.', null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Born MARCH THIRD 1961 Thank you.', null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DOB 0 3 / 0 3 / 1 9 6 1 Thank you.', null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DOB 1961/3 Thank you.', null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DOB March 3rd, nineteen sixty-one Thank you.', null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. DOB 03\n14\n1980 on file.', null, {}],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Member ZZ.765.4321 on file.', null, {}],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Claim C2026/000417 on file.', null, {}],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Seen 03-15-61 Thank you.', null, { memberIds: ['031561'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Claim 123456780.00 Thank you.', null, { claimNumbers: ['12345678'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Ref 1234ー5678 Thank you.', null, { claimNumbers: ['12345678'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Total $555001.00 Thank you.', null, { claimNumbers: ['555001'] }],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Patient JQZ.', null, {}],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Patient J.Q.Z.', null, {}],
    ['PHIJ1-3', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Patient Z E P H Y R A', null, {}],
    ['PHIJ1-3', ['JOANN ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. Dear jo ann,', null, {}],
    // PHIJ1-4: a member ID or claim number of digits alone glued to a word, in such a letter.
    ['PHIJ1-4', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 Paid76543210 in full.', null, { memberIds: ['76543210'] }],
    ['PHIJ1-4', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. MemberID76543210.', null, { memberIds: ['76543210'] }],
    ['PHIJ1-4', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 76543210Paid in full.', null, { memberIds: ['76543210'] }],
    ['PHIJ1-4', ['JANE Q ZEPHYRA'], 'Service 2020-01-01-150.00 Paid. Dear88776655.', null, { claimNumbers: ['88776655'] }],
    ['PHIJ1-4', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. CLAIMNO99887766 Thank you.', null, { claimNumbers: ['99887766'] }],
    // PHIJ1-5: a masked SSN glued to a word glued to a held range's end, or anywhere in such a letter; a word and a gap
    // alone glue nothing (MOD-16's own letter is sent).
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidXXX-XX-3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020PaidXXX-XX-3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00Paid***-**-3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00Paidxxx-xx-3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidXXX XX 3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidXXX-XX-3456 thanks', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 PaidXXX-XX-3456', null, {}],
    ['PHIJ1-5', ['JANE Q ZEPHYRA'], 'Service 01/01/2020-150.00Paid 97110   3   1234.56', 'Service 01/01/2020-150.00Paid 97110   3   1234.56', {}],
    // GATEWAYJ1-4: a part's head before the name's placeholder where redaction read the rest of a part written with a space
    // inside as a shorter part (seed 2026110710's shape): with a held chain any run, elsewhere a head glued to a digit.
    ['GATEWAYJ1-4', ['DANIELLE LE'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020DANIEL LE $0,000.00', null, {}],
    ['GATEWAYJ1-4', ['DANIELLE LE'], 'Billed 01/02/2020-150.00Daniel Le, seen', null, {}],
    ['GATEWAYJ1-4', ['ANGELA Q LA'], 'Seen 01/01/2020-150.00ANGE LA, Paid', null, {}],
    ['GATEWAYJ1-4', ['STELLA LA'], 'Service 01/01/2020-150.00STEL LA paid', null, {}],
    ['GATEWAYJ1-4', ['CLAIM LA ORLA'], 'Seen 01/01/2020-150.00OR LA, CL AIM LA, ', null, { datesOfBirth: ['1970-01-01'], memberIds: ['19900101'], claimNumbers: ['19900101'] }],
    ['GATEWAYJ1-4', ['ANGELA Q LA'], 'Seen 150.00ANGE LA, Paid', null, {}],
    // GATEWAYJ1-1: outside such a letter, a part of four letters or more only where its run sets it apart (from the run's
    // start or a change of case, to its end, a digit or a change of case) or anywhere in a run of one case: an ordinary word
    // around a part is sent as at cc3dd7f6; the part as a whole word glued to a digit, and a run of capitals, are refused
    // (fail-safe: "Page" for PAGE, "BALANCE24.00" for ALAN). A part's tail after the placeholder is sent ("CY2026").
    ['GATEWAYJ1-1', ['BILL Q ZEPHYRA'], 'Paid 96.00 2020Billed 150.00', 'Paid 96.00 2020Billed 150.00', {}],
    ['GATEWAYJ1-1', ['VERA Q ZEPHYRA'], 'Paid 0.00Coverage 01/01/2020-12/31/2020', 'Paid 0.00Coverage 01/01/2020-12/31/2020', {}],
    ['GATEWAYJ1-1', ['MARK Q ZEPHYRA'], 'CO-45 Remark1: N130', 'CO-45 Remark1: N130', {}],
    ['GATEWAYJ1-1', ['ROSS Q ZEPHYRA'], 'Gross150.00 Net120.00', 'Gross150.00 Net120.00', {}],
    ['GATEWAYJ1-1', ['TATE Q ZEPHYRA'], 'Statement1 of 2', 'Statement1 of 2', {}],
    ['GATEWAYJ1-1', ['MINA Q ZEPHYRA'], 'Determination01/15/2026', 'Determination01/15/2026', {}],
    ['GATEWAYJ1-1', ['WARD Q ZEPHYRA'], 'Forwarded2 claims', 'Forwarded2 claims', {}],
    ['GATEWAYJ1-1', ['BILL Q ZEPHYRA'], 'Service 6 March 2020—8 March 2020Billed0.00 paid.', 'Service 6 March 2020—8 March 2020Billed0.00 paid.', {}],
    ['GATEWAYJ1-1', ['PAGE Q ZEPHYRA'], '93359   5   335.00Page 2 of 5   95870 2   58.00', null, {}],
    ['GATEWAYJ1-1', ['ALAN Q ZEPHYRA'], 'BILLED 150.00 ALLOWED 120.00 PAID 96.00 BALANCE24.00', null, {}],
    ['GATEWAYJ1-1', ['PAGE Q ZEPHYRA'], 'Paid 150.00Page 2 of 3', null, {}],
    ['GATEWAYJ1-1', ['NANCY VANTREE'], 'Patient: Nancy Vantree CY2026 1 150.00', 'Patient: [PATIENT_NAME] CY2026 1 150.00', {}],
    // GATEWAYJ1-3: outside such a letter, an initial alone after a digit only before the name's placeholder (or a number's
    // that a part of the name is written as), a whole part or another initial: suite and line letters before a word that
    // begins like a part, or before another placeholder, are sent as at cc3dd7f6. Before the name it is refused (fail-safe:
    // "Room 4L, Lee Hall" for LEE).
    ['GATEWAYJ1-3', ['AL Q ZEPHYRA'], 'Suite 2A, Albany, NY 12207', 'Suite 2A, Albany, NY 12207', {}],
    ['GATEWAYJ1-3', ['AL Q ZEPHYRA'], 'Line 1A Allowed 120.00', 'Line 1A Allowed 120.00', {}],
    ['GATEWAYJ1-3', ['JANE A MA'], 'Suite 3A, Main Street, Baltimore MD 21201', 'Suite 3A, Main Street, Baltimore MD 21201', {}],
    ['GATEWAYJ1-3', ['ED Q LI'], 'Box 1E, Edison NJ 08817', 'Box 1E, Edison NJ 08817', {}],
    ['GATEWAYJ1-3', ['ED Q LI'], 'Room 4L, Lincoln Hall', 'Room 4L, Lincoln Hall', {}],
    ['GATEWAYJ1-3', ['TY Q ZEPHYRA'], 'Apt 2T, Tyler TX 75701', 'Apt 2T, Tyler TX 75701', {}],
    ['GATEWAYJ1-3', ['ANNA Q ZEPHYRA'], 'Suite 2A, Annapolis, MD 21401', 'Suite 2A, Annapolis, MD 21401', {}],
    ['GATEWAYJ1-3', ['ANNA Q ZEPHYRA'], 'Appeals Unit, Suite 2A, 202-555-0143', 'Appeals Unit, Suite 2A, [PHONE]', {}],
    ['GATEWAYJ1-3', ['BEN Q ZEPHYRA'], 'Floor 3B, 202-555-0143', 'Floor 3B, [PHONE]', {}],
    ['GATEWAYJ1-3', ['CARL Q ZEPHYRA'], 'Building 4C - 202-555-0143', 'Building 4C - [PHONE]', {}],
    ['GATEWAYJ1-3', ['ANNA Q ZEPHYRA'], 'Line 1A: SYNCLAIM0001 denied CO-45', 'Line 1A: [CLAIM_1] denied CO-45', {}],
    ['GATEWAYJ1-3', ['ZEPHYRA Q LEE'], 'Room 4L, Lee Hall', null, {}],
    ['GATEWAYJ1-3', ['JANE Q ZEPHYRA'], 'Seen 150.00Q Zephyra', null, {}],
    ['GATEWAYJ1-3', ['JANE Q ZEPHYRA'], 'Seen 150.00J. Q. Zephyra', null, {}],
  ] as const)('handles the judge’s round 1 input (%s): %s %s', (_finding, names, letter, sent, more) => {
    const { patient: who, claims } = judge1([...names], more);
    const redacted = redactLetterForScreen(letter, who, claims);
    expect(holdsIdentifier(redacted.text, who, claims)).toBe(sent === null);
    if (sent !== null) {
      expect(redacted.text).toBe(sent);
    }
  });

  // The judge's review round 2 of the range fix (2026-11-07): each finding's input, refused (null) or sent as written here.
  // GATEWAYJ2-2's sent rows are sent as at cc3dd7f6 (5b8ed30f refused them; its last row, a head whose rest is a part, stays
  // refused, cc3dd7f6 sending "Daniel" in clear); GATEWAYJ2-3's and PHIJ2-2's refused rows cc3dd7f6 refused for the range's
  // own digits (2a5ed43b sent them), and it sends their rows with no range as here; "Total 80.03 14 units" it refused for
  // the range too, an amount and units that write the date of birth's three numbers, refused since the judge's review round
  // 3 (PHIJ3-1, a fail-safe of a held letter: below); GATEWAYJ2-4's are fail-safe refusals of letters
  // cc3dd7f6 sent, beside GATEWAYJ1-1's "BALANCE24.00", and title case is sent as there.
  const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
  it.each([
    // GATEWAYJ2-2: an ordinal's or a time's letters glued to a digit before the whole name, which redaction read, are no head
    // of a part; a head is refused only where the rest of the part is a part or an initial redaction read and a space or a
    // joiner alone stands between (GATEWAYJ1-4's rows above).
    ['GATEWAYJ2-2', ['THOMAS ZEPHYRA'], 'On March 10th, Thomas Zephyra was seen for therapy.', 'On March 10th, [PATIENT_NAME] was seen for therapy.', {}],
    ['GATEWAYJ2-2', ['STEPHEN ZEPHYRA'], 'On March 1st, Stephen Zephyra received physical therapy.', 'On March 1st, [PATIENT_NAME] received physical therapy.', {}],
    ['GATEWAYJ2-2', ['STANLEY ZEPHYRA'], 'On June 1st, Stanley Zephyra was evaluated.', 'On June 1st, [PATIENT_NAME] was evaluated.', {}],
    ['GATEWAYJ2-2', ['STELLA ZEPHYRA'], 'Since April 1st Stella Zephyra has attended 12 visits.', 'Since April 1st [PATIENT_NAME] has attended 12 visits.', {}],
    ['GATEWAYJ2-2', ['AMANDA ZEPHYRA'], 'On 01/02/2020 at 9am Amanda Zephyra was seen.', 'On 01/02/2020 at 9am [PATIENT_NAME] was seen.', {}],
    ['GATEWAYJ2-2', ['AMBER ZEPHYRA'], 'Seen 01/02/2020 at 11am, Amber Zephyra arrived late.', 'Seen 01/02/2020 at 11am, [PATIENT_NAME] arrived late.', {}],
    ['GATEWAYJ2-2', ['ZEPHYRA THOMPSON'], 'On March 10th, Thompson was seen.', 'On March 10th, [PATIENT_NAME] was seen.', {}],
    ['GATEWAYJ2-2', ['STEPHANIE VANTREE'], 'Visit of the 21st, Stephanie Vantree, was denied.', 'Visit of the 21st, [PATIENT_NAME], was denied.', {}],
    ['GATEWAYJ2-2', ['DANIELLE LE'], 'Seen 150.00DANIEL, LE', 'Seen 150.00DANIEL, [PATIENT_NAME]', {}],
    ['GATEWAYJ2-2', ['DANIELLE LE'], 'Seen 150.00Daniel Le, paid', null, {}],
    // GATEWAYJ2-3: a part of two or three letters written letter by letter, each letter alone, in a held letter; with no
    // range both trees send it.
    ['GATEWAYJ2-3', ['AL Q ZEPHYRA'], 'Seen 01/01/2020-150.00A L Paid', null, {}],
    ['GATEWAYJ2-3', ['TY Q ZEPHYRA'], 'Seen 01/01/2020-150.00T Y Paid', null, {}],
    ['GATEWAYJ2-3', ['TY Q ZEPHYRA'], 'Seen 01/01/2020-150.00 T Y Paid', null, {}],
    ['GATEWAYJ2-3', ['AL Q ZEPHYRA'], `${HELD}A L`, null, {}],
    ['GATEWAYJ2-3', ['TY Q ZEPHYRA'], 'Seen 150.00T Y Paid', 'Seen 150.00T Y Paid', {}],
    // PHIJ2-2: the date of birth's two-digit-year forms redaction reads after a birth label, in a held letter, and a birth
    // label written "D/O/B" before a date redaction did not read; with no range and no label both trees send them. The
    // forms no rule reads (OCR confusions, homoglyphs, Roman or CJK months, seven digits) are ruling A' of 2026-11-07,
    // pinned in src/redact.residuals.json.
    ['PHIJ2-2', ['SIMONE Q VANTREE'], `${HELD}D/O/B 75-11-02`, null, { datesOfBirth: ['1975-11-02'] }],
    ['PHIJ2-2', ['SIMONE Q VANTREE'], `${HELD}75/11/02`, null, { datesOfBirth: ['1975-11-02'] }],
    ['PHIJ2-2', ['SIMONE Q VANTREE'], `${HELD}751102`, null, { datesOfBirth: ['1975-11-02'] }],
    ['PHIJ2-2', ['SIMONE Q VANTREE'], `${HELD}D/O/B 2-XI-1975`, null, { datesOfBirth: ['1975-11-02'] }],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], `${HELD}80-03-14`, null, {}],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], `${HELD}800314`, null, {}],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 Paid. 80 3 14', null, {}],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], `${HELD}Total 80.03 14 units`, null, {}],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], 'Dear Patient, re 80-03-14, thank you.', 'Dear Patient, re 80-03-14, thank you.', {}],
    ['PHIJ2-2', ['JANE Q ZEPHYRA'], 'Dear Patient, re 800314, thank you.', 'Dear Patient, re 800314, thank you.', {}],
    // GATEWAYJ2-4: outside a held letter a part of four letters or more anywhere in a run of one case a digit touches is
    // refused (no boundary can be read there): 14 of 422 common parts for a payer's word in capitals glued to an amount.
    ['GATEWAYJ2-4', ['MARK Q ZEPHYRA'], 'REMARK150.00', null, {}],
    ['GATEWAYJ2-4', ['MARK Q ZEPHYRA'], 'remark150.00', null, {}],
    ['GATEWAYJ2-4', ['MARY Q ZEPHYRA'], 'PRIMARY150.00', null, {}],
    ['GATEWAYJ2-4', ['BILL Q ZEPHYRA'], 'BILLED150.00', null, {}],
    ['GATEWAYJ2-4', ['MARK Q ZEPHYRA'], 'Remark150.00', 'Remark150.00', {}],
  ] as const)('handles the judge’s round 2 input (%s): %s %s', (_finding, names, letter, sent, more) => {
    const { patient: who, claims } = judge1([...names], more);
    const redacted = redactLetterForScreen(letter, who, claims);
    expect(holdsIdentifier(redacted.text, who, claims)).toBe(sent === null);
    if (sent !== null) {
      expect(redacted.text).toBe(sent);
    }
  });

  // The judge's review round 3 of the range fix (2026-11-07): each finding's input, refused (null) or sent as written here.
  // GATEWAYJ3-1's sent rows cc3dd7f6 sends as here (3cf4d8cf refused them), and "Paid 150.00ST AN Zephyra" is a fail-safe
  // refusal of a letter it sent with "ST" of STAN in clear; PHIJ3-1's and PHIJ3-2's refused rows it refused for the range's
  // own digits (3cf4d8cf sent them), and with no range both trees send or redact them as here.
  const VANTREE = { datesOfBirth: ['1975-11-02'] };
  it.each([
    // GATEWAYJ3-1: a unit's letters before a name part whose rest is an initial, and an ordinal's suffix that fits the whole
    // number before it or "am"/"pm" after an hour, before a part whose rest is another part, are no head of a part.
    ['GATEWAYJ3-1', ['MINA ALI'], 'Total treatment time 45min Mina was seen on 02/14/2026.', 'Total treatment time 45min [PATIENT_NAME] was seen on 02/14/2026.', {}],
    ['GATEWAYJ3-1', ['MINA ALI'], 'Session 30min Mina Ali attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ3-1', ['MINH HOANG'], 'Patient seen for 45min. Minh Hoang tolerated treatment well.', 'Patient seen for 45min. [PATIENT_NAME] tolerated treatment well.', {}],
    ['GATEWAYJ3-1', ['MINH HOANG'], 'PT 45min Minh Hoang, 97110 x3 units.', 'PT 45min [PATIENT_NAME], 97110 x3 units.', {}],
    ['GATEWAYJ3-1', ['MING GAO'], 'Session 30min Ming Gao attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ3-1', ['MINH H NGUYEN'], 'Treatment 45min Minh Nguyen tolerated treatment.', 'Treatment 45min [PATIENT_NAME] [PATIENT_NAME] tolerated treatment.', {}],
    ['GATEWAYJ3-1', ['NGUYEN THANH ANH'], 'Seen on the 4th Nguyen Thanh Anh.', 'Seen on the 4th [PATIENT_NAME].', {}],
    ['GATEWAYJ3-1', ['NGUYEN THANH ANH'], 'On March 4th Thanh Anh was seen for therapy.', 'On March 4th [PATIENT_NAME] [PATIENT_NAME] was seen for therapy.', {}],
    ['GATEWAYJ3-1', ['STAN AN ZEPHYRA'], 'On March 1st Stan An Zephyra called.', 'On March 1st [PATIENT_NAME] called.', {}],
    ['GATEWAYJ3-1', ['STAN AN ZEPHYRA'], 'On March 1st Stan was seen.', 'On March 1st [PATIENT_NAME] was seen.', {}],
    ['GATEWAYJ3-1', ['TRAN STAN AN'], 'Since the 1st Stan An has attended 8 visits.', 'Since the 1st [PATIENT_NAME] [PATIENT_NAME] has attended 8 visits.', {}],
    ['GATEWAYJ3-1', ['THAI AI VANTREE'], 'On the 4th Thai called our office.', 'On the 4th [PATIENT_NAME] called our office.', {}],
    ['GATEWAYJ3-1', ['AMAL AL ZEPHYRA'], 'Seen at 9am Amal Al Zephyra.', 'Seen at 9am [PATIENT_NAME].', {}],
    ['GATEWAYJ3-1', ['AMAL AL ZEPHYRA'], 'Appointment at 9am Amal arrived on time.', 'Appointment at 9am [PATIENT_NAME] arrived on time.', {}],
    ['GATEWAYJ3-1', ['MINA ALI'], 'Seen 150.00MIN A ALI paid', 'Seen 150.00MIN [PATIENT_NAME] [PATIENT_NAME] paid', {}],
    ['GATEWAYJ3-1', ['STAN AN ZEPHYRA'], 'Paid 150.00ST AN Zephyra', null, {}],
    // PHIJ3-1: the date of birth's year, month and day in any order, whatever joins them, compact, or with its month's
    // word, in a held letter; with no range a birth label's date is redacted and an unlabeled one sent, by both trees.
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80_03_14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80|03|14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80\\03\\14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80⁃03⁃14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 1980-14-03`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 19801403`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 801403`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 03/80/14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 14/80/03`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80 March 14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen Mar., '80, 14`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 198014thMarch`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen Mar8014`, null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 Paid. Seen 80|03|14', null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00March 80 14 in full.', null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00DOB 1980-14-03', null, {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 196133`, null, { datesOfBirth: ['1961-03-03'] }],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'DOB 80|03|14 today.', 'DOB [DATE_OF_BIRTH] today.', {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'DOB 1980-14-03 today.', 'DOB [DATE_OF_BIRTH] today.', {}],
    ['PHIJ3-1', ['JANE Q ZEPHYRA'], 'Seen 80|03|14 today.', 'Seen 80|03|14 today.', {}],
    // PHIJ3-2: a birth label glued to a range's end, to a word or to the date after it, in a held letter, before a date
    // redaction did not read (ruling A' forms: alone they are pinned as sent in src/redact.residuals.json).
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00DOB 2-XI-1975', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00DOB: 2-XI-1975', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020DOB 2-XI-1975 $0,000.00', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00DOB November second, nineteen seventy-five', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00Born 1975/11', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00D/O/B 2-XI-1975', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00Birthdate 1975/11', null, VANTREE],
    ['PHIJ3-2', ['SIMONE Q VANTREE'], 'Seen 01/01/2020-150.00DOBNovember second, nineteen seventy-five in full.', null, VANTREE],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidDOB 1961/3', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020DOB March 14th, nineteen eighty', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020Birthdate 14-III-1980', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020-01/02/2020D/O/B 14-III-1980', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidBorn 14-III-1980 in full.', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00DOBMar 14th in full.', null, {}],
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00PaidDOBIII/14/1980 in full.', null, {}],
    // "D O B" written with spaces alone is read between word edges only: "and obtain" before a number is no label.
    ['PHIJ3-2', ['JANE Q ZEPHYRA'], 'Seen 01/01/2020-150.00 Paid. AND OBTAIN 2 copies.', 'Seen 01/01/2020-150.00 Paid. AND OBTAIN 2 copies.', {}],
  ] as const)('handles the judge’s round 3 input (%s): %s %s', (_finding, names, letter, sent, more) => {
    const { patient: who, claims } = judge1([...names], more);
    const redacted = redactLetterForScreen(letter, who, claims);
    expect(holdsIdentifier(redacted.text, who, claims)).toBe(sent === null);
    if (sent !== null) {
      expect(redacted.text).toBe(sent);
    }
  });

  // The judge's review round 4 of the range fix (2026-11-07): each finding's input, refused (null) or sent as written here.
  // PHIJ4-1's and PHIJ4-2's refused rows cc3dd7f6 refused for the range's own digits (69a3a2fe sent them), and with no range
  // both trees send or redact them as here; GATEWAYJ4-1's sent rows cc3dd7f6 sends as here (69a3a2fe refused them), and its
  // refused rows are fail-safe refusals of letters cc3dd7f6 sent with the head of a part in clear (an amount's letters, a
  // bare whole number's or a range's second end without its own letters).
  const RANGE_END = 'Paid $0,000.00. Service 01/01/2020-01/02/2020';
  it.each([
    // PHIJ4-1: the date of birth in a form redaction reads after a birth label, more than four characters between its parts
    // where only white space, separators, commas, full stops, apostrophes and "OF" stand there (datesIn takes any length).
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80  /  03  /  14 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 1980  /  14  /  03 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80     March     14 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80-03-\n        14 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80 /\n    03 /\n    14 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80  -  03  -  14 today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80/\r\n   03/\r\n   14 today.`, null, {}],
    ['PHIJ4-1', ['SIMONE Q VANTREE'], `${HELD}Seen 75  .  02  .  11 today.`, null, VANTREE],
    // The month's word last with wide gaps, which no rule read (the skeptic's 216 letters), refused with them.
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 14     80     March today.`, null, {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 80 \r\n   14 \r\n   March today.`, null, {}],
    // A part of the date of birth beside its placeholder past a wide gap, where redaction read only some of the written date
    // ("May/2009" as May 20, 2009; the widened PHIJ3-1 property's counterexamples).
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen May/2009     20`, null, { datesOfBirth: ['2009-05-20'] }],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen Sep.1995  .     19`, null, { datesOfBirth: ['1995-09-19'] }],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen Jun\r\n   –     1941  -\r\n   19`, null, { datesOfBirth: ['1941-06-19'] }],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], `${HELD}Seen 19 ,\n      June 1941 today.`, null, { datesOfBirth: ['1941-06-19'] }],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], 'Seen May/2009     20', 'Seen [DATE_OF_BIRTH]     20', { datesOfBirth: ['2009-05-20'] }],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], 'DOB 80  /  03  /  14 today.', 'DOB [DATE_OF_BIRTH] today.', {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], 'DOB 80     March     14 today.', 'DOB [DATE_OF_BIRTH] today.', {}],
    ['PHIJ4-1', ['JANE Q ZEPHYRA'], 'Seen 80  /  03  /  14 today.', 'Seen 80  /  03  /  14 today.', {}],
    // PHIJ4-2: two or more of the name's initials written together, in any order and case and for a name of any number of
    // parts, and a part of three letters split by a space or a bare line break, glued at a range's end or after it.
    ['PHIJ4-2', ['JANE ZEPHYRA'], `${RANGE_END}JZ $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE ZEPHYRA'], `${RANGE_END}ZJ $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE ZEPHYRA'], `${RANGE_END}Jz $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE ZEPHYRA'], `${HELD}Re: Jane Zephyra (JZ).`, null, {}],
    ['PHIJ4-2', ['JANE ZEPHYRA'], `${HELD}Initials: JZ`, null, {}],
    ['PHIJ4-2', ['SIMONE VANTREE'], `${RANGE_END}SV $0,000.00`, null, VANTREE],
    ['PHIJ4-2', ['JANE Q ZEPHYRA'], `${RANGE_END}QZ $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE Q ZEPHYRA'], `${RANGE_END}QJZ $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE Q ZEPHYRA'], `${RANGE_END}JZQ $0,000.00`, null, {}],
    ['PHIJ4-2', ['JANE Q ZEPHYRA'], `${RANGE_END}ZJQ $0,000.00`, null, {}],
    ['PHIJ4-2', ['ANA BEA CORA DINA ELLA FAYE GIA'], `${RANGE_END}AG $0,000.00`, null, {}],
    ['PHIJ4-2', ['ANA BEA CORA DINA ELLA FAYE GIA'], `${RANGE_END}BF $0,000.00`, null, {}],
    ['PHIJ4-2', ['BOB XU'], `${RANGE_END}Bo b $0,000.00`, null, {}],
    ['PHIJ4-2', ['ANN Q VANTREE'], `${RANGE_END}An\nn $0,000.00`, null, VANTREE],
    ['PHIJ4-2', ['JANE ZEPHYRA'], 'Paid $0,000.00. Service 01/01/2020 JZ $0,000.00', 'Paid $0,000.00. Service 01/01/2020 JZ $0,000.00', {}],
    // Review round 5, PHI5-1: two or more initials glued to another word's letters, at either end or inside, in any case:
    // no boundary says where the word ends, so a held letter is refused (cc3dd7f6 refused each for the range's own digits;
    // 9f953223 sent them); with no range both trees send them as written, and a word with one of the initials' letters
    // twice is no pair of initials.
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}4thZQ was seen.`, null, {}],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}4thzq was seen.`, null, {}],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}PaidZQ 150.00`, null, {}],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}ZQpaid in full.`, null, {}],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}SeenQJZtoday.`, null, {}],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `Re: 3rd-4thZQ\nService January 1, 2020-2020-01-02Paid $0,000.00`, null, {}],
    ['PHI5-1', ['SIMONE VANTREE'], `${HELD}3rd-4thSV`, null, VANTREE],
    ['PHI5-1', ['JANE Q ZEPHYRA'], 'Seen 3rd-4thZQ today.', 'Seen 3rd-4thZQ today.', {}],
    // The re-review of round 5, F4's mirror, recorded and unchanged: where a date of service's last two numbers and the
    // number after it happen to read as the date of birth ("12/24 - 24", born 2024-12-24), they are replaced as one, a
    // must-stay date and count lost that cc3dd7f6 sent. Reading no date from a start inside any date cc3dd7f6 read would
    // send a date of birth written straight after another number ("12.03/14/1980", "June 103 / 03.03.61"): the safer
    // reading is kept (docs/adr/0054).
    ['F4-mirror', ['ZEPHYRA VANTREE'], 'DOS 11/12/24 - 24 units of 97110 billed', 'DOS 11/[DATE_OF_BIRTH] units of 97110 billed', { datesOfBirth: ['2024-12-24'] }],
    ['F4-mirror', ['ZEPHYRA VANTREE'], 'DOS 11/12/24 - 25 units of 97110 billed', 'DOS 11/12/24 - 25 units of 97110 billed', { datesOfBirth: ['2024-12-24'] }],
    // The re-review of round 5, PHI5-2: two initials with a space, a hyphen, an apostrophe or a modifier letter between
    // them, one standing alone and the other at the near end of a word (cc3dd7f6 refused each for the range's own digits;
    // 9f953223 and dedeb35f sent them); with no range both trees send them as written.
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Patient: Z VPaid $10.00.`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Patient Z-VDenied.`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Patient: z vpaid`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}PaidZ V today`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Pt: Z\u02bcV`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Patient Z\u02b9 V`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Patient Z\u3005V`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA QUILL VANTREE'], `${HELD}Patient Z QPaid`, null, VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], 'Patient: Z VPaid $10.00.', 'Patient: Z VPaid $10.00.', VANTREE],
    ['PHI5-2', ['ZEPHYRA VANTREE'], `${HELD}Claim reviewed; no balance is owed.`, `${HELD}Claim reviewed; no balance is owed.`, VANTREE],
    ['PHI5-1', ['JANE Q ZEPHYRA'], `${HELD}A jazz quiz was held.`, `${HELD}A jazz quiz was held.`, {}],
    ['PHIJ4-2', ['BOB XU'], 'Paid $0,000.00. Service 01/01/2020 Bo b $0,000.00', 'Paid $0,000.00. Service 01/01/2020 Bo b $0,000.00', {}],
    // GATEWAYJ4-1: a number's own letters before the name are no head of a part: "am" or "pm" after a range of hours or
    // times, h.mm or hhmm, an ordinal's suffix after a range's first end, a unit's letters after a whole number, and a
    // procedure code's modifier.
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 9-10am Amal Al Hassan tolerated treatment.', 'Seen 9-10am [PATIENT_NAME] tolerated treatment.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Session 9am-10am Amal Al Hassan attended.', 'Session 9am-10am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Appointment 10:00-11:00am Amal Al Hassan arrived on time.', 'Appointment 10:00-11:00am [PATIENT_NAME] arrived on time.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Appointment at 9.30am Amal Al Hassan arrived on time.', 'Appointment at 9.30am [PATIENT_NAME] arrived on time.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Appointment at 0930am Amal Al Hassan arrived on time.', 'Appointment at 0930am [PATIENT_NAME] arrived on time.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 9AM-10AM Amal Al Hassan attended.', 'Seen 9AM-10AM [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 9:00am-10:30am Amal Al Hassan attended.', 'Seen 9:00am-10:30am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 9–10am Amal Al Hassan attended.', 'Seen 9–10am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 9 - 10am Amal Al Hassan attended.', 'Seen 9 - 10am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Seen 1400-1500am Amal Al Hassan attended.', 'Seen 1400-1500am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'On 02/14/2026 9-10am Amal Al Hassan attended.', 'On 02/14/2026 9-10am [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['AMAN AN ZEPHYRA'], 'Seen 8-9am Aman An Zephyra.', 'Seen 8-9am [PATIENT_NAME].', {}],
    ['GATEWAYJ4-1', ['NGUYEN THANH ANH'], 'Seen on March 3rd-4th Thanh Anh attended both visits.', 'Seen on March 3rd-4th [PATIENT_NAME] [PATIENT_NAME] attended both visits.', {}],
    ['GATEWAYJ4-1', ['NGUYEN THANH ANH'], 'Seen on the 3rd/4th Thanh Anh attended.', 'Seen on the 3rd/4th [PATIENT_NAME] [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['NGUYEN THANH ANH'], 'Seen 3-4th Thanh Anh attended.', 'Seen 3-4th [PATIENT_NAME] [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['THANH ANH'], 'Seen 3rd–4th Thanh Anh attended.', 'Seen 3rd–4th [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINSEO SEO'], 'Session 30min Minseo Seo attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINSEO SEO'], 'Session 30min Minseo attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINSEO SEO'], 'Session 1-30min Minseo Seo attended.', 'Session 1-30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINSEO SEO'], 'Session 30mins Minseo Seo attended.', 'Session 30mins [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINJI JI'], 'Session 30min Minji Ji attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MINHO HO'], 'Treatment time 45min Minho Ho tolerated treatment.', 'Treatment time 45min [PATIENT_NAME] tolerated treatment.', {}],
    ['GATEWAYJ4-1', ['MINSU SU'], 'Therapeutic exercise 15min Minsu Su.', 'Therapeutic exercise 15min [PATIENT_NAME].', {}],
    ['GATEWAYJ4-1', ['MINJUN JUN'], 'Session 30min Minjun Jun attended.', 'Session 30min [PATIENT_NAME] attended.', {}],
    ['GATEWAYJ4-1', ['MOANA ANA'], 'Follow-up in 6mo Moana Ana agreed.', 'Follow-up in 6mo [PATIENT_NAME] agreed.', {}],
    ['GATEWAYJ4-1', ['INES ES'], 'Measured 5in Ines Es tolerated.', 'Measured 5in [PATIENT_NAME] tolerated.', {}],
    ['GATEWAYJ4-1', ['COLIN LIN'], 'Billed 97110CO Colin Lin tolerated treatment.', 'Billed 97110CO [PATIENT_NAME] tolerated treatment.', {}],
    ['GATEWAYJ4-1', ['COLIN LIN'], 'Line 2: 97530CO Colin Lin 02/14/2026 $38.00', 'Line 2: 97530CO [PATIENT_NAME] 02/14/2026 $38.00', {}],
    ['GATEWAYJ4-1', ['COLIN LIN'], 'Billed G0283CO Colin Lin.', 'Billed G0283CO [PATIENT_NAME].', {}],
    ['GATEWAYJ4-1', ['AMAL AL HASSAN'], 'Billed 97110AM Amal Al Hassan.', 'Billed 97110AM [PATIENT_NAME].', {}],
    // Fail-safe refusals, as before: an amount's letters, a bare whole number's, and a range's second end glued to a head.
    ['GATEWAYJ4-1', ['MINHO HO'], 'Seen 150.00MIN HO paid', null, {}],
    ['GATEWAYJ4-1', ['DANIELLE LE'], '1Daniel Le', null, {}],
    ['GATEWAYJ4-1', ['DANIELLE LE'], 'Seen 9-10Daniel Le', null, {}],
    ['GATEWAYJ4-1', ['DANIELLE LE'], 'Seen 3rd-4Daniel Le', null, {}],
    // Review round 5, F4: the date of birth's last numbers and the number after it read as the date again ("2/01 - 01" of
    // "1/2/01 - 01/05/2026", born 2001-01-02), a read only from a start inside the written date of birth: the number after
    // it is the next token's and stays as cc3dd7f6 left it.
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 1/2/01 - 01/05/2026 date of service denied.', 'DOB [DATE_OF_BIRTH] - 01/05/2026 date of service denied.', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 10/11/10 - 10/14/2025 visit', 'DOB [DATE_OF_BIRTH] - 10/14/2025 visit', { datesOfBirth: ['2010-10-11'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 1/2/01|01:30am visit', 'DOB [DATE_OF_BIRTH]|01:30am visit', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 1/2/01. 01.00 paid', 'DOB [DATE_OF_BIRTH]. 01.00 paid', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 01/02/01/01 units billed', 'DOB [DATE_OF_BIRTH]/01 units billed', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'DOB 1-2-01-01/05/2026 denied', 'DOB [DATE_OF_BIRTH]-01/05/2026 denied', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'Born 1/2/01 - 01/05/2026 seen', 'Born [DATE_OF_BIRTH] - 01/05/2026 seen', { datesOfBirth: ['2001-01-02'] }],
    ['F4', ['ZEPHYRA VANTREE'], 'Seen 1/2/01 - 01/05/2026 again', 'Seen [DATE_OF_BIRTH] - 01/05/2026 again', { datesOfBirth: ['2001-01-02'] }],
    // Review round 5, F6: cc3dd7f6 reads every letter as a space once any letter touches a digit, so "12/31 terminated. 26"
    // is a date to it and the range before it stands; the dates it read so are barriers of the scan's full reading too,
    // and the letter is sent as it sent it. With no letter against a digit both trees refuse the range's digits.
    ['F6', ['ZEPHYRA VANTREE'], 'Coverage 10/1/2025-12/31 terminated. 26 units of 97110GP were billed.', 'Coverage 10/1/2025-12/31 terminated. 26 units of 97110GP were billed.', {}],
    ['F6', ['ZEPHYRA VANTREE'], 'DOS 10/22/2024-2/12 reviewed. 16 claims of 97110GP are pending.', 'DOS 10/22/2024-2/12 reviewed. 16 claims of 97110GP are pending.', {}],
    ['F6', ['ZEPHYRA VANTREE'], 'Service 03/08/2021-6/14 denied. 27 visits of 97530GO were denied.', 'Service 03/08/2021-6/14 denied. 27 visits of 97530GO were denied.', {}],
    ['F6', ['ZEPHYRA VANTREE'], 'DOS 10/22/2024-2/12/2025 reviewed. 16 claims of 97110GP are pending.', 'DOS 10/22/2024-2/12/2025 reviewed. 16 claims of 97110GP are pending.', {}],
    ['F6', ['ZEPHYRA VANTREE'], 'DOS 10/22/2024-2/12 reviewed.', null, {}],
    ['F6', ['ZEPHYRA VANTREE'], 'DOS 10/22/2024-2/12 reviewed. 16 claims of 97110 GP are pending.', null, {}],
    // Review round 5, F5: a lone letter glued after a number before the name is the number's own by its structure, an
    // ICD-10-CM code's last character or a one-letter unit after a whole number of one to three digits, and no initial
    // (cc3dd7f6 sends each with only the name replaced); after an amount, a currency sign, a year or a longer number it
    // stays an initial, and so does every such letter in a held letter (fail-safe refusals).
    ['F5', ['ANNA DAVIS'], 'Diagnosis S83.511A. Anna was evaluated on 01/05/2026.', 'Diagnosis S83.511A. [PATIENT_NAME] was evaluated on 01/05/2026.', {}],
    ['F5', ['ANNA DAVIS'], 'Diagnosis S83.511A Davis', 'Diagnosis S83.511A [PATIENT_NAME]', {}],
    ['F5', ['MAY ALLEN'], 'Diagnosis S83.511A may be payable under the plan.', 'Diagnosis S83.511A [PATIENT_NAME] be payable under the plan.', {}],
    ['F5', ['WILL ADAMS'], 'Diagnosis S83.511A will be reviewed.', 'Diagnosis S83.511A [PATIENT_NAME] be reviewed.', {}],
    ['F5', ['DANA SMITH'], 'Authorized 30d. Dana Smith may appeal.', 'Authorized 30d. [PATIENT_NAME] may appeal.', {}],
    ['F5', ['XAVIER VANTREE'], 'Therapy 3x, Xavier Vantree, denied.', 'Therapy 3x, [PATIENT_NAME], denied.', {}],
    ['F5', ['FIONA VANTREE'], 'Patient 45F Fiona Vantree', 'Patient 45F [PATIENT_NAME]', {}],
    ['F5', ['SAM VANTREE'], 'Rest 30s. Sam Vantree tolerated.', 'Rest 30s. [PATIENT_NAME] tolerated.', {}],
    ['F5', ['WILLIAM VANTREE'], 'Visit 6w William Vantree', 'Visit 6w [PATIENT_NAME]', {}],
    ['F5', ['SAM VANTREE'], 'Level L4-5S, Sam Vantree', 'Level L4-5S, [PATIENT_NAME]', {}],
    ['F5', ['JANE Q ZEPHYRA'], 'Paid 150.00Q Zephyra', null, {}],
    ['F5', ['JANE Q ZEPHYRA'], 'Paid 150Q Zephyra', null, {}],
    ['F5', ['DANA SMITH'], 'Paid 150.00D Dana Smith', null, {}],
    ['F5', ['DANA SMITH'], 'Paid $30D Dana Smith', null, {}],
    ['F5', ['DANA SMITH'], 'Seen 2020D Dana Smith', null, {}],
    ['F5', ['DANA SMITH'], 'Ref 12345D Dana Smith', null, {}],
    ['F5', ['ANNA DAVIS'], 'Diagnosis 9S83.511A. Anna', null, {}],
    ['F5', ['ANNA DAVIS'], `${HELD}Diagnosis S83.511A. Anna was evaluated.`, null, {}],
    ['F5', ['DANA SMITH'], `${HELD}Authorized 30d. Dana Smith may appeal.`, null, {}],
    // Review round 5, F1 (the glued property's seeds 85720467, 283659814, -1270007264 and 708482257). A letter with no case
    // in a run a digit touches (U+02BC, U+02B9 and U+02CA written for an apostrophe, a letter of a script without case)
    // ends the word before it and begins none: the part beside it is set apart and the letter refused; a word that only
    // holds a part stays ("Billed" for BILL).
    ['F1', ["O'BRIEN AA"], 'Billed 150.00-120.00OʼBrien Aa, ', null, {}],
    ['F1', ["O'BRIEN AA"], 'Paid 150.00OʹBrien', null, {}],
    ['F1', ["O'BRIEN AA"], 'Paid 150.00OˊBrien', null, {}],
    ['F1', ['ZEPHYRA VANTREE'], 'Paid 150.00ʼZephyra', null, {}],
    ['F1', ['ZEPHYRA VANTREE'], 'Paid 150.00Zephyraʼs', null, {}],
    ['F1', ['ZEPHYRA VANTREE'], 'Paid 150.00אZephyra', null, {}],
    ['F1', ['ZEPHYRA VANTREE'], 'Paid 150.00王Zephyra', null, {}],
    ['F1', ['BILL VANTREE'], 'Paid 150.00אBilled', 'Paid 150.00אBilled', {}],
    // A member ID or claim number of letters that begins glued to a digit, a part of the name inside it already replaced
    // (redaction read "JONES" after the soft hyphen as the name): the rest of the number beside the placeholder is read.
    ['F1', ['AA SMITH-JONES'], 'DOS 2020-01-01–2020-01-02S MITH\u00ADJONES;', null, { memberIds: ['SMITHJONES'] }],
    ['F1', ['CLAIM SMITH-JONES'], 'DOS 2020-01-01–2020-01-02S MITH\u00ADJONES;', null, { claimNumbers: ['SMITHJONES'] }],
    ['F1', ['AA JONES'], 'Jones-SMITH9 paid', null, { memberIds: ['JONESSMITH'] }],
    ['F1', ['AA SMITH-JONES'], 'DOS 2020-01-01–2020-01-02 S MITH\u00ADJONES;', 'DOS 2020-01-01–2020-01-02 [MEMBER_ID];', { memberIds: ['SMITHJONES'] }],
    ['F1', ['AA JONES'], 'Paid 150.00 Mary-Jones today', 'Paid 150.00 Mary-[PATIENT_NAME] today', { memberIds: ['SMITHJONES'] }],
    // Review round 5, F7: more units whose letters after a whole number are no head of a part (dose and the counts a letter
    // bills); after an amount they stay a head, and the head rule's other gaps stay fail-safe refusals (docs/adr/0054).
    ['F7', ['MGALI ALI'], 'Dose 30mg Ali tolerated.', 'Dose 30mg [PATIENT_NAME] tolerated.', {}],
    ['F7', ['MLALI ALI'], 'Dose 5ml Ali tolerated.', 'Dose 5ml [PATIENT_NAME] tolerated.', {}],
    ['F7', ['OZANA ANA'], 'Weight 8oz Ana gained.', 'Weight 8oz [PATIENT_NAME] gained.', {}],
    ['F7', ['DAYSANA ANA'], 'Stay 3days Ana attended.', 'Stay 3days [PATIENT_NAME] attended.', {}],
    ['F7', ['VISITSANA ANA'], 'Limit 12visits Ana used.', 'Limit 12visits [PATIENT_NAME] used.', {}],
    ['F7', ['UNITSANA ANA'], 'Billed 4units Ana attended.', 'Billed 4units [PATIENT_NAME] attended.', {}],
    ['F7', ['UNITSANA ANA'], 'Billed 150.00units Ana attended.', null, {}],
    ['F7', ['COLIN LIN'], 'Billed 97110-59CO Lin', null, {}],
    ['F7', ['COLIN LIN'], 'Rev 0420CO Lin', null, {}],
    ['F7', ['AMAL AL HASSAN'], 'Seen 9:30:00am Al Hassan', null, {}],
  ] as const)('handles the judge’s round 4 and review round 5 input (%s): %s %j', (_finding, names, letter, sent, more) => {
    const { patient: who, claims } = judge1([...names], more);
    const redacted = redactLetterForScreen(letter, who, claims);
    expect(holdsIdentifier(redacted.text, who, claims)).toBe(sent === null);
    if (sent !== null) {
      expect(redacted.text).toBe(sent);
    }
  });

  // PHIJ3-1: a held letter never sends the date of birth written with each of datesIn's separators (DATE_SEPARATOR, a dash
  // of each kind among them), white space, and gaps of two or three characters, in every order of its year, month and
  // day, with a four- or two-digit year, padded or not (one row per separator and order): it is refused, or redaction
  // reads the form as the date of birth and the letter is sent with that form alone replaced ("03/14/1980").
  const neverInClear = (letter: string, form: string, who: PatientIdentifiers, claims: readonly LetterClaim[]) => {
    const screened = redactLetterForScreen(letter, who, claims);
    const refused = holdsIdentifier(screened.text, who, claims);
    expect(refused || screened.text === letter.normalize('NFKC').replace(form.normalize('NFKC'), '[DATE_OF_BIRTH]'), JSON.stringify(letter)).toBe(true);
  };
  const HELD_FRAMES = [`${HELD}Seen {T}`, 'Seen 01/01/2020-150.00 Paid. {T}', '{T}\nSeen 01/01/2020-150.00Paid in full.', 'Re: {T}. Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00'];
  const SEPARATORS = ['/', '\\', '.', '-', '‐', '‑', '‒', '–', '—', '―', '−', '⁃', '_', '|', ' ', '\n', ' / ', '--', ', ', ' | '];
  const ORDERS = ['ymd', 'ydm', 'mdy', 'dmy', 'myd', 'dym'] as const;
  const writtenAs = (birth: string, order: string, separator: string, short: boolean, padded: boolean) => {
    const [year = '', month = '', day = ''] = birth.split('-');
    const parts: Record<string, string> = { y: short ? year.slice(2) : year, m: padded ? month : month.replace(/^0/u, ''), d: padded ? day : day.replace(/^0/u, '') };
    return [...order].map((part) => parts[part] ?? '').join(separator);
  };
  it.each(SEPARATORS.flatMap((separator) => ORDERS.map((order) => [separator, order] as const)))('never sends the date of birth in a held letter written with %j in the order %s', (separator, order) => {
    for (const [names, birth] of [
      [['JANE Q ZEPHYRA'], '1980-03-14'],
      [['SIMONE Q VANTREE'], '1975-11-02'],
    ] as const) {
      const { patient: who, claims } = judge1([...names], { datesOfBirth: [birth] });
      for (const short of [false, true]) {
        for (const padded of [true, false]) {
          for (const frame of HELD_FRAMES) {
            const form = writtenAs(birth, order, separator, short, padded);
            neverInClear(frame.replace('{T}', form), form, who, claims);
          }
        }
      }
    }
  });

  it.each([
    ['1980-03-14', ['19800314', '19801403', '03141980', '14031980', '03198014', '14198003', '1980314', '3141980', '800314', '801403', '031480', '140380', '038014', '148003']],
    ['1975-11-02', ['1121975', '2111975', '1975112', '1975211', '19751102', '751102', '021175']],
    ['1961-03-03', ['19610303', '196133', '331961', '319613', '1961033', '610303', '030361']],
  ] as const)('never sends the date of birth %s written compact in a held letter, in any order', (birth, forms) => {
    const { patient: who, claims } = judge1(['JANE Q ZEPHYRA'], { datesOfBirth: [birth] });
    for (const form of forms) {
      for (const frame of HELD_FRAMES) {
        neverInClear(frame.replace('{T}', form), form, who, claims);
      }
    }
  });

  it('never sends the date of birth in clear in a held letter, whatever separators, order, year length, padding or month word write it (property, PHIJ3-1)', () => {
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    // One to three characters, or a wide gap: white space longer than four characters, a separator then a line break and
    // indentation, CRLF (the judge's review round 4, PHIJ4-1: datesIn takes white space of any length between a date's parts).
    const narrow = fc.array(fc.constantFrom('/', '\\', '.', '-', '–', '−', '⁃', '_', '|', ' ', ',', '\n', "'"), { minLength: 1, maxLength: 3 }).map((characters) => characters.join(''));
    const blank = fc.constantFrom('', '  ', '     ', '        ', '\n        ', '\r\n   ', '\t\t\t');
    const wide = fc.tuple(blank, fc.constantFrom('', '/', '-', '.', ',', '–', '|'), blank).map(([before, separator, after]) => `${before}${separator}${after}`).filter((written) => written.length > 4);
    const gap = fc.oneof(narrow, wide);
    const property = fc.property(
      fc.date({ min: new Date('1925-01-01T00:00:00Z'), max: new Date('2009-12-31T00:00:00Z'), noInvalidDate: true }),
      fc.constantFrom(...HELD_FRAMES),
      fc.constantFrom(...ORDERS),
      gap,
      gap,
      fc.boolean(),
      fc.boolean(),
      fc.nat(4),
      (date, frame, order, first, second, short, padded, word) => {
        const birth = date.toISOString().slice(0, 10);
        const [year = '', month = '', day = ''] = birth.split('-');
        const name = MONTH_NAMES[Number.parseInt(month, 10) - 1] ?? 'May';
        // The month as a number, or as its word, its first three letters, those with a full stop, or the word in capitals.
        const monthAs = [padded ? month : month.replace(/^0/u, ''), name, name.slice(0, 3), `${name.slice(0, 3)}.`, name.toUpperCase()][word] ?? month;
        const parts: Record<string, string> = { y: short ? year.slice(2) : year, m: monthAs, d: padded ? day : day.replace(/^0/u, '') };
        const [a = '', b = '', c = ''] = [...order].map((part) => parts[part] ?? '');
        const form = `${a}${first}${b}${second}${c}`;
        const { patient: who, claims } = judge1(['JANE Q ZEPHYRA'], { datesOfBirth: [birth] });
        neverInClear(frame.replace('{T}', form), form, who, claims);
      },
    );
    fc.assert(property, { numRuns: 300 });
  });

  it('never sends two or more of the name’s initials written together in a held letter, in any order and case, for a name of any number of parts: refused, or the letters replaced where they spell a whole part (property, PHIJ4-2)', () => {
    const NAMES = ['JANE ZEPHYRA', 'JANE Q ZEPHYRA', 'SIMONE VANTREE', 'ANN Q VANTREE', 'BOB XU', 'MARY-JANE Q ZEPHYRA', 'ANA BEA CORA DINA ELLA FAYE GIA'];
    const FRAMES = [`${RANGE_END}{T} $0,000.00`, `${HELD}Initials: {T}`, `${HELD}Re: {T}, thank you.`, 'Seen 01/01/2020-150.00{T} Paid in full.', '{T}\nSeen 01/01/2020-150.00Paid in full.'];
    const property = fc.property(
      fc.constantFrom(...NAMES).chain((name) => {
        const initials = name.split(/[ -]/u).map((part) => part.charAt(0));
        return fc.tuple(fc.constant(name), fc.shuffledSubarray(initials, { minLength: 2 }), fc.array(fc.boolean(), { minLength: initials.length, maxLength: initials.length }));
      }),
      fc.constantFrom(...FRAMES),
      ([name, initials, small], frame) => {
        const written = initials.map((initial, k) => (small[k] === true ? initial.toLowerCase() : initial)).join('');
        const letter = frame.replace('{T}', written);
        const { patient: who, claims } = judge1([name], {});
        const screened = redactLetterForScreen(letter, who, claims);
        // Refused, or sent with those letters replaced: initials written together may spell a whole part of the name ("BEA"
        // for B, E and A of ANA BEA CORA DINA ELLA FAYE GIA), which redaction takes as the name where a boundary sets it
        // apart (review round 5, F2: seeds -893188803 and -2096183961 drew it).
        expect(holdsIdentifier(screened.text, who, claims) || screened.text === frame.replace('{T}', '[PATIENT_NAME]'), JSON.stringify(letter)).toBe(true);
      },
    );
    fc.assert(property, { numRuns: 300 });
  });

  it.each([
    ['BEA\nSeen 01/01/2020-150.00Paid in full.', '[PATIENT_NAME]\nSeen 01/01/2020-150.00Paid in full.'],
    ['bEa\nSeen 01/01/2020-150.00Paid in full.', '[PATIENT_NAME]\nSeen 01/01/2020-150.00Paid in full.'],
    ['Re: Bea.\nSeen 01/01/2020-150.00Paid in full.', 'Re: [PATIENT_NAME].\nSeen 01/01/2020-150.00Paid in full.'],
    // "Service" holds C and E, two of this name's initials, together: a held letter with it is refused whatever else it holds (PHI5-1).
    [`${HELD}Initials: BEA`, null],
    [`${RANGE_END}BEA $0,000.00`, null],
    ['Seen 01/01/2020-150.00BEA Paid in full.', null],
    [`${HELD}Initials: BAE`, null],
    [`${HELD}Initials: BE`, null],
  ] as const)('sends initials written together that spell a whole part of the name with the part replaced, and refuses them glued or in another order (F2): %j', (letter, sent) => {
    const { patient: who, claims } = judge1(['ANA BEA CORA DINA ELLA FAYE GIA'], {});
    const screened = redactLetterForScreen(letter, who, claims);
    expect(holdsIdentifier(screened.text, who, claims)).toBe(sent === null);
    if (sent !== null) expect(screened.text).toBe(sent);
  });

  it('refuses a hand-made redacted text that holds a surviving form, and a letter that glues the patient’s name to one (identifier_left, a fixed message with no number)', () => {
    for (const text of ['Call [CLAIM_1] at 202-555-0123', 'SSN 900 12 3456', 'Phone: 2025550123', 'xxx-xx-3456', 'RE: Vantree[SSN]']) {
      expect(holdsIdentifier(text, A, AC), text).toBe(true);
    }
    // The name glued to the number by a lost space has no boundary redaction reads: the letter is refused, as at cc3dd7f6
    // (design 7.4; the glued reading of review round 2 is reverted, review round 3).
    for (const text of ['RE: Vantree900-12-3456', 'SSN 900 12 34 56']) {
      expect(() => denialLetterSpec.prepare({ ...syntheticLetterInput(), patient: A, claims: AC, text })).toThrow(expect.objectContaining({ code: 'identifier_left', message: 'the letter still holds an identifier after redaction; it is not sent' }));
    }
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
