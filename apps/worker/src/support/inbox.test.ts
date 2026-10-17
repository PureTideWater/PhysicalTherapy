import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { MAX_LISTED, S3SupportInbox, SUPPORT_MAIL_PREFIX, mailRef } from './inbox';
import { MAX_MAIL_BYTES } from './mime';

describe('the S3 support inbox', () => {
  it('lists the messages SES wrote under its prefix, page by page, skipping its setup notice and folders', async () => {
    const sent: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        sent.push(command);
        if (command instanceof ListObjectsV2Command) {
          return Promise.resolve(
            command.input.ContinuationToken === undefined
              ? { Contents: [{ Key: 'inbound/AMAZON_SES_SETUP_NOTIFICATION', Size: 10 }, { Key: 'inbound/', Size: 0 }, { Key: 'inbound/one', Size: 120 }, {}], IsTruncated: true, NextContinuationToken: 'next' }
              : { Contents: [{ Key: 'inbound/two' }], IsTruncated: false },
          );
        }
        return Promise.reject(new Error('unexpected'));
      },
    };
    const inbox = new S3SupportInbox({ client: client as never, bucket: 'tp-support-mail' });
    expect(inbox.verifiesSenders).toBe(true);
    expect(await inbox.list()).toEqual([
      { ref: mailRef('inbound/one'), location: 'inbound/one', sizeBytes: 120 },
      { ref: mailRef('inbound/two'), location: 'inbound/two', sizeBytes: 0 },
    ]);
    expect(sent.map((command) => (command as ListObjectsV2Command).input)).toEqual([
      { Bucket: 'tp-support-mail', Prefix: SUPPORT_MAIL_PREFIX, ContinuationToken: undefined },
      { Bucket: 'tp-support-mail', Prefix: SUPPORT_MAIL_PREFIX, ContinuationToken: 'next' },
    ]);
    expect(mailRef('inbound/one')).toMatch(/^[0-9a-f]{64}$/);
    expect(mailRef('inbound/one')).not.toBe(mailRef('inbound/two'));
  });

  it('stops listing at its bound', async () => {
    const page = Array.from({ length: 1000 }, (_, index) => ({ Key: `inbound/${String(index)}`, Size: 1 }));
    const client = { send: () => Promise.resolve({ Contents: page, IsTruncated: true, NextContinuationToken: 'more' }) };
    expect(await new S3SupportInbox({ client: client as never, bucket: 'b' }).list()).toHaveLength(MAX_LISTED);
  });

  it('reads a message, and never one larger than the reader takes', async () => {
    const bytes = new Uint8Array([70, 114, 111, 109]);
    const reads: unknown[] = [];
    const client = {
      send: (command: unknown) => {
        reads.push(command);
        return Promise.resolve(
          command instanceof GetObjectCommand && command.input.Key === 'inbound/big' ? { Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(MAX_MAIL_BYTES + 1)) } } : command instanceof GetObjectCommand && command.input.Key === 'inbound/empty' ? {} : { Body: { transformToByteArray: () => Promise.resolve(bytes) } },
        );
      },
    };
    const inbox = new S3SupportInbox({ client: client as never, bucket: 'b' });
    expect(await inbox.read({ ref: mailRef('inbound/one'), location: 'inbound/one', sizeBytes: 4 })).toEqual(bytes);
    expect(await inbox.read({ ref: mailRef('inbound/empty'), location: 'inbound/empty', sizeBytes: 0 })).toEqual(new Uint8Array());
    expect(await inbox.read({ ref: mailRef('inbound/big'), location: 'inbound/big', sizeBytes: 10 })).toBeNull();
    expect(await inbox.read({ ref: mailRef('inbound/listed-big'), location: 'inbound/listed-big', sizeBytes: MAX_MAIL_BYTES + 1 })).toBeNull();
    expect(reads).toHaveLength(3);
  });
});
