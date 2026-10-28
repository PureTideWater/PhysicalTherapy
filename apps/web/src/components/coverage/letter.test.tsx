import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { LETTER_CODES_PATTERN } from '../../lib/contracts/letter';
import { payerLetter } from '../../lib/routes/coverage';
import { forgetRefusalUrl } from '../forget-refusal';
import { LETTER_CONTROLS, type LetterSearchParams, PayerLetter } from './letter';
import { type ContractChoice, type PayerChoice, contractOwners, watchLetterContract } from './letter-contract-check';
import { type LetterMark, type MarkedControl, clearMark, describedWithout, watchLetterMarks } from './letter-marks';

/**
 * Coverage's letter form, rendered as the page renders it (docs/adr/0079; test matrix DLR-04): the route's rule as the
 * codes field's pattern with its hint, each contract listed under its payer and its payer by ID for the check that
 * holds the contract to the payer, and a refused letter's return marked on the control it names, a payer the route did not find unanswered, its
 * entries kept only as the form's own options and the codes' alphabet allow, and never a word from the URL; then the
 * marks cleared as the person edits and sends (LetterMarks), the contract held to its payer before the letter is sent
 * (LetterContractCheck), and a refused pair's contract mark cleared once a change of the payer makes the pair hold
 * (UX-DLR-17), over fake controls (there is no DOM here). Synthetic IDs only. Written by hand.
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
  const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>/g)];
  return (options.find((option) => / selected=""/.test(option[0])) ?? options[0])?.[1];
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
    // The format and its example are the hint's; a placeholder would repeat it at 3.3:1 and read as a kept entry.
    expect(codes.has('placeholder')).toBe(false);
    expect(textOf(page, 'letter-codes-hint')).toBe('Five-character codes separated by commas, such as 97110, 97530. Leave blank to ask for the whole schedule.');
    // Each example code in the mono face with tabular numerals (brand.md), the separator in the sentence's.
    expect(page).toContain('<span class="font-mono tabular-nums">97110</span>, <span class="font-mono tabular-nums">97530</span>. Leave blank');
    expect(page).not.toMatch(/aria-invalid=|data-field-error|data-download-refusal|Choose a payer/);
    expect(attributes(page, 'letter-payer').has('aria-describedby')).toBe(false);
    expect(attributes(page, 'letter-contract').has('aria-describedby')).toBe(false);
    expect(autofocused(page)).toEqual([]);
    expect(shown(page, 'letter-payer')).toBe(PAYER_Q);
    expect(shown(page, 'letter-contract')).toBe('');
    // Each contract is listed under its payer, and the check that holds the contract to the payer chosen is given each
    // listed contract's payer by ID (the shared SelectField writes no attribute on an option); None named names none.
    expect(page).toContain(`<optgroup label="SYNTHETIC PAYER Q"><option value="${CONTRACT_Q}">SYNTHETIC FIXED SCHEDULE AGREEMENT</option></optgroup>`);
    expect(contractOwners(CONTRACTS)).toEqual({ [CONTRACT_Q]: PAYER_Q });
    expect(page).toContain('<option value="">None named</option>');
  });

  it('marks a refused code, keeps what was asked for, describes the field by its message then its hint, and focuses it', () => {
    const page = render({ refused: 'invalid', fields: 'codes', payer: PAYER_Q, contract: CONTRACT_Q, codes: 'ABC' });
    const codes = attributes(page, 'letter-codes');
    expect(codes.get('value')).toBe('ABC');
    expect(codes.get('aria-invalid')).toBe('true');
    expect(codes.get('aria-describedby')).toBe('letter-codes-error letter-codes-hint');
    expect(codes.get('class')).toContain('scroll-mt-18');
    // The message says what is wrong; the label names the field and the hint, read after it, gives the format.
    expect(textOf(page, 'letter-codes-error')).toBe('Error: Each code must be five letters or digits.');
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
    expect(textOf(page, 'letter-contract-error')).toBe('Error: Choose one of this payer’s contracts, or None named.');
    expect(autofocused(page)).toEqual(['letter-contract']);
    expect(shown(page, 'letter-payer')).toBe(PAYER_R);
    expect(shown(page, 'letter-contract')).toBe(CONTRACT_Q);
    expect(attributes(page, 'letter-codes').get('aria-invalid')).toBe('true');
  });

  it('marks the payer when the route did not find it, unanswered, and selects only a payer or contract among the form’s own options', () => {
    const page = render({ refused: 'not_found', payer: ELSEWHERE, contract: ELSEWHERE, codes: '97110, 97530' });
    const payer = attributes(page, 'letter-payer');
    expect(payer.get('aria-invalid')).toBe('true');
    expect(payer.get('aria-describedby')).toBe('letter-payer-error');
    expect(payer.has('required')).toBe(true);
    expect(textOf(page, 'letter-payer-error')).toBe('Error: Choose one of the payers listed.');
    expect(autofocused(page)).toEqual(['letter-payer']);
    // Never a listed payer under the mark: the choice starts unanswered, and required holds the next letter until it is made.
    expect(shown(page, 'letter-payer')).toBe('');
    expect(page).toContain('<option value="" selected="">Choose a payer</option>');
    expect(shown(page, 'letter-contract')).toBe('');
    expect(page).not.toContain(ELSEWHERE);
    expect(attributes(page, 'letter-codes').get('value')).toBe('97110, 97530');
    expect(page).not.toContain('data-download-refusal');
    // An invalid payer (no opaque ID, so none kept) comes back the same way.
    const invalid = render({ refused: 'invalid', fields: 'payer', payer: 'SYN-1' });
    expect(shown(invalid, 'letter-payer')).toBe('');
    expect(invalid).toContain('<option value="" selected="">Choose a payer</option>');
    expect(attributes(invalid, 'letter-payer').get('aria-invalid')).toBe('true');
    // A contract refused beside a payer the form lists keeps that payer, with no unanswered choice.
    const contract = render({ refused: 'invalid', fields: 'contract', payer: PAYER_R, contract: CONTRACT_Q });
    expect(shown(contract, 'letter-payer')).toBe(PAYER_R);
    expect(contract).not.toContain('Choose a payer');
  });

  it.each([
    ['rate_limited', { refused: 'rate_limited', retry: '3' }, 'Too many downloads in a short time. Wait 3 minutes and try again.'],
    ['forbidden', { refused: 'forbidden' }, 'Your role cannot download this file. Ask your organization’s administrator, who manages users and roles.'],
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
    // Within the alphabet, an identifier's shape is dropped by the same rule the 303 keeps codes by (keptCodes; SEC-01).
    for (const codes of ['123456789', '19500115', '919 555 0100']) {
      const shaped = render({ refused: 'invalid', fields: 'codes', codes });
      expect(attributes(shaped, 'letter-codes').has('value'), codes).toBe(false);
      expect(attributes(shaped, 'letter-codes').get('aria-invalid'), codes).toBe('true');
      expect(shaped, codes).not.toContain(codes);
    }
    expect(attributes(render({ refused: 'invalid', fields: 'codes', codes: ['97110', 'ABC'] }), 'letter-codes').has('value')).toBe(false);
    // An unknown code is no refusal: nothing marked, no notice, none of its words.
    const unknown = render({ refused: 'Your account is closed', fields: 'codes', codes: '97110' });
    expect(unknown).not.toMatch(/aria-invalid=|data-download-refusal|closed/);
    expect(attributes(unknown, 'letter-codes').has('value')).toBe(false);
  });

  it('keeps beside a refusal exactly the entries the route keeps, and a shown refusal or a sent letter takes them all out of the URL', () => {
    const kept = payerLetter.returnTo?.({ practiceId: PRACTICE, payer: PAYER_Q, contract: CONTRACT_Q, codes: '97110' })?.keep ?? {};
    expect(Object.keys(kept).sort()).toEqual([...LETTER_CONTROLS].sort());
    const href = `https://app.example/p/${PRACTICE}/coverage?refused=rate_limited&retry=3&payer=${PAYER_Q}&contract=${CONTRACT_Q}&codes=97110%2C+97530&page=2#c`;
    expect(forgetRefusalUrl(href, LETTER_CONTROLS)).toBe(`/p/${PRACTICE}/coverage?page=2#c`);
  });

  it('says why there is no form before any payer has loaded, and still says a refusal there', () => {
    const empty = render({}, []);
    expect(empty).not.toContain('<form');
    expect(text(empty)).toBe('Payers appear once their 835s load.');
    expect(render({ refused: 'not_found' }, [])).toContain('data-download-refusal="not_found"');
  });
});

/** A control's attributes, its validity and its events, as LetterMarks reads and clears them. */
class FakeControl extends EventTarget implements MarkedControl {
  readonly marks: Map<string, string>;
  validity = { valid: true };

