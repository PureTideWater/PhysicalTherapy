import { describe, expect, it } from 'vitest';

import { PhiLeakError, assertNoPhi, jobPayloadPhiFindings, s3KeyPhiFindings, textPhiFindings, urlPhiFindings, writtenPhiFindings } from './phi-guard';

const PRACTICE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const CLAIM = '9c8b7a65-4321-4fed-8cba-123456789012';
/** A synthetic patient record, as a later milestone's test would hand the guard. */
const SYNTHETIC = ['SYNTHETIC', 'TWIN', '1950-01-01', 'SYN000000001', 'SYNPCN0001'];

describe('urlPhiFindings (SEC-08)', () => {
  it.each([
    `/practices/${PRACTICE}/claims/${CLAIM}`,
    `https://app.example.test/practices/${PRACTICE}/cases?state=open&owner_id=${CLAIM}`,
    '/settings/security',
    `/claims/${CLAIM.toUpperCase()}`,
  ])('accepts %s', (url) => {
    expect(urlPhiFindings(url, { known: SYNTHETIC })).toEqual([]);
  });

  it.each([
    ['/claims/SYNPCN0001', /path segment 2 is neither an opaque ID nor a lowercase route word/],
    ['/patients/123456789', /nine or more digits/],
    ['/patients/123-45-6789', /SSN shape/],
    ['/patients/twin/1950-01-01', /calendar date/],
    ['/claims?dob=01%2F02%2F1950', /query parameter dob holds a calendar date/],
    ['/claims?member=SYN000000001', /synthetic record/],
    ['/users/someone%40synthetic.test', /email address/],
    ['/claims?callback=919-555-0100', /phone number/],
    ['/claims?Patient=x', /query parameter name/],
    ['/claims#SYNTHETIC', /fragment holds a value of the synthetic record/],
    ['/patients/synthetic-twin', /synthetic record/],
  ])('refuses %s', (url, expected) => {
    expect(urlPhiFindings(url, { known: SYNTHETIC }).join('; ')).toMatch(expected);
  });

  it('never quotes the value it refused', () => {
    expect(urlPhiFindings('/claims/SYNPCN0001?member=SYN000000001', { known: SYNTHETIC }).join(' ')).not.toMatch(/SYN/);
  });

  it('reads a malformed escape as written', () => {
    expect(urlPhiFindings('/claims/%E0%A4%A')).toEqual(['URL path segment 2 is neither an opaque ID nor a lowercase route word']);
  });
});

describe('s3KeyPhiFindings (SEC-08)', () => {
  it.each([`practices/${PRACTICE}/documents/${CLAIM}`, `practices/${PRACTICE}/packets/${CLAIM}.pdf`, 'audit-events/v1/2026/10/14.jsonl', 'quarantine/v2/a1'])(
    'accepts %s',
    (key) => {
      expect(s3KeyPhiFindings(key, { known: SYNTHETIC })).toEqual([]);
    },
  );

  it.each([
    [`practices/${PRACTICE}/SMITH_JOHN_835.txt`, /segment 3 is not an opaque ID/],
    [`practices/${PRACTICE}/documents/remit-1950-01-01.835`, /calendar date/],
    ['uploads/123456789/x', /nine or more digits/],
    [`practices/${PRACTICE}/synthetic`, /synthetic record/],
    [`practices/${PRACTICE}/doc.tar.gz`, /segment 3 is not an opaque ID/],
    ['exports/12345', /segment 2 is not an opaque ID/],
  ])('refuses %s', (key, expected) => {
    expect(s3KeyPhiFindings(key, { known: SYNTHETIC }).join('; ')).toMatch(expected);
  });
});

describe('jobPayloadPhiFindings (SEC-08)', () => {
  it.each([{ practice_id: PRACTICE, document_id: CLAIM }, { practice_id: PRACTICE, period: '2026-10' }, { day: '2026-10-14' }, {}])('accepts %j', (payload) => {
    expect(jobPayloadPhiFindings(payload, { known: SYNTHETIC })).toEqual([]);
  });

  it.each([
    [{ practice_id: PRACTICE, patient_name: 'SYNTHETIC TWIN' }, /patient_name is not an ID field/],
    [{ practice_id: 'SYNPCN0001' }, /practice_id does not hold an opaque UUID/],
    [{ claim_id: '123456789' }, /nine or more digits/],
    [{ practice_id: PRACTICE, nested: { name: 'x' } }, /nested is not an ID field/],
    [{ period: '2026-13' }, /period is not in its fixed format/],
    [{ day: 20261014 }, /day is not in its fixed format/],
    [{ day: '1950-01-01' }, /synthetic record/],
    [[PRACTICE], /an object of opaque IDs/],
    ['practice', /an object of opaque IDs/],
    [null, /an object of opaque IDs/],
  ])('refuses %j', (payload, expected) => {
    expect(jobPayloadPhiFindings(payload, { known: SYNTHETIC }).join('; ')).toMatch(expected);
  });

  it('works without a synthetic record', () => {
    expect(jobPayloadPhiFindings({ practice_id: PRACTICE })).toEqual([]);
  });
});

