import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  CHOOSE_KIND_PLACEHOLDER,
  HeldFiles,
  KIND_HELP,
  KindField,
  Uploader,
  type UploadKind,
  type UploaderProps,
  afterChoosing,
  batchProblems,
  heldWith,
  startingKind,
  waitingFor,
  waitingText,
} from './uploader';

/**
 * The upload panel's kind (docs/adr/0070, Part 3; the Lane B design, 5.9): a panel that offers more than one kind and
 * names none starts with none, its select leading with a disabled placeholder and saying that a kind cannot be changed
 * once uploaded. Files dropped or chosen before the kind, or before an ERA export's system, are kept in this browser
 * and wait: the select that waits is marked invalid, described by what to do and focused, and the files upload only
 * when the person presses Upload, never on the select's change (an arrow key on a closed select changes it). The
 * Uploads page names its 835 (N4). The server refuses a file without a kind on its own (uploads.db.test.ts). SYNTHETIC
 * values.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const PRACTICE = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b01';
const LIMITS = { maxFiles: 100, maxBytes: 2 * 1024 ** 3, contentTypes: ['application/pdf', 'application/zip'] };

const CONTRACT: UploadKind = { kind: 'contract', label: 'Contract', contentTypes: ['application/pdf'] };
const LETTER: UploadKind = { kind: 'payer_letter', label: 'Payer letter', contentTypes: ['application/pdf'] };
const POSTING: UploadKind = { kind: 'posting_export', label: 'Posting export', contentTypes: ['text/csv'] };
const EFT: UploadKind = { kind: 'eft_export', label: 'EFT or bank export', contentTypes: ['text/csv'] };
const ERA: UploadKind = { kind: 'era_export', label: 'ERA export', contentTypes: ['text/csv'], formats: [{ id: 'spry_era_v0', label: 'SYNTHETIC ERA export', unconfirmed: true }] };
const ANSI: UploadKind = { kind: 'x12_835', label: '835 remittance', contentTypes: ['text/plain'] };

const pdf = { name: 'agreement.pdf', type: 'application/pdf', size: 1200, lastModified: 1_790_000_000_000 };
const letter = { name: 'letter.pdf', type: 'application/pdf', size: 800, lastModified: 1_790_000_100_000 };
const csv = { name: 'era.csv', type: 'text/csv', size: 100, lastModified: 1_790_000_200_000 };

const noop = () => undefined;

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

/** The opening tag of the element with this id. */
function openingTag(html: string, id: string): string {
  return new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? '';
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
    // Short enough to show whole at a phone's width, where controls are 16 px (docs/adr/0077, D6; M4-1).
    expect(CHOOSE_KIND_PLACEHOLDER).toBe('Choose a kind');
  });

  it('says, where the kind is chosen, that a document’s kind cannot be changed once it is uploaded, on every panel that offers kinds (UX-4)', () => {
    expect(KIND_HELP).toBe('A document’s kind cannot be changed once it is uploaded.');
    for (const html of [rendered({ kinds: [CONTRACT, LETTER] }), rendered({ kinds: [POSTING, EFT] }), rendered({ kinds: [ANSI, ERA], initialKind: 'x12_835' })]) {
      const select = openingTag(html, 'upload-kind');
      expect(select).toContain('aria-describedby="upload-kind-hint"');
      expect(select).not.toContain('aria-invalid=');
      // The shared Hint (docs/adr/0077, D9): 14 px, as every field's.
      expect(html).toContain(`<p id="upload-kind-hint" class="text-sm text-muted-foreground">${KIND_HELP}</p>`);
    }
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

  it('starts with nothing waiting: no file listed, no error and nothing to upload', () => {
    const html = rendered({ kinds: [CONTRACT, LETTER] });
    expect(html).not.toContain('upload-kind-error');
    expect(html).not.toContain('Waiting to upload');
    expect(html).not.toContain('>Upload ');
  });
});

describe('what a panel waits for before a batch can start', () => {
  it('is the kind while none is chosen, an ERA export’s system while none is chosen, and nothing once both are', () => {
    expect(waitingFor(null, undefined)).toBe('kind');
    expect(waitingFor(ERA, undefined)).toBe('format');
    expect(waitingFor(ERA, ERA.formats?.[0])).toBeNull();
    expect(waitingFor(CONTRACT, undefined)).toBeNull();
    expect(waitingFor(ANSI, undefined)).toBeNull();
  });

  it('is said with the count of files waiting, singular for one, asking for the choice and then the upload', () => {
    expect(waitingText('kind', 1)).toBe('Choose the kind of document for this file, then upload it.');
    expect(waitingText('kind', 3)).toBe('Choose the kind of document for these 3 files, then upload them.');
    expect(waitingText('format', 1)).toBe('Choose which system’s ERA export this file is, then upload it.');
    expect(waitingText('format', 2)).toBe('Choose which system’s ERA export these 2 files are, then upload them.');
  });
});

