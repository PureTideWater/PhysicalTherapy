import type { Page, Request } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ResponseDocument } from '../../lib/packets/submissions';
import type { Receipt } from '../../lib/uploads/receipt-labels';
import { type Harness, chromiumInstalled, startHarness } from '../test-support/browser';
import type { ResponseLetterFieldProps, ResponseLetters } from './response-letter';

/**
 * The payer's letter uploaded inside "Log a payer response" (test matrix CAS-47 and CAS-48; docs/adr/0085, D3), in a
 * real browser through the forms harness (test-support/browser.ts): the real ActionForm, ResponseLetterField and
 * Uploader, with the uploader's server stood in for by page.route (request, the PUT, complete, retry, receipts) and
 * the page's letters rendered again on each refresh of the stand-in router, which the test may hold or lose.
 * Synthetic values only.
 */

/** The harness's handle, as forms-harness.tsx sets it on window. */
interface Control {
  calls: { readonly entries: readonly (readonly [string, string])[] }[];
  refreshes: number;
  render: (next: { readonly requestKey?: string; readonly person?: string | null }) => void;
  letters: ResponseLetters;
  upload: ResponseLetterFieldProps['upload'];
  holdRefreshes: boolean;
  failRefreshes: boolean;
  releaseRefreshes: () => void;
  serve: () => void;
  serving: boolean;
}

let harness: Harness;

