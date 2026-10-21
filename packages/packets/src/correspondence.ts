/**
 * The practice's correspondence contact (audit item #37 part 1, D6; the founder's ruling of 2026-10-20, Q1 (a);
 * docs/adr/0061): who a payer's examiner writes to or calls about a dispute, printed on the payer's copy of every
 * packet ("Correspondence about this dispute: <contact>."). It lives in practice.settings.correspondence_contact,
 * which the practice administrator sets; a packet is not exported until it is set (the export's coded refusal
 * contact_missing).
 *
 * A name or office and a phone number are required; the extension, an email and a mailing address are optional.
 * The contact's email is the one email the payer's copy prints (its logins never are), so the name and the address
 * lines hold no @: a second email typed there would print beside it. It is staff contact data, not PHI, and it is
 * never logged.
 *
 * Stored shape (the key is absent until set; no other key):
 *
 *   { "name": "BILLING OFFICE", "phone": "9195550100", "phone_extension": "12", "email": "billing@synthetic.test",
 *     "address": { "line1": "100 SYNTHETIC WAY", "line2": "SUITE 2", "city": "RALEIGH", "state": "NC", "zip": "27601" } }
 *
 * correspondenceContactSetting() validates a contact as a person enters it and returns its stored form (the web's
 * Zod schema checks it first); correspondenceContactOf() reads the stored value back, and anything but `set`
 * refuses an export. A malformed value is never replaced by a default.
 */

/** The practice.settings key the contact is stored under. */
export const CORRESPONDENCE_CONTACT_KEY = 'correspondence_contact';

export interface CorrespondenceAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  /** A USPS state or territory code. */
  readonly state: string;
  /** Five digits, or ZIP+4. */
  readonly zip: string;
}

/** The contact as stored and printed. */
export interface CorrespondenceContact {
  /** A person's name or an office, 1 to 120 characters. */
  readonly name: string;
  /** Ten digits in the North American plan's form. */
  readonly phone: string;
  readonly phone_extension?: string;
  readonly email?: string;
  readonly address?: CorrespondenceAddress;
}

/** A contact as a person enters it: blanks for the optional fields, a phone with its punctuation. */
export interface CorrespondenceContactInput {
  readonly name: string;
  readonly phone: string;
  readonly phone_extension?: string | null;
  readonly email?: string | null;
  readonly address?: {
    readonly line1?: string | null;
    readonly line2?: string | null;
    readonly city?: string | null;
    readonly state?: string | null;
    readonly zip?: string | null;
  } | null;
}

/** Every field a contact is refused by, as the form names it. */
export const CORRESPONDENCE_FIELDS = ['contact', 'name', 'phone', 'phone_extension', 'email', 'address_line1', 'address_line2', 'address_city', 'address_state', 'address_zip'] as const;
export type CorrespondenceField = (typeof CORRESPONDENCE_FIELDS)[number];

/** What each refusal says (fixed words, never the value). */
export const CORRESPONDENCE_FIELD_RULES: Readonly<Record<CorrespondenceField, string>> = {
  contact: 'a correspondence contact names a person or office and a phone number, and holds nothing else',
  name: 'a name or office of 1 to 120 characters, with no hidden characters and no @ (an email goes in its own field)',
  phone: 'a 10-digit phone number, such as (919) 555-0100',
  phone_extension: 'an extension of 1 to 6 digits',
  email: 'an email address of at most 254 characters, with one @ and no spaces',
  address_line1: 'a mailing address names its street line, city, state and ZIP, each 1 to 100 characters with no @ (an email goes in its own field)',
  address_line2: 'a second address line of 1 to 100 characters with no @ (an email goes in its own field)',
  address_city: 'a mailing address names its street line, city, state and ZIP, each 1 to 100 characters with no @ (an email goes in its own field)',
  address_state: 'a USPS state or territory code, such as NC',
  address_zip: 'a ZIP code of five digits, or ZIP+4',
};

/** A contact refused, naming the field (the rule's words, never the value). */
export class CorrespondenceContactError extends Error {
  override readonly name = 'CorrespondenceContactError';

  constructor(readonly field: CorrespondenceField) {
    super(CORRESPONDENCE_FIELD_RULES[field]);
  }
}

/** The USPS codes of the states, the District of Columbia, the territories and the military post offices. */
export const USPS_STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI',
  'WY', 'AS', 'GU', 'MP', 'PR', 'VI', 'AA', 'AE', 'AP',
] as const;
const STATES: ReadonlySet<string> = new Set(USPS_STATE_CODES);

/** Characters that print as nothing or as something else: controls (tab and line breaks included), format and unassigned code points, separators. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
const PHONE = /^[2-9]\d{2}[2-9]\d{6}$/;
const EXTENSION = /^\d{1,6}$/;
const ZIP = /^\d{5}(-\d{4})?$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Text of `min` to `max` characters with no hidden character, trimmed; null for a blank. `noAt` refuses an @ too (the
 * name and the address lines: the email field holds the one email the payer's copy prints).
 */
function plainText(value: unknown, max: number, field: CorrespondenceField, noAt = false): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new CorrespondenceContactError(field);
  }
  const text = value.normalize('NFC').trim();
  if (text === '') {
    return null;
  }
  if ([...text].length > max || HIDDEN.test(text) || (noAt && text.includes('@'))) {
    throw new CorrespondenceContactError(field);
  }
  return text;
}

