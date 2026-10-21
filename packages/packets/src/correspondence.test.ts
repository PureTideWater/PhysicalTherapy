import { describe, expect, it } from 'vitest';

import {
  CORRESPONDENCE_CONTACT_KEY,
  CORRESPONDENCE_FIELDS,
  CORRESPONDENCE_FIELD_RULES,
  CorrespondenceContactError,
  type CorrespondenceContactInput,
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  correspondenceContactOf,
  correspondenceContactSetting,
  correspondenceText,
} from './correspondence';

/** The practice's correspondence contact (audit item #37 part 1, D6; the founder's ruling of 2026-10-20, Q1 (a)). */

const refusedFor = (input: CorrespondenceContactInput): string | null => {
  try {
    correspondenceContactSetting(input);
    return null;
  } catch (error) {
    if (error instanceof CorrespondenceContactError) {
      return error.field;
    }
    throw error;
  }
};

describe('correspondenceContactSetting', () => {
  it('stores a name or office and a phone as digits; the extension, email and address are optional', () => {
    expect(correspondenceContactSetting({ name: '  BILLING OFFICE ', phone: '+1 (919) 555-0100' })).toEqual({ name: 'BILLING OFFICE', phone: '9195550100' });
    expect(correspondenceContactSetting({ name: 'BILLING OFFICE', phone: '919.555.0100', phone_extension: '', email: ' ', address: { line1: '', city: '', state: '', zip: '' } })).toEqual({
      name: 'BILLING OFFICE',
      phone: '9195550100',
    });
    expect(
      correspondenceContactSetting({
        name: 'BILLING OFFICE',
        phone: '1-919-555-0100',
        phone_extension: '12',
        email: 'billing@synthetic.test',
        address: { line1: '100 SYNTHETIC WAY', line2: 'SUITE 2', city: 'RALEIGH', state: 'nc', zip: '27601-1234' },
      }),
    ).toEqual({
      name: 'BILLING OFFICE',
      phone: '9195550100',
      phone_extension: '12',
      email: 'billing@synthetic.test',
      address: { line1: '100 SYNTHETIC WAY', line2: 'SUITE 2', city: 'RALEIGH', state: 'NC', zip: '27601-1234' },
    });
  });

  it('refuses each field by its rule, naming the field and never the value', () => {
    const base = { name: 'BILLING OFFICE', phone: '9195550100' };
    expect(refusedFor({ ...base, name: ' ' })).toBe('name');
    expect(refusedFor({ ...base, name: 'B'.repeat(121) })).toBe('name');
    expect(refusedFor({ ...base, name: 'BILLING​OFFICE' })).toBe('name');
    expect(refusedFor({ ...base, name: 'BILLING\nOFFICE' })).toBe('name');
    expect(refusedFor({ ...base, phone: '' })).toBe('phone');
    expect(refusedFor({ ...base, phone: '919555010' })).toBe('phone');
    expect(refusedFor({ ...base, phone: '1195550100' })).toBe('phone');
    expect(refusedFor({ ...base, phone: '9191550100' })).toBe('phone');
    expect(refusedFor({ ...base, phone: '919-555-01OO' })).toBe('phone');
    expect(refusedFor({ ...base, phone_extension: '1234567' })).toBe('phone_extension');
    expect(refusedFor({ ...base, phone_extension: 'x12' })).toBe('phone_extension');
    expect(refusedFor({ ...base, email: 'billing at synthetic.test' })).toBe('email');
    expect(refusedFor({ ...base, email: 'a@b@synthetic.test' })).toBe('email');
    expect(refusedFor({ ...base, email: `${'b'.repeat(250)}@x.test` })).toBe('email');
    expect(refusedFor({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC' } })).toBe('address_zip');
    expect(refusedFor({ ...base, address: { city: 'RALEIGH', state: 'NC', zip: '27601' } })).toBe('address_line1');
    expect(refusedFor({ ...base, address: { line1: '100 SYNTHETIC WAY', state: 'NC', zip: '27601' } })).toBe('address_city');
    expect(refusedFor({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'ZZ', zip: '27601' } })).toBe('address_state');
    expect(refusedFor({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '2760' } })).toBe('address_zip');
    expect(refusedFor({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '27601123' } })).toBe('address_zip');
    // ZIP+4 typed as nine digits, as a phone's digits-only keypad gives it, is stored hyphenated.
    expect(correspondenceContactSetting({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '276011234' } }).address?.zip).toBe('27601-1234');
    expect(correspondenceContactSetting({ ...base, address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '27601-1234' } }).address?.zip).toBe('27601-1234');
    expect(refusedFor({ ...base, address: { line1: 'L'.repeat(101), city: 'RALEIGH', state: 'NC', zip: '27601' } })).toBe('address_line1');
    expect(refusedFor({ ...base, fax: '9195550101' } as CorrespondenceContactInput)).toBe('contact');
    // The contact's email is the one email the payer's copy prints (Q1 (a)): the name and the address lines hold no @.
    expect(refusedFor({ ...base, name: 'J. DOE (jdoe@practice.test)' })).toBe('name');
    const mailing = { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '27601' };
    expect(refusedFor({ ...base, address: { ...mailing, line1: 'billing@practice.test' } })).toBe('address_line1');
    expect(refusedFor({ ...base, address: { ...mailing, line2: 'ATTN billing@practice.test' } })).toBe('address_line2');
    expect(refusedFor({ ...base, address: { ...mailing, city: 'RALEIGH@X' } })).toBe('address_city');
    expect(CORRESPONDENCE_FIELD_RULES.name).toContain('no @');
    for (const field of CORRESPONDENCE_FIELDS) {
      expect(new CorrespondenceContactError(field).message).toBe(CORRESPONDENCE_FIELD_RULES[field]);
    }
  });
});

