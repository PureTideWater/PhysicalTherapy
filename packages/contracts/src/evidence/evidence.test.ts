import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import { GetDocumentTextDetectionCommand, StartDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { describe, expect, it, vi } from 'vitest';

import { syntheticPdf } from '../testing/synthetic-pdf';
import { syntheticXlsx, zipParts } from '../testing/synthetic-xlsx';
import { CSV_ROWS_PER_PAGE, csvRows, csvText, decodeXml, readPagesHere, sharedStrings, sheetText, workbookSheets } from './page-thread';
import { normalizePageText, pageTextHash, quoteOnPage } from './page-text';
import { PAGE_READ_LIMITS, documentFormat, documentPages, looksLikePdf, readDocumentPages } from './pages';
import { type DocumentSource, EvidenceResolver, type PageSource } from './resolve';
import { ScanReadError, type ScannedPageReader, TEXTRACT_ACTIONS, TextractPageReader, createTextractPageReader } from './scan';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const PAGE_ONE = ['SYNTHETIC PROVIDER AGREEMENT', 'Section 4. Compensation is set out in Exhibit A.'];
const PAGE_TWO = ['SYNTHETIC EXHIBIT A FEE SCHEDULE', '97110 Therapeutic exercise $32.00 per unit', '97140 Manual therapy $30.50 per unit'];

function documents(entries: Record<string, { bytes: Uint8Array; contentType?: string }>): DocumentSource & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read: (documentId: string) => {
      reads.push(documentId);
      const entry = entries[documentId];
      if (entry === undefined) {
        return Promise.reject(new Error('no such document'));
      }
      return Promise.resolve({ bytes: entry.bytes, contentType: entry.contentType ?? 'application/pdf' });
    },
  };
}

describe('page text', () => {
  it('compares and hashes the page after one normalization: NFKC, whitespace collapsed, trimmed', () => {
    expect(normalizePageText('  97110\n\tThera peutic   exﬁt ')).toBe('97110 Thera peutic exfit');
    expect(pageTextHash('a  b\n')).toBe(createHash('sha256').update('a b').digest('hex'));
    expect(quoteOnPage('97110 Therapeutic\nexercise', PAGE_TWO.join('\n'))).toBe(true);
    expect(quoteOnPage('97110 Therapeutic exercise $3200', PAGE_TWO.join('\n'))).toBe(false);
    expect(quoteOnPage('97110 therapeutic exercise', PAGE_TWO.join('\n'))).toBe(false);
    expect(quoteOnPage('  ', 'anything')).toBe(false);
  });
});

