import { createHash, randomUUID } from 'node:crypto';

import { GetDocumentTextDetectionCommand, StartDocumentTextDetectionCommand } from '@aws-sdk/client-textract';
import { describe, expect, it, vi } from 'vitest';

import { syntheticPdf } from '../testing/synthetic-pdf';
import { normalizePageText, pageTextHash, quoteOnPage } from './page-text';
import { DocumentUnreadableError, looksLikePdf, pdfPageTexts } from './pdf';
import { type DocumentSource, EvidenceResolver } from './resolve';
import { ScanReadError, type ScannedPageReader, TextractPageReader } from './scan';

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

describe('pdf.js page text', () => {
  it('reads each page’s text layer, and an empty string for a page without one', async () => {
    const pages = await pdfPageTexts(syntheticPdf([PAGE_ONE, PAGE_TWO, { scanned: true }]));
    expect(pages.map(normalizePageText)).toEqual([PAGE_ONE.join(' '), PAGE_TWO.join(' '), '']);
  });

  it('refuses bytes that are not a readable PDF', async () => {
    expect(looksLikePdf(new TextEncoder().encode('%PDF-1.4'))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
    await expect(pdfPageTexts(new TextEncoder().encode('%PDF-1.4\nnot really'))).rejects.toThrow(DocumentUnreadableError);
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
});

describe('evidence resolution (CON-04, CON-05)', () => {
  const contract = randomUUID();
  const scanned = randomUUID();
  const image = randomUUID();
  const sheet = randomUUID();
  const broken = randomUUID();
  const source = documents({
    [contract]: { bytes: syntheticPdf([PAGE_ONE, PAGE_TWO, { scanned: true }]) },
    [scanned]: { bytes: syntheticPdf([{ scanned: true }]) },
    [image]: { bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), contentType: 'image/png' },
    [sheet]: { bytes: new TextEncoder().encode('code,amount\n97110,32.00\n'), contentType: 'text/csv' },
    [broken]: { bytes: new TextEncoder().encode('%PDF-1.7 truncated') },
  });
  const inVersion = [contract, scanned, image, sheet, broken];
  const quote = '97110 Therapeutic exercise $32.00 per unit';
  const hash = pageTextHash(PAGE_TWO.join('\n'));

  it('cites a quote on a page with the page text’s hash, and the citation resolves to that page', async () => {
    const resolver = new EvidenceResolver({ documents: source });
    const cited = await resolver.cite(contract, 2, quote, inVersion);
    expect(cited).toEqual({ cited: true, citation: { document_id: contract, page: 2, quote, hash } });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote, hash }, inVersion)).toEqual({ resolved: true, page: 2, pageCount: 3, hash });
    // The document was read once for both.
    expect(source.reads.filter((id) => id === contract)).toHaveLength(1);
  });

  it('names what fails: no citation, another version’s document, a missing page, a quote not on the page, a changed hash', async () => {
    const resolver = new EvidenceResolver({ documents: source });
    expect(await resolver.resolve(null, inVersion)).toEqual({ resolved: false, problem: 'not_cited' });
    expect(await resolver.resolve({ document_id: randomUUID(), page: 2, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'document_not_in_version' });
    expect(await resolver.resolve({ document_id: contract, page: 4, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'page_missing', pageCount: 3 });
    expect(await resolver.resolve({ document_id: contract, page: 1, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'quote_not_on_page', pageCount: 3 });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote: '97110 Therapeutic exercise $35.00 per unit', hash }, inVersion)).toMatchObject({ problem: 'quote_not_on_page' });
    expect(await resolver.resolve({ document_id: contract, page: 2, quote, hash: 'b'.repeat(64) }, inVersion)).toEqual({ resolved: false, problem: 'hash_mismatch', pageCount: 3 });
    expect(await resolver.cite(contract, 1, quote, inVersion)).toEqual({ cited: false, problem: 'quote_not_on_page' });
    expect(await resolver.cite(contract, 0, quote, inVersion)).toEqual({ cited: false, problem: 'page_missing' });
  });

  it('cannot cite a scanned page without a scan reader, or a document that is not a readable PDF', async () => {
    const resolver = new EvidenceResolver({ documents: source });
    expect(await resolver.resolve({ document_id: contract, page: 3, quote, hash }, inVersion)).toEqual({ resolved: false, problem: 'no_text', pageCount: 3 });
    expect(await resolver.cite(scanned, 1, quote, inVersion)).toEqual({ cited: false, problem: 'no_text' });
    expect(await resolver.cite(image, 1, quote, inVersion)).toEqual({ cited: false, problem: 'unsupported_document' });
    expect(await resolver.cite(sheet, 1, quote, inVersion)).toEqual({ cited: false, problem: 'unsupported_document' });
    expect(await resolver.cite(broken, 1, quote, inVersion)).toEqual({ cited: false, problem: 'document_unreadable' });
  });

  it('reads scanned pages through the scan reader, only where pdf.js found no text', async () => {
    const scans: ScannedPageReader = { pageTexts: vi.fn(() => Promise.resolve(['ignored: page one has a text layer', 'ignored too', 'SYNTHETIC SCANNED PAGE 97530 $35.00 per unit'])) };
    const resolver = new EvidenceResolver({ documents: source, scans });
    const cited = await resolver.cite(contract, 3, '97530 $35.00', inVersion);
    expect(cited).toMatchObject({ cited: true, citation: { page: 3, hash: pageTextHash('SYNTHETIC SCANNED PAGE 97530 $35.00 per unit') } });
    expect(await resolver.cite(contract, 2, quote, inVersion)).toMatchObject({ cited: true, citation: { hash } });
    const images: ScannedPageReader = { pageTexts: () => Promise.resolve(['SYNTHETIC IMAGE 97110 $32.00']) };
    expect(await new EvidenceResolver({ documents: source, scans: images }).cite(image, 1, '97110 $32.00', inVersion)).toMatchObject({ cited: true });
    const short: ScannedPageReader = { pageTexts: () => Promise.resolve([]) };
    expect(await new EvidenceResolver({ documents: source, scans: short }).cite(scanned, 1, quote, inVersion)).toEqual({ cited: false, problem: 'no_text' });
  });

  it('passes on a failure to read the bytes rather than calling it evidence', async () => {
    const failing: DocumentSource = { read: () => Promise.reject(new Error('store unavailable')) };
    await expect(new EvidenceResolver({ documents: failing }).cite(contract, 1, quote, [contract])).rejects.toThrow('store unavailable');
  });
});
