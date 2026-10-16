import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

/**
 * The signed copies of agreements a platform administrator uploads (PRD 6, Agreements: "Store signed documents by
 * reference and SHA-256"; milestone 11: "recorded ... by upload with hash"; docs/adr/0053). An agreement is no PHI
 * and names no patient, so it is not sealed with a practice's key: in staging and production it is written once
 * to the documents bucket under agreements/ (the bucket's customer-managed key, If-None-Match so nothing is ever
 * replaced); locally, to a directory. The key is opaque (the organization's and the agreement's IDs).
 */

export interface AgreementDocuments {
  /** Writes the document once; an existing key is refused. */
  putNew(key: string, bytes: Uint8Array): Promise<void>;
}

export class AgreementDocumentError extends Error {
  override readonly name = 'AgreementDocumentError';
}

const KEY = /^agreements\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;

/** The key an uploaded agreement is kept under. */
export function agreementDocumentKey(organizationId: string, agreementId: string): string {
  const key = `agreements/${organizationId}/${agreementId}.pdf`;
  if (!KEY.test(key)) {
    throw new AgreementDocumentError('an agreement document is kept under opaque IDs');
  }
  return key;
}

export class LocalAgreementDocuments implements AgreementDocuments {
  constructor(private readonly directory: string) {}

  async putNew(key: string, bytes: Uint8Array): Promise<void> {
    if (!KEY.test(key)) {
      throw new AgreementDocumentError('not an agreement document key');
    }
    const file = path.join(this.directory, key);
    await mkdir(path.dirname(file), { recursive: true }).catch(() => {
      throw new AgreementDocumentError('the agreement document could not be stored');
    });
    const handle = await open(file, 'wx', 0o600).catch((error: unknown) => {
      throw new AgreementDocumentError((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'an agreement document is written once' : 'the agreement document could not be stored');
    });
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }
}

export class S3AgreementDocuments implements AgreementDocuments {
  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string; readonly kmsKeyId: string }) {}

  async putNew(key: string, bytes: Uint8Array): Promise<void> {
    if (!KEY.test(key)) {
      throw new AgreementDocumentError('not an agreement document key');
    }
    await this.options.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: bytes,
        ContentType: 'application/pdf',
        IfNoneMatch: '*',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: this.options.kmsKeyId,
        ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
      }),
    );
  }
}

/** The most an uploaded agreement may be. */
export const MAX_AGREEMENT_BYTES = 10 * 1024 * 1024;

/** Reads an upload whole (an agreement is small) and its SHA-256, refusing more than the limit. */
export async function readAgreementUpload(body: AsyncIterable<Uint8Array>): Promise<{ readonly bytes: Uint8Array; readonly sha256: string }> {
  const hash = createHash('sha256');
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of body) {
    size += part.length;
    if (size > MAX_AGREEMENT_BYTES) {
      throw new AgreementDocumentError('an agreement document is at most 10 MB');
    }
    hash.update(part);
    parts.push(part);
  }
  return { bytes: Buffer.concat(parts), sha256: hash.digest('hex') };
}

/** Whether the bytes are a PDF (its header), the one format agreements are signed in. */
export function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString('latin1') === '%PDF-';
}
