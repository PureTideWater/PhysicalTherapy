import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { normalizePageText, parsePageText } from '@tp/contracts';
import { syntheticPdf, syntheticXlsx } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, documentPagesKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, createMigratedDatabase, createTenantWorld, createUser } from '@tp/db/testing';
import { assertNoPhi, createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import type { JobPayload, JobType } from '../jobs/registry';
import { parseHandler } from '../parse/job';
import { DocumentStore, type SealedBytes, collect } from '../storage/documents';
import { type IntakeServices, entryDocumentId, intakeHandler } from './intake';
import { LocalLanding } from './landing';
import { LocalScanService, ScanPendingError, type ScanService } from './scan';
import { EICAR } from './sniff';
import { MemorySealedBytes } from './test-support/memory-bytes';
import { type TestEntry, buildZip } from './test-support/zip-writer';
import { ZIP_LIMITS } from './zip';

/**
 * The intake job against PostgreSQL, as the application role in each job's scope (test matrix PAR-06,
 * PAR-27, PAR-28, PAR-30, SEC-08; PRD 6, Intake and documents; PRD 10, Pipeline steps 1 and 2). The
 * bytes land as the local upload receiver leaves them: sealed under the document's key.
 */

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');
const fixture = (relative: string) => readFileSync(path.join(FIXTURES, relative));

let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let world: TenantWorld;
let other: TenantWorld;
let manager: string;
const keys = LocalKeyProvider.random();
const ciphers = new Map<string, PracticeCipher>();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 6);
  world = await createTenantWorld(owner, 'intake');
  other = await createTenantWorld(owner, 'intake other');
  for (const practiceId of [world.practiceId, other.practiceId]) {
    // The worlds' placeholder keys become real ones, so the job can open the practices' ciphers.
    const key = await provisionPracticeKey(keys, practiceId);
    await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, practiceId]);
    ciphers.set(practiceId, key.cipher);
  }
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
}, 60_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
});

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** A synthetic 835 that differs from every other one this test makes. */
let made = 0;
function remit(): Buffer {
  made += 1;
  return Buffer.from(fixture('PAR-01/remit.835').toString('latin1').replace('SYNEFTPAR01001', `SYNEFT${String(made).padStart(8, '0')}`), 'latin1');
}

interface Harness {
  readonly services: IntakeServices;
  readonly bytes: SealedBytes;
}

function harness(scan: ScanService = new LocalScanService(), bytes: SealedBytes = new MemorySealedBytes()): Harness {
  const documents = new DocumentStore(bytes);
  return { bytes, services: { documents, landing: new LocalLanding(documents), scan, keys, scanWait: { pollMs: 1, timeoutMs: 20 } } };
}

function once(bytes: Buffer): AsyncIterable<Buffer> {
  return Readable.from([bytes]);
}

/** What the upload API and the browser leave behind: the row, and the bytes sealed under its key. */
async function upload(h: Harness, bytes: Buffer | undefined, options: { kind?: string; size?: number; practice?: TenantWorld; uploader?: string } = {}): Promise<string> {
  const id = randomUUID();
  const practice = options.practice ?? world;
  const uploader = options.uploader ?? (practice === world ? manager : practice.adminUserId);
  await withPracticeScope(app, { actorId: uploader, practiceIds: [practice.practiceId] }, (scope) =>
    scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, $3, $4, 'application/octet-stream', $5)", [
      id,
      practice.practiceId,
      options.kind ?? 'x12_835',
      options.size ?? bytes?.length ?? 0,
      uploader,
    ]),
  );
  if (bytes !== undefined) {
    await h.services.documents.write(ciphers.get(practice.practiceId) as PracticeCipher, documentObjectKey(practice.practiceId, id), once(bytes));
  }
  return id;
}

interface Run {
  readonly queued: { type: JobType; payload: unknown }[];
  readonly logs: Record<string, unknown>[];
}

function context(practiceId: string, run: Run, lastAttempt = false): JobContext {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: (line) => run.logs.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (work) => withJobScope(app, { jobId, practiceId }, work),
    enqueue: <T extends JobType>(type: T, payload: JobPayload<T>) => {
      run.queued.push({ type, payload });
      return Promise.resolve(randomUUID());
    },
    lastAttempt,
  };
}

