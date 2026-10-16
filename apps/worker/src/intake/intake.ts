import { createHash } from 'node:crypto';

import type { ReadPagesOptions } from '@tp/contracts/pages';
import { type DocumentKind, type DocumentStatus, type KeyProvider, type PracticeCipher, type PracticeScope, type ScopeClient, documentObjectKey, loadPracticeCipher } from '@tp/db/runtime';

import type { JobContext, JobHandler } from '../jobs/handlers';
import type { DocumentReader, DocumentStore, WrittenDocument } from '../storage/documents';
import { type Disposition, dispose } from './classify';
import type { LandedDocument, UploadLanding } from './landing';
import { PAGE_TEXT_KINDS, readAndStorePages, recordPageText } from './pages';
import { DEFAULT_SCAN_WAIT, type ScanService, type ScanWait, waitForVerdict } from './scan';
import { HEAD_BYTES, sniff } from './sniff';
import { type ZipEntry, type ZipInventory, ZIP_LIMITS, ZipEntryError, type ZipLimits, inspectZip, zipEntries } from './zip';

/**
 * The intake job (PRD 5, J4; PRD 6, Intake and documents; PRD 10, Pipeline steps 1 and 2; PRD 16,
 * Upload safety; test matrix PAR-06, PAR-27, PAR-28, PAR-30; docs/adr/0026). One job per upload,
 * queued by the web app when the browser reports its PUT complete, keyed by the document. In order:
 *
 * 1. The bytes have arrived (or nothing happens: the browser has not uploaded them).
 * 2. The malware scan's verdict is clean; anything else quarantines the document. Nothing reads past
 *    the first bytes before this.
 * 3. The original is left sealed under the document's own key, and its SHA-256 and size are computed
 *    from the bytes themselves; a size other than the one the upload declared is unreadable.
 * 4. Same bytes as an earlier document of the practice: this one is its duplicate, recorded and held,
 *    and nothing loads (PAR-06; concurrent uploads of the same bytes serialize on the hash, PAR-30).
 * 5. Content sniffing decides: a clean 835 is scanned and its parse_835 job queued (the document's ID
 *    is the job's idempotency subject); a clean document of another kind is stored; an executable or a
 *    script is quarantined (PAR-28); anything else is held with its reason.
 * 6. A zip is expanded entry by entry (zip.ts): each entry becomes its own document (parent_document_id
 *    the zip), sniffed from its first bytes before anything is written (an entry its first bytes hold,
 *    an executable or not an 835, is never copied out of the zip), then sealed under its own key,
 *    hashed, deduplicated and held or kept on its own, so a bad entry is held while the others continue
 *    (PAR-27). If any entry is an executable, a script or the EICAR file, the whole upload is
 *    quarantined and nothing is queued (PAR-28). Otherwise every clean 835 entry is queued for parse,
 *    and the zip is expanded.
 * 7. A clean contract, exhibit or payer letter (a top-level upload or a zip entry) has its page text
 *    read in a bounded thread and sealed beside it before it is stored (pages.ts; docs/adr/0033), so
 *    the web app cites pages from that text and never parses an uploaded document itself. A clean
 *    posting or EFT export, once stored, queues the reconcile step, which reads it (docs/adr/0042).
 *
 * Every step is idempotent, so a retried attempt resumes: an entry's document ID is derived from the
 * zip's ID and the entry's position, entries already decided are skipped, a sealed object already
 * written is hashed rather than written again, and parse jobs are keyed by their documents. A failure
 * on the last attempt marks the document failed (the job's own failure alerts the operator) so the
 * Uploads screen offers a retry.
 */

export interface IntakeServices {
  readonly documents: DocumentStore;
  readonly landing: UploadLanding;
  readonly scan: ScanService;
  readonly keys: KeyProvider;
  readonly zipLimits?: ZipLimits;
  readonly scanWait?: ScanWait;
  /** The page reader's limits and scan reader (defaults: PAGE_READ_LIMITS, no scan reader). */
  readonly pages?: ReadPagesOptions;
}

