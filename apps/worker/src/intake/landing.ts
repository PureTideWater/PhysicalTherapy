import { GetObjectCommand, HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { type PracticeCipher, documentIntakeKey } from '@tp/db/runtime';

import { type DocumentStore, type WrittenDocument, collect } from '../storage/documents';
import { ObjectConflictError, ObjectKeyError, requireOpaqueKey } from '../storage/object-store';
import type { ScanSubject } from './scan';

/**
 * Where the browser's bytes land, and how the intake job takes them in (PRD 10, Pipeline step 1;
 * docs/adr/0018 and 0026).
 *
 * - S3 (staging and production): the browser PUTs the original to the document's intake key through
 *   a presigned URL (content type and length signed, SSE-KMS, If-None-Match). GuardDuty scans it
 *   there. Once the scan is clean the job seals it into the document's own key with the practice's
 *   data key, computing its SHA-256 on the way. The intake copy is never read again; the bucket's
 *   intake lifecycle rule expires it, and its noncurrent version, within a day or two (the
 *   application role deletes nothing, infra/lib/constructs/storage.ts), so plaintext rests in S3
 *   only under intake keys, only that long, and only under the bucket's SSE-KMS.
 * - Local (development and tests): the web app's upload receiver seals the bytes into the document's
 *   own key as they arrive; the job reads them back to hash them.
 */

/** The document as the intake job knows it. */
export interface LandedDocument {
  readonly practiceId: string;
  readonly documentId: string;
  /** The document's own key (source_document.s3_key). */
  readonly key: string;
}

export interface UploadLanding {
  readonly kind: 'local' | 's3';
  /** Whether the upload's bytes have arrived (or already sit sealed under the document's key). */
  arrived(document: LandedDocument): Promise<boolean>;
  /** What the malware scanner examines. */
  scanSubject(cipher: PracticeCipher, document: LandedDocument): ScanSubject;
  /**
   * Leaves the original sealed under the document's key and returns its SHA-256 and size, computed
   * server-side from the bytes themselves. Idempotent: a retry after a crash finds the sealed copy.
   */
  settle(cipher: PracticeCipher, document: LandedDocument): Promise<WrittenDocument>;
}

/** The S3 key a browser uploads a document to, before the scan: opaque, inside the intake prefix. */
export function intakeKey(practiceId: string, documentId: string): string {
  return requireOpaqueKey(documentIntakeKey(practiceId, documentId));
}

/** Development and tests: the bytes arrived sealed under the document's key. */
export class LocalLanding implements UploadLanding {
  readonly kind = 'local';

  constructor(private readonly documents: DocumentStore) {}

  arrived(document: LandedDocument): Promise<boolean> {
    return this.documents.exists(document.key);
  }

  scanSubject(cipher: PracticeCipher, document: LandedDocument): ScanSubject {
    return {
      landingKey: document.key,
      head: async (bytes) => {
        const reader = await this.documents.open(cipher, document.key);
        return reader.read(0, Math.min(bytes, reader.sizeBytes));
      },
    };
  }

  settle(cipher: PracticeCipher, document: LandedDocument): Promise<WrittenDocument> {
    return this.documents.digest(cipher, document.key);
  }
}

function status(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

/** Staging and production: the intake key in the documents bucket. */
export class S3Landing implements UploadLanding {
  readonly kind = 's3';

  constructor(
    private readonly documents: DocumentStore,
    private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string },
  ) {}

  private async intakeExists(document: LandedDocument): Promise<boolean> {
    try {
      await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: intakeKey(document.practiceId, document.documentId) }));
      return true;
    } catch (error) {
      if (status(error) === 404) {
        return false;
      }
      throw error;
    }
  }

  private async *intakeBytes(document: LandedDocument, range?: { readonly start: number; readonly end: number }): AsyncGenerator<Uint8Array> {
    const output = await this.options.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: intakeKey(document.practiceId, document.documentId),
        ...(range === undefined ? {} : { Range: `bytes=${String(range.start)}-${String(range.end - 1)}` }),
      }),
    );
    if (output.Body === undefined) {
      throw new ObjectKeyError('the upload has no body');
    }
    yield* output.Body as unknown as AsyncIterable<Uint8Array>;
  }

  async arrived(document: LandedDocument): Promise<boolean> {
    return (await this.intakeExists(document)) || (await this.documents.exists(document.key));
  }

  scanSubject(_cipher: PracticeCipher, document: LandedDocument): ScanSubject {
    return {
      landingKey: intakeKey(document.practiceId, document.documentId),
      head: (bytes) => collect(this.intakeBytes(document, { start: 0, end: bytes })),
    };
  }

  async settle(cipher: PracticeCipher, document: LandedDocument): Promise<WrittenDocument> {
    if (await this.documents.exists(document.key)) {
      // Sealed by an earlier attempt.
      return this.documents.digest(cipher, document.key);
    }
    try {
      return await this.documents.write(cipher, document.key, this.intakeBytes(document));
    } catch (error) {
      if (!(error instanceof ObjectConflictError)) {
        throw error;
      }
      return this.documents.digest(cipher, document.key);
    }
  }
}