describe('assertNoPhi', () => {
  it('passes clean values and throws a PhiLeakError naming the carrier and the rules, never the value', () => {
    expect(() => {
      assertNoPhi('url', `/practices/${PRACTICE}`);
    }).not.toThrow();
    expect(() => {
      assertNoPhi('s3_key', `practices/${PRACTICE}/documents/${CLAIM}`);
    }).not.toThrow();
    expect(() => {
      assertNoPhi('job_payload', { practice_id: PRACTICE });
    }).not.toThrow();
    let caught: unknown;
    try {
      assertNoPhi('job_payload', { practice_id: PRACTICE, member_id: 'SYN000000001' }, { known: SYNTHETIC });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PhiLeakError);
    expect(caught).toMatchObject({ carrier: 'job_payload', name: 'PhiLeakError' });
    expect((caught as PhiLeakError).message).toMatch(/^job_payload may carry PHI: /);
    expect((caught as PhiLeakError).message).not.toContain('SYN000000001');
    expect(() => {
      assertNoPhi('url', '/claims/SYNPCN0001');
    }).toThrow(PhiLeakError);
    expect(() => {
      assertNoPhi('s3_key', 'uploads/SMITH.835');
    }).toThrow(PhiLeakError);
  });
});

describe('textPhiFindings (docs/adr/0053)', () => {
  it('passes plain words and opaque IDs', () => {
    expect(textPhiFindings('The upload screen says the file is held; what should we do next?')).toEqual([]);
    expect(textPhiFindings('Ticket about run 3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60 and 12 lines')).toEqual([]);
  });

  it('finds identifier shapes', () => {
    expect(textPhiFindings('claim 123456789 was underpaid')).toHaveLength(1);
    expect(textPhiFindings('born 1980-04-12')).toHaveLength(1);
    expect(textPhiFindings('ssn 123-45-6789')).not.toEqual([]);
    expect(textPhiFindings('call 919-555-0100')).toHaveLength(1);
    expect(textPhiFindings('write to someone@synthetic.test')).toHaveLength(1);
    expect(textPhiFindings('patient SYNTHLAST', { known: ['SYNTHLAST'] })).toHaveLength(1);
  });
});

describe('writtenPhiFindings (docs/adr/0055)', () => {
  it('finds what a person writes about a patient in words, as the reviewed ticket did', () => {
    const ticket = 'Patient Zephyra Quillon, born March 3 1961, member ZQ4455667 was underpaid on claim CLM55512.';
    expect(textPhiFindings(ticket)).toEqual([]);
    expect(writtenPhiFindings(ticket)).toEqual([
      'the text holds a date written in words (a date of birth shape)',
      'the text holds a birth date named',
      'the text holds an identifier of letters and digits (a member ID or claim number shape)',
      'the text holds a name after a word that introduces a person',
    ]);
    expect(writtenPhiFindings('the 3rd of March, 1961')).toHaveLength(1);
    expect(writtenPhiFindings('Mrs. Quillon called about it')).toHaveLength(1);
    expect(writtenPhiFindings('member # 5551234 was underpaid')).toEqual(['the text holds an identifier named by its kind']);
    expect(writtenPhiFindings('DOB on file')).toEqual(['the text holds a birth date named']);
    expect(writtenPhiFindings('claim 123456789')).toEqual(expect.arrayContaining(['the text holds an identifier named by its kind']));
  });

  it('passes support questions that name screens, codes, opaque IDs and product words', () => {
    for (const text of [
      'How do I export a packet from the Packet builder?',
      'The Patient Share column on Claims and lines looks wrong for code 97110-GP and G0283.',
      'Pricing run 3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60 shows 12 lines unpriced since March.',
      'Our invoice INV-0042 for May was charged twice.',
      'The member ID column and the patient reference are blank after the upload of 2 files.',
      'Fee schedule 2026 rates for 97140 look off by 3 percent.',
    ]) {
      expect(writtenPhiFindings(text), text).toEqual([]);
    }
  });
});