/** A phone as digits: spaces, dots, dashes, parentheses and a leading +1 or 1 dropped. */
function phoneDigits(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CorrespondenceContactError('phone');
  }
  const digits = value.trim().replace(/[\s.()-]/g, '').replace(/^\+?1(?=\d{10}$)/, '');
  if (!PHONE.test(digits)) {
    throw new CorrespondenceContactError('phone');
  }
  return digits;
}

function address(value: CorrespondenceContactInput['address']): CorrespondenceAddress | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== 'object') {
    throw new CorrespondenceContactError('address_line1');
  }
  const line1 = plainText(value.line1, 100, 'address_line1', true);
  const line2 = plainText(value.line2, 100, 'address_line2', true);
  const city = plainText(value.city, 100, 'address_city', true);
  const state = plainText(value.state, 2, 'address_state')?.toUpperCase() ?? null;
  const zip = plainText(value.zip, 10, 'address_zip');
  if (line1 === null && line2 === null && city === null && state === null && zip === null) {
    return undefined;
  }
  if (line1 === null) {
    throw new CorrespondenceContactError('address_line1');
  }
  if (city === null) {
    throw new CorrespondenceContactError('address_city');
  }
  if (state === null || !STATES.has(state)) {
    throw new CorrespondenceContactError('address_state');
  }
  if (zip === null || !ZIP.test(zip)) {
    throw new CorrespondenceContactError('address_zip');
  }
  return { line1, ...(line2 === null ? {} : { line2 }), city, state, zip };
}

const INPUT_KEYS: ReadonlySet<string> = new Set(['name', 'phone', 'phone_extension', 'email', 'address']);
const ADDRESS_KEYS: ReadonlySet<string> = new Set(['line1', 'line2', 'city', 'state', 'zip']);

/** The contact's stored form, or a CorrespondenceContactError naming the first field refused. */
export function correspondenceContactSetting(input: CorrespondenceContactInput): CorrespondenceContact {
  if (typeof input !== 'object' || input === null || Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    throw new CorrespondenceContactError('contact');
  }
  if (input.address !== null && input.address !== undefined && (typeof input.address !== 'object' || Object.keys(input.address).some((key) => !ADDRESS_KEYS.has(key)))) {
    throw new CorrespondenceContactError('contact');
  }
  const name = plainText(input.name, 120, 'name', true);
  if (name === null) {
    throw new CorrespondenceContactError('name');
  }
  const phone = phoneDigits(input.phone);
  const extension = plainText(input.phone_extension, 6, 'phone_extension');
  if (extension !== null && !EXTENSION.test(extension)) {
    throw new CorrespondenceContactError('phone_extension');
  }
  const email = plainText(input.email, 254, 'email');
  if (email !== null && (!EMAIL.test(email) || email.split('@').length !== 2)) {
    throw new CorrespondenceContactError('email');
  }
  const mailing = address(input.address);
  return {
    name,
    phone,
    ...(extension === null ? {} : { phone_extension: extension }),
    ...(email === null ? {} : { email }),
    ...(mailing === undefined ? {} : { address: mailing }),
  };
}

export type CorrespondenceContactState =
  | { readonly state: 'set'; readonly contact: CorrespondenceContact }
  /** The key is absent: no one has set it. */
  | { readonly state: 'missing' }
  /** A value is stored that is not a contact in its stored form: never replaced by a default. */
  | { readonly state: 'malformed' };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
function sorted(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, sorted(item)]),
  );
}

/** The practice's contact as its settings hold it: set only when the stored value is exactly a contact's stored form. */
export function correspondenceContactOf(settings: unknown): CorrespondenceContactState {
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings) || !(CORRESPONDENCE_CONTACT_KEY in settings)) {
    return { state: 'missing' };
  }
  const stored = (settings as Readonly<Record<string, unknown>>)[CORRESPONDENCE_CONTACT_KEY];
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return { state: 'malformed' };
  }
  try {
    const contact = correspondenceContactSetting(stored as CorrespondenceContactInput);
    return same(contact, stored) ? { state: 'set', contact } : { state: 'malformed' };
  } catch (error) {
    if (error instanceof CorrespondenceContactError) {
      return { state: 'malformed' };
    }
    throw error;
  }
}

/** A stored phone in its printed form: (919) 555-0100. */
export function phoneText(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * The contact in the words the payer's copy, the packet page and the settings preview print:
 * `<name>, (919) 555-0100[ ext. <ext>][, <email>][; <line1>[, <line2>], <city>, <ST> <ZIP>]`.
 */
export function correspondenceText(contact: CorrespondenceContact): string {
  const { address: mailing } = contact;
  return [
    `${contact.name}, ${phoneText(contact.phone)}`,
    contact.phone_extension === undefined ? '' : ` ext. ${contact.phone_extension}`,
    contact.email === undefined ? '' : `, ${contact.email}`,
    mailing === undefined ? '' : `; ${mailing.line1}${mailing.line2 === undefined ? '' : `, ${mailing.line2}`}, ${mailing.city}, ${mailing.state} ${mailing.zip}`,
  ].join('');
}

/** A SYNTHETIC contact the test worlds, the e2e and `pnpm db:seed` set (never a real office). */
export const SYNTHETIC_CORRESPONDENCE_CONTACT: CorrespondenceContact = {
  name: 'SYNTHETIC BILLING OFFICE',
  phone: '9195550100',
  phone_extension: '12',
  email: 'disputes@synthetic-practice.test',
  address: { line1: '100 SYNTHETIC WAY', line2: 'SUITE 2', city: 'RALEIGH', state: 'NC', zip: '27601' },
};
