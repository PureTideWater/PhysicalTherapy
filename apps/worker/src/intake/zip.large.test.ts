import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DocumentStore, LocalSealedBytes, type SealedBytes } from '../storage/documents';
import { type StreamedEntry, streamZip } from './test-support/zip-writer';
import { TEST_KEY, TEST_PRACTICE, testCipher } from './test-support/memory-bytes';
import { inspectZip, zipEntries } from './zip';

/**
 * A 2 GB zip queues per file without being loaded into memory (PRD 6 Intake and documents; milestone 3
 * done check). This streams a generated zip of TP_LARGE_ZIP_MB mebibytes (256 by default, what a CI
 * runner's disk and minute allow) through the real path: sealed into the local store as it is
 * generated, opened by random access, inspected, and each entry streamed into its own sealed document.
 * It asserts the zip and every entry were seen in full, that no piece handed to the store was larger
 * than one sealed chunk, and that the process's memory (heap plus buffers) never grew by more than a
 * small bound, a fraction of the zip's size. docs/adr/0026 has the arithmetic for 2 GiB: nothing in the
 * path holds more than a chunk (64 KiB), the inflate window (32 KiB), the reader's cache (64 chunks, 4
 * MiB) and, in S3, one 8 MiB part, so memory does not grow with the zip; time and storage grow linearly.
 */

const MIB = 1024 * 1024;
const ZIP_MIB = Number.parseInt(process.env.TP_LARGE_ZIP_MB ?? '256', 10);
const ENTRY_MIB = 1;
const ENTRIES = Math.max(1, Math.floor(ZIP_MIB / ENTRY_MIB));
/** What the path may hold at once, whatever the zip's size: far below the zip. */
const MEMORY_BOUND = 96 * MIB;

const root = mkdtempSync(path.join(tmpdir(), 'tp-large-zip-'));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A store that records the largest piece it was handed, around the local one. */
class Watched implements SealedBytes {
  largest = 0;
  written = 0;
  constructor(private readonly inner: LocalSealedBytes) {}
  putNew(key: string, source: AsyncIterable<Uint8Array>): Promise<void> {
    const watch = async function* (this: Watched): AsyncGenerator<Uint8Array> {
      for await (const part of source) {
        this.largest = Math.max(this.largest, part.length);
        this.written += part.length;
        yield part;
      }
    }.call(this);
    return this.inner.putNew(key, watch);
  }
  size(key: string): Promise<number | null> {
    return this.inner.size(key);
  }
  get(key: string, range?: { readonly start: number; readonly end: number }): AsyncIterable<Uint8Array> {
    return this.inner.get(key, range);
  }
}

function used(): number {
  const memory = process.memoryUsage();
  return memory.heapUsed + memory.arrayBuffers;
}

describe('a large zip', () => {
  it(`streams a ${String(ZIP_MIB)} MiB zip of ${String(ENTRIES)} entries into per-entry documents in bounded memory`, async () => {
    const bytes = new Watched(new LocalSealedBytes(root));
    const documents = new DocumentStore(bytes);
    const cipher = testCipher();
    // One 64 KiB piece of an 835-like text, repeated: generated on demand, never accumulated.
    const piece = Buffer.alloc(64 * 1024, 'ISA*00*SYNTHETIC LARGE ZIP ENTRY*~');
    function* entries(): Generator<StreamedEntry> {
      for (let index = 0; index < ENTRIES; index += 1) {
        yield {
          name: `remit-${String(index).padStart(5, '0')}.835`,
          chunks: function* () {
            for (let sent = 0; sent < ENTRY_MIB * MIB; sent += piece.length) {
              yield piece;
            }
          },
        };
      }
    }
    const baseline = used();
    let peak = 0;
    const sampler = setInterval(() => {
      peak = Math.max(peak, used() - baseline);
    }, 10);
    try {
      const zip = await documents.write(cipher, TEST_KEY, streamZip(entries()));
      expect(zip.sizeBytes).toBeGreaterThan(ZIP_MIB * MIB);
      const reader = await documents.open(cipher, TEST_KEY);
      const inspection = await inspectZip(reader);
      expect(inspection).toMatchObject({ kind: 'zip', inventory: { fileEntries: ENTRIES } });
      if (inspection.kind !== 'zip') {
        return;
      }
      let expanded = 0;
      let entryBytes = 0;
      for await (const entry of zipEntries(reader, inspection.inventory)) {
        expect(entry.hold).toBeUndefined();
        const written = await documents.write(cipher, `practices/${TEST_PRACTICE}/documents/entry-${String(entry.index)}`, entry.open());
        expanded += 1;
        entryBytes += written.sizeBytes;
        peak = Math.max(peak, used() - baseline);
      }
      expect(expanded).toBe(ENTRIES);
      expect(entryBytes).toBe(ENTRIES * ENTRY_MIB * MIB);
    } finally {
      clearInterval(sampler);
    }
    // Every piece written was at most one sealed chunk (64 KiB plus its tag), and the store saw the
    // zip and every entry once.
    expect(bytes.largest).toBeLessThanOrEqual(64 * 1024 + 16);
    expect(bytes.written).toBeGreaterThan(2 * ZIP_MIB * MIB);
    expect(peak, `peak growth ${String(Math.round(peak / MIB))} MiB for a ${String(ZIP_MIB)} MiB zip`).toBeLessThan(MEMORY_BOUND);
  }, 240_000);
});
