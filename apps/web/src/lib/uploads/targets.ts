import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { type PracticeCipher, documentIntakeKey, documentObjectKey } from '@tp/db/runtime';
import { type DocumentStore, ObjectConflictError } from '@tp/worker/documents';

import type { Sealer } from '../auth/seal';
import { UPLOAD_URL_SECONDS } from './limits';
import { type TokenSubject, uploadToken, validUploadToken } from './token';

/**
 * Where the browser sends an upload's bytes (PRD 5, J4: "the browser gets a pre-signed URL per file and
 * uploads straight to S3"; PRD 16, Upload safety; docs/adr/0018 and 0026).
 *
 * - S3UploadTargets (staging and production): a presigned PUT to the document's intake key in the
 *   documents bucket, signed with its content type, content length, If-None-Match: * and SSE-KMS under
 *   the environment key, valid for fifteen minutes. S3 refuses any other type, size, an overwrite or
 *   another encryption; GuardDuty scans the object there; the worker seals it into its own key.
 * - LocalUploadTargets (development and tests): the web app's own receiver route, with a signed
 *   short-lived token in place of the signature, which seals the bytes with the practice's data key as
 *   they arrive and writes them once under the document's key.
 *
 * URLs carry opaque IDs and signatures only (SEC-08).
 */

export interface UploadTarget {
  readonly method: 'PUT';
  readonly url: string;
  /** The headers the PUT must carry exactly (they are signed). */
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export interface UploadTargets {
  readonly kind: 'local' | 's3';
  /** A URL the browser can PUT the document's bytes to, once, as declared. */
  target(subject: TokenSubject, now: Date): Promise<UploadTarget>;
  /** Whether the document's bytes have arrived. */
  arrived(practiceId: string, documentId: string): Promise<boolean>;
  /** The local receiver, where uploads land in this server (development and tests). */
  readonly receiver?: LocalReceiver;
}

function status(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

export interface S3UploadTargetOptions {
  /**
   * A client that adds no checksum of its own (requestChecksumCalculation: 'WHEN_REQUIRED', as
   * presigningClient builds it): a default client would sign a checksum of the empty body, which the
   * browser's real bytes could never match.
   */
  readonly client: S3Client;
  readonly bucket: string;
  /** The environment's customer-managed key, which the bucket also uses by default. */
  readonly kmsKeyId: string;
}

/** The client S3UploadTargets presigns with. */
export function presigningClient(region?: string): S3Client {
  return new S3Client({ ...(region === undefined ? {} : { region }), requestChecksumCalculation: 'WHEN_REQUIRED' });
}

/** The headers a presigned PUT signs and the browser must send as headers. */
const SIGNED_HEADERS = new Set(['content-type', 'content-length', 'if-none-match', 'x-amz-server-side-encryption', 'x-amz-server-side-encryption-aws-kms-key-id']);

export class S3UploadTargets implements UploadTargets {
  readonly kind = 's3';

  constructor(private readonly options: S3UploadTargetOptions) {}

  async target(subject: TokenSubject, now: Date): Promise<UploadTarget> {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: documentIntakeKey(subject.practiceId, subject.documentId),
      ContentType: subject.contentType,
      ContentLength: subject.sizeBytes,
      IfNoneMatch: '*',
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: this.options.kmsKeyId,
    });
    const url = await getSignedUrl(this.options.client, command, {
      expiresIn: UPLOAD_URL_SECONDS,
      signingDate: now,
      signableHeaders: SIGNED_HEADERS,
      unhoistableHeaders: SIGNED_HEADERS,
    });
    return {
      method: 'PUT',
      url,
      // The browser sets Content-Length itself, from the file: S3 compares it with the signed one.
      headers: {
        'content-type': subject.contentType,
        'if-none-match': '*',
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': this.options.kmsKeyId,
      },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000),
    };
  }

  private async exists(key: string): Promise<boolean> {
    try {
      await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return true;
    } catch (error) {
      if (status(error) === 404) {
        return false;
      }
      throw error;
    }
  }

  async arrived(practiceId: string, documentId: string): Promise<boolean> {
    return (await this.exists(documentIntakeKey(practiceId, documentId))) || (await this.exists(documentObjectKey(practiceId, documentId)));
  }
}

/** The bytes were not the size the upload declared. */
export class UploadSizeError extends Error {
  override readonly name = 'UploadSizeError';
}

/** Passes at most `size` bytes, and fails if the stream ends short of them. */
async function* exactly(source: AsyncIterable<Uint8Array>, size: number): AsyncGenerator<Uint8Array> {
  let seen = 0;
  for await (const part of source) {
    seen += part.length;
    if (seen > size) {
      throw new UploadSizeError('the upload is larger than it declared');
    }
    yield part;
  }
  if (seen !== size) {
    throw new UploadSizeError('the upload ended before its declared size');
  }
}

/** The local upload receiver: seals the bytes as they arrive and writes them once. */
export class LocalReceiver {
  constructor(
    private readonly documents: DocumentStore,
    private readonly sealer: Sealer,
  ) {}

  /** Whether `token` authorizes this document's upload as declared, now. */
  authorizes(subject: TokenSubject, token: string, now: Date): boolean {
    return validUploadToken(this.sealer, subject, token, now);
  }

  /**
   * Stores the document's bytes, sealed under its key: 'stored', or 'already' when they were stored
   * by an earlier PUT (the first one stays; originals are never replaced).
   */
  async receive(cipher: PracticeCipher, subject: TokenSubject, body: AsyncIterable<Uint8Array>): Promise<'stored' | 'already'> {
    const key = documentObjectKey(subject.practiceId, subject.documentId);
    if (await this.documents.exists(key)) {
      return 'already';
    }
    try {
      await this.documents.write(cipher, key, exactly(body, subject.sizeBytes));
      return 'stored';
    } catch (error) {
      if (error instanceof ObjectConflictError) {
        return 'already';
      }
      throw error;
    }
  }
}

export class LocalUploadTargets implements UploadTargets {
  readonly kind = 'local';
  readonly receiver: LocalReceiver;

  constructor(
    private readonly origin: string,
    private readonly documents: DocumentStore,
    private readonly sealer: Sealer,
  ) {
    this.receiver = new LocalReceiver(documents, sealer);
  }

  target(subject: TokenSubject, now: Date): Promise<UploadTarget> {
    const expiresAt = new Date(now.getTime() + UPLOAD_URL_SECONDS * 1000);
    const url = new URL(`/p/${subject.practiceId}/uploads/${subject.documentId}/content`, this.origin);
    url.searchParams.set('token', uploadToken(this.sealer, subject, expiresAt));
    url.searchParams.set('request_key', randomUUID());
    return Promise.resolve({ method: 'PUT', url: url.toString(), headers: { 'content-type': subject.contentType }, expiresAt });
  }

  arrived(practiceId: string, documentId: string): Promise<boolean> {
    return this.documents.exists(documentObjectKey(practiceId, documentId));
  }
}
