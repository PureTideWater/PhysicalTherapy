import { KmsKeyProvider, LocalKeyProvider } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '../storage/documents';
import { LocalLanding, S3Landing } from './landing';
import { GuardDutyScanService, LocalScanService } from './scan';
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
  });
});