/** One page whose content stream inflates from a few hundred kilobytes to `mib` MiB of spaces, then one line of text. */
function deflateBombPdf(mib: number): Uint8Array {
  const content = Buffer.concat([Buffer.alloc(mib * 1024 * 1024, 0x20), Buffer.from('BT /F1 12 Tf 72 720 Td (SYNTHETIC CONTRACT PAGE) Tj ET\n')]);
  const compressed = deflateSync(content, { level: 9 });
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk =
      body === null
        ? Buffer.concat([Buffer.from(`${String(index + 1)} 0 obj\n<< /Length ${String(compressed.length)} /Filter /FlateDecode >>\nstream\n`), compressed, Buffer.from('\nendstream\nendobj\n')])
        : Buffer.from(`${String(index + 1)} 0 obj\n${body}\nendobj\n`);
    parts.push(chunk);
    length += chunk.length;
  });
  parts.push(Buffer.from(`xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(length)}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

const ok = (pages: Awaited<ReturnType<typeof readDocumentPages>>): readonly string[] => {
  expect(pages.ok, pages.ok ? '' : pages.problem).toBe(true);
  return pages.ok ? pages.pages : [];
};

describe('the bounded page reader (ADR 0033)', () => {
  it('reads each PDF page’s text layer in its own thread, and an empty string for a page without one', async () => {
    const pages = ok(await readDocumentPages({ bytes: syntheticPdf([PAGE_ONE, PAGE_TWO, { scanned: true }]), contentType: 'application/pdf' }));
    expect(pages.map(normalizePageText)).toEqual([PAGE_ONE.join(' '), PAGE_TWO.join(' '), '']);
  });

  it('refuses bytes that are not a readable PDF', async () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.4'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
    expect(await readDocumentPages({ bytes: new TextEncoder().encode('%PDF-1.4\nnot really'), contentType: 'application/pdf' })).toEqual({ ok: false, problem: 'document_unreadable' });
  });

  it('reads a workbook one page per sheet, each row a line of tab-separated cells', async () => {
    const bytes = syntheticXlsx([
      { name: 'Exhibit A', rows: [['SYNTHETIC EXHIBIT A FEE SCHEDULE'], ['Code', 'Description', 'Rate'], ['97110', 'Therapeutic exercise', 32], ['97140', 'Manual therapy', { number: '30.5' }]] },
      { name: 'Notes', rows: [['Rates per unit', true], [{ inline: 'Effective 2026-01-01 & after' }]] },
    ]);
    const pages = ok(await readDocumentPages({ bytes, contentType: XLSX }));
    expect(pages).toEqual(['SYNTHETIC EXHIBIT A FEE SCHEDULE\nCode\tDescription\tRate\n97110\tTherapeutic exercise\t32\n97140\tManual therapy\t30.5', 'Rates per unit\tTRUE\nEffective 2026-01-01 & after']);
    // The same workbook arriving undeclared from a zip upload reads the same; a deflated one too.
    expect(ok(await readDocumentPages({ bytes, contentType: 'application/octet-stream' }))).toEqual(pages);
    expect(ok(await readDocumentPages({ bytes: syntheticXlsx([{ name: 'A', rows: [['97110', 32]] }], { deflate: true }), contentType: XLSX }))).toEqual(['97110\t32']);
    // A zip that is not a workbook, and a zip declared as a PDF.
    expect(await readDocumentPages({ bytes: zipParts([{ name: 'remit.835', text: 'not a workbook' }]), contentType: XLSX })).toEqual({ ok: false, problem: 'document_unreadable' });
    expect(await readDocumentPages({ bytes, contentType: 'application/pdf' })).toEqual({ ok: false, problem: 'unsupported_document' });
  });

  it('reads a CSV one page per block of rows', async () => {
    const rows = Array.from({ length: CSV_ROWS_PER_PAGE + 2 }, (_, index) => `${String(97000 + index)},"SYNTHETIC, item ${String(index)}",${String(index)}.00`);
    const pages = ok(await readDocumentPages({ bytes: new TextEncoder().encode(`\uFEFFcode,description,amount\r\n${rows.join('\r\n')}\r\n`), contentType: 'text/csv' }));
    expect(pages).toHaveLength(2);
    expect(pages[0]?.split('\n')[1]).toBe('97000\tSYNTHETIC, item 0\t0.00');
    expect(pages[1]?.split('\n')).toEqual([`${String(97000 + CSV_ROWS_PER_PAGE - 1)}\tSYNTHETIC, item ${String(CSV_ROWS_PER_PAGE - 1)}\t${String(CSV_ROWS_PER_PAGE - 1)}.00`, `${String(97000 + CSV_ROWS_PER_PAGE)}\tSYNTHETIC, item ${String(CSV_ROWS_PER_PAGE)}\t${String(CSV_ROWS_PER_PAGE)}.00`, `${String(97000 + CSV_ROWS_PER_PAGE + 1)}\tSYNTHETIC, item ${String(CSV_ROWS_PER_PAGE + 1)}\t${String(CSV_ROWS_PER_PAGE + 1)}.00`]);
  });

  it('refuses a document past any limit as unsupported, never reading it in part', async () => {
    const pdf = syntheticPdf([PAGE_ONE, PAGE_TWO]);
    const document = { bytes: pdf, contentType: 'application/pdf' };
    expect(await readDocumentPages(document, { limits: { maxBytes: pdf.length - 1 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(await readDocumentPages(document, { limits: { maxPages: 1 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(await readDocumentPages(document, { limits: { maxTextCharacters: 20 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(await readDocumentPages(document, { limits: { timeoutMs: 0 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    const workbook = syntheticXlsx([{ name: 'A', rows: [['x'.repeat(4096)]] }, { name: 'B', rows: [['y']] }], { deflate: true });
    expect(await readDocumentPages({ bytes: workbook, contentType: XLSX }, { limits: { maxInflatedBytes: 2048 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(await readDocumentPages({ bytes: workbook, contentType: XLSX }, { limits: { maxPages: 1 } })).toEqual({ ok: false, problem: 'unsupported_document' });
  });

  it('stops the reading thread when a decompression bomb passes the memory cap, and this thread is untouched', async () => {
    const before = process.memoryUsage().heapUsed;
    const started = Date.now();
    expect(await readDocumentPages({ bytes: deflateBombPdf(160), contentType: 'application/pdf' }, { limits: { maxMemoryBytes: 64 * 1024 * 1024 } })).toEqual({ ok: false, problem: 'unsupported_document' });
    expect(Date.now() - started).toBeLessThan(PAGE_READ_LIMITS.timeoutMs);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(64 * 1024 * 1024);
  }, 30_000);

  it('knows a document’s format from its bytes and its declared type', () => {
    const text = new TextEncoder().encode('code,amount\n');
    expect(documentFormat(syntheticPdf([PAGE_ONE]), 'application/octet-stream')).toBe('pdf');
    expect(documentFormat(text, 'text/csv')).toBe('csv');
    expect(documentFormat(text, 'text/plain')).toBe('csv');
    expect(documentFormat(text, 'application/octet-stream')).toBe('csv');
    expect(documentFormat(new Uint8Array([0x61, 0, 0x62]), 'application/octet-stream')).toBeNull();
    expect(documentFormat(text, 'application/vnd.ms-excel')).toBeNull();
    expect(documentFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'application/vnd.ms-excel')).toBeNull();
    expect(documentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe('image');
  });

  it('reads workbook XML by pattern: entities, prefixes, phonetic runs, rich text, sheet order', () => {
    expect(decodeXml('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42; &unknown; &#x110000;')).toBe('a & b <c> "d" \'e\' AB &unknown; &#x110000;');
    expect(sharedStrings('<x:sst><x:si><x:r><x:t>97110 </x:t></x:r><x:r><x:t>Therapeutic</x:t></x:r><x:rPh><x:t>ignored</x:t></x:rPh></x:si><x:si><x:t/></x:si></x:sst>')).toEqual(['97110 Therapeutic', '']);
    expect(sheetText('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="b"><v>0</v></c><c r="C1" t="e"><v>#N/A</v></c><c r="D1"/><c r="E1" t="str"><f>A1</f><v>x</v></c><c r="F1" t="s"><v>9</v></c></row><row r="2"/></sheetData>', ['97110'])).toBe('97110\tFALSE\t#N/A\tx');
    expect(workbookSheets('<workbook><sheets><sheet name="B" sheetId="2" r:id="rId2"/><sheet name="A" sheetId="1" r:id="rId1"/><sheet name="lost" sheetId="3" r:id="rId9"/></sheets></workbook>', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/./sheet2.xml"/></Relationships>')).toEqual([
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('reads CSV fields as RFC 4180 writes them, and text that is not UTF-8 as Latin-1', async () => {
    expect(csvRows('a,"b,c","d ""e""","f\ng"\r\nh,,i')).toEqual([
      ['a', 'b,c', 'd "e"', 'f\ng'],
      ['h', '', 'i'],
    ]);
    expect(csvRows('')).toEqual([]);
    expect(csvText(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
    expect(await readPagesHere({ format: 'csv', bytes: new TextEncoder().encode('a\n'), maxPages: 0, maxTextCharacters: 10, maxInflatedBytes: 10 })).toEqual({ kind: 'refused', problem: 'unsupported_document' });
  });

  it('escapes what a PDF string needs and refuses text it cannot write', () => {
    expect(() => syntheticPdf([])).toThrow();
    expect(() => syntheticPdf([['café']])).toThrow();
  });
});

describe('Textract page reader (mocked client)', () => {
  it('stages the document, polls the job and returns each page’s lines in order, across result pages', async () => {
    const respond = (command: unknown): unknown => {
      if (command instanceof StartDocumentTextDetectionCommand) {
        expect(command.input).toEqual({ DocumentLocation: { S3Object: { Bucket: 'synthetic-staging', Name: 'staged/one' } } });
        return { JobId: 'job-1' };
      }
      if (command instanceof GetDocumentTextDetectionCommand) {
        const calls = send.mock.calls.filter(([call]) => call instanceof GetDocumentTextDetectionCommand).length;
        if (calls === 1) {
          return { JobStatus: 'IN_PROGRESS' };
        }
        if (command.input.NextToken === undefined) {
          return {
            JobStatus: 'SUCCEEDED',
            DocumentMetadata: { Pages: 3 },
            NextToken: 'more',
            Blocks: [
              { BlockType: 'PAGE', Page: 1 },
              { BlockType: 'LINE', Text: 'SYNTHETIC SCANNED EXHIBIT', Page: 1 },
              { BlockType: 'WORD', Text: 'SYNTHETIC', Page: 1 },
            ],
          };
        }
        return { JobStatus: 'SUCCEEDED', Blocks: [{ BlockType: 'LINE', Text: '97110 $32.00 per unit', Page: 1 }, { BlockType: 'LINE', Text: 'Page two line', Page: 2 }, { BlockType: 'LINE', Page: 2 }] };
      }
      throw new Error('unexpected command');
    };
    const send = vi.fn((command: unknown) => Promise.resolve(respond(command)));
    const sleep = vi.fn(() => Promise.resolve());
    const reader = new TextractPageReader({ client: { send } as never, staging: { stage: () => Promise.resolve({ bucket: 'synthetic-staging', name: 'staged/one' }) }, pollMilliseconds: 0, sleep });
    expect(await reader.pageTexts({ bytes: new Uint8Array([1]), contentType: 'application/pdf' })).toEqual(['SYNTHETIC SCANNED EXHIBIT\n97110 $32.00 per unit', 'Page two line', '']);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('fails a job that fails, that never starts, or that never finishes', async () => {
    const staging = { stage: () => Promise.resolve({ bucket: 'b', name: 'n' }) };
    const failing = new TextractPageReader({ client: { send: (command: unknown) => Promise.resolve(command instanceof StartDocumentTextDetectionCommand ? { JobId: 'j' } : { JobStatus: 'FAILED' }) } as never, staging });
    await expect(failing.pageTexts({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toThrow('ended failed');
    const unstarted = new TextractPageReader({ client: { send: () => Promise.resolve({}) } as never, staging });
    await expect(unstarted.pageTexts({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toThrow(ScanReadError);
    const slow = new TextractPageReader({
      client: { send: (command: unknown) => Promise.resolve(command instanceof StartDocumentTextDetectionCommand ? { JobId: 'j' } : { JobStatus: 'IN_PROGRESS' }) } as never,
      staging,
      maxPolls: 2,
      sleep: () => Promise.resolve(),
    });
    await expect(slow.pageTexts({ bytes: new Uint8Array([1]), contentType: 'image/png' })).rejects.toThrow('did not finish');
    const defaults = new TextractPageReader({
      client: { send: (command: unknown) => Promise.resolve(command instanceof StartDocumentTextDetectionCommand ? { JobId: 'j' } : { JobStatus: 'SUCCEEDED' }) } as never,
      staging,
    });
    expect(await defaults.pageTexts({ bytes: new Uint8Array([1]), contentType: 'image/png' })).toEqual([]);
  });

  it('is built for a deployed task from its staging, and names the two calls it makes for the task role', async () => {
    const send = vi.fn((command: unknown) => Promise.resolve(command instanceof StartDocumentTextDetectionCommand ? { JobId: 'j' } : { JobStatus: 'SUCCEEDED', Blocks: [{ BlockType: 'LINE', Text: 'SYNTHETIC', Page: 1 }] }));
    const stage = vi.fn(() => Promise.resolve({ bucket: 'synthetic-documents', name: 'textract/one' }));
    const reader = createTextractPageReader({ stage }, { client: { send } });
    expect(reader).toBeInstanceOf(TextractPageReader);
    expect(await reader.pageTexts({ bytes: new Uint8Array([1]), contentType: 'image/png' })).toEqual(['SYNTHETIC']);
    expect(stage).toHaveBeenCalledOnce();
    expect(createTextractPageReader({ stage })).toBeInstanceOf(TextractPageReader);
    const commands = [...new Set(send.mock.calls.map(([command]) => `textract:${(command as object).constructor.name.replace(/Command$/, '')}`))].sort();
    expect(commands).toEqual([...TEXTRACT_ACTIONS].sort());
  });
});

describe('evidence resolution (CON-04, CON-05)', () => {
  const contract = randomUUID();
  const scanned = randomUUID();
  const image = randomUUID();
  const sheet = randomUUID();
  const workbook = randomUUID();
  const legacy = randomUUID();
  const broken = randomUUID();
  const source = documents({
    [contract]: { bytes: syntheticPdf([PAGE_ONE, PAGE_TWO, { scanned: true }]) },
    [scanned]: { bytes: syntheticPdf([{ scanned: true }]) },
    [image]: { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png' },
    [sheet]: { bytes: new TextEncoder().encode('code,description,amount\n97110,Therapeutic exercise,$32.00 per unit\n'), contentType: 'text/csv' },
    [workbook]: { bytes: syntheticXlsx([{ name: 'Cover', rows: [['SYNTHETIC EXHIBIT A']] }, { name: 'Rates', rows: [['Code', 'Rate'], ['97110', 32], ['97140', { number: '30.5' }]] }]), contentType: XLSX },
    [legacy]: { bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), contentType: 'application/vnd.ms-excel' },
    [broken]: { bytes: new TextEncoder().encode('%PDF-1.7 truncated') },
  });
  const inVersion = [contract, scanned, image, sheet, workbook, legacy, broken];
  const quote = '97110 Therapeutic exercise $32.00 per unit';
  const hash = pageTextHash(PAGE_TWO.join('\n'));
  const read = (options: Parameters<typeof documentPages>[1] = {}, from: DocumentSource = source): PageSource => documentPages(from, options);

  it('cites a quote on a page with the page text’s hash, and the citation resolves to that page', async () => {
    const resolver = new EvidenceResolver({ pages: read() });
    const cited = await resolver.cite(contract, 2, quote, inVersion);
    expect(cited).toEqual({ cited: true, citation: { document_id: contract, page: 2, quote, hash } });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote, hash }, inVersion)).toEqual({ resolved: true, page: 2, pageCount: 3, hash });
    // The document was read once for both.
    expect(source.reads.filter((id) => id === contract)).toHaveLength(1);
  });

  it('cites a SYNTHETIC fee-schedule exhibit uploaded as a workbook (a sheet a page) or as a CSV (a block of rows a page)', async () => {
    const resolver = new EvidenceResolver({ pages: read() });
    const cell = await resolver.cite(workbook, 2, '97110 32', inVersion);
    expect(cell).toEqual({ cited: true, citation: { document_id: workbook, page: 2, quote: '97110 32', hash: pageTextHash('Code\tRate\n97110\t32\n97140\t30.5') } });
    expect(cell.cited && (await resolver.resolve(cell.citation, inVersion))).toEqual({ resolved: true, page: 2, pageCount: 2, hash: pageTextHash('Code\tRate\n97110\t32\n97140\t30.5') });
    expect(await resolver.cite(workbook, 1, '97110 32', inVersion)).toEqual({ cited: false, problem: 'quote_not_on_page' });
    const row = await resolver.cite(sheet, 1, quote, inVersion);
    expect(row).toMatchObject({ cited: true, citation: { page: 1, hash: pageTextHash('code\tdescription\tamount\n97110\tTherapeutic exercise\t$32.00 per unit') } });
    expect(row.cited && (await resolver.resolve(row.citation, inVersion))).toMatchObject({ resolved: true, pageCount: 1 });
    expect(await resolver.cite(legacy, 1, quote, inVersion)).toEqual({ cited: false, problem: 'unsupported_document' });
  });

  it('names what fails: no citation, another version’s document, a missing page, a quote not on the page, a changed hash', async () => {
    const resolver = new EvidenceResolver({ pages: read() });
    expect(await resolver.resolve(null, inVersion)).toEqual({ resolved: false, problem: 'not_cited' });
    expect(await resolver.resolve({ document_id: randomUUID(), page: 2, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'document_not_in_version' });
    expect(await resolver.resolve({ document_id: contract, page: 4, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'page_missing', pageCount: 3 });
    expect(await resolver.resolve({ document_id: contract, page: 1, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'quote_not_on_page', pageCount: 3 });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote: '97110 Therapeutic exercise $35.00 per unit', hash }, inVersion)).toMatchObject({ problem: 'quote_not_on_page' });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote, hash: 'b'.repeat(64) }, inVersion)).toEqual({ resolved: false, problem: 'hash_mismatch', pageCount: 3 });
    expect(await resolver.cite(contract, 1, quote, inVersion)).toEqual({ cited: false, problem: 'quote_not_on_page' });
    expect(await resolver.cite(contract, 0, quote, inVersion)).toEqual({ cited: false, problem: 'page_missing' });
  });

  it('cannot cite a scanned page without a scan reader, a document of no supported kind, or a damaged PDF', async () => {
    const resolver = new EvidenceResolver({ pages: read() });
    expect(await resolver.resolve({ document_id: contract, page: 3, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'no_text', pageCount: 3 });
    expect(await resolver.cite(scanned, 1, quote, inVersion)).toEqual({ cited: false, problem: 'no_text' });
    expect(await resolver.cite(image, 1, quote, inVersion)).toEqual({ cited: false, problem: 'unsupported_document' });
    expect(await resolver.cite(broken, 1, quote, inVersion)).toEqual({ cited: false, problem: 'document_unreadable' });
    // Page text the source has not read yet (intake still running) is not evidence yet.
    const pending = new EvidenceResolver({ pages: { pages: () => Promise.resolve({ ok: false, problem: 'not_read_yet' }) } });
    expect(await pending.cite(contract, 1, quote, inVersion)).toEqual({ cited: false, problem: 'not_read_yet' });
  });

  it('reads scanned pages through the scan reader, only where pdf.js found no text', async () => {
    const scans: ScannedPageReader = { pageTexts: vi.fn(() => Promise.resolve(['ignored: page one has a text layer', 'ignored too', 'SYNTHETIC SCANNED PAGE 97530 $35.00 per unit'])) };
    const resolver = new EvidenceResolver({ pages: read({ scans }) });
    const cited = await resolver.cite(contract, 3, '97530 $35.00', inVersion);
    expect(cited).toMatchObject({ cited: true, citation: { page: 3, hash: pageTextHash('SYNTHETIC SCANNED PAGE 97530 $35.00 per unit') } });
    expect(await resolver.cite(contract, 2, quote, inVersion)).toMatchObject({ cited: true, citation: { hash } });
    const images: ScannedPageReader = { pageTexts: () => Promise.resolve(['SYNTHETIC IMAGE 97110 $32.00']) };
    expect(await new EvidenceResolver({ pages: read({ scans: images }) }).cite(image, 1, '97110 $32.00', inVersion)).toMatchObject({ cited: true });
    const short: ScannedPageReader = { pageTexts: () => Promise.resolve([]) };
    expect(await new EvidenceResolver({ pages: read({ scans: short }) }).cite(scanned, 1, quote, inVersion)).toEqual({ cited: false, problem: 'no_text' });
  });

  it('passes on a failure to read the bytes rather than calling it evidence', async () => {
    const failing: DocumentSource = { read: () => Promise.reject(new Error('store unavailable')) };
    await expect(new EvidenceResolver({ pages: read({}, failing) }).cite(contract, 1, quote, [contract])).rejects.toThrow('store unavailable');
  });
});