interface DocumentRow {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly s3_key: string;
  readonly content_type: string;
  readonly sha256: string | null;
  readonly size_bytes: string;
  readonly uploaded_by: string;
  readonly scan_status: string;
  readonly status: DocumentStatus;
  readonly parent_document_id: string | null;
}

const SELECT_DOCUMENT = 'SELECT id, kind, s3_key, content_type, sha256, size_bytes::text AS size_bytes, uploaded_by, scan_status, status, parent_document_id FROM source_document WHERE id = $1';

/** The statuses intake works on; every other one has been decided. */
const OPEN_STATUSES: ReadonlySet<DocumentStatus> = new Set(['awaiting_upload', 'received', 'scanned', 'failed']);

/** A zip entry's document ID: the same for the same zip and position on every attempt (UUID version 8). */
export function entryDocumentId(zipId: string, index: number): string {
  const hash = createHash('sha256').update(`${zipId}:entry:${String(index)}`).digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x80;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

type Scope = PracticeScope<ScopeClient>;

async function setStatus(scope: Scope, documentId: string, status: DocumentStatus): Promise<void> {
  await scope.client.query('UPDATE source_document SET status = $2 WHERE id = $1', [documentId, status]);
}

async function recordVerdict(scope: Scope, documentId: string, scanStatus: string, status?: DocumentStatus): Promise<void> {
  await scope.client.query('UPDATE source_document SET scan_status = $2, scan_at = now(), status = coalesce($3, status) WHERE id = $1', [documentId, scanStatus, status ?? null]);
}

/**
 * Records the document's SHA-256, or makes it the duplicate of the practice's first document with the
 * same bytes. Serialized per practice and hash, so two uploads of the same bytes at once give one first
 * and one duplicate (PAR-30).
 */
async function claimBytes(scope: Scope, practiceId: string, documentId: string, sha256: string): Promise<'first' | 'duplicate'> {
  await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))", [practiceId, sha256]);
  const { rows } = await scope.client.query<{ id: string }>(
    "SELECT id FROM source_document WHERE practice_id = $1 AND sha256 = $2 AND status <> 'duplicate' AND id <> $3 ORDER BY created_at, id LIMIT 1",
    [practiceId, sha256, documentId],
  );
  if (rows.length > 0) {
    await scope.client.query("UPDATE source_document SET sha256 = $2, status = 'duplicate' WHERE id = $1", [documentId, sha256]);
    return 'duplicate';
  }
  await scope.client.query('UPDATE source_document SET sha256 = $2 WHERE id = $1 AND sha256 IS NULL', [documentId, sha256]);
  return 'first';
}

/**
 * The first `length` bytes of a stream, and the whole stream again (those bytes included) to write, or
 * `close` to stop reading it. Holds at most the head and one chunk.
 */
async function peek(source: AsyncIterable<Buffer>, length: number): Promise<{ readonly head: Buffer; readonly whole: AsyncIterable<Buffer>; close(): Promise<void> }> {
  const iterator = source[Symbol.asyncIterator]();
  const buffered: Buffer[] = [];
  let read = 0;
  let ended = false;
  while (read < length) {
    const next = await iterator.next();
    if (next.done === true) {
      ended = true;
      break;
    }
    buffered.push(next.value);
    read += next.value.length;
  }
  const whole = async function* (): AsyncGenerator<Buffer> {
    yield* buffered;
    if (!ended) {
      for (let next = await iterator.next(); next.done !== true; next = await iterator.next()) {
        yield next.value;
      }
    }
  };
  return {
    head: Buffer.concat(buffered).subarray(0, length),
    whole: whole(),
    close: async () => {
      await iterator.return?.();
    },
  };
}

