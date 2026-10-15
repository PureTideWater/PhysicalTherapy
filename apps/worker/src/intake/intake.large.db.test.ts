import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, openPool, provisionPracticeKey, readDatabaseUrl, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createTenantWorld, createUser } from '@tp/db/testing';
import { SYNTHETIC_BODY, syntheticInterchange } from '@tp/edi835/testing';
import { createLogger } from '@tp/observability';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import type { JobPayload, JobType } from '../jobs/registry';
import { DocumentStore, LocalSealedBytes, type SealedBytes } from '../storage/documents';
import { intakeHandler } from './intake';
import { LocalLanding } from './landing';
import { LocalScanService } from './scan';
import { type StreamedEntry, streamZip } from './test-support/zip-writer';

/**
 * A 2 GB zip of 835s uploads and queues per file (PRD 6, Intake and documents; PRD 17 and the
 * milestone 3 done check), through the intake job itself: a zip of TP_LARGE_ZIP_MB mebibytes (256 by
 * default, what a pull request's runner allows; the scheduled large-zip workflow runs 2048) made of
 * SYNTHETIC 835 entries of about a mebibyte each, generated as a stream and sealed into the local store
 * as the upload receiver leaves it. The intake handler scans, hashes, inspects and expands it against
 * PostgreSQL as the application role: every entry becomes its own source_document, sniffed as an 835,
 * and gets its own parse_835 job, recorded here. Memory (heap plus buffers) never grows by more than a
 * small bound, whatever the zip's size, and no piece handed to the store is larger than one sealed
 * chunk (docs/adr/0026 has the arithmetic for 2 GiB).
 */

const MIB = 1024 * 1024;
const ZIP_MIB = Number.parseInt(process.env.TP_LARGE_ZIP_MB ?? '256', 10);
/** What the path may hold at once, whatever the zip's size: far below the zip. */
const MEMORY_BOUND = 96 * MIB;

/** Transaction sets per entry, so an entry is about a mebibyte. */
const SET_BYTES = Buffer.byteLength(syntheticInterchange([SYNTHETIC_BODY, SYNTHETIC_BODY])) - Buffer.byteLength(syntheticInterchange([SYNTHETIC_BODY]));
const SETS_PER_ENTRY = Math.floor(MIB / SET_BYTES);
const ENTRY_BYTES = Buffer.byteLength(syntheticInterchange(Array.from({ length: SETS_PER_ENTRY }, () => SYNTHETIC_BODY)));
const ENTRIES = Math.max(1, Math.ceil((ZIP_MIB * MIB) / ENTRY_BYTES));

const root = mkdtempSync(path.join(tmpdir(), 'tp-large-zip-'));
let database: MigratedDatabase;
let owner: DatabaseClient;
let app: DatabasePool;
let world: TenantWorld;
let manager: string;
let cipher: PracticeCipher;
const keys = LocalKeyProvider.random();

beforeAll(async () => {
  database = await createMigratedDatabase(readDatabaseUrl());
  owner = databaseClient(database.url);
  await owner.connect();
  app = openPool(database.appUrl, 4);
  world = await createTenantWorld(owner, 'large zip');
  const key = await provisionPracticeKey(keys, world.practiceId);
  await owner.query('UPDATE practice SET data_key_ref = $1 WHERE id = $2', [key.dataKeyRef, world.practiceId]);
  cipher = key.cipher;
  manager = await createUser(owner);
  await addMembership(owner, world.organizationId, manager, 'billing_manager');
}, 60_000);

afterAll(async () => {
  await app.end();
  await owner.end();
  await database.drop();
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

/** Entry n: a SYNTHETIC interchange with its own ISA13, so no two entries share their bytes; built when the zip reaches it. */
function* entries(): Generator<StreamedEntry> {
  for (let index = 0; index < ENTRIES; index += 1) {
    yield {
      name: `remit-${String(index).padStart(5, '0')}.835`,
      chunks: function* () {
        const bytes = Buffer.from(syntheticInterchange(Array.from({ length: SETS_PER_ENTRY }, () => SYNTHETIC_BODY), String(index + 1).padStart(9, '0')), 'utf8');
        for (let at = 0; at < bytes.length; at += 64 * 1024) {
          yield bytes.subarray(at, at + 64 * 1024);
        }
      },
    };
  }
}

describe('a large zip of 835s', () => {
  it(`uploads as ${String(ZIP_MIB)} MiB and queues each of its ${String(ENTRIES)} 835 entries for parse, in bounded memory`, async () => {
    const bytes = new Watched(new LocalSealedBytes(root));
    const documents = new DocumentStore(bytes);
    const id = randomUUID();
    const baseline = used();
    let peak = 0;
    const sampler = setInterval(() => {
      peak = Math.max(peak, used() - baseline);
    }, 10);
    const queued: { type: JobType; payload: unknown }[] = [];
    try {
      // The browser's PUT, as the local upload receiver seals it under the document's key.
      const zip = await documents.write(cipher, documentObjectKey(world.practiceId, id), streamZip(entries()));
      expect(zip.sizeBytes).toBeGreaterThan(ZIP_MIB * MIB);
      await withPracticeScope(app, { actorId: manager, practiceIds: [world.practiceId] }, (scope) =>
        scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', $3, 'application/zip', $4)", [
          id,
          world.practiceId,
          zip.sizeBytes,
          manager,
        ]),
      );
      const jobId = randomUUID();
      const context: JobContext = {
        jobId,
        logger: createLogger({ sink: () => undefined }),
        transaction: (work) => withJobScope(app, { jobId, practiceId: world.practiceId }, work),
        enqueue: <T extends JobType>(type: T, payload: JobPayload<T>) => {
          queued.push({ type, payload });
          peak = Math.max(peak, used() - baseline);
          return Promise.resolve(randomUUID());
        },
        lastAttempt: false,
      };
      await intakeHandler({ documents, landing: new LocalLanding(documents), scan: new LocalScanService(), keys })({ practice_id: world.practiceId, document_id: id }, context);
    } finally {
      clearInterval(sampler);
    }
    const counts = await asOwner(owner, [world.practiceId], async () => ({
      zip: (await owner.query<{ status: string }>('SELECT status FROM source_document WHERE id = $1', [id])).rows[0]?.status,
      entries: (await owner.query<{ status: string; n: number }>('SELECT status, count(*)::int AS n FROM source_document WHERE parent_document_id = $1 GROUP BY status', [id])).rows,
      ids: (await owner.query<{ id: string }>('SELECT id FROM source_document WHERE parent_document_id = $1', [id])).rows.map((row) => row.id),
    }));
    expect(counts.zip).toBe('expanded');
    expect(counts.entries).toEqual([{ status: 'scanned', n: ENTRIES }]);
    // One parse_835 job per entry, keyed by its document.
    expect(queued).toHaveLength(ENTRIES);
    expect(queued.every((job) => job.type === 'parse_835')).toBe(true);
    expect(new Set(queued.map((job) => (job.payload as { document_id: string }).document_id))).toEqual(new Set(counts.ids));
    // Every piece written was at most one sealed chunk (64 KiB plus its tag); the store saw the zip and every entry once.
    expect(bytes.largest).toBeLessThanOrEqual(64 * 1024 + 16);
    expect(bytes.written).toBeGreaterThan(2 * ZIP_MIB * MIB);
    expect(peak, `peak growth ${String(Math.round(peak / MIB))} MiB for a ${String(ZIP_MIB)} MiB zip`).toBeLessThan(MEMORY_BOUND);
  }, 1_800_000);
});
