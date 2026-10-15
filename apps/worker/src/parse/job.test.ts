import { LocalKeyProvider, type PracticeScope, type ScopeClient, documentObjectKey, provisionPracticeKey } from '@tp/db/runtime';
import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import type { JobContext } from '../jobs/handlers';
import { MemorySealedBytes } from '../intake/test-support/memory-bytes';
import { DocumentStore } from '../storage/documents';
import { DocumentIntegrityError, parseHandler } from './job';

/**
 * The parse job's guards with an in-memory scope (parse.db.test.ts runs it against PostgreSQL): it
 * reads a document only from its own key under its practice's prefix, and leaves a document that is
 * not an 835 waiting for parse untouched.
 */

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const OTHER = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';

async function harness(row: Record<string, unknown>) {
  const keys = LocalKeyProvider.random();
  const key = await provisionPracticeKey(keys, PRACTICE);
  const queries: string[] = [];
  const lines: Record<string, unknown>[] = [];
  const client = {
    query: (text: string) => {
      queries.push(text);
      if (text.includes('FROM source_document d')) {
        return Promise.resolve({ rows: [row], rowCount: 1 });
      }
      if (text.startsWith('SELECT data_key_ref')) {
        return Promise.resolve({ rows: [{ data_key_ref: key.dataKeyRef }], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
    release: () => undefined,
  } as unknown as ScopeClient;
  const scope = { kind: 'job', client, actorId: DOCUMENT, actorKind: 'service', practiceIds: [PRACTICE], access: () => undefined } as unknown as PracticeScope<ScopeClient>;
  const context: JobContext = {
    jobId: DOCUMENT,
    logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
    transaction: (run) => run(scope),
    enqueue: () => Promise.resolve(null),
    lastAttempt: false,
  };
  const handler = parseHandler({ documents: new DocumentStore(new MemorySealedBytes()), keys });
  return { run: () => handler({ practice_id: PRACTICE, document_id: DOCUMENT }, context), queries, lines };
}

const waiting = { id: DOCUMENT, kind: 'x12_835', s3_key: documentObjectKey(PRACTICE, DOCUMENT), sha256: 'a'.repeat(64), status: 'scanned', reported: false };

describe('the parse job’s guards', () => {
  it('refuses to read a document from anywhere but its own key under its practice’s prefix', async () => {
    const { run } = await harness({ ...waiting, s3_key: documentObjectKey(OTHER, DOCUMENT) });
    await expect(run()).rejects.toThrow(DocumentIntegrityError);
  });

  it('leaves a document of another kind, or one already reported, as it is', async () => {
    for (const row of [{ ...waiting, kind: 'contract' }, { ...waiting, reported: true }, { ...waiting, status: 'loaded' }]) {
      const { run, queries, lines } = await harness(row);
      await run();
      expect(lines.map((line) => line.msg)).toEqual(['document was not waiting for parse']);
      expect(queries.some((text) => text.includes('parse_report (') || text.startsWith('UPDATE'))).toBe(false);
    }
  });
});
