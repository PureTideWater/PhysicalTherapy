import { randomUUID } from 'node:crypto';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { TextractStaging } from '@tp/contracts';

import { requireOpaqueKey } from '../storage/object-store';

/**
 * Where Textract reads a scanned contract, exhibit or letter (PRD 15, Documents: Textract for scanned
 * PDFs; docs/adr/0055). Textract reads only from S3, and the sealed original is ciphertext to it, so
 * intake puts the document's clean bytes, once its malware scan has passed, under a new random key in
 * the `textract/` prefix of the documents bucket: written once (If-None-Match), under the bucket's
 * SSE-KMS, the key opaque (a random ID, never the practice's or the document's). Nothing reads the
 * object again once Textract has; the bucket's lifecycle rule for the prefix expires it, its
 * noncurrent version and its delete marker within a day or two, since the application role deletes
 * nothing (infra/lib/constructs/storage.ts). Plaintext rests in S3 only under the intake and textract
 * prefixes, only that long, and only under SSE-KMS.
 */

/** The documents bucket's prefix for Textract's copies (TEXTRACT_STAGING_PREFIX in infra/lib/constructs/storage.ts). */
export const TEXTRACT_STAGING_PREFIX = 'textract/';

export class S3TextractStaging implements TextractStaging {
  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string; readonly newId?: () => string }) {}

  async stage(bytes: Uint8Array, contentType: string): Promise<{ readonly bucket: string; readonly name: string }> {
    const { client, bucket } = this.options;
    const name = requireOpaqueKey(`${TEXTRACT_STAGING_PREFIX}${(this.options.newId ?? randomUUID)()}`);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: name, Body: bytes, ContentLength: bytes.length, ContentType: contentType, IfNoneMatch: '*' }));
    return { bucket, name };
  }
}