describe('files dropped or chosen before the kind (UX-1)', () => {
  it('are kept in the browser and the kind select is focused; nothing is asked of the server', () => {
    expect(afterChoosing([], [pdf], null, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf], focus: 'kind' });
    expect(afterChoosing([], [pdf, letter], null, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf, letter], focus: 'kind' });
  });

  it('join the files already waiting; a file dropped again is not held twice, and the select is focused each time', () => {
    expect(afterChoosing([pdf], [letter], null, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf, letter], focus: 'kind' });
    expect(afterChoosing([pdf], [{ ...pdf }], null, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf], focus: 'kind' });
    // The same name and size, changed since: another file.
    const edited = { ...pdf, lastModified: pdf.lastModified + 1 };
    expect(heldWith([pdf], [edited])).toEqual([pdf, edited]);
    expect(heldWith([pdf, letter], [letter, pdf])).toEqual([pdf, letter]);
  });

  it('wait for the Upload button once the kind is chosen: a new choice joins them, focus goes to Upload, and none starts on its own', () => {
    expect(afterChoosing([pdf], [letter], CONTRACT, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf, letter], focus: 'upload' });
  });

  it('start at once on a panel whose kind is chosen and where nothing waits, as before', () => {
    expect(afterChoosing([], [pdf], CONTRACT, undefined, LIMITS)).toEqual({ step: 'start', files: [pdf] });
    expect(afterChoosing([], [csv], ERA, ERA.formats?.[0], LIMITS)).toEqual({ step: 'start', files: [csv] });
  });

  it('wait the same way for an ERA export’s system, its select focused (UX-049)', () => {
    expect(afterChoosing([], [csv], ERA, undefined, LIMITS)).toEqual({ step: 'hold', held: [csv], focus: 'format' });
  });

  it('are refused, and what waits is kept, when a file is empty, too large or a spreadsheet for a CSV-only kind, or when the files waiting would pass the limit', () => {
    expect(afterChoosing([pdf], [{ ...letter, size: 0 }], null, undefined, LIMITS)).toEqual({ step: 'refuse', problems: ['File 1 is empty.'] });
    expect(afterChoosing([pdf], [{ ...letter, size: LIMITS.maxBytes + 1 }], null, undefined, LIMITS)).toEqual({ step: 'refuse', problems: [expect.stringMatching(/^File 1 is larger than /)] });
    expect(afterChoosing([], [{ ...csv, name: 'era.xlsx', type: '' }], ERA, undefined, LIMITS)).toEqual({ step: 'refuse', problems: [expect.stringMatching(/^File 1 is a spreadsheet: /)] });
    const many = Array.from({ length: 60 }, (_, index) => ({ ...pdf, name: `agreement-${String(index)}.pdf` }));
    const more = Array.from({ length: 41 }, (_, index) => ({ ...letter, name: `letter-${String(index)}.pdf` }));
    expect(afterChoosing(many, more, null, undefined, LIMITS)).toEqual({ step: 'refuse', problems: ['At most 100 files at once; zip the rest and upload the zip.'] });
    expect(afterChoosing(many, more.slice(0, 40), null, undefined, LIMITS)).toMatchObject({ step: 'hold', focus: 'kind' });
  });

  it('change nothing when no file is chosen (a picker closed with none)', () => {
    expect(afterChoosing([pdf], [], null, undefined, LIMITS)).toEqual({ step: 'hold', held: [pdf], focus: null });
    expect(afterChoosing([], [], CONTRACT, undefined, LIMITS)).toEqual({ step: 'hold', held: [], focus: null });
  });
});