/** The disposition of a stored document, from its first bytes (and, for a zip, its directory). */
async function disposition(kind: DocumentKind, reader: DocumentReader, entry: boolean, limits: ZipLimits): Promise<{ disposition: Disposition; inventory?: ZipInventory; refusal?: DocumentStatus }> {
  const sniffed = sniff(await reader.read(0, Math.min(HEAD_BYTES, reader.sizeBytes)));
  if (sniffed.type !== 'zip') {
    return { disposition: dispose(kind, sniffed, { entry }) };
  }
  const inspection = await inspectZip(reader, limits);
  if (inspection.kind === 'refused') {
    // A workbook cannot be told apart from an unreadable zip once its directory is unreadable.
    return entry ? { disposition: { action: 'hold', status: 'nested_zip' } } : { disposition: { action: 'expand' }, refusal: inspection.reason };
  }
  return { disposition: dispose(kind, sniffed, { entry, spreadsheetZip: inspection.inventory.spreadsheet }), inventory: inspection.inventory };
}

class Intake {
  private readonly limits: ZipLimits;

  constructor(
    private readonly services: IntakeServices,
    private readonly context: JobContext,
    private readonly practiceId: string,
    private readonly cipher: PracticeCipher,
  ) {
    this.limits = services.zipLimits ?? ZIP_LIMITS;
  }

  private transaction<T>(run: (scope: Scope) => Promise<T>): Promise<T> {
    return this.context.transaction(run);
  }

  private async queueParse(documentId: string): Promise<void> {
    await this.context.enqueue('parse_835', { practice_id: this.practiceId, document_id: documentId });
  }

  /** Stores a clean document of another kind: a contract kind with its page text read first. */
  private async store(document: { readonly id: string; readonly kind: DocumentKind; readonly key: string; readonly contentType: string; readonly sizeBytes: number }): Promise<void> {
    const pages = PAGE_TEXT_KINDS.has(document.kind)
      ? await readAndStorePages(this.services.documents, this.cipher, { practiceId: this.practiceId, documentId: document.id, key: document.key, contentType: document.contentType, sizeBytes: document.sizeBytes }, this.services.pages)
      : null;
    await this.transaction(async (scope) => {
      if (pages !== null) {
        await recordPageText(scope, document.id, pages);
      }
      await setStatus(scope, document.id, 'stored');
    });
    if (document.kind === 'posting_export' || document.kind === 'eft_export') {
      // The recovery ledger reads a stored export into rows and matches them (docs/adr/0042).
      await this.context.enqueue('reconcile', { practice_id: this.practiceId, document_id: document.id });
    }
  }

  async takeIn(row: DocumentRow): Promise<void> {
    const landed: LandedDocument = { practiceId: this.practiceId, documentId: row.id, key: row.s3_key };
    const { landing, scan } = this.services;
    if (!(await landing.arrived(landed))) {
      this.context.logger.info('upload has not arrived; nothing to take in', { document_id: row.id });
      return;
    }
    if (row.status === 'awaiting_upload' || row.status === 'failed') {
      await this.transaction((scope) => setStatus(scope, row.id, 'received'));
    }
    if (row.scan_status !== 'clean') {
      const verdict = await waitForVerdict(scan, landing.scanSubject(this.cipher, landed), this.services.scanWait ?? DEFAULT_SCAN_WAIT);
      if (verdict.status === 'failed') {
        await this.transaction((scope) => recordVerdict(scope, row.id, 'failed'));
        throw new Error('the malware scan failed');
      }
      if (verdict.status !== 'clean') {
        await this.transaction((scope) => recordVerdict(scope, row.id, verdict.status, 'quarantined'));
        this.context.logger.warn('upload quarantined by the malware scan', { document_id: row.id, error_code: 'UPLOAD_QUARANTINED' });
        return;
      }
      await this.transaction((scope) => recordVerdict(scope, row.id, 'clean'));
    }
    const written = await landing.settle(this.cipher, landed);
    const claim = await this.transaction((scope) => claimBytes(scope, this.practiceId, row.id, written.sha256));
    if (claim === 'duplicate') {
      this.context.logger.info('upload is a duplicate of an earlier document', { document_id: row.id });
      return;
    }
    if (written.sizeBytes !== Number(row.size_bytes)) {
      await this.transaction((scope) => setStatus(scope, row.id, 'unreadable'));
      return;
    }
    const reader = await this.services.documents.open(this.cipher, row.s3_key);
    const decided = await disposition(row.kind, reader, false, this.limits);
    await this.carryOut(row, decided, reader);
  }