  constructor(marks: Readonly<Record<string, string>>) {
    super();
    this.marks = new Map(Object.entries(marks));
  }

  getAttribute(name: string): string | null {
    return this.marks.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.marks.set(name, value);
  }

  removeAttribute(name: string): void {
    this.marks.delete(name);
  }

  edit(type: 'input' | 'change' = 'input'): void {
    this.dispatchEvent(new Event(type));
  }
}

/** A control marked as letter.tsx marks it, with its message, and the other controls whose change can answer it. */
function markedControl(control: string, hint?: string, also?: readonly EventTarget[]): LetterMark & { readonly control: FakeControl; readonly message: { hidden: boolean } } {
  const messageId = `letter-${control}-error`;
  return { control: new FakeControl({ 'aria-invalid': 'true', 'aria-describedby': [messageId, hint].filter((id) => id !== undefined).join(' ') }), message: { hidden: false }, messageId, also };
}

/**
 * A change of a control as the browser sends it: at the control, then bubbling to its form, where its target is still
 * the control (fakes have no tree, so the form is sent it here).
 */
function changeBubbling(control: EventTarget, form: EventTarget): void {
  control.dispatchEvent(new Event('change'));
  const bubbled = new Event('change');
  Object.defineProperty(bubbled, 'target', { value: control });
  form.dispatchEvent(bubbled);
}