describe('the kind field while files wait for it (UX-1, UX-5)', () => {
  const field = (problem: string | null) =>
    renderToStaticMarkup(<KindField kinds={[CONTRACT, LETTER]} kind={null} startedUnchosen problem={problem} attempt={2} onChange={noop} selectRef={{ current: null }} />);

  it('marks the select invalid and describes it by what to do, read before the help, the words under the select', () => {
    const html = field(waitingText('kind', 3));
    const select = openingTag(html, 'upload-kind');
    expect(select).toContain('aria-invalid="true"');
    expect(select).toContain('aria-describedby="upload-kind-error upload-kind-hint"');
    // The shared field error (docs/adr/0077, D3): "Error:" and its icon beside the message, which the element the select
    // names holds alone; in an alert, so each drop or choice that leaves files waiting is announced.
    expect(html).toMatch(
      /<div role="alert"><div data-field-error="true" class="[^"]*\btext-sm text-destructive"><svg aria-hidden="true"[^>]*>.*?<\/svg><span aria-hidden="true" class="font-semibold">Error:<\/span><p id="upload-kind-error">Choose the kind of document for these 3 files, then upload them\.<\/p><\/div><\/div>/,
    );
    expect(html.indexOf('</select>')).toBeLessThan(html.indexOf('id="upload-kind-error"'));
    expect(html.indexOf('id="upload-kind-error"')).toBeLessThan(html.indexOf('id="upload-kind-hint"'));
  });

  it('keeps the select’s width while the words come and go: the field is the column’s width up to 28rem, its select the field’s (M4-3)', () => {
    const box = (html: string) => /^<div class="([^"]*)">/.exec(html)?.[1];
    const selectClass = (html: string) => /class="([^"]*)"/.exec(openingTag(html, 'upload-kind'))?.[1];
    const waiting = field(waitingText('kind', 1));
    const settled = field(null);
    expect(box(waiting)).toBe('flex w-full min-w-0 max-w-md flex-col gap-1');
    expect(box(settled)).toBe(box(waiting));
    expect(selectClass(waiting)).toBe('h-9 w-full rounded-md border bg-background px-2 text-sm');
    expect(selectClass(settled)).toBe(selectClass(waiting));
    // The ERA export's system field is the same box, so the two selects line up.
    const era = rendered({ kinds: [ANSI, ERA], initialKind: 'era_export' });
    expect(era).toContain(`<div class="${String(box(settled))}"><label for="upload-format"`);
    expect(/class="([^"]*)"/.exec(openingTag(era, 'upload-format'))?.[1]).toBe(selectClass(settled));
  });

  it('drops the mark and the words once nothing waits for the kind', () => {
    const html = field(null);
    expect(openingTag(html, 'upload-kind')).not.toContain('aria-invalid=');
    expect(openingTag(html, 'upload-kind')).toContain('aria-describedby="upload-kind-hint"');
    expect(html).not.toContain('upload-kind-error');
    expect(html).not.toContain('role="alert"');
  });
});

describe('the files waiting', () => {
  const held = (files: readonly { readonly name: string; readonly size: number; readonly lastModified: number }[], ready: boolean) =>
    renderToStaticMarkup(<HeldFiles files={files} ready={ready} onUpload={noop} onClear={noop} uploadRef={{ current: null }} />);

  it('are listed by name in a group that counts them, with Clear, and no Upload while a choice is still to make', () => {
    const html = held([pdf, letter], false);
    expect(html).toContain('role="group" aria-labelledby="upload-held-title"');
    expect(html).toMatch(/id="upload-held-title"[^>]*>Waiting to upload: 2 files</);
    expect(html).toContain('>agreement.pdf</li>');
    expect(html).toContain('>letter.pdf</li>');
    expect(html).toContain('>Clear</button>');
    expect(html).not.toContain('>Upload 2 files</button>');
  });

  it('upload only on the explicit Upload button, which counts them', () => {
    expect(held([pdf, letter], true)).toContain('>Upload 2 files</button>');
    expect(held([pdf, letter], true)).toContain('>Clear</button>');
    expect(held([pdf], true)).toContain('>Upload 1 file</button>');
  });
});

describe('a batch’s own problems', () => {
  it('are refused in the uploader’s words, file by file, and nothing is asked of the server', () => {
    expect(batchProblems([pdf, { ...pdf, size: 0 }], CONTRACT, LIMITS)).toEqual(['File 2 is empty.']);
    expect(batchProblems([pdf], CONTRACT, LIMITS)).toEqual([]);
    expect(batchProblems([], CONTRACT, LIMITS)).toEqual([]);
  });

  it('keep the checks of a chosen kind: a spreadsheet chosen as a CSV-only export, and the batch’s size', () => {
    expect(batchProblems([csv], ERA, LIMITS)).toEqual([]);
    expect(batchProblems([{ name: 'posting.xlsx', type: '', size: 100 }], POSTING, LIMITS)).toEqual([expect.stringMatching(/^File 1 is a spreadsheet: /)]);
    expect(batchProblems(Array.from({ length: 101 }, () => pdf), CONTRACT, LIMITS)).toEqual(['At most 100 files at once; zip the rest and upload the zip.']);
  });

  it('never include a choice still to make, which the panel waits for instead of refusing', () => {
    expect(batchProblems([pdf], null, LIMITS)).toEqual([]);
    expect(batchProblems([csv], ERA, LIMITS)).toEqual([]);
  });
});