async function intake(h: Harness, documentId: string, options: { practiceId?: string; lastAttempt?: boolean } = {}): Promise<Run> {
  const run: Run = { queued: [], logs: [] };
  await intakeHandler(h.services)({ practice_id: options.practiceId ?? world.practiceId, document_id: documentId }, context(options.practiceId ?? world.practiceId, run, options.lastAttempt));
  return run;
}

interface Row {
  readonly id: string;
  readonly status: string;
  readonly scan_status: string;
  readonly sha256: string | null;
  readonly s3_key: string;
  readonly parent_document_id: string | null;
}

async function rows(where: string, values: unknown[]): Promise<Row[]> {
  return (await owner.query(`SELECT id, status, scan_status, sha256, s3_key, parent_document_id FROM source_document WHERE ${where} ORDER BY id`, values)).rows as Row[];
}

async function one(id: string): Promise<Row> {
  const [row] = await rows('id = $1', [id]);
  if (row === undefined) {
    throw new Error('no such document');
  }
  return row;
}

const entriesOf = (zipId: string) => rows('parent_document_id = $1', [zipId]);
const counts = (found: readonly Row[]) => Object.fromEntries([...new Set(found.map((row) => row.status))].map((status) => [status, found.filter((row) => row.status === status).length]));

describe('intake of a single file', () => {
  it('scans a clean 835, records its hash, and queues parse_835 by the document, which loads it', async () => {
    const h = harness();
    const bytes = remit();
    const id = await upload(h, bytes);
    const run = await intake(h, id);
    expect(await one(id)).toMatchObject({ status: 'scanned', scan_status: 'clean', sha256: sha(bytes) });
    expect(run.queued).toEqual([{ type: 'parse_835', payload: { practice_id: world.practiceId, document_id: id } }]);
    for (const { payload } of run.queued) {
      expect(() => {
        assertNoPhi('job_payload', payload, { known: ['SYNTHETIC PAYER A', 'SYNPCNPAR01001'] });
      }).not.toThrow();
    }
    expect(() => {
      assertNoPhi('s3_key', documentObjectKey(world.practiceId, id));
    }).not.toThrow();
    // The parse job loads it; a replay changes nothing (src/parse/parse.db.test.ts covers the loader).
    const parse: Run = { queued: [], logs: [] };
    const parser = parseHandler({ documents: h.services.documents, keys });
    await parser({ practice_id: world.practiceId, document_id: id }, context(world.practiceId, parse));
    expect((await one(id)).status).toBe('loaded');
    await parser({ practice_id: world.practiceId, document_id: id }, context(world.practiceId, parse));
    expect(parse.logs.map((line) => line.msg)).toEqual(['document parsed and loaded', 'document was not waiting for parse']);
    // Intake again: the document is decided, nothing more happens.
    expect((await intake(h, id)).queued).toEqual([]);
  });

  it('records a second upload of the same bytes as a duplicate of the first, and loads nothing for it (PAR-06)', async () => {
    const h = harness();
    const bytes = fixture('PAR-06/remit.835');
    const first = await upload(h, bytes);
    const second = await upload(h, bytes);
    await intake(h, first);
    const run = await intake(h, second);
    expect(run.queued).toEqual([]);
    expect(await one(second)).toMatchObject({ status: 'duplicate', sha256: sha(bytes) });
    expect((await one(first)).status).toBe('scanned');
    // "Duplicate of file X": the first document of the practice with these bytes.
    const original = await rows("practice_id = $1 AND sha256 = $2 AND status <> 'duplicate'", [world.practiceId, sha(bytes)]);
    expect(original.map((row) => row.id)).toEqual([first]);
    // Another practice's upload of the same bytes is its own first.
    const theirs = await upload(h, bytes, { practice: other });
    await intake(h, theirs, { practiceId: other.practiceId });
    expect((await one(theirs)).status).toBe('scanned');
  });

  it('makes exactly one of two concurrent uploads of the same bytes the first (PAR-30)', async () => {
    const h = harness();
    const bytes = fixture('PAR-30/remit.835');
    const [a, b] = [await upload(h, bytes), await upload(h, bytes)];
    const runs = await Promise.all([intake(h, a), intake(h, b)]);
    const statuses = [(await one(a)).status, (await one(b)).status].sort();
    expect(statuses).toEqual(['duplicate', 'scanned']);
    expect(runs.flatMap((run) => run.queued)).toHaveLength(1);
  });

  it('quarantines a renamed executable and the EICAR file before reading further (PAR-28)', async () => {
    const h = harness();
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(200)]);
    const executable = await upload(h, elf);
    const eicar = await upload(h, Buffer.from(EICAR));
    for (const id of [executable, eicar]) {
      const run = await intake(h, id);
      expect(run.queued).toEqual([]);
      expect(await one(id)).toMatchObject({ status: 'quarantined', scan_status: 'flagged', sha256: null });
      expect(run.logs.find((line) => line.error_code === 'UPLOAD_QUARANTINED')).toMatchObject({ document_id: id });
    }
  });

  it('quarantines an executable the malware scan passed, by its signature', async () => {
    const clean: ScanService = { verdict: () => Promise.resolve({ status: 'clean' }) };
    const h = harness(clean);
    const id = await upload(h, Buffer.from('#!/bin/sh\nexit 0\n'));
    expect((await intake(h, id)).queued).toEqual([]);
    expect(await one(id)).toMatchObject({ status: 'quarantined', scan_status: 'flagged' });
  });

  it('holds what is not what it was declared to be, and stores clean documents of other kinds', async () => {
    const h = harness();
    const pdf = (label: string) => Buffer.from(`%PDF-1.7\n%synthetic ${label}\n`);
    const cases: [Buffer, string, string][] = [
      [pdf('remittance'), 'x12_835', 'not_835'],
      [pdf('contract'), 'contract', 'stored'],
      [Buffer.from('check,amount\nSYN-1,1.00\n'), 'contract', 'wrong_type'],
      [Buffer.from('check,amount\nSYN-2,1.00\n'), 'posting_export', 'stored'],
      [Buffer.from(`ISA*00*${' '.repeat(120)}`), 'x12_835', 'unreadable'],
    ];
    for (const [bytes, kind, status] of cases) {
      const id = await upload(h, bytes, { kind });
      expect((await intake(h, id)).queued).toEqual([]);
      expect((await one(id)).status, `${kind} ${status}`).toBe(status);
    }
  });

  it('holds an upload whose bytes are not the size it declared', async () => {
    const h = harness();
    const id = await upload(h, remit(), { size: 10 });
    await intake(h, id);
    expect((await one(id)).status).toBe('unreadable');
  });

  it('does nothing until the bytes arrive, and finds nothing of another practice', async () => {
    const h = harness();
    const id = await upload(h, undefined, { size: 100 });
    const run = await intake(h, id);
    expect(run.queued).toEqual([]);
    expect(run.logs.map((line) => line.msg)).toContain('upload has not arrived; nothing to take in');
    expect((await one(id)).status).toBe('awaiting_upload');
    const theirs = await upload(h, remit(), { practice: other });
    const wrong = await intake(h, theirs);
    expect(wrong.logs.find((line) => line.error_code === 'DOCUMENT_NOT_FOUND')).toBeDefined();
    expect((await one(theirs)).status).toBe('awaiting_upload');
  });

  it('waits for the scan, fails the attempt while it is pending, marks the document failed on the last attempt, and resumes', async () => {
    let verdict: 'pending' | 'clean' | 'failed' = 'pending';
    const h = harness({ verdict: () => Promise.resolve({ status: verdict }) });
    const id = await upload(h, remit());
    await expect(intake(h, id)).rejects.toThrow(ScanPendingError);
    expect((await one(id)).status).toBe('received');
    await expect(intake(h, id, { lastAttempt: true })).rejects.toThrow(ScanPendingError);
    expect(await one(id)).toMatchObject({ status: 'failed', scan_status: 'pending' });
    verdict = 'failed';
    await expect(intake(h, id)).rejects.toThrow('the malware scan failed');
    expect((await one(id)).scan_status).toBe('failed');
    verdict = 'clean';
    expect((await intake(h, id)).queued).toHaveLength(1);
    expect(await one(id)).toMatchObject({ status: 'scanned', scan_status: 'clean' });
  });

  it('quarantines what the malware scan flags or cannot scan', async () => {
    for (const status of ['flagged', 'unscannable'] as const) {
      const h = harness({ verdict: () => Promise.resolve(status === 'flagged' ? { status, finding: 'malware' } : { status }) });
      const id = await upload(h, remit());
      await intake(h, id);
      expect(await one(id)).toMatchObject({ status: 'quarantined', scan_status: status });
    }
  });
});

