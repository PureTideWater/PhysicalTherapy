import { S3Client } from '@aws-sdk/client-s3';
import { type ScannedPageReader, createTextractPageReader } from '@tp/contracts';
import { type KeyProvider, LocalKeyProvider, createKmsKeyProvider } from '@tp/db/runtime';

import type { IntakeConfig } from '../config';
import { DocumentStore, LocalSealedBytes, S3SealedBytes } from '../storage/documents';
import type { IntakeServices } from './intake';
import { LocalLanding, S3Landing } from './landing';
import { DEFAULT_SCAN_WAIT, GuardDutyScanService, LocalScanService } from './scan';
import { S3TextractStaging } from './textract-staging';

/**
 * The intake job's services from its configuration: S3, GuardDuty, Textract for scanned pages and KMS
 * when deployed, or their local stand-ins (no scan reader: a page with no text layer stays empty, and
 * an image is an unsupported document).
 */
export function intakeServices(
  config: IntakeConfig,
  s3: () => S3Client = () => new S3Client({}),
  scans: (staging: S3TextractStaging) => ScannedPageReader = createTextractPageReader,
): IntakeServices {
  const keys: KeyProvider = config.keys.kind === 'kms' ? createKmsKeyProvider(config.keys.keyId) : new LocalKeyProvider(config.keys.masterKey);
  const scanWait = { pollMs: DEFAULT_SCAN_WAIT.pollMs, timeoutMs: config.scanWaitMs };
  if (config.documents.kind === 's3') {
    const client = s3();
    const documents = new DocumentStore(new S3SealedBytes({ client, bucket: config.documents.bucket }));
    return {
      documents,
      keys,
      scanWait,
      landing: new S3Landing(documents, { client, bucket: config.documents.bucket }),
      scan: new GuardDutyScanService({ client, bucket: config.documents.bucket }),
      pages: { scans: scans(new S3TextractStaging({ client, bucket: config.documents.bucket })) },
    };
  }
  const documents = new DocumentStore(new LocalSealedBytes(config.documents.dir));
  return { documents, keys, scanWait, landing: new LocalLanding(documents), scan: new LocalScanService() };
}
