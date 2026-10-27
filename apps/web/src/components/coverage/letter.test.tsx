import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LETTER_CODES_PATTERN } from '../../lib/contracts/letter';
import { type LetterSearchParams, PayerLetter } from './letter';

/**
 * Coverage's letter form, rendered as the page renders it (docs/adr/0079; test matrix DLR-04): the route's rule as the
 * codes field's pattern with its hint, and a refused letter's return marked on the control it names, its entries kept
 * only as the form's own options and the codes' alphabet allow, and never a word from the URL. Synthetic IDs only.
 * Written by hand.
 */

const PRACTICE = '00000000-0000-4000-8000-000000000001';
const PAYER_Q = '00000000-0000-4000-8000-0000000000a1';
const PAYER_R = '00000000-0000-4000-8000-0000000000a2';
const CONTRACT_Q = '00000000-0000-4000-8000-0000000000c1';
const ELSEWHERE = '00000000-0000-4000-8000-0000000000ff';

const PAYERS = [
  { id: PAYER_Q, name: 'SYNTHETIC PAYER Q' },
  { id: PAYER_R, name: 'SYNTHETIC PAYER R' },
];
const CONTRACTS = [{ id: CONTRACT_Q, payerId: PAYER_Q, title: 'SYNTHETIC FIXED SCHEDULE AGREEMENT' }];

/** The rendered form, as markup. */
function render(searchParams: LetterSearchParams, payers = PAYERS): string {
  return renderToStaticMarkup(<PayerLetter path={`/p/${PRACTICE}/coverage`} payers={payers} contracts={CONTRACTS} searchParams={searchParams} />);
}

