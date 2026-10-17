import { PutObjectCommand } from '@aws-sdk/client-s3';
import { TextractPageReader } from '@tp/contracts';
import { KmsKeyProvider, LocalKeyProvider } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '../storage/documents';
import { LocalLanding, S3Landing } from './landing';
import { GuardDutyScanService, LocalScanService } from './scan';
import { S3TextractStaging, TEXTRACT_STAGING_PREFIX } from './textract-staging';
import { intakeServices } from './wiring';

describe('intake wiring', () => {
  it('uses a directory, the local scanner and the local key provider in development', () => {
    const services = intakeServices({ documents: { kind: 'local', dir: '/tmp/tp-documents' }, keys: { kind: 'local', masterKey: Buffer.alloc(32, 7) }, scanWaitMs: 1000 });
    expect(services.documents).toBeInstanceOf(DocumentStore);
    expect(services.documents.bytes).toBeInstanceOf(LocalSealedBytes);
    expect(services.landing).toBeInstanceOf(LocalLanding);
    expect(services.scan).toBeInstanceOf(LocalScanService);
    expect(services.keys).toBeInstanceOf(LocalKeyProvider);
    expect(services.scanWait).toEqual({ pollMs: 5000, timeoutMs: 1000 });
    expect(services.pages).toBeUndefined();
  });

  it('uses the documents bucket, GuardDuty’s result and KMS when deployed', () => {
    let built = 0;
    const services = intakeServices({ documents: { kind: 's3', bucket: 'tp-documents' }, keys: { kind: 'kms', keyId: 'alias/tp' }, scanWaitMs: 600_000 }, () => {
      built += 1;
      return { send: () => Promise.resolve({}) } as never;
    });
    expect(built).toBe(1);
    expect(services.documents.bytes).toBeInstanceOf(S3SealedBytes);
    expect(services.landing).toBeInstanceOf(S3Landing);
    expect(services.scan).toBeInstanceOf(GuardDutyScanService);
    expect(services.keys).toBeInstanceOf(KmsKeyProvider);
    expect(services.pages?.scans).toBeInstanceOf(TextractPageReader);
  });

  it('stages scanned documents for Textract in the documents bucket, under an opaque key in the textract prefix, written once', async () => {
    const sent: unknown[] = [];
    let staging: S3TextractStaging | undefined;
    intakeServices(
      { documents: { kind: 's3', bucket: 'tp-documents' }, keys: { kind: 'kms', keyId: 'alias/tp' }, scanWaitMs: 600_000 },
      () =>
        ({
          send: (command: unknown) => {
            sent.push(command);
            return Promise.resolve({});
          },
        }) as never,
      (given) => {
        staging = given;
        return { pageTexts: () => Promise.resolve([]) };
      },
    );
    expect(staging).toBeInstanceOf(S3TextractStaging);
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const staged = await staging?.stage(bytes, 'application/pdf');
    expect(staged?.bucket).toBe('tp-documents');
    expect(staged?.name).toMatch(/^textract\/[0-9a-f-]{36}$/);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(PutObjectCommand);
    expect((sent[0] as PutObjectCommand).input).toEqual({ Bucket: 'tp-documents', Key: staged?.name, Body: bytes, ContentLength: 4, ContentType: 'application/pdf', IfNoneMatch: '*' });
    expect(TEXTRACT_STAGING_PREFIX).toBe('textract/');
    const fixed = new S3TextractStaging({ client: { send: () => Promise.resolve({}) } as never, bucket: 'tp-documents', newId: () => '00000000-0000-4000-8000-000000000001' });
    expect((await fixed.stage(bytes, 'image/png')).name).toBe('textract/00000000-0000-4000-8000-000000000001');
  });
});
