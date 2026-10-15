import { randomUUID } from 'node:crypto';
import { chmod, link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type ObjectStore, ObjectKeyError, type PutImmutableRequest, type PutOutcome, type StoredObject, compareExisting, requireOpaqueKey, sha256Hex } from './object-store';

/**
 * The development and test object store: one file per key under a root directory, created
 * atomically (written to a temporary name, then hard-linked into place, which fails if the key
 * exists), made read-only, with its retention date in a sidecar file. Local development has no
 * Object Lock; the write-once rule is enforced by this class, which is what the tests exercise.
 */
/** The retention date in a sidecar file; null when the sidecar is missing or unreadable. */
async function readRetention(sidecar: string): Promise<Date | null> {
  try {
    const parsed = JSON.parse(await readFile(sidecar, 'utf8')) as { retainUntil?: unknown };
    return typeof parsed.retainUntil === 'string' ? new Date(parsed.retainUntil) : null;
  } catch {
    return null;
  }
}

export class LocalObjectStore implements ObjectStore {
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

  async head(key: string): Promise<StoredObject | null> {
    const file = this.file(key);
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
    return { sha256: sha256Hex(body), retainUntil: await readRetention(`${file}.retention.json`) };
  }

  async putImmutable(request: PutImmutableRequest): Promise<PutOutcome> {
    const file = this.file(request.key);
    const sha256 = sha256Hex(request.body);
    const existing = await this.head(request.key);
    if (existing !== null) {
      return compareExisting(existing, sha256);
    }
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.partial`;
    await writeFile(temporary, request.body, { mode: 0o444 });
    try {
      await link(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      // Another writer got there first: same bytes is fine, anything else is refused.
      const raced = await this.head(request.key);
      return compareExisting(raced ?? { sha256: '', retainUntil: null }, sha256);
    } finally {
      await unlink(temporary);
    }
    await chmod(file, 0o444);
    await writeFile(`${file}.retention.json`, `${JSON.stringify({ retainUntil: request.retainUntil.toISOString(), contentType: request.contentType })}\n`, { flag: 'wx', mode: 0o444 });
    return 'written';
  }
}
