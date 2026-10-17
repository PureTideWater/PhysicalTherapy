import { createHash } from 'node:crypto';

import type { PracticeCipher, PracticeScope, ScopeClient } from '@tp/db/runtime';

import { type ExportPaymentLoad, loadExportPayment, lockTrace } from '../loader';
import { ERA_EXPORT_MAX_BYTES, type EraExportNormalized } from './normalize';

/**
 * Reading and loading an ERA export for the parse job (docs/adr/0060). The job reads the sealed document once,
 * hashing every byte to check it against intake's SHA-256 and keeping at most ERA_EXPORT_MAX_BYTES of it for the
 * normalizer (a larger export is held whole as export_too_large and never parsed); then, inside the document's one
 * transaction, each loadable payment is loaded through the 835 loader's write path (loader.ts loadExportPayment),
 * and the report and the document's status are written with them.
 */

export interface ReadExport {
  /** SHA-256 of every byte of the document. */
  readonly sha256: string;
  /** The document's bytes, or null when it is larger than the normalizer reads. */
  readonly bytes: Uint8Array | null;
}

/** Reads a document's chunks: its hash over every byte, and its bytes when they are within `limit`. */
export async function readEraExport(chunks: AsyncIterable<Uint8Array>, limit: number = ERA_EXPORT_MAX_BYTES): Promise<ReadExport> {
  const hash = createHash('sha256');
  const kept: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks) {
    hash.update(chunk);
    size += chunk.byteLength;
    if (size <= limit) {
      kept.push(chunk);
    }
  }
  return { sha256: hash.digest('hex'), bytes: size > limit ? null : new Uint8Array(Buffer.concat(kept)) };
}

/** The held result of an export too large to read. */
export const TOO_LARGE: EraExportNormalized = { kind: 'held', reasons: [{ reason: 'export_too_large', column: null, row: null, payment: null }] };

export interface ExportLoadContext {
  readonly scope: PracticeScope<ScopeClient>;
  readonly cipher: PracticeCipher;
  readonly practiceId: string;
  readonly documentId: string;
}

/**
 * Loads each loadable payment, in file order, inside the caller's transaction; what each became, by its position.
 * The traces' locks are taken first, in sorted order, so two exports sharing traces never wait on each other in a
 * cycle; each payment's load then takes its own lock again, which its transaction already holds.
 */
export async function loadEraExport(context: ExportLoadContext, normalized: EraExportNormalized): Promise<Map<number, ExportPaymentLoad>> {
  const results = new Map<number, ExportPaymentLoad>();
  if (normalized.kind === 'held') {
    return results;
  }
  const loadable = normalized.payments.filter((payment) => payment.kind === 'loadable');
  for (const trace of [...new Set(loadable.map((payment) => payment.plan.remittance.trn02))].sort()) {
    await lockTrace(context.scope.client, context.practiceId, trace);
  }
  for (const payment of loadable) {
    results.set(payment.position, await loadExportPayment(context, payment.plan));
  }
  return results;
}
