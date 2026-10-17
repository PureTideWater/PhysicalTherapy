import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { LocalKeyProvider, type PracticeScope, type ScopeClient, provisionPracticeKey } from '@tp/db/runtime';
import { type CodeListProvider, inCodeSet } from '@tp/edi835';
import { describe, expect, it } from 'vitest';

import { TOO_LARGE, loadEraExport, readEraExport } from './load';
import { type LoadableEraPayment, normalizeEraExport } from './normalize';

/**
 * Reading an ERA export for the normalizer and loading its payments (load.ts), with an in-memory scope:
 * era-intake.db.test.ts runs the same path against PostgreSQL.
 */

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DOCUMENT = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';
const EARLIER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c04';
const EMR = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic/emr');
const KNOWN_CODES: CodeListProvider = { release: null, has: (list, code) => list === 'carc' || list === 'rarc' || inCodeSet(list, code) };

describe('reading an export for the normalizer', () => {
  it('hashes every byte, and keeps the bytes only within the limit', async () => {
    const chunks = [Buffer.from('a,b\r\n'), Buffer.from('1,2\r\n')];
    const sha = createHash('sha256').update(Buffer.concat(chunks)).digest('hex');
    expect(await readEraExport(Readable.from(chunks), 10)).toEqual({ sha256: sha, bytes: new Uint8Array(Buffer.concat(chunks)) });
    expect(await readEraExport(Readable.from(chunks), 9)).toEqual({ sha256: sha, bytes: null });
    expect(TOO_LARGE).toEqual({ kind: 'held', reasons: [{ reason: 'export_too_large', column: null, row: null, payment: null }] });
  });
});

describe('loading an export’s payments', () => {
  it('takes every trace’s lock first, in sorted order, then loads each payment in file order', async () => {
    // Raintree's rows, the payments reversed so that file order is not trace order.
    const lines = readFileSync(path.join(EMR, 'raintree_era_v0', 'era-export.csv'), 'utf8').trimEnd().split('\n');
    const bytes = new TextEncoder().encode(`${[lines[0], ...lines.slice(1).reverse()].join('\n')}\n`);
    const normalized = normalizeEraExport({ bytes, formatId: 'raintree_era_v0', codeLists: KNOWN_CODES });
    const payments = normalized.kind === 'payments' ? normalized.payments.filter((payment): payment is LoadableEraPayment => payment.kind === 'loadable') : [];
    expect(payments).toHaveLength(7);
    const queries: { readonly text: string; readonly values: readonly unknown[] }[] = [];
    // Every payment is already held from an 835, so each load reads its trace and writes nothing.
    const client = {
      query: (text: string, values: readonly unknown[] = []) => {
        queries.push({ text, values });
        const payment = payments.find((item) => item.plan.remittance.trn02 === values[1]);
        if (text.includes('FROM remittance WHERE practice_id = $1 AND trn02 = $2') && payment !== undefined) {
          const r = payment.plan.remittance;
          const row = { id: EARLIER, source_document_id: DOCUMENT, provenance: 'x12_835', payee_npi: r.payeeId, trn02: r.trn02, bpr_credit_debit: r.creditDebit, bpr02_cents: r.bpr02Cents.toString(), bpr16_date: r.bpr16Date };
          return Promise.resolve({ rows: [row], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
      release: () => undefined,
    } as unknown as ScopeClient;
    const scope = { kind: 'job', client, actorId: DOCUMENT, actorKind: 'service', practiceIds: [PRACTICE], access: () => undefined } as unknown as PracticeScope<ScopeClient>;
    const { cipher } = await provisionPracticeKey(LocalKeyProvider.random(), PRACTICE);
    const results = await loadEraExport({ scope, cipher, practiceId: PRACTICE, documentId: DOCUMENT }, normalized);
    const traces = payments.map((payment) => payment.plan.remittance.trn02);
    const locks = queries.filter((query) => query.text.includes('pg_advisory_xact_lock')).map((query) => query.values[1]);
    // The sorted locks first, then each payment's own, in file order.
    expect(locks).toEqual([...[...traces].sort(), ...traces]);
    expect(traces).not.toEqual([...traces].sort());
    expect(queries.slice(0, 7).every((query) => query.text.includes('pg_advisory_xact_lock'))).toBe(true);
    expect([...results.keys()]).toEqual(payments.map((payment) => payment.position));
    expect(new Set([...results.values()].map((result) => JSON.stringify(result)))).toEqual(
      new Set([JSON.stringify({ kind: 'duplicate', remittanceId: EARLIER, documentId: DOCUMENT, provenance: 'x12_835' })]),
    );
    expect(queries.some((query) => query.text.startsWith('INSERT'))).toBe(false);
  });

  it('loads nothing, and takes no lock, for an export held whole', async () => {
    const queries: string[] = [];
    const client = { query: (text: string) => (queries.push(text), Promise.resolve({ rows: [], rowCount: 0 })), release: () => undefined } as unknown as ScopeClient;
    const scope = { kind: 'job', client, actorId: DOCUMENT, actorKind: 'service', practiceIds: [PRACTICE], access: () => undefined } as unknown as PracticeScope<ScopeClient>;
    const { cipher } = await provisionPracticeKey(LocalKeyProvider.random(), PRACTICE);
    expect((await loadEraExport({ scope, cipher, practiceId: PRACTICE, documentId: DOCUMENT }, TOO_LARGE)).size).toBe(0);
    expect(queries).toEqual([]);
  });
});
