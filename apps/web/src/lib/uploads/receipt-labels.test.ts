import { DOCUMENT_KINDS, DOCUMENT_STATUSES, HELD_AT_INTAKE } from '@tp/db';
import { ZIP_LIMITS } from '@tp/worker/runtime';
import { describe, expect, it } from 'vitest';

import { KIND_NAMES, type Receipt, formatBytes, receiptState, shortId, utcMinute } from './receipt-labels';

const base: Receipt = {
  documentId: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
  parentDocumentId: null,
  kind: 'x12_835',
  sizeBytes: '1200',
  receivedAt: '2026-10-16T12:00:00.000Z',
  status: 'awaiting_upload',
  scanStatus: 'pending',
  sha256: null,
  duplicateOf: null,
  entries: null,
};

describe('receipt states', () => {
  it('give every status a stage, a label and a reason in J4’s words, and hold every intake hold', () => {
    for (const status of DOCUMENT_STATUSES) {
      const state = receiptState({ ...base, status });
      expect(state.label.length, status).toBeGreaterThan(0);
      expect(state.detail.length, status).toBeGreaterThan(0);
      expect(['waiting', 'received', 'scanned', 'stored', 'expanded', 'parsed', 'balanced', 'loaded', 'held', 'failed']).toContain(state.stage);
    }
    for (const status of HELD_AT_INTAKE) {
      expect(receiptState({ ...base, status }), status).toMatchObject({ stage: 'held', held: true, settled: true });
    }
    expect(receiptState({ ...base, status: 'received' })).toMatchObject({ stage: 'received', settled: false, retry: 'intake' });
    expect(receiptState({ ...base, status: 'awaiting_upload' })).toMatchObject({ settled: false, retry: 'upload' });
    expect(receiptState({ ...base, status: 'failed' })).toMatchObject({ stage: 'failed', settled: true, retry: 'intake' });
    expect(receiptState({ ...base, status: 'parse_queued' })).toMatchObject({ stage: 'scanned', settled: true, detail: 'The malware scan is clean; queued for parse.' });
    for (const status of ['parsed', 'balanced', 'loaded'] as const) {
      expect(receiptState({ ...base, status }).stage).toBe(status);
    }
  });

  it('say which file a duplicate repeats (PAR-06)', () => {
    expect(receiptState({ ...base, status: 'duplicate', duplicateOf: { documentId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04', receivedAt: '2026-10-15T08:00:00.000Z' } }).detail).toBe(
      'Duplicate of file 9a8b7c6d (received 2026-10-15); nothing loads from it.',
    );
    expect(receiptState({ ...base, status: 'duplicate' }).detail).toContain('Duplicate of an earlier file');
  });

  it('count a zip’s files in its batch receipt (PAR-27), and say a zip is quarantined whole (PAR-28)', () => {
    const entries = { total: 500, byStatus: { parse_queued: 499, held: 0, unsafe_entry: 1 } };
    expect(receiptState({ ...base, status: 'expanded', entries }).detail).toBe('Each file in the zip has its own receipt: 500 files, 499 queued for parse, 1 held.');
    expect(receiptState({ ...base, status: 'scanned', entries: { total: 3, byStatus: { scanned: 1, stored: 1, received: 1 } } }).detail).toBe(
      'Expanding the zip: 3 files, 1 queued for parse, 1 stored, 1 in progress, 0 held so far.',
    );
    expect(receiptState({ ...base, status: 'expanded', entries: { total: 1, byStatus: { scanned: 1 } } }).detail).toContain('1 file, 1 queued');
    expect(receiptState({ ...base, status: 'expanded' }).detail).toContain('0 files');
    expect(receiptState({ ...base, status: 'quarantined', entries: { total: 2, byStatus: { quarantined: 2 } } }).detail).toContain('a file in the zip');
    expect(receiptState({ ...base, status: 'quarantined' }).detail).toContain('it is malware, an executable or a script');
  });

  it('state the zip limits the worker applies', () => {
    expect(receiptState({ ...base, status: 'too_large' }).detail).toContain(`${String(ZIP_LIMITS.maxEntryBytes / 1024 ** 2)} MiB`);
    expect(receiptState({ ...base, status: 'too_large' }).detail).toContain(`${String(ZIP_LIMITS.maxTotalBytes / 1024 ** 3)} GiB`);
    expect(receiptState({ ...base, status: 'too_many_entries' }).detail).toContain(ZIP_LIMITS.maxEntries.toLocaleString('en-US'));
  });

  it('name every kind, and format sizes, dates and IDs for people', () => {
    expect(Object.keys(KIND_NAMES).sort()).toEqual([...DOCUMENT_KINDS].sort());
    expect(receiptState({ ...base, kind: 'contract', status: 'wrong_type' }).detail).toBe('Not a contract: the file is another type of document.');
    expect(receiptState({ ...base, kind: 'contract', status: 'stored' }).detail).toContain('contract is kept for its review');
    expect([formatBytes(1000), formatBytes(2048), formatBytes(5 * 1024 ** 2), formatBytes(2 * 1024 ** 3), formatBytes(8 * 1024 ** 4)]).toEqual(['1000 bytes', '2.0 KiB', '5.0 MiB', '2.0 GiB', '8192.0 GiB']);
    expect(utcMinute('2026-10-16T12:34:56.000Z')).toBe('2026-10-16 12:34 UTC');
    expect(shortId(base.documentId)).toBe('0b6e2a7c');
  });
});