/** Markup's text, as a reader meets it. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replaceAll('&#x27;', '’')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The attributes of the element of an id (its opening tag), by lowercased name, unescaped; a failure names a missing one. */
function attributes(markup: string, id: string): ReadonlyMap<string, string> {
  const opening = new RegExp(`<[a-z]+ [^>]*\\bid="${id}"[^>]*>`).exec(markup)?.[0];
  if (opening === undefined) {
    throw new Error(`no #${id}`);
  }
  // HTML's attribute names are case-insensitive (React writes maxLength, spellCheck): read lowercased.
  return new Map([...opening.matchAll(/ ([a-zA-Z-]+)(?:="([^"]*)")?/g)].map((match) => [(match[1] ?? '').toLowerCase(), (match[2] ?? '').replaceAll('&quot;', '"').replaceAll('&amp;', '&')]));
}

/** The text of the element of an id (a paragraph, the one element here that holds words by id). */
function textOf(markup: string, id: string): string {
  const inner = new RegExp(`<p [^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</p>`).exec(markup)?.[1];
  if (inner === undefined) {
    throw new Error(`no paragraph #${id}`);
  }
  return text(inner);
}

/** The value a select shows: its option marked selected, else its first. */
function shown(markup: string, id: string): string | undefined {
  const select = new RegExp(`<select [^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(markup)?.[1] ?? '';
  const options = [...select.matchAll(/<option value="([^"]*)"( selected="")?/g)];
  return (options.find((option) => option[2] !== undefined) ?? options[0])?.[1];
}

/** What takes the focus on arrival: each element with autofocus, by its id or its notice's status. */
function autofocused(markup: string): string[] {
  return [...markup.matchAll(/<[a-z]+ [^>]*\bautofocus=""[^>]*>/g)].map((match) => /\bid="([^"]*)"/.exec(match[0])?.[1] ?? /data-download-refusal="([^"]*)"/.exec(match[0])?.[1] ?? match[0]);
}

describe('Coverage’s letter form', () => {
  it('takes the route’s rule as the codes’ pattern, with its hint, before anything is refused', () => {
    const page = render({});
    const codes = attributes(page, 'letter-codes');
    const form = /<form [^>]*>/.exec(page)?.[0];
    expect(form).toContain(`action="/p/${PRACTICE}/coverage/letter"`);
    expect(form).toContain('method="get"');
    expect(codes.get('pattern')).toBe(LETTER_CODES_PATTERN);
    expect(codes.get('maxlength')).toBe('400');
    expect(codes.get('autocapitalize')).toBe('characters');
    expect(codes.get('spellcheck')).toBe('false');
    expect(codes.get('aria-describedby')).toBe('letter-codes-hint');
    expect(codes.has('aria-invalid')).toBe(false);
    expect(codes.has('value')).toBe(false);
    expect(textOf(page, 'letter-codes-hint')).toBe('Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule.');
    // The example codes in the mono face with tabular numerals (brand.md).
    expect(page).toContain('<span class="font-mono tabular-nums">97110, 97530</span>. Leave blank');
    expect(page).not.toMatch(/aria-invalid=|data-field-error|data-download-refusal/);
    expect(autofocused(page)).toEqual([]);
    expect(shown(page, 'letter-payer')).toBe(PAYER_Q);
    expect(shown(page, 'letter-contract')).toBe('');
  });

  it('marks a refused code, keeps what was asked for, describes the field by its message then its hint, and focuses it', () => {
    const page = render({ refused: 'invalid', fields: 'codes', payer: PAYER_Q, contract: CONTRACT_Q, codes: 'ABC' });
    const codes = attributes(page, 'letter-codes');
    expect(codes.get('value')).toBe('ABC');
    expect(codes.get('aria-invalid')).toBe('true');
    expect(codes.get('aria-describedby')).toBe('letter-codes-error letter-codes-hint');
    expect(codes.get('class')).toContain('scroll-mt-18');
    expect(textOf(page, 'letter-codes-error')).toBe('Error: Procedure codes: enter five-character codes separated by commas, such as 97110, 97530, or leave the field blank.');
    expect(page).toContain('such as <span class="font-mono tabular-nums">97110, 97530</span>, or leave');
    expect(autofocused(page)).toEqual(['letter-codes']);
    expect(shown(page, 'letter-payer')).toBe(PAYER_Q);
    expect(shown(page, 'letter-contract')).toBe(CONTRACT_Q);
    // The field the form marks says the refusal; no second notice repeats it.
    expect(page).not.toContain('data-download-refusal');
    expect(attributes(page, 'letter-payer').has('aria-invalid')).toBe(false);
    expect(attributes(page, 'letter-contract').has('aria-invalid')).toBe(false);
  });

  it('marks a contract that is not the payer’s, and only the first marked control takes the focus', () => {
    const page = render({ refused: 'invalid', fields: 'contract,codes', payer: PAYER_R, contract: CONTRACT_Q, codes: '97110' });
    const contract = attributes(page, 'letter-contract');
    expect(contract.get('aria-invalid')).toBe('true');
    expect(contract.get('aria-describedby')).toBe('letter-contract-error');
    expect(contract.get('class')).toContain('scroll-mt-18');
    expect(textOf(page, 'letter-contract-error')).toBe('Error: The payer’s contract: choose one of this payer’s contracts, or None named.');
    expect(autofocused(page)).toEqual(['letter-contract']);
    expect(shown(page, 'letter-payer')).toBe(PAYER_R);
    expect(shown(page, 'letter-contract')).toBe(CONTRACT_Q);
    expect(attributes(page, 'letter-codes').get('aria-invalid')).toBe('true');
  });

  it('marks the payer when the route did not find it, and selects only a payer or contract among the form’s own options', () => {
    const page = render({ refused: 'not_found', payer: ELSEWHERE, contract: ELSEWHERE, codes: '97110, 97530' });
    const payer = attributes(page, 'letter-payer');
    expect(payer.get('aria-invalid')).toBe('true');
    expect(payer.get('aria-describedby')).toBe('letter-payer-error');
    expect(textOf(page, 'letter-payer-error')).toBe('Error: Payer: choose one of the payers listed.');
    expect(autofocused(page)).toEqual(['letter-payer']);
    expect(shown(page, 'letter-payer')).toBe(PAYER_Q);
    expect(shown(page, 'letter-contract')).toBe('');
    expect(page).not.toContain(ELSEWHERE);
    expect(attributes(page, 'letter-codes').get('value')).toBe('97110, 97530');
    expect(page).not.toContain('data-download-refusal');
  });

  it.each([
    ['rate_limited', { refused: 'rate_limited', retry: '3' }, 'Too many downloads in a short time. Wait 3 minutes and try again.'],
    ['forbidden', { refused: 'forbidden' }, 'Your role cannot download this file. Users and roles are managed by your organization’s administrator.'],
    ['invalid, of no field the form holds', { refused: 'invalid', fields: 'practiceId' }, 'This file could not be made from what was asked. Try the download again from this page.'],
  ] as const)('says a refusal it cannot mark (%s) as the download’s notice in the card, focused', (_, searchParams, body) => {
    const page = render(searchParams);
    expect(page).toMatch(new RegExp(`^<div [^>]*role="alert"[^>]*data-download-refusal="${searchParams.refused}"`));
    expect(text(page)).toContain(body);
    expect(autofocused(page)).toEqual([searchParams.refused]);
    expect(page).not.toContain('aria-invalid=');
  });

  it('keeps nothing without a refusal, and says nothing from the URL in words', () => {
    // Entries come back only with a refusal: a plain link cannot fill the form.
    const plain = render({ payer: PAYER_R, contract: CONTRACT_Q, codes: '97110' });
    expect(attributes(plain, 'letter-codes').has('value')).toBe(false);
    expect(shown(plain, 'letter-payer')).toBe(PAYER_Q);
    expect(shown(plain, 'letter-contract')).toBe('');
    // Codes outside the field's alphabet, and a repeated key, are dropped; the field is still marked.
    const crafted = render({ refused: 'invalid', fields: 'codes', codes: 'Call 555-0100 to restore access' });
    expect(attributes(crafted, 'letter-codes').has('value')).toBe(false);
    expect(attributes(crafted, 'letter-codes').get('aria-invalid')).toBe('true');
    expect(crafted).not.toContain('555');
    expect(attributes(render({ refused: 'invalid', fields: 'codes', codes: ['97110', 'ABC'] }), 'letter-codes').has('value')).toBe(false);
    // An unknown code is no refusal: nothing marked, no notice, none of its words.
    const unknown = render({ refused: 'Your account is closed', fields: 'codes', codes: '97110' });
    expect(unknown).not.toMatch(/aria-invalid=|data-download-refusal|closed/);
    expect(attributes(unknown, 'letter-codes').has('value')).toBe(false);
  });

  it('says why there is no form before any payer has loaded, and still says a refusal there', () => {
    const empty = render({}, []);
    expect(empty).not.toContain('<form');
    expect(text(empty)).toBe('Payers appear once their 835s load.');
    expect(render({ refused: 'not_found' }, [])).toContain('data-download-refusal="not_found"');
  });
});