describe('a refused letter’s marks, cleared once they no longer hold (LetterMarks)', () => {
  it('takes one id out of a description, the rest kept in order, and none left is no description', () => {
    expect(describedWithout('letter-codes-error letter-codes-hint', 'letter-codes-error')).toBe('letter-codes-hint');
    expect(describedWithout('letter-contract-error', 'letter-contract-error')).toBeNull();
    expect(describedWithout(null, 'letter-payer-error')).toBeNull();
    expect(describedWithout('a  letter-codes-error b', 'letter-codes-error')).toBe('a b');
  });

  it('clears a mark once: aria-invalid, the message hidden and out of the description, the hint kept', () => {
    const codes = markedControl('codes', 'letter-codes-hint');
    clearMark(codes);
    expect(codes.control.marks).toEqual(new Map([['aria-describedby', 'letter-codes-hint']]));
    expect(codes.message.hidden).toBe(true);
    // A control with no mark left is not touched.
    codes.message.hidden = false;
    clearMark(codes);
    expect(codes.message.hidden).toBe(false);
    const contract = markedControl('contract');
    clearMark({ ...contract, message: null });
    expect(contract.control.marks.size).toBe(0);
  });

  it('clears only the control the person edits, and every mark when the letter is sent, then takes the refusal out', () => {
    const form = new EventTarget();
    const contract = markedControl('contract');
    const codes = markedControl('codes', 'letter-codes-hint');
    const sent = vi.fn();
    const stop = watchLetterMarks(form, [contract, codes], sent);
    codes.control.edit('input');
    expect(codes.control.getAttribute('aria-invalid')).toBeNull();
    expect(codes.message.hidden).toBe(true);
    // Another control's mark stays: only its own edit, a change that makes it hold (below) or a sent letter clears it.
    expect(contract.control.getAttribute('aria-invalid')).toBe('true');
    expect(contract.message.hidden).toBe(false);
    expect(sent).not.toHaveBeenCalled();
    form.dispatchEvent(new Event('submit'));
    expect(contract.control.getAttribute('aria-invalid')).toBeNull();
    expect(contract.control.getAttribute('aria-describedby')).toBeNull();
    expect(contract.message.hidden).toBe(true);
    expect(sent).toHaveBeenCalledTimes(1);
    stop();
    const again = markedControl('codes');
    const after = watchLetterMarks(new EventTarget(), [again], sent);
    after();
    again.control.edit('change');
    expect(again.control.getAttribute('aria-invalid')).toBe('true');
  });

  it('clears a mark that names another control once a change of that control makes it hold, and no other mark', () => {
    const form = new EventTarget();
    const payer = new EventTarget();
    const codesControl = new EventTarget();
    const contract = markedControl('contract', undefined, [payer]);
    const codes = markedControl('codes', 'letter-codes-hint');
    const sent = vi.fn();
    const stop = watchLetterMarks(form, [contract, codes], sent);
    // The pair is still refused: the mark stays.
    contract.control.validity = { valid: false };
    changeBubbling(payer, form);
    expect(contract.control.getAttribute('aria-invalid')).toBe('true');
    expect(contract.message.hidden).toBe(false);
    // A change of a control the mark does not name leaves it, valid or not.
    contract.control.validity = { valid: true };
    changeBubbling(codesControl, form);
    expect(contract.control.getAttribute('aria-invalid')).toBe('true');
    // The payer's change makes it hold: the mark clears, its message hidden and out of the description.
    changeBubbling(payer, form);
    expect(contract.control.getAttribute('aria-invalid')).toBeNull();
    expect(contract.control.getAttribute('aria-describedby')).toBeNull();
    expect(contract.message.hidden).toBe(true);
    // A mark that names no other control is cleared only by its own edit or a sent letter.
    expect(codes.control.getAttribute('aria-invalid')).toBe('true');
    expect(sent).not.toHaveBeenCalled();
    stop();
  });

  it('stops listening when it is stopped', () => {
    const form = new EventTarget();
    const payer = markedControl('payer');
    const other = new EventTarget();
    const contract = markedControl('contract', undefined, [other]);
    const sent = vi.fn();
    watchLetterMarks(form, [payer, contract], sent)();
    payer.control.edit('change');
    changeBubbling(other, form);
    form.dispatchEvent(new Event('submit'));
    expect(payer.control.getAttribute('aria-invalid')).toBe('true');
    expect(contract.control.getAttribute('aria-invalid')).toBe('true');
    expect(sent).not.toHaveBeenCalled();
  });
});

