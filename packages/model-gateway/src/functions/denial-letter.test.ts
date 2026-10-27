import { DENIAL_CATEGORIES } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FlagRow } from '../flags';
import { dateForms, datesIn, holdsIdentifier, identifierCandidates, redactLetter, redactionForms } from '../redact';
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

  it('refuses to send a letter that still holds an identifier after redaction', () => {
    // An identifier that its own placeholder spells: the redacted text still holds it, so nothing is sent.
    const patient = { ...input.patient, names: ['PATIENT_NAME'] };
    expect(() => denialLetterSpec.prepare({ ...input, patient, text: 'Re: PATIENT_NAME' })).toThrow(expect.objectContaining({ code: 'identifier_left' }));
  });

  it('leaves no identifier in any letter, whatever its synthetic names and numbers (property)', () => {
    const word = fc.stringMatching(/^[A-Z][a-z]{2,9}$/);
    const number = fc.stringMatching(/^SYN[0-9]{6,10}$/);
    fc.assert(
      fc.property(word, word, number, number, fc.date({ min: new Date('1930-01-01T00:00:00Z'), max: new Date('2020-12-31T00:00:00Z'), noInvalidDate: true }), (first, last, member, claim, birth) => {
        // A name spelled by its own placeholder's words is left in the redacted text and refused, as the test above shows.
        fc.pre(![first, last].some((part) => ['PATIENT', 'NAME'].includes(part.toUpperCase())));
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
