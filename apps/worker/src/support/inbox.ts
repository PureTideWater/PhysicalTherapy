import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import { GetObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';

import { MAX_MAIL_BYTES } from './mime';

/**
 * Where mail to the support address waits for the support_mail job (docs/adr/0055).
 *
 * - S3 (staging and production): Amazon SES receives the mail and writes each message under `inbound/` in the
 *   support mail bucket (infra/lib/constructs/support-mail.ts), where a lifecycle rule expires it after a week. The
 *   job lists and reads it as the operator role; nothing else reads the bucket, and nothing writes it but SES.
 * - Local (development and the tests): a directory of `.eml` files, the stand-in for the bucket. Nothing verifies
 *   its senders, so it is refused in production (apps/worker/src/config.ts).
 *
 * A message is named to the database by mail_ref, the SHA-256 of where the inbox holds it, never by its sender or
 * its subject.
 */

export interface InboxMessage {
  /** The SHA-256 of the message's place in the inbox. */
  readonly ref: string;
  /** Its place: the S3 key or the file name. Never logged or stored. */
  readonly location: string;
  readonly sizeBytes: number;
}

export interface SupportInbox {
  readonly kind: 's3' | 'local';
  /** Whether the inbox's receiving service verifies senders (SES); the local directory does not. */
  readonly verifiesSenders: boolean;
  /** The messages waiting, at most MAX_LISTED (a week of support mail is far fewer). */
  list(): Promise<InboxMessage[]>;
  /** A message's bytes; null when it is larger than MAX_MAIL_BYTES (it is not read). */
  read(message: InboxMessage): Promise<Uint8Array | null>;
}

export function mailRef(location: string): string {
  return createHash('sha256').update(`support-mail:${location}`).digest('hex');
}

/** The most messages one run lists. */
export const MAX_LISTED = 5000;

/** The prefix SES writes messages under (SUPPORT_MAIL_PREFIX in infra/lib/constructs/support-mail.ts). */
export const SUPPORT_MAIL_PREFIX = 'inbound/';

export class S3SupportInbox implements SupportInbox {
  readonly kind = 's3';
  readonly verifiesSenders = true;

  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string }) {}

  async list(): Promise<InboxMessage[]> {
    const found: InboxMessage[] = [];
    let token: string | undefined;
    do {
      const page = await this.options.client.send(new ListObjectsV2Command({ Bucket: this.options.bucket, Prefix: SUPPORT_MAIL_PREFIX, ContinuationToken: token }));
      for (const object of page.Contents ?? []) {
        // SES writes an object to prove it may (AMAZON_SES_SETUP_NOTIFICATION): not a message.
        if (object.Key !== undefined && !object.Key.endsWith('/') && !object.Key.endsWith('AMAZON_SES_SETUP_NOTIFICATION')) {
          found.push({ ref: mailRef(object.Key), location: object.Key, sizeBytes: object.Size ?? 0 });
        }
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined && found.length < MAX_LISTED);
    return found.slice(0, MAX_LISTED);
  }

  async read(message: InboxMessage): Promise<Uint8Array | null> {
    if (message.sizeBytes > MAX_MAIL_BYTES) {
      return null;
    }
    const output = await this.options.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: message.location }));
    const bytes = output.Body === undefined ? new Uint8Array() : await output.Body.transformToByteArray();
    return bytes.byteLength > MAX_MAIL_BYTES ? null : bytes;
  }
}

export class LocalSupportInbox implements SupportInbox {
  readonly kind = 'local';
  readonly verifiesSenders = false;

  constructor(private readonly dir: string) {}

  async list(): Promise<InboxMessage[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const messages: InboxMessage[] = [];
    for (const name of names
      .filter((item) => item.endsWith('.eml'))
      .sort()
      .slice(0, MAX_LISTED)) {
      messages.push({ ref: mailRef(name), location: name, sizeBytes: (await stat(path.join(this.dir, name))).size });
    }
    return messages;
  }

  async read(message: InboxMessage): Promise<Uint8Array | null> {
    if (message.sizeBytes > MAX_MAIL_BYTES) {
      return null;
    }
    const bytes = await readFile(path.join(this.dir, path.basename(message.location)));
    return bytes.byteLength > MAX_MAIL_BYTES ? null : bytes;
  }
}