describe('the page text of contract documents (docs/adr/0033)', () => {
  const pageText = async (h: Harness, id: string) => {
    const row = (await owner.query('SELECT status, page_text_status, page_count FROM source_document WHERE id = $1', [id])).rows[0] as { status: string; page_text_status: string | null; page_count: number | null };
    const key = documentPagesKey(world.practiceId, id);
    const pages = (await h.bytes.size(key)) === null ? null : parsePageText(await collect(h.services.documents.read(ciphers.get(world.practiceId) as PracticeCipher, key))).map(normalizePageText);
    return { ...row, pages };
  };

  it('reads a clean contract, a workbook exhibit and a CSV exhibit once, and seals each page text beside it before storing it', async () => {
    const h = harness();
    const contract = await upload(h, Buffer.from(syntheticPdf([['SYNTHETIC AGREEMENT'], ['97110 $32.00 per unit']])), { kind: 'contract' });
    const workbook = await upload(h, Buffer.from(syntheticXlsx([{ name: 'Rates', rows: [['97110', 32]] }])), { kind: 'exhibit' });
    const csv = await upload(h, Buffer.from('code,amount\n97140,30.50\n'), { kind: 'exhibit' });
    for (const id of [contract, workbook, csv]) {
      expect((await intake(h, id)).queued).toEqual([]);
    }
    expect(await pageText(h, contract)).toEqual({ status: 'stored', page_text_status: 'ready', page_count: 2, pages: ['SYNTHETIC AGREEMENT', '97110 $32.00 per unit'] });
    expect(await pageText(h, workbook)).toEqual({ status: 'stored', page_text_status: 'ready', page_count: 1, pages: ['97110 32'] });
    expect(await pageText(h, csv)).toEqual({ status: 'stored', page_text_status: 'ready', page_count: 1, pages: ['code amount 97140 30.50'] });
  });

  it('records a damaged PDF, a document past a limit and a decompression bomb, and stores them without page text', async () => {
    const h = harness();
    const bounded: Harness = { ...h, services: { ...h.services, pages: { limits: { maxPages: 1, maxMemoryBytes: 64 * 1024 * 1024 } } } };
    const damaged = await upload(bounded, Buffer.from('%PDF-1.7\n%synthetic damaged contract\n'), { kind: 'contract' });
    const long = await upload(bounded, Buffer.from(syntheticPdf([['SYNTHETIC PAGE 1'], ['SYNTHETIC PAGE 2']])), { kind: 'payer_letter' });
    for (const id of [damaged, long]) {
      await intake(bounded, id);
    }
    expect(await pageText(h, damaged)).toEqual({ status: 'stored', page_text_status: 'document_unreadable', page_count: null, pages: null });
    expect(await pageText(h, long)).toEqual({ status: 'stored', page_text_status: 'unsupported_document', page_count: null, pages: null });
    // Other kinds are stored without being read.
    const posting = await upload(h, Buffer.from('check,amount\nSYN-3,1.00\n'), { kind: 'posting_export' });
    await intake(h, posting);
    expect(await pageText(h, posting)).toEqual({ status: 'stored', page_text_status: null, page_count: null, pages: null });
  });

  it('reads the contract documents a zip holds, entry by entry', async () => {
    const h = harness();
    const id = await upload(h, buildZip([{ name: 'agreement.pdf', data: Buffer.from(syntheticPdf([['SYNTHETIC ZIPPED AGREEMENT']])) }]), { kind: 'contract' });
    await intake(h, id);
    expect((await one(id)).status).toBe('expanded');
    expect(await pageText(h, entryDocumentId(id, 0))).toEqual({ status: 'stored', page_text_status: 'ready', page_count: 1, pages: ['SYNTHETIC ZIPPED AGREEMENT'] });
  });
});