describe('correspondenceContactOf', () => {
  it('reads a stored contact as set, an absent key as missing, and anything else as malformed, never a default', () => {
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: SYNTHETIC_CORRESPONDENCE_CONTACT, proof_level: 'posted' })).toEqual({ state: 'set', contact: SYNTHETIC_CORRESPONDENCE_CONTACT });
    expect(correspondenceContactOf({ proof_level: 'posted' })).toEqual({ state: 'missing' });
    expect(correspondenceContactOf(null)).toEqual({ state: 'missing' });
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: null })).toEqual({ state: 'malformed' });
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: 'BILLING OFFICE' })).toEqual({ state: 'malformed' });
    // Not in its stored form: punctuation in the phone, a blank kept, a key of another kind.
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: { name: 'BILLING OFFICE', phone: '(919) 555-0100' } })).toEqual({ state: 'malformed' });
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: { name: 'BILLING OFFICE', phone: '9195550100', email: '' } })).toEqual({ state: 'malformed' });
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: { name: 'BILLING OFFICE', phone: '9195550100', fax: '9195550101' } })).toEqual({ state: 'malformed' });
    expect(correspondenceContactOf({ [CORRESPONDENCE_CONTACT_KEY]: { name: 'BILLING OFFICE' } })).toEqual({ state: 'malformed' });
  });
});

describe('correspondenceText', () => {
  it('prints the contact in the payer copy’s words', () => {
    expect(correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)).toBe('SYNTHETIC BILLING OFFICE, (919) 555-0100 ext. 12, disputes@synthetic-practice.test; 100 SYNTHETIC WAY, SUITE 2, RALEIGH, NC 27601');
    expect(correspondenceText({ name: 'BILLING OFFICE', phone: '9195550100' })).toBe('BILLING OFFICE, (919) 555-0100');
    expect(correspondenceText({ name: 'BILLING OFFICE', phone: '9195550100', address: { line1: '100 SYNTHETIC WAY', city: 'RALEIGH', state: 'NC', zip: '27601' } })).toBe(
      'BILLING OFFICE, (919) 555-0100; 100 SYNTHETIC WAY, RALEIGH, NC 27601',
    );
  });
});