/** The file the person chooses: its name carries a sentinel no request may hold. */
const SENTINEL = 'SYNTHETIC-NAME-SENTINEL';
const LETTER_FILE = { name: `${SENTINEL}-letter.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 SYNTHETIC payer letter') };

/** The document the stand-in server records for the upload, and letters already on file. */
const UPLOADED = '00000000-0000-4000-8000-0000000000a1';
const ON_FILE = '00000000-0000-4000-8000-0000000000b1';
const THIS_CASE = '00000000-0000-4000-8000-0000000000b2';
const OTHER_CASE = '00000000-0000-4000-8000-0000000000b3';
const NOT_LISTED = '00000000-0000-4000-8000-0000000000b4';

const FORM_KEY = 'synthetic-request-key';
const PERSON_B = 'synthetic-person-b';
const SUMMARY = '[data-slot="refusal-summary"]';
const SELECT = '#response-document';
const STATUS = '#response-letter-status';

const STATUS_TEXT = {
  scanning: 'The letter is being uploaded and scanned. It is chosen here once it is scanned clean, and what you typed stays.',
  'stored-listing': 'The letter is scanned clean and stored, and is being added to the list.',
  'stored-not-listed': 'The letter is stored, but the list could not show it. Reload the page, then choose it in the list; a reload clears what you typed.',
  chosen: 'The letter you uploaded is chosen.',
  'stored-not-chosen':
    'The letter you uploaded is stored and marked “uploaded here” in the list. Choose it if it is this response’s letter; until a response names it, it is listed among the contract documents to tag.',
  'duplicate-chosen': 'That file was already on file, so the copy on file is chosen.',
  'duplicate-chosen-other-case':
    'That file was already on file as the letter of another case’s response, so that copy is chosen. Check that it answers this case too, or choose another letter.',
  'duplicate-unusable':
    'This file was uploaded before, as another kind of document or as a contract’s document, so it cannot be this response’s letter. Upload the letter saved another way, such as the payer’s portal page saved as a PDF.',
  held: 'The letter was held at intake, so it is not chosen; its line under This batch says why.',
} as const;
type Status = keyof typeof STATUS_TEXT;

const SCANNING_BUBBLE = 'The payer’s letter is still being uploaded and scanned; it is chosen here once it is scanned clean.';
const LISTING_BUBBLE = 'The payer’s letter is being added to the list; it is chosen here in a moment.';
const SINGLE_REFUSAL = 'Choose one PDF: the payer’s letter itself, not a zip or another kind of file.';

/** A letter on file as the server lists it. */
function letter(id: string, uploadedAt = '2026-10-27T09:15:00.000Z'): ResponseDocument {
  return { id, kind: 'payer_letter', uploadedAt, sha256: `${id.slice(-2)}${'0'.repeat(62)}` };
}

const NONE: ResponseLetters = { unused: [], thisCase: [], otherCases: [] };

/** The receipt the stand-in receipts route answers for the upload. */
function receipt(status: string, duplicateOf?: string): Receipt {
  return {
    documentId: UPLOADED,
    parentDocumentId: null,
    kind: 'payer_letter',
    format: null,
    sizeBytes: String(LETTER_FILE.buffer.length),
    receivedAt: '2026-10-28T14:02:00.000Z',
    status,
    scanStatus: status === 'received' ? 'pending' : 'clean',
    sha256: status === 'received' ? null : `a1${'0'.repeat(62)}`,
    duplicateOf: duplicateOf === undefined ? null : { documentId: duplicateOf, receivedAt: '2026-10-27T09:15:00.000Z' },
    entries: null,
    parse: null,
  } as Receipt;
}

/** The uploader's server, stood in for: what it answers, and what the page sent. */
interface StandIn {
  /** Every request the page sent: its URL, method and body. */
  readonly sent: { readonly url: string; readonly method: string; readonly body: string | null }[];
  /** The receipt the receipts route answers with now: its status, and a duplicate's original. */
  receipt: { status: string; duplicateOf?: string };
  /** How the PUT answers: at once, held until releasePut(), or refused. */
  put: 'ok' | 'hold' | 'fail';
  releasePut: () => void;
  /** Calls of the retry route. */
  retries: number;
}

async function standIn(page: Page): Promise<StandIn> {
  let held: (() => void) | null = null;
  const server: StandIn = {
    sent: [],
    receipt: { status: 'received' },
    put: 'ok',
    releasePut: () => {
      held?.();
    },
    retries: 0,
  };
  page.on('request', (request: Request) => {
    server.sent.push({ url: request.url(), method: request.method(), body: request.postData() });
  });
  await page.route('**/p/practice-1/uploads/request', (route) =>
    route.fulfill({ json: { documents: [{ documentId: UPLOADED, upload: { method: 'PUT', url: `/synthetic-put/${UPLOADED}`, headers: {} } }] } }),
  );
  await page.route('**/synthetic-put/**', async (route) => {
    if (server.put === 'hold') {
      await new Promise<void>((resolve) => {
        held = resolve;
      });
    }
    await route.fulfill(server.put === 'fail' ? { status: 500, body: '' } : { status: 200, body: '' });
  });
  await page.route('**/p/practice-1/uploads/complete', (route) => route.fulfill({ json: {} }));
  await page.route('**/p/practice-1/uploads/retry', (route) => {
    server.retries += 1;
    return route.fulfill({ status: 400, json: { status: 'invalid', issues: [{ field: 'documentId', message: 'SYNTHETIC: the upload was refused again.' }] } });
  });
  await page.route('**/p/practice-1/uploads/receipts*', (route) =>
    route.fulfill({ json: { receipts: [receipt(server.receipt.status, server.receipt.duplicateOf)], page: 1, pages: 1, total: 1 } }),
  );
  return server;
}

/** Sets what the server lists and may upload; `now` renders it at once, else the next refresh does. */
async function serve(page: Page, letters: ResponseLetters, options: { readonly now?: boolean; readonly upload?: Partial<ResponseLetterFieldProps['upload']> } = {}): Promise<void> {
  await page.evaluate(
    ({ given, upload, now }) => {
      const control = (window as unknown as { harness: Control }).harness;
      control.letters = given;
      control.upload = { ...control.upload, ...upload };
      if (now) {
        control.serve();
      }
    },
    { given: letters, upload: options.upload ?? {}, now: options.now ?? true },
  );
}

/** Opens the form, its server stood in for, with these letters on file. */
async function openForm(letters: ResponseLetters = NONE, upload?: Partial<ResponseLetterFieldProps['upload']>): Promise<{ readonly page: Page; readonly server: StandIn }> {
  const page = await harness.open('response-letter');
  // The form reads the server's answers once it is mounted.
  await page.waitForFunction(() => (window as unknown as { harness: Control }).harness.serving);
  const server = await standIn(page);
  await serve(page, letters, upload === undefined ? {} : { upload });
  return { page, server };
}

function calls(page: Page): Promise<Control['calls']> {
  return page.evaluate(() => (window as unknown as { harness: Control }).harness.calls);
}

/** The stand-in router's refresh() calls. */
function refreshes(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { harness: Control }).harness.refreshes);
}

async function waitForStatus(page: Page, status: Status | 'none'): Promise<void> {
  await page.waitForSelector(`${STATUS}[data-letter-status="${status}"]`, { state: 'attached', timeout: 15_000 });
}

/** The status line's words now. */
async function statusText(page: Page): Promise<string> {
  return (await page.textContent(STATUS)) ?? '';
}

/** The letter select's validity, as the browser holds it. */
function validity(page: Page): Promise<{ readonly message: string; readonly custom: boolean; readonly missing: boolean; readonly value: string }> {
  return page.$eval(SELECT, (select) => {
    const element = select as HTMLSelectElement;
    return { message: element.validationMessage, custom: element.validity.customError, missing: element.validity.valueMissing, value: element.value };
  });
}

/**
 * Presses Record the response and checks that the browser stopped it on the letter, before the form's submit handler:
 * the letter select, first in the form, is the first control the browser finds invalid, and nothing was sent.
 */
async function pressSendsNothing(page: Page): Promise<void> {
  const before = (await calls(page)).length;
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { invalidControls: seen });
    document.querySelector('form')?.addEventListener(
      'invalid',
      (event) => {
        seen.push((event.target as HTMLElement).id);
      },
      { capture: true },
    );
  });
  await page.getByRole('button', { name: 'Record the response', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { invalidControls: readonly string[] }).invalidControls.length > 0);
  expect(await page.evaluate(() => (window as unknown as { invalidControls: readonly string[] }).invalidControls[0])).toBe('response-document');
  expect(await calls(page)).toHaveLength(before);
}

async function chooseFile(page: Page): Promise<void> {
  await page.getByLabel('Choose a file to upload').setInputFiles(LETTER_FILE);
}

/** Drops files on the drop zone, as a drag from the desktop does (no input event fires). */
async function drop(page: Page, files: readonly { readonly name: string; readonly type: string }[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((given) => {
    const transfer = new DataTransfer();
    for (const file of given) {
      transfer.items.add(new File(['%PDF-1.4 SYNTHETIC'], file.name, { type: file.type }));
    }
    return transfer;
  }, files);
  await page.getByRole('region', { name: 'Drop zone' }).dispatchEvent('drop', { dataTransfer });
}

/** The option texts of the select, under each group's label. */
function groups(page: Page): Promise<readonly { readonly label: string; readonly options: readonly string[] }[]> {
  return page.$$eval(`${SELECT} optgroup`, (found) => found.map((group) => ({ label: group.getAttribute('label') ?? '', options: [...group.querySelectorAll('option')].map((option) => option.text) })));
}

/** The form's headings, in order: level and words. */
function headings(page: Page): Promise<readonly string[]> {
  return page.$$eval('form :is(h1, h2, h3, h4, h5, h6)', (found) => found.map((heading) => `${heading.tagName.toLowerCase()} ${heading.textContent ?? ''}`));
}

describe.skipIf(!chromiumInstalled())('the payer’s letter inside “Log a payer response” in the browser', { timeout: 45_000 }, () => {
  beforeAll(async () => {
    harness = await startHarness();
  }, 60_000);

  afterAll(async () => {
    expect(harness.errors()).toEqual([]);
    await harness.close();
  });

  it('CAS-47: the letter starts unchosen and a press sends nothing; the status line is there, empty, from the start', async () => {
    const { page } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    expect(await page.inputValue(SELECT)).toBe('');
    expect(await page.$eval(SELECT, (select) => (select as HTMLSelectElement).selectedOptions[0]?.text)).toBe('Choose the payer’s letter');
    expect(await page.getAttribute(STATUS, 'role')).toBe('status');
    expect(await page.getAttribute(STATUS, 'data-letter-status')).toBe('none');
    expect(await statusText(page)).toBe('');
    expect(await page.getAttribute(SELECT, 'aria-describedby')).toBe('response-document-hint response-letter-status');
    expect(await page.textContent('#response-document-hint')).toBe(
      'Upload the payer’s letter here, or choose one already on file; a letter uploaded here is chosen once it is scanned clean.',
    );
    await page.selectOption('#response-kind', 'partial');
    await pressSendsNothing(page);
    expect((await validity(page)).missing).toBe(true);
    await page.close();
  });

  it('CAS-47, FRM-01: what was typed survives the upload and the scan; a press while it uploads or scans sends nothing; the stored letter is chosen without moving the focus, and marked', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    await page.selectOption('#response-kind', 'partial');
    await page.fill('#response-notes', 'SYNTHETIC: the payer accepts part');
    server.put = 'hold';
    await chooseFile(page);
    // The PUT is held open: the letter is uploading.
    await waitForStatus(page, 'scanning');
    expect(await statusText(page)).toBe(STATUS_TEXT.scanning);
    expect((await validity(page)).message).toBe(SCANNING_BUBBLE);
    await pressSendsNothing(page);
    // Sent, its receipt Received: scanning still.
    server.releasePut();
    await page.waitForSelector('li[data-phase="sent"]', { state: 'attached' });
    await page.getByText('Scanning for malware.').waitFor();
    expect(await page.getAttribute(STATUS, 'data-letter-status')).toBe('scanning');
    expect((await validity(page)).message).toBe(SCANNING_BUBBLE);
    await pressSendsNothing(page);
    // The person is typing in Notes when the scan ends; the server lists the letter once it is stored.
    await page.focus('#response-notes');
    await serve(page, { ...NONE, unused: [letter(UPLOADED, '2026-10-28T14:02:00.000Z'), letter(ON_FILE)] }, { now: false });
    server.receipt = { status: 'stored' };
    await waitForStatus(page, 'chosen');
    expect(await refreshes(page)).toBeGreaterThanOrEqual(1);
    expect(await page.inputValue(SELECT)).toBe(UPLOADED);
    expect(await statusText(page)).toBe(STATUS_TEXT.chosen);
    expect((await validity(page)).custom).toBe(false);
    expect(await page.$eval(SELECT, (select) => (select as HTMLSelectElement).selectedOptions[0]?.text)).toBe(
      `Payer letter, uploaded 2026-10-28 14:02 UTC, SHA-256 a10000000000… (uploaded here)`,
    );
    expect((await groups(page))[0]?.label).toBe('Letters no response names yet');
    expect(await page.inputValue('#response-kind')).toBe('partial');
    expect(await page.inputValue('#response-notes')).toBe('SYNTHETIC: the payer accepts part');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('response-notes');
    await page.close();
  });

  it('CAS-47: never chooses over the person’s own choice, and still marks the letter it uploaded', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    await chooseFile(page);
    await waitForStatus(page, 'scanning');
    await page.selectOption(SELECT, ON_FILE);
    await serve(page, { ...NONE, unused: [letter(UPLOADED, '2026-10-28T14:02:00.000Z'), letter(ON_FILE)] }, { now: false });
    server.receipt = { status: 'stored' };
    await waitForStatus(page, 'stored-not-chosen');
    expect(await statusText(page)).toBe(STATUS_TEXT['stored-not-chosen']);
    expect(await page.inputValue(SELECT)).toBe(ON_FILE);
    expect((await groups(page))[0]?.options).toEqual([
      'Payer letter, uploaded 2026-10-28 14:02 UTC, SHA-256 a10000000000… (uploaded here)',
      'Payer letter, uploaded 2026-10-27 09:15 UTC, SHA-256 b10000000000…',
    ]);
    await page.close();
  });

  it('CAS-47, CAS-48: a duplicate chooses the copy on file a response may carry, says so when it is another case’s, and chooses nothing when it is no letter on the list', async () => {
    const cases: readonly { readonly letters: ResponseLetters; readonly status: Status; readonly value: string }[] = [
      { letters: { ...NONE, unused: [letter(ON_FILE)] }, status: 'duplicate-chosen', value: ON_FILE },
      { letters: { ...NONE, unused: [letter(THIS_CASE)], otherCases: [letter(ON_FILE)] }, status: 'duplicate-chosen-other-case', value: ON_FILE },
      { letters: { ...NONE, unused: [letter(THIS_CASE)] }, status: 'duplicate-unusable', value: '' },
    ];
    for (const { letters, status, value } of cases) {
      const { page, server } = await openForm(letters);
      server.receipt = { status: 'duplicate', duplicateOf: ON_FILE };
      await chooseFile(page);
      await waitForStatus(page, status);
      expect(await statusText(page)).toBe(STATUS_TEXT[status]);
      expect(await page.inputValue(SELECT)).toBe(value);
      expect((await validity(page)).custom).toBe(false);
      await page.close();
    }
  });

  it('CAS-47: a letter held at intake is not chosen, and its line under This batch says why', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    server.receipt = { status: 'wrong_type' };
    await chooseFile(page);
    await waitForStatus(page, 'held');
    expect(await statusText(page)).toBe(STATUS_TEXT.held);
    expect(await page.inputValue(SELECT)).toBe('');
    await page.getByRole('region', { name: 'This batch' }).getByText('Not a payer letter: the file is another type of document.').waitFor();
    await page.close();
  });

  it('CAS-47: no uploader button submits the form: Retry calls only the retry route, and Enter in Amount sends the response once', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    server.put = 'fail';
    await chooseFile(page);
    const batch = page.getByRole('region', { name: 'This batch' });
    await batch.getByText('Not sent').waitFor();
    expect(await page.getAttribute(STATUS, 'data-letter-status')).toBe('none');
    await batch.getByRole('button', { name: 'Retry', exact: true }).click();
    await batch.getByText('SYNTHETIC: the upload was refused again.').waitFor();
    expect(server.retries).toBe(1);
    expect(await calls(page)).toHaveLength(0);
    // Retry still showing: the form's own button is its default, so Enter in a single-line field presses it.
    await page.selectOption(SELECT, ON_FILE);
    await page.selectOption('#response-kind', 'partial');
    await page.fill('#amount', '60.00');
    await page.press('#amount', 'Enter');
    await page.waitForSelector(SUMMARY);
    const sent = await calls(page);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.entries).toEqual(expect.arrayContaining([['documentId', ON_FILE], ['kind', 'partial'], ['amount', '60.00']]));
    expect(server.retries).toBe(1);
    await page.close();
  });

  it('CAS-47: one PDF only: two files or a zip dropped are refused here, with no request', async () => {
    for (const files of [
      [
        { name: `${SENTINEL}-one.pdf`, type: 'application/pdf' },
        { name: `${SENTINEL}-two.pdf`, type: 'application/pdf' },
      ],
      [{ name: `${SENTINEL}-letters.zip`, type: 'application/zip' }],
      [{ name: `${SENTINEL}-letter.txt`, type: 'text/plain' }],
    ]) {
      const { page, server } = await openForm();
      await drop(page, files);
      const refused = page.getByRole('alert').filter({ hasText: 'Nothing was uploaded' });
      await refused.waitFor();
      expect(await refused.textContent()).toContain(SINGLE_REFUSAL);
      expect(server.sent.filter((request) => request.url.includes('/uploads/'))).toEqual([]);
      expect(await page.locator('[aria-label="This batch"]').count()).toBe(0);
      await page.close();
    }
  });

  it('CAS-47: no request carries the file’s name, no upload request carries the form’s request key, and the response posts nothing of the uploader’s', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    await serve(page, { ...NONE, unused: [letter(UPLOADED), letter(ON_FILE)] }, { now: false });
    server.receipt = { status: 'stored' };
    await chooseFile(page);
    await waitForStatus(page, 'chosen');
    await page.selectOption('#response-kind', 'denied');
    await page.getByRole('button', { name: 'Record the response', exact: true }).click();
    await page.waitForSelector(SUMMARY);
    for (const request of server.sent) {
      expect(request.url).not.toContain(SENTINEL);
      expect(request.body ?? '').not.toContain(SENTINEL);
    }
    const uploads = server.sent.filter((request) => request.method === 'POST' && request.url.includes('/uploads/'));
    expect(uploads.map((request) => new URL(request.url).pathname)).toEqual(['/p/practice-1/uploads/request', '/p/practice-1/uploads/complete']);
    for (const request of uploads) {
      const body = JSON.parse(request.body ?? '{}') as { readonly requestKey?: string; readonly csrfToken?: string };
      expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
      expect(body.requestKey).not.toBe(FORM_KEY);
      expect(body.csrfToken).toBe(['synthetic', 'page', 'csrf'].join('-'));
    }
    expect(JSON.parse(uploads[0]?.body ?? '{}')).toMatchObject({ files: [{ kind: 'payer_letter', contentType: 'application/pdf', sizeBytes: LETTER_FILE.buffer.length }] });
    const [call] = await calls(page);
    expect(call?.entries.map(([name]) => name).sort()).toEqual(['amount', 'documentId', 'kind', 'notes', 'requestKey']);
    expect(call?.entries).toContainEqual(['documentId', UPLOADED]);
    expect(call?.entries).toContainEqual(['requestKey', FORM_KEY]);
    await page.close();
  });

  it('CAS-47, FRM-01: another person signed in clears the batch with the form: a file chosen, a file dropped with nothing typed, and the field’s own choice', async () => {
    // (a) Typed, and a file chosen through the picker.
    const typed = await openForm();
    typed.server.put = 'hold';
    await typed.page.fill('#response-notes', 'SYNTHETIC note');
    await chooseFile(typed.page);
    await typed.page.getByText(`${SENTINEL}-letter.pdf`).waitFor();
    await typed.page.evaluate((person) => {
      (window as unknown as { harness: Control }).harness.render({ person });
    }, PERSON_B);
    await typed.page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await typed.page.textContent(`${SUMMARY} [data-slot="alert-title"]`)).toBe('Form cleared');
    expect(await typed.page.inputValue('#response-notes')).toBe('');
    expect(await typed.page.getByText(SENTINEL).count()).toBe(0);
    expect(await typed.page.locator('[aria-label="This batch"]').count()).toBe(0);
    typed.server.releasePut();
    await typed.page.close();

    // (b) Nothing typed: a file dropped, which fires no input event of its own.
    const dropped = await openForm();
    dropped.server.put = 'hold';
    await drop(dropped.page, [{ name: `${SENTINEL}-letter.pdf`, type: 'application/pdf' }]);
    await dropped.page.getByText(`${SENTINEL}-letter.pdf`).waitFor();
    await dropped.page.evaluate((person) => {
      (window as unknown as { harness: Control }).harness.render({ person });
    }, PERSON_B);
    await dropped.page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await dropped.page.getByText(SENTINEL).count()).toBe(0);
    expect(await dropped.page.locator('[aria-label="This batch"]').count()).toBe(0);
    expect(await dropped.page.getAttribute(STATUS, 'data-letter-status')).toBe('none');
    dropped.server.releasePut();
    await dropped.page.close();

    // (c) Nothing typed: the field chose the letter it uploaded.
    const chosen = await openForm();
    await serve(chosen.page, { ...NONE, unused: [letter(UPLOADED)] }, { now: false });
    chosen.server.receipt = { status: 'stored' };
    await drop(chosen.page, [{ name: `${SENTINEL}-letter.pdf`, type: 'application/pdf' }]);
    await waitForStatus(chosen.page, 'chosen');
    await chosen.page.evaluate((person) => {
      (window as unknown as { harness: Control }).harness.render({ person });
    }, PERSON_B);
    await chosen.page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
    expect(await chosen.page.inputValue(SELECT)).toBe('');
    expect(await chosen.page.getByText(SENTINEL).count()).toBe(0);
    await chosen.page.close();
  });

  it('CAS-47: one kind offers no kind to choose; the file input takes one PDF; the headings sit one level below the card, and Response under its own', async () => {
    const { page, server } = await openForm();
    expect(await page.getByLabel('Kind of document').count()).toBe(0);
    const input = page.getByLabel('Choose a file to upload');
    expect(await input.getAttribute('multiple')).toBeNull();
    expect(await input.getAttribute('accept')).toBe('application/pdf');
    expect(await page.getByRole('button', { name: 'Choose a file', exact: true }).count()).toBe(1);
    expect(await page.getByRole('region', { name: 'Drop zone' }).locator('p').first().textContent()).toBe('One PDF, up to 2.0 GiB. The file is scanned for malware before anything reads it.');
    expect(await headings(page)).toEqual(['h3 Upload the payer’s letter', 'h3 What the letter says']);
    server.put = 'hold';
    await chooseFile(page);
    await page.getByRole('region', { name: 'This batch' }).waitFor();
    expect(await headings(page)).toEqual(['h3 Upload the payer’s letter', 'h3 This batch', 'h3 What the letter says']);
    expect(
      await page.evaluate(() => {
        const heading = [...document.querySelectorAll('h3')].find((found) => found.textContent === 'What the letter says');
        const response = document.getElementById('response-kind');
        return heading !== undefined && response !== null && (heading.compareDocumentPosition(response) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      }),
    ).toBe(true);
    server.releasePut();
    await page.close();
  });

  it('CAS-47: a stored letter the list does not show yet is on its way while the field’s refresh runs, and when it ends without it the form says to reload', async () => {
    const { page, server } = await openForm({ ...NONE, unused: [letter(ON_FILE)] });
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.holdRefreshes = true;
    });
    server.receipt = { status: 'stored' };
    await chooseFile(page);
    await waitForStatus(page, 'stored-listing');
    expect(await statusText(page)).toBe(STATUS_TEXT['stored-listing']);
    expect((await validity(page)).message).toBe(LISTING_BUBBLE);
    await page.selectOption('#response-kind', 'denied');
    await pressSendsNothing(page);
    // The server still does not list it when the refresh answers.
    await page.evaluate(() => {
      const control = (window as unknown as { harness: Control }).harness;
      control.holdRefreshes = false;
      control.releaseRefreshes();
    });
    await waitForStatus(page, 'stored-not-listed');
    expect(await statusText(page)).toBe(STATUS_TEXT['stored-not-listed']);
    expect(await validity(page)).toMatchObject({ custom: false, missing: true, value: '' });
    expect(await page.inputValue('#response-kind')).toBe('denied');
    await page.close();
  });

  it('CAS-47: a refresh whose answer is lost ends without the letter, and the form says to reload', async () => {
    const { page, server } = await openForm();
    await serve(page, { ...NONE, unused: [letter(UPLOADED)] }, { now: false });
    await page.evaluate(() => {
      (window as unknown as { harness: Control }).harness.failRefreshes = true;
    });
    server.receipt = { status: 'stored' };
    await chooseFile(page);
    await waitForStatus(page, 'stored-not-listed');
    expect(await page.inputValue(SELECT)).toBe('');
    await page.close();
  });

  it('CAS-48: the letters are grouped, those no response names first, then this case’s, then other cases’; an empty group is left out', async () => {
    const { page } = await openForm({ unused: [letter(ON_FILE)], thisCase: [letter(THIS_CASE)], otherCases: [letter(OTHER_CASE)] });
    expect(await groups(page)).toEqual([
      { label: 'Letters no response names yet', options: ['Payer letter, uploaded 2026-10-27 09:15 UTC, SHA-256 b10000000000…'] },
      { label: 'Letters of this case’s earlier responses', options: ['Payer letter, uploaded 2026-10-27 09:15 UTC, SHA-256 b20000000000…'] },
      { label: 'Letters of other cases’ responses', options: ['Payer letter, uploaded 2026-10-27 09:15 UTC, SHA-256 b30000000000…'] },
    ]);
    await serve(page, { unused: [], thisCase: [letter(THIS_CASE)], otherCases: [letter(NOT_LISTED)] });
    expect((await groups(page)).map((group) => group.label)).toEqual(['Letters of this case’s earlier responses', 'Letters of other cases’ responses']);
    await page.close();
  });

  it('CAS-47: a person who cannot upload here, or a practice whose uploads are paused, is told to choose a letter on file, and the uploader says why', async () => {
    const viewer = await openForm({ ...NONE, unused: [letter(ON_FILE)] }, { canUpload: false });
    expect(await viewer.page.textContent('#response-document-hint')).toBe('Choose the payer’s letter already on file; the note below says why nothing can be uploaded here.');
    await viewer.page.getByText('Not available to your role').waitFor();
    expect(await viewer.page.getByText('As Viewer, you cannot upload files.').count()).toBe(1);
    expect(await viewer.page.getByText('Billing managers, analysts and firm principals upload files; a letter already on file can still be chosen above.').count()).toBe(1);
    expect(await viewer.page.getByRole('region', { name: 'Drop zone' }).count()).toBe(0);
    await viewer.page.close();

    const paused = await openForm(NONE, { gate: { open: false, reason: 'Uploads are paused: SYNTHETIC reason.' } });
    expect(await paused.page.textContent('#response-document-hint')).toBe('No payer’s letter is on file yet, and it cannot be uploaded here now; the note below says why.');
    await paused.page.getByText('Uploads are not open yet').waitFor();
    expect(await paused.page.getByText('Uploads are paused: SYNTHETIC reason.').count()).toBe(1);
    expect(await paused.page.getByRole('region', { name: 'Drop zone' }).count()).toBe(0);
    await paused.page.close();

    const empty = await openForm();
    expect(await empty.page.textContent('#response-document-hint')).toBe('Upload the payer’s letter here; it is chosen once it is scanned clean.');
    expect(await empty.page.$$eval(`${SELECT} option`, (options) => options.map((option) => option.textContent))).toEqual(['Choose the payer’s letter']);
    await empty.page.close();
  });
});