  private async carryOut(row: DocumentRow, decided: Awaited<ReturnType<typeof disposition>>, reader: DocumentReader): Promise<void> {
    const { disposition: next } = decided;
    switch (next.action) {
      case 'parse':
        await this.transaction((scope) => setStatus(scope, row.id, 'scanned'));
        await this.queueParse(row.id);
        return;
      case 'store':
        await this.store({ id: row.id, kind: row.kind, key: row.s3_key, contentType: row.content_type, sizeBytes: Number(row.size_bytes) });
        return;
      case 'hold':
        await this.transaction((scope) =>
          next.status === 'quarantined' ? recordVerdict(scope, row.id, 'flagged', 'quarantined') : setStatus(scope, row.id, next.status),
        );
        if (next.status === 'quarantined') {
          this.context.logger.warn('upload quarantined: an executable or a script', { document_id: row.id, error_code: 'UPLOAD_QUARANTINED' });
        }
        return;
      case 'expand':
        if (decided.refusal !== undefined || decided.inventory === undefined) {
          await this.transaction((scope) => setStatus(scope, row.id, decided.refusal ?? 'unreadable'));
          return;
        }
        await this.transaction((scope) => setStatus(scope, row.id, 'scanned'));
        await this.expand(row, reader, decided.inventory);
        return;
    }
  }

  /**
   * An entry's bytes sealed under its key, unless its first bytes hold it (an executable, a script, not
   * the declared kind, empty): then nothing is written and the hold is returned. A zip inside the zip is
   * written, so its directory can be read to tell a workbook from a nested zip.
   */
  private async sealUnlessHeld(kind: DocumentKind, key: string, entry: ZipEntry): Promise<WrittenDocument | Extract<Disposition, { action: 'hold' }>> {
    const opened = await peek(entry.open(), HEAD_BYTES);
    const sniffed = sniff(opened.head);
    const early = sniffed.type === 'zip' ? undefined : dispose(kind, sniffed, { entry: true });
    if (early?.action === 'hold') {
      await opened.close();
      return early;
    }
    return this.services.documents.write(this.cipher, key, opened.whole);
  }

