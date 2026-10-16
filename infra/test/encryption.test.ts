import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS } from '../lib/environments';
import { allResources, getAtt, keyId, onlyResource, propertiesOf, resourcesOf, templateFor } from './synth';

/**
 * PRD 16, encryption: "RDS encryption; S3 server-side encryption with per-practice data keys under a
 * customer-managed KMS key; key rotation yearly". Evidence: these CDK assertions. The per-practice
 * layer is the application's (docs/adr/0018): every object it stores is sealed with a key derived
 * from its practice's data key, which only KMS with that practice's encryption context unwraps
 * (application-role.test.ts); S3's SSE-KMS under the environment key is the layer beneath.
 */

/** Every resource type in the stacks that stores data at rest, and where it names its key. */
const KEY_PROPERTY: Record<string, (properties: Record<string, unknown>) => unknown> = {
  'AWS::S3::Bucket': (p) =>
    (p.BucketEncryption as { ServerSideEncryptionConfiguration: { ServerSideEncryptionByDefault: { KMSMasterKeyID: unknown } }[] })
      .ServerSideEncryptionConfiguration[0]?.ServerSideEncryptionByDefault.KMSMasterKeyID,
  'AWS::RDS::DBInstance': (p) => p.KmsKeyId,
  'AWS::SecretsManager::Secret': (p) => p.KmsKeyId,
  'AWS::SNS::Topic': (p) => p.KmsMasterKeyId,
  'AWS::Logs::LogGroup': (p) => p.KmsKeyId,
  'AWS::CloudTrail::Trail': (p) => p.KMSKeyId,
  'AWS::ECR::Repository': (p) => (p.EncryptionConfiguration as { EncryptionType: string; KmsKey: unknown }).KmsKey,
};

/** Cognito encrypts user pools at rest with keys it manages; there is no customer key to choose. */
const SERVICE_ENCRYPTED = new Set(['AWS::Cognito::UserPool']);

/** Resource types that store data at rest. Each one in a stack must be listed above. */
const DATA_STORE = new RegExp(
  `^AWS::(${[
    'S3::Bucket',
    'RDS::DBInstance',
    'RDS::DBCluster',
    'SecretsManager::Secret',
    'SNS::Topic',
    'SQS::Queue',
    'Logs::LogGroup',
    'CloudTrail::Trail',
    'DynamoDB::Table',
    'EFS::FileSystem',
    'ElastiCache::\\w+',
    'Kinesis::Stream',
    'Backup::BackupVault',
    'ECR::Repository',
    'Cognito::UserPool',
  ].join('|')})$`,
);

describe.each(ENVIRONMENTS)('%s: encryption at rest', (environment) => {
  const template = templateFor(environment);
  const environmentKey = getAtt(keyId(template), 'Arn');

  it('has one customer-managed key that rotates every 365 days and is never deleted with the stack', () => {
    const [, key] = onlyResource(template, 'AWS::KMS::Key');
    expect(propertiesOf(key)).toMatchObject({ EnableKeyRotation: true, RotationPeriodInDays: 365, PendingWindowInDays: 30 });
    expect(key.DeletionPolicy).toBe('Retain');
    template.hasResourceProperties('AWS::KMS::Alias', { AliasName: `alias/tp-${environment}` });
  });

  it('encrypts every data store under the environment key', () => {
    let checked = 0;
    for (const [type, keyOf] of Object.entries(KEY_PROPERTY)) {
      const found = resourcesOf(template, type);
      expect(found.length, type).toBeGreaterThan(0);
      for (const [id, resource] of found) {
        expect(keyOf(propertiesOf(resource)), `${type} ${id}`).toEqual(environmentKey);
        checked += 1;
      }
    }
    // Five buckets (documents, packets, audit copies, trail, canary artifacts), one database, five secrets
    // (owner, application, operator and queue logins, the cookie-sealing key), one topic, five log groups
    // (web, worker, platform, migration, migration runner), one trail, two image repositories.
    expect(checked).toBe(20);
  });

  it('has no data store outside that list', () => {
    const types = new Set(allResources(template).map(([, resource]) => resource.Type));
    expect([...types].filter((type) => DATA_STORE.test(type) && !(type in KEY_PROPERTY) && !SERVICE_ENCRYPTED.has(type))).toEqual([]);
    expect(types.has('AWS::Cognito::UserPool')).toBe(true);
  });

  it('encrypts the image repositories with KMS', () => {
    for (const [id, repository] of resourcesOf(template, 'AWS::ECR::Repository')) {
      expect(propertiesOf(repository).EncryptionConfiguration, id).toEqual({ EncryptionType: 'KMS', KmsKey: environmentKey });
    }
  });

  it('turns on storage encryption on the database and S3 bucket keys on every bucket', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', { StorageEncrypted: true });
    for (const [id, bucket] of resourcesOf(template, 'AWS::S3::Bucket')) {
      expect(propertiesOf(bucket).BucketEncryption, id).toEqual({
        ServerSideEncryptionConfiguration: [
          { BucketKeyEnabled: true, ServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: environmentKey } },
        ],
      });
    }
  });
});
