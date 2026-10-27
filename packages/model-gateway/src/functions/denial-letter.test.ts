import { DENIAL_CATEGORIES } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FlagRow } from '../flags';
import { BARRIER, dateForms, datesIn, fold, holdsIdentifier, identifierCandidates, redactLetter, redactionForms } from '../redact';
import { SYNTHETIC_IDS, SYNTHETIC_LETTER, localGateway, registerOutput, syntheticLetterInput, syntheticLetterOutput, syntheticRecords } from '../testing';
import { type DenialLetterInput, type DenialLetterOutput, denialLetterSpec, verifyDenialLetter } from './denial-letter';

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

  it('reads every date form with each calendar date it can be', () => {
    expect(datesIn('on 03/04/61').map((span) => span.dates)).toEqual([['1961-03-04', '2061-03-04', '1961-04-03', '2061-04-03']]);
    expect(datesIn('31/12/2026 and 2/30/2026').map((span) => span.dates)).toEqual([['2026-12-31'], []]);
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
