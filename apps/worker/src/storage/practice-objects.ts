import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { PracticeCipher } from '@tp/db';

import { ObjectConflictError, ObjectKeyError, requireOpaqueKey } from './object-store';

/**
 * A practice's stored objects (documents, packets, exports): S3 server-side encryption with a
 * per-practice data key (PRD 15 Files; PRD 6 Intake: "server-side encryption with the practice's data
 * key"; PRD 16 Encryption: "data keys destroyed on deletion"), done in the application before the
 * bytes leave it (docs/adr/0018). Every object is sealed with the practice's cipher
 * (PracticeCipher.encryptObject: a key derived from the practice's data key, bound to the practice
 * and the object's key) and only then written; reading opens it with the same cipher. A cipher is
 * opened for one practice inside that practice's scope (loadPracticeCipher), so a job or request
 * can seal and open only its own practice's objects, and once destroyPracticeDataKey() has removed
 * the practice's key, none of its objects can be opened by anyone. The bucket's own SSE-KMS under the
 * environment key stays beneath this layer.
 *
 * Objects are written once: a key that exists is never overwritten (If-None-Match: * in S3, an
 * exclusive create locally), which keeps original documents immutable (PRD 6).
 */

/** Where the sealed bytes go: written once per key, read back whole. */
export interface ByteStore {
  /** Writes the bytes under a new key; an existing key is refused with ObjectConflictError. */
  putNew(key: string, body: Uint8Array): Promise<void>;
  /** The bytes under a key; an unknown key is an error (the records name only objects that exist). */
  get(key: string): Promise<Uint8Array>;
}

/** The content type every sealed object is stored with; the original type lives with its record. */
export const SEALED_CONTENT_TYPE = 'application/octet-stream';

export class PracticeObjectStore {
  constructor(private readonly bytes: ByteStore) {}

  /** Seals `body` with the practice's cipher and writes it under `key`, once. */
  async put(cipher: PracticeCipher, key: string, body: Uint8Array): Promise<void> {
    const opaque = requireOpaqueKey(key);
    await this.bytes.putNew(opaque, cipher.encryptObject(opaque, body));
  }

  /** Reads the object under `key` and opens it with the practice's cipher; another practice's cipher cannot. */
  async get(cipher: PracticeCipher, key: string): Promise<Buffer> {
    const opaque = requireOpaqueKey(key);
    return cipher.decryptObject(opaque, await this.bytes.get(opaque));
  }
}

/** Development and tests: one file per key under a root directory, created exclusively. */
export class LocalByteStore implements ByteStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    const file = path.resolve(this.root, requireOpaqueKey(key));
    if (!file.startsWith(`${this.root}${path.sep}`)) {
      throw new ObjectKeyError('object keys stay inside the store');
    }
    return file;
  }

  async putNew(key: string, body: Uint8Array): Promise<void> {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, body, { flag: 'wx', mode: 0o400 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ObjectConflictError('an object already exists under this key; stored objects are never replaced');
      }
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.file(key));
  }
}

function status(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode : undefined;
}

/**
 * Staging and production: an S3 bucket (documents or packets). Writes carry If-None-Match: *, which
 * the bucket policy also requires (infra/lib/constructs/storage.ts), so a key is never overwritten;
 * the bucket's default SSE-KMS applies beneath the practice's sealing.
 */
export class S3ByteStore implements ByteStore {
  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string }) {}

  async putNew(key: string, body: Uint8Array): Promise<void> {
    try {
      await this.options.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(key), Body: body, ContentType: SEALED_CONTENT_TYPE, IfNoneMatch: '*' }));
    } catch (error) {
      if (status(error) === 412) {
        throw new ObjectConflictError('an object already exists under this key; stored objects are never replaced');
      }
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array> {
    const output = await this.options.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(key) }));
    if (output.Body === undefined) {
      throw new ObjectKeyError('the object has no body');
    }
    return output.Body.transformToByteArray();
  }
}