describe('intake of a zip', () => {
  it('expands the 500 entries of PAR-27 into their own documents and queues each for parse, in one batch', async () => {
    const h = harness();
    const id = await upload(h, fixture('PAR-27/batch.zip'));
    const run = await intake(h, id);
    expect((await one(id)).status).toBe('expanded');
    const entries = await entriesOf(id);
    expect(entries).toHaveLength(500);
    expect(counts(entries)).toEqual({ scanned: 500 });
    // Entry 137 is cut off halfway: intake keeps it; the parser holds it (EDI_SYNTAX).
    expect(run.queued).toHaveLength(500);
    expect(new Set(run.queued.map((job) => (job.payload as { document_id: string }).document_id))).toEqual(new Set(entries.map((entry) => entry.id)));
    // Each entry's document is named by the zip and its position, under the practice's prefix.
    expect(new Set(entries.map((entry) => entry.id))).toEqual(new Set(Array.from({ length: 500 }, (_, index) => entryDocumentId(id, index))));
    for (const entry of entries) {
      expect(entry.s3_key).toBe(documentObjectKey(world.practiceId, entry.id));
      expect(entry.parent_document_id).toBe(id);
    }
    // A replay of the job does nothing more.
    expect((await intake(h, id)).queued).toEqual([]);
    expect(await entriesOf(id)).toHaveLength(500);
  });

  it('holds the one bad entry of 500 while the 499 others continue, and says so in the batch (PAR-27)', async () => {
    const h = harness();
    const entries: TestEntry[] = Array.from({ length: 499 }, (_, at) => ({ name: `remit-${String(at).padStart(3, '0')}.835`, data: remit() }));
    entries.splice(136, 0, { name: '../outside/remit-136.835', data: remit() });
    const id = await upload(h, buildZip(entries));
    const run = await intake(h, id);
    expect((await one(id)).status).toBe('expanded');
    const expanded = await entriesOf(id);
    expect(counts(expanded)).toEqual({ scanned: 499, unsafe_entry: 1 });
    expect(run.queued).toHaveLength(499);
    const held = expanded.find((entry) => entry.status === 'unsafe_entry');
    expect(held).toMatchObject({ id: entryDocumentId(id, 136), sha256: null });
  });

  it('quarantines the whole upload when an entry is a renamed executable, and parses nothing in it (PAR-28)', async () => {
    const h = harness();
    const id = await upload(h, fixture('PAR-28/upload.zip'));
    const run = await intake(h, id);
    expect(run.queued).toEqual([]);
    expect((await one(id)).status).toBe('quarantined');
    expect(counts(await entriesOf(id))).toEqual({ quarantined: 2 });
    expect(run.logs.find((line) => line.error_code === 'UPLOAD_QUARANTINED')).toMatchObject({ document_id: id });
    // The executable is recognized by its first bytes and never copied out of the zip.
    expect(await one(entryDocumentId(id, 0))).toMatchObject({ scan_status: 'flagged', sha256: null });
    expect(await h.bytes.size(documentObjectKey(world.practiceId, entryDocumentId(id, 0)))).toBeNull();
  });

  it('holds nested zips, damaged entries and duplicates on their own, and stores what each is', async () => {
    const h = harness();
    const known = remit();
    const earlier = await upload(h, known);
    await intake(h, earlier);
    const inner = buildZip([{ name: 'inner.835', data: remit() }]);
    const zip = buildZip([
      { name: 'nested.zip', data: inner },
      { name: 'damaged.835', data: remit(), crc32: 7 },
      { name: 'again.835', data: known },
      { name: 'contract.pdf', data: Buffer.from('%PDF-1.7\n') },
      { name: 'fine.835', data: remit() },
      { name: 'locked.835', data: remit(), flags: 1 },
    ]);
    const id = await upload(h, zip);
    const run = await intake(h, id);
    const byIndex: Row[] = [];
    for (const index of [0, 1, 2, 3, 4, 5]) {
      byIndex.push(await one(entryDocumentId(id, index)));
    }
    expect(byIndex.map((entry) => entry.status)).toEqual(['nested_zip', 'unreadable', 'duplicate', 'not_835', 'scanned', 'encrypted']);
    expect(run.queued).toEqual([{ type: 'parse_835', payload: { practice_id: world.practiceId, document_id: entryDocumentId(id, 4) } }]);
    // Held by its first bytes (not an 835), the PDF is never written; the 835 and the nested zip are.
    const stored = async (index: number) => (await h.bytes.size(documentObjectKey(world.practiceId, entryDocumentId(id, index)))) !== null;
    expect([await stored(0), await stored(3), await stored(4)]).toEqual([true, false, true]);
  });

  it('refuses a zip with too many entries, a zip bomb and an unreadable zip without creating any entry', async () => {
    const files = (count: number): TestEntry[] => Array.from({ length: count }, (_, at) => ({ name: `f${String(at)}.835`, data: remit() }));
    const h = harness();
    const limited: Harness = { ...h, services: { ...h.services, zipLimits: { ...ZIP_LIMITS, maxEntries: 3 } } };
    const zeros = Buffer.alloc(1024 * 1024);
    const cases: [Buffer, string][] = [
      [buildZip(files(4)), 'too_many_entries'],
      [buildZip([{ name: 'a.835', data: Buffer.alloc(6000, 0x61) }, { name: 'b.835', data: Buffer.alloc(6000, 0x61), sameDataAs: 0 }]), 'too_compressed'],
      // Three entries of 1 MiB of zeros each, none above the per-entry ratio floor: the archive expands
      // over a thousand times its size, so it is refused whole and nothing is written.
      [buildZip(Array.from({ length: 3 }, (_, at) => ({ name: `zeros-${String(at)}.835`, data: zeros }))), 'too_compressed'],
      [Buffer.from('PK\u0003\u0004 not really a zip', 'latin1'), 'unreadable'],
    ];
    for (const [bytes, status] of cases) {
      const id = await upload(limited, bytes);
      expect((await intake(limited, id)).queued).toEqual([]);
      expect((await one(id)).status).toBe(status);
      expect(await entriesOf(id)).toEqual([]);
    }
  });

  it('resumes an expansion that stopped partway, creating each entry once', async () => {
    const memory = new MemorySealedBytes();
    let writes = 0;
    let failAt = 4;
    const flaky: SealedBytes = {
      putNew: (key, source) => {
        writes += 1;
        if (writes === failAt) {
          return Promise.reject(new Error('synthetic storage outage'));
        }
        return memory.putNew(key, source);
      },
      size: (key) => memory.size(key),
      get: (key, range) => memory.get(key, range),
    };
    const h = harness(new LocalScanService(), flaky);
    const id = await upload(h, buildZip(Array.from({ length: 6 }, (_, at) => ({ name: `r${String(at)}.835`, data: remit() }))));
    await expect(intake(h, id)).rejects.toThrow('synthetic storage outage');
    expect((await one(id)).status).toBe('scanned');
    expect((await entriesOf(id)).length).toBeLessThan(6);
    failAt = 0;
    const run = await intake(h, id);
    expect((await one(id)).status).toBe('expanded');
    expect(counts(await entriesOf(id))).toEqual({ scanned: 6 });
    expect(new Set(run.queued.map((job) => (job.payload as { document_id: string }).document_id)).size).toBe(6);
  });

  it('marks a zip failed when its last attempt fails, for the operator and a retry', async () => {
    const failing: SealedBytes = {
      putNew: () => Promise.reject(new Error('synthetic storage outage')),
      size: () => Promise.resolve(null),
      get: () => {
        throw new Error('nothing stored');
      },
    };
    const good = harness();
    const id = await upload(good, buildZip([{ name: 'a.835', data: remit() }]));
    // The upload is there (the receiver stored it); every later write fails.
    const memory = (good.bytes as MemorySealedBytes).objects;
    const broken: SealedBytes = {
      putNew: (key, source) => failing.putNew(key, source),
      size: (key) => Promise.resolve(memory.get(key)?.length ?? null),
      get: (key, range) => good.bytes.get(key, range),
    };
    const h = harness(new LocalScanService(), broken);
    await expect(intake(h, id, { lastAttempt: true })).rejects.toThrow('synthetic storage outage');
    expect((await one(id)).status).toBe('failed');
  });
});