/** The payer select: its value and its change. */
class FakePayer extends EventTarget implements PayerChoice {
  value = '';

  choose(value: string): void {
    this.value = value;
    this.dispatchEvent(new Event('change'));
  }
}

/** The contract select: its value (a contract's ID, '' for None named), its change, and the validity the check sets. */
class FakeContract extends EventTarget implements ContractChoice {
  value = '';
  customValidity = '';

  setCustomValidity(message: string): void {
    this.customValidity = message;
  }

  choose(value: string): void {
    this.value = value;
    this.dispatchEvent(new Event('change'));
  }
}

/** The listed contracts' payers, as the page gives them to the check: payer Q's contract. */
const OWNERS = contractOwners(CONTRACTS);

describe('the letter’s contract, held to its payer before it is sent (LetterContractCheck)', () => {
  const MESSAGE = 'Choose one of this payer’s contracts, or None named.';

  it('holds a contract of another payer at once (a kept or restored pair) and on every change of either select', () => {
    const payer = new FakePayer();
    const contract = new FakeContract();
    payer.value = PAYER_R;
    contract.value = CONTRACT_Q;
    const stop = watchLetterContract(payer, contract, OWNERS, MESSAGE);
    expect(contract.customValidity).toBe(MESSAGE);
    payer.choose(PAYER_Q);
    expect(contract.customValidity).toBe('');
    payer.choose(PAYER_R);
    expect(contract.customValidity).toBe(MESSAGE);
    contract.choose('');
    expect(contract.customValidity).toBe('');
    contract.choose(CONTRACT_Q);
    expect(contract.customValidity).toBe(MESSAGE);
    stop();
    payer.choose(PAYER_Q);
    expect(contract.customValidity).toBe(MESSAGE);
  });

  it('never holds None named, a value the list does not name, nor a contract while no payer is chosen (the payer’s required stops that letter)', () => {
    const payer = new FakePayer();
    const contract = new FakeContract();
    watchLetterContract(payer, contract, OWNERS, MESSAGE);
    expect(contract.customValidity).toBe('');
    contract.choose(CONTRACT_Q);
    expect(contract.customValidity).toBe('');
    payer.choose(PAYER_Q);
    expect(contract.customValidity).toBe('');
    // Payer R chosen: neither a contract the list does not name nor a key every object has is held to it.
    payer.choose(PAYER_R);
    for (const value of [ELSEWHERE, 'toString', 'constructor', '__proto__']) {
      contract.choose(value);
      expect(contract.customValidity, value).toBe('');
    }
  });
});