  /** Each entry of the zip becomes its own document, one at a time; then the 835s are queued, or all is quarantined. */
  private async expand(zip: DocumentRow, reader: DocumentReader, inventory: ZipInventory): Promise<void> {
    const { documents } = this.services;
    let quarantined = false;
    for await (const entry of zipEntries(reader, inventory)) {
      const id = entryDocumentId(zip.id, entry.index);
      const key = documentObjectKey(this.practiceId, id);
      const existing = await this.transaction(async (scope) => (await scope.client.query<{ status: DocumentStatus }>('SELECT status FROM source_document WHERE id = $1', [id])).rows[0]);
      if (existing !== undefined && existing.status !== 'received') {
        quarantined ||= existing.status === 'quarantined';
        continue;
      }
      if (existing === undefined) {
        await this.transaction((scope) =>
          scope.client.query(
            `INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by, parent_document_id, status)
             VALUES ($1, $2, $3, $4, 'application/octet-stream', $5, $6, $7)`,
            [id, this.practiceId, zip.kind, entry.uncompressedBytes, zip.uploaded_by, zip.id, entry.hold ?? 'received'],
          ),
        );
      }
      if (entry.hold !== undefined) {
        continue;
      }
      let sealed: WrittenDocument | Extract<Disposition, { action: 'hold' }>;
      try {
        sealed = (await documents.exists(key)) ? await documents.digest(this.cipher, key) : await this.sealUnlessHeld(zip.kind, key, entry);
      } catch (error) {
        if (!(error instanceof ZipEntryError)) {
          throw error;
        }
        await this.transaction((scope) => setStatus(scope, id, 'unreadable'));
        continue;
      }
      if ('action' in sealed) {
        // Held by its first bytes, never written: quarantined (and the upload with it), or held with its reason.
        const held = sealed.status;
        await this.transaction((scope) => recordVerdict(scope, id, held === 'quarantined' ? 'flagged' : 'clean', held));
        quarantined ||= held === 'quarantined';
        continue;
      }
      const written = sealed;
      // The archive was scanned whole; each entry is then checked for its own signatures below.
      await this.transaction((scope) => recordVerdict(scope, id, 'clean'));
      if ((await this.transaction((scope) => claimBytes(scope, this.practiceId, id, written.sha256))) === 'duplicate') {
        continue;
      }
      const decided = await disposition(zip.kind, await documents.open(this.cipher, key), true, this.limits);
      const next = decided.disposition;
      const status: DocumentStatus = next.action === 'hold' ? next.status : next.action === 'parse' ? 'scanned' : 'stored';
      if (status === 'stored') {
        await this.store({ id, kind: zip.kind, key, contentType: 'application/octet-stream', sizeBytes: written.sizeBytes });
        continue;
      }
      await this.transaction((scope) => (status === 'quarantined' ? recordVerdict(scope, id, 'flagged', status) : setStatus(scope, id, status)));
      quarantined ||= status === 'quarantined';
    }
    if (quarantined) {
      // The whole upload is quarantined: nothing in it is parsed (PAR-28). A duplicate entry stays one.
      await this.transaction(async (scope) => {
        await scope.client.query("UPDATE source_document SET status = 'quarantined' WHERE parent_document_id = $1 AND status <> 'duplicate'", [zip.id]);
        await setStatus(scope, zip.id, 'quarantined');
      });
      this.context.logger.warn('zip quarantined: an entry is an executable or a script', { document_id: zip.id, error_code: 'UPLOAD_QUARANTINED' });
      return;
    }
    const ready = await this.transaction(async (scope) => (await scope.client.query<{ id: string }>("SELECT id FROM source_document WHERE parent_document_id = $1 AND status = 'scanned' ORDER BY id", [zip.id])).rows);
    for (const { id } of ready) {
      await this.queueParse(id);
    }
    await this.transaction((scope) => setStatus(scope, zip.id, 'expanded'));
  }
}

/** The intake job's handler. */
export function intakeHandler(services: IntakeServices): JobHandler<'intake'> {
  return async (payload, context) => {
    const practiceId = payload.practice_id;
    const opened = await context.transaction(async (scope) => {
      const row = (await scope.client.query<DocumentRow>(SELECT_DOCUMENT, [payload.document_id])).rows[0];
      return row === undefined ? undefined : { row, cipher: await loadPracticeCipher(scope, services.keys, practiceId) };
    });
    if (opened === undefined) {
      context.logger.warn('intake found no such document', { document_id: payload.document_id, error_code: 'DOCUMENT_NOT_FOUND' });
      return;
    }
    const { row, cipher } = opened;
    if (row.parent_document_id !== null || !OPEN_STATUSES.has(row.status)) {
      // A zip's entries are taken in with their zip; a decided document stays decided. (A scanned
      // document is still open: taking it in again re-queues its parse job, which its key keeps to one.)
      return;
    }
    try {
      await new Intake(services, context, practiceId, cipher).takeIn(row);
    } catch (error) {
      if (context.lastAttempt) {
        await context.transaction((scope) => setStatus(scope, row.id, 'failed'));
      }
      throw error;
    }
  };
}
