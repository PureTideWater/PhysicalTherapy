import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CHOOSE_KIND_FIRST, CHOOSE_KIND_PLACEHOLDER, Uploader, type UploadKind, type UploaderProps, batchProblems, startingKind } from './uploader';

/**
 * The upload panel's kind (docs/adr/0070, Part 3; the Lane B design, 5.9): a panel that offers more than one kind and
 * names none starts with none, its select leading with a disabled placeholder, and a batch dropped or chosen before the
 * kind is refused in the uploader's words, the way an ERA export's unchosen system is; the Uploads page names its 835
 * (N4). The server refuses a file without a kind on its own (uploads.db.test.ts). SYNTHETIC values.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const PRACTICE = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b01';
const LIMITS = { maxFiles: 100, maxBytes: 2 * 1024 ** 3, contentTypes: ['application/pdf', 'application/zip'] };

const CONTRACT: UploadKind = { kind: 'contract', label: 'Contract', contentTypes: ['application/pdf'] };
const LETTER: UploadKind = { kind: 'payer_letter', label: 'Payer letter', contentTypes: ['application/pdf'] };
const POSTING: UploadKind = { kind: 'posting_export', label: 'Posting export', contentTypes: ['text/csv'] };
const ERA: UploadKind = { kind: 'era_export', label: 'ERA export', contentTypes: ['text/csv'], formats: [{ id: 'spry_era_v0', label: 'SYNTHETIC ERA export', unconfirmed: true }] };
const ANSI: UploadKind = { kind: 'x12_835', label: '835 remittance', contentTypes: ['text/plain'] };

const pdf = { name: 'agreement.pdf', type: 'application/pdf', size: 1200 };

function rendered(props: Partial<UploaderProps>): string {
  return renderToStaticMarkup(
    <Uploader practiceId={PRACTICE} canUpload csrfToken="token" roleNames="Billing manager" gate={{ open: true, reason: null }} limits={LIMITS} showReceipts={false} {...props} />,
  );
}

/** The kind select's markup, and its options' opening tags with their text. */
function kindSelect(html: string): { readonly select: string; readonly options: readonly string[] } {
  const select = /<select id="upload-kind"[^>]*>(.*?)<\/select>/.exec(html);
  return { select: select?.[0] ?? '', options: [...(select?.[1] ?? '').matchAll(/<option[^>]*>[^<]*<\/option>/g)].map((match) => match[0]) };
}

describe('the kind a panel starts with', () => {
  it('is none when more than one kind is offered and the page names none, so the person chooses', () => {
    expect(startingKind([CONTRACT, LETTER], undefined, LIMITS.contentTypes)).toBeNull();
    expect(startingKind([POSTING, CONTRACT], undefined, LIMITS.contentTypes)).toBeNull();
  });

  it('is the one offered, the one the page names, or an 835 with the limits’ types when the page offers none', () => {
    expect(startingKind([CONTRACT], undefined, LIMITS.contentTypes)).toBe(CONTRACT);
    expect(startingKind([ANSI, ERA], 'x12_835', LIMITS.contentTypes)).toBe(ANSI);
    expect(startingKind(undefined, undefined, ['text/plain'])).toEqual({ kind: 'x12_835', label: '835 remittance', contentTypes: ['text/plain'] });
  });

  it('is none when the page names a kind it does not offer', () => {
    expect(startingKind([CONTRACT, LETTER], 'x12_835', LIMITS.contentTypes)).toBeNull();
  });
});

describe('the panel’s kind select', () => {
  it('leads, on a panel of several kinds, with a disabled placeholder that is the value until the person chooses', () => {
    const { select, options } = kindSelect(rendered({ kinds: [CONTRACT, LETTER] }));
    expect(select).toContain('required');
    expect(options).toEqual([`<option value="" disabled="" selected="">${CHOOSE_KIND_PLACEHOLDER}</option>`, '<option value="contract">Contract</option>', '<option value="payer_letter">Payer letter</option>']);
    expect(CHOOSE_KIND_PLACEHOLDER).toBe('Choose the kind of document');
  });

  it('keeps the Uploads page’s 835 chosen, with no placeholder, and asks for no ERA system until an ERA export is chosen (N4)', () => {
    const html = rendered({ kinds: [ANSI, ERA], initialKind: 'x12_835' });
    const { options } = kindSelect(html);
    expect(options).toEqual(['<option value="x12_835" selected="">835 remittance</option>', '<option value="era_export">ERA export</option>']);
    expect(html).not.toContain('id="upload-format"');
  });

  it('is not shown on a panel of 835s alone', () => {
    expect(rendered({})).not.toContain('id="upload-kind"');
  });
});

describe('a batch dropped or chosen before the kind', () => {
  it('is refused in the uploader’s words, beside the batch’s other problems, and nothing is asked of the server', () => {
    expect(batchProblems([pdf], null, undefined, LIMITS)).toEqual([CHOOSE_KIND_FIRST]);
    expect(CHOOSE_KIND_FIRST).toBe('Choose the kind of document first, then choose the files again.');
    expect(batchProblems([pdf, { ...pdf, size: 0 }], null, undefined, LIMITS)).toEqual([CHOOSE_KIND_FIRST, 'File 2 is empty.']);
  });

  it('is taken once a kind is chosen; an empty choice refuses nothing', () => {
    expect(batchProblems([pdf], CONTRACT, undefined, LIMITS)).toEqual([]);
    expect(batchProblems([], null, undefined, LIMITS)).toEqual([]);
  });

  it('keeps the checks of a chosen kind: an ERA export’s system, and a spreadsheet chosen as a CSV-only export', () => {
    const csv = { name: 'era.csv', type: 'text/csv', size: 100 };
    expect(batchProblems([csv], ERA, undefined, LIMITS)).toEqual(['Choose which system’s ERA export the files are, then choose the files again.']);
    expect(batchProblems([csv], ERA, ERA.formats?.[0], LIMITS)).toEqual([]);
    expect(batchProblems([{ name: 'posting.xlsx', type: '', size: 100 }], POSTING, undefined, LIMITS)).toEqual([expect.stringMatching(/^File 1 is a spreadsheet: /)]);
    expect(batchProblems(Array.from({ length: 101 }, () => pdf), CONTRACT, undefined, LIMITS)).toEqual(['At most 100 files at once; zip the rest and upload the zip.']);
  });
});
