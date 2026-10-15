import { HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import { type ObjectStore, type PutImmutableRequest, type PutOutcome, type StoredObject, compareExisting, requireOpaqueKey, sha256Hex } from './object-store';

/**
 * The staging and production object store: S3 with Object Lock. In production the mode is
 * COMPLIANCE, so no one, the account root included, can delete or overwrite an object before its
 * retention date; staging and dev hold synthetic copies under GOVERNANCE (docs/adr/0012). Each write
 * carries its SHA-256 (checked by S3 on arrival and kept as metadata) and refuses to replace an
 * existing key (If-None-Match: *). Encryption is the bucket's default, SSE-KMS under the
 * environment's customer-managed key; naming aws:kms without a key ID would pick the AWS-managed key
 * instead, so the header is sent only with an explicit key. The bucket itself (versioning, Object
 * Lock, default retention, key) is created by infra/.
 */
export interface S3ObjectLockStoreOptions {
  readonly client: Pick<S3Client, 'send'>;
  readonly bucket: string;
  /** COMPLIANCE in production, GOVERNANCE in staging and dev (the bucket's default mode). */
  readonly lockMode: 'COMPLIANCE' | 'GOVERNANCE';
  /** A customer-managed key other than the bucket default; omit to use the default. */
  readonly kmsKeyId?: string;
}

function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return metadata?.httpStatusCode;
}

export class S3ObjectLockStore implements ObjectStore {
  constructor(private readonly options: S3ObjectLockStoreOptions) {}

  async head(key: string): Promise<StoredObject | null> {
    try {
      const output = await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(key), ChecksumMode: 'ENABLED' }));
      const fromMetadata = output.Metadata?.sha256;
      const fromChecksum = output.ChecksumSHA256 === undefined ? undefined : Buffer.from(output.ChecksumSHA256, 'base64').toString('hex');
      return { sha256: fromMetadata ?? fromChecksum ?? '', retainUntil: output.ObjectLockRetainUntilDate ?? null };
    } catch (error) {
      if (status(error) === 404) {
        return null;
      }
      throw error;
    }
  }

  async putImmutable(request: PutImmutableRequest): Promise<PutOutcome> {
    const key = requireOpaqueKey(request.key);
    const sha256 = sha256Hex(request.body);
    const existing = await this.head(key);
    if (existing !== null) {
      return compareExisting(existing, sha256);
    }
    try {
      await this.options.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
          Body: request.body,
          ContentType: request.contentType,
          ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
          Metadata: { sha256 },
          IfNoneMatch: '*',
          ObjectLockMode: this.options.lockMode,
          ObjectLockRetainUntilDate: request.retainUntil,
          ...(this.options.kmsKeyId === undefined ? {} : { ServerSideEncryption: 'aws:kms', SSEKMSKeyId: this.options.kmsKeyId }),
        }),
      );
    } catch (error) {
      // 412: another writer created the key between the HEAD and the PUT.
      if (status(error) !== 412) {
        throw error;
      }
      const raced = await this.head(key);
      return compareExisting(raced ?? { sha256: '', retainUntil: null }, sha256);
    }
    return 'written';
  }
}
