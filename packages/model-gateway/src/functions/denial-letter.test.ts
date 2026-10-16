import { DENIAL_CATEGORIES } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dateForms, holdsIdentifier, redactLetter, redactionForms } from '../redact';
import { SYNTHETIC_IDS, SYNTHETIC_LETTER, syntheticLetterInput, syntheticLetterOutput } from '../testing';
import { type DenialLetterOutput, denialLetterSpec, verifyDenialLetter } from './denial-letter';

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