/** The contract select marked by a refused pair: held to its payer by LetterContractCheck, and marked as letter.tsx marks it. */
class FakeMarkedContract extends FakeContract implements MarkedControl {
  readonly marks = new Map([
    ['aria-invalid', 'true'],
    ['aria-describedby', 'letter-contract-error'],
  ]);

  getAttribute(name: string): string | null {
    return this.marks.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.marks.set(name, value);
  }

  removeAttribute(name: string): void {
    this.marks.delete(name);
  }

  get validity(): Pick<ValidityState, 'valid'> {
    return { valid: this.customValidity === '' };
  }
}

describe('a refused pair answered by changing the payer (LetterContractCheck, then LetterMarks; UX-DLR-17)', () => {
  it('clears the contract’s mark once the payer’s change makes the pair hold, read after the check has set its validity', () => {
    const form = new EventTarget();
    const payer = new FakePayer();
    const contract = new FakeMarkedContract();
    const message = { hidden: false };
    // The kept pair: payer R with payer Q's contract, held at once.
    payer.value = PAYER_R;
    contract.value = CONTRACT_Q;
    const stopCheck = watchLetterContract(payer, contract, OWNERS, 'Choose one of this payer’s contracts, or None named.');
    const stopMarks = watchLetterMarks(form, [{ control: contract, message, messageId: 'letter-contract-error', also: [payer] }], vi.fn());
    expect(contract.validity.valid).toBe(false);
    // Another payer that is not the contract's: still refused, still marked.
    payer.value = ELSEWHERE;
    changeBubbling(payer, form);
    expect(contract.getAttribute('aria-invalid')).toBe('true');
    expect(message.hidden).toBe(false);
    // The contract's own payer: the check frees it at the payer, and the form, reached after, clears its mark.
    payer.value = PAYER_Q;
    changeBubbling(payer, form);
    expect(contract.validity.valid).toBe(true);
    expect(contract.getAttribute('aria-invalid')).toBeNull();
    expect(contract.getAttribute('aria-describedby')).toBeNull();
    expect(message.hidden).toBe(true);
    stopMarks();
    stopCheck();
  });
});
