import { Readable } from 'node:stream';

import { parsePageText } from '@tp/contracts';
import type { PracticeCipher } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import type { DocumentStore } from '../storage/documents';
import { c1Occurrences, readAndStorePages } from './pages';

/**
 * Queues item 41 (test matrix MOD-27): when intake stores a document's page text it logs how many of each C1
 * character (U+0080 to U+009F) the extracted text holds: the practice, the document, the code point and the count,
 * and not one character of the text or of what stands beside it. The text is stored exactly as extracted.
 * SYNTHETIC documents only. A C1 character is a byte or an escape here, never the character.
 */

const PRACTICE = '00000000-0000-4000-8000-0000000000a1';
const DOCUMENT = '00000000-0000-4000-8000-0000000000d1';
const cipher = {} as PracticeCipher;

/** A store in memory: the original under its key, and whatever intake writes. */
function storeOf(original: Uint8Array): { readonly store: DocumentStore; readonly written: Map<string, Buffer> } {
  const written = new Map<string, Buffer>();
  const store = {
    read: (_cipher: PracticeCipher, key: string) => Readable.from([written.get(key) ?? Buffer.from(original)]),
    exists: (key: string) => Promise.resolve(written.has(key)),
    write: async (_cipher: PracticeCipher, key: string, body: AsyncIterable<Uint8Array>) => {
      const parts: Buffer[] = [];
      for await (const part of body) parts.push(Buffer.from(part));
      written.set(key, Buffer.concat(parts));
    },
  } as unknown as DocumentStore;
  return { store, written };
}

function capture() {
  const lines: Record<string, unknown>[] = [];
  return { lines, logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }) };
}

/** A synthetic fee table as a Windows-1252 CSV: a dash (0x96) twice, an apostrophe (0x92), a mainframe line ending (0x85). */
const csv = Buffer.concat([Buffer.from('code,rate\r\n97110', 'latin1'), Buffer.from([0x96]), Buffer.from('97112,32.00\r\n97530', 'latin1'), Buffer.from([0x96]), Buffer.from('97535,the plan', 'latin1'), Buffer.from([0x92]), Buffer.from('s rate', 'latin1'), Buffer.from([0x85])]);
const document = { practiceId: PRACTICE, documentId: DOCUMENT, key: 'synthetic/original', contentType: 'text/csv', sizeBytes: csv.length };

describe('c1Occurrences: each C1 character of a document’s pages and how often it stands there', () => {
  it('counts by code point across the pages, in code point order', () => {
    expect(c1Occurrences(['a\u0096b\u0096c', 'd\u0085e\u0096', 'plain'])).toEqual([
      { codePoint: 'U+0085', occurrences: 1 },
      { codePoint: 'U+0096', occurrences: 3 },
    ]);
  });

  it('counts nothing outside U+0080 to U+009F', () => {
    expect(c1Occurrences(['\u007f \u0000 – — ’ é'])).toEqual([]);
  });
});

describe('readAndStorePages: the C1 count is logged when the pages are stored', () => {
  it('logs one line for each C1 code point, with the practice, the document, the code point and the count alone', async () => {
    const { store } = storeOf(csv);
    const { lines, logger } = capture();
    await expect(readAndStorePages(store, cipher, document, {}, logger)).resolves.toEqual({ status: 'ready', pageCount: 1 });
    const counted = lines.filter((line) => line.msg === 'page text holds a C1 character');
    expect(counted.map(({ practice_id, document_id, control_character_code, occurrence_count }) => ({ practice_id, document_id, control_character_code, occurrence_count }))).toEqual([
      { practice_id: PRACTICE, document_id: DOCUMENT, control_character_code: 'U+0085', occurrence_count: 1 },
      { practice_id: PRACTICE, document_id: DOCUMENT, control_character_code: 'U+0092', occurrence_count: 1 },
      { practice_id: PRACTICE, document_id: DOCUMENT, control_character_code: 'U+0096', occurrence_count: 2 },
    ]);
    // No text and no context: nothing of the document is in any line.
    expect(JSON.stringify(lines)).not.toMatch(/97110|97112|32\.00|plan|rate|[\u0080-\u009f]/u);
    for (const line of counted) {
      expect(Object.keys(line).sort()).toEqual(['control_character_code', 'document_id', 'level', 'msg', 'occurrence_count', 'practice_id', 'time'].sort());
    }
  });

  it('stores the text exactly as extracted, every C1 character in place', async () => {
    const { store, written } = storeOf(csv);
    await readAndStorePages(store, cipher, document, {}, capture().logger);
    const stored = [...written.values()].map((bytes) => parsePageText(bytes));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.join('\n')).toContain('97110\u009697112');
    expect(stored[0]?.join('\n')).toContain('the plan\u0092s rate');
    expect(stored[0]?.join('\n')).not.toMatch(/[–’]/u);
  });

  it('logs nothing for a document with no C1 character, and nothing when the page text is already stored', async () => {
    const plain = Buffer.from('code,rate\r\n97110,32.00\r\n', 'utf8');
    const first = capture();
    await readAndStorePages(storeOf(plain).store, cipher, { ...document, sizeBytes: plain.length }, {}, first.logger);
    expect(first.lines).toEqual([]);
    const { store } = storeOf(csv);
    await readAndStorePages(store, cipher, document, {}, capture().logger);
    const again = capture();
    await readAndStorePages(store, cipher, document, {}, again.logger);
    expect(again.lines).toEqual([]);
  });
});
