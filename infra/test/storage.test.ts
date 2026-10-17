import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UPLOAD_CORS_MAX_AGE_SECONDS, UPLOAD_HEADERS } from '../lib/constructs/storage';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { type CfnStatement, getAtt, logicalIdOf, propertiesOf, ref, resourcesOf, synthesized } from './synth';

/**
 * PRD 15, files; PRD 16, encryption and backups; PRD 19, data lifecycle: versioned buckets that are
 * never public and refuse plain HTTP; Object Lock with seven years' retention on packets and audit
 * copies. Evidence: these CDK assertions.
 */
describe('the upload CORS contract with the web app', () => {
  it('admits exactly the headers the presigned PUT signs, less Content-Length, which the browser sets', () => {
    const targets = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/uploads/targets.ts'), 'utf8');
    const signed = /const SIGNED_HEADERS = new Set\(\[([^\]]*)\]\)/.exec(targets)?.[1];
    expect(signed).toBeDefined();
    const names = [...(signed ?? '').matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
    expect(names.filter((name) => name !== 'content-length').sort()).toEqual([...UPLOAD_HEADERS].sort());
  });
});

describe.each(ENVIRONMENTS)('%s: buckets', (environment) => {
  const { stack, template } = synthesized(environment);
  const buckets = resourcesOf(template, 'AWS::S3::Bucket');
  const policies = resourcesOf(template, 'AWS::S3::BucketPolicy').map(([, policy]) => propertiesOf(policy));
  const idOf = (bucket: Parameters<typeof logicalIdOf>[1]) => logicalIdOf(stack, bucket);
  const writeOnce = [idOf(stack.storage.packets), idOf(stack.storage.auditCopies)];

  it('has the documents, packets, audit-copy, trail and canary-artifact buckets and no other', () => {
    expect(buckets.map(([id]) => id).sort()).toEqual(
      [idOf(stack.storage.documents), ...writeOnce, idOf(stack.accountSecurity.trailBucket), idOf(stack.uptime.artifacts)].sort(),
    );
  });

  it('admits presigned upload PUTs to the documents bucket from the application origin alone, with the headers the PUT signs', () => {
    const [, documents] = buckets.find(([id]) => id === idOf(stack.storage.documents)) ?? ['', { Type: '' }];
    expect(propertiesOf(documents).CorsConfiguration).toEqual({
      CorsRules: [
        {
          Id: 'presigned-uploads-from-the-application',
          AllowedOrigins: [{ 'Fn::Join': ['', ['https://', { Ref: PARAMETER_NAMES.appDomainName }]] }],
          AllowedMethods: ['PUT'],
          AllowedHeaders: [...UPLOAD_HEADERS],
          MaxAge: UPLOAD_CORS_MAX_AGE_SECONDS,
        },
      ],
    });
    for (const [id, bucket] of buckets.filter(([candidate]) => candidate !== idOf(stack.storage.documents))) {
      expect(propertiesOf(bucket).CorsConfiguration, id).toBeUndefined();
    }
  });

  it('expires canary artifacts after 35 days', () => {
    const [, artifacts] = buckets.find(([id]) => id === idOf(stack.uptime.artifacts)) ?? ['', { Type: '' }];
    expect(propertiesOf(artifacts).LifecycleConfiguration).toEqual({
      Rules: [
        {
          Id: 'canary-artifacts-expire',
          Status: 'Enabled',
          ExpirationInDays: 35,
          NoncurrentVersionExpiration: { NoncurrentDays: 1 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    });
  });

  const blocks = ['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets'];
  it.each(blocks)('blocks public access (%s) on every bucket', (setting) => {
    for (const [id, bucket] of buckets) {
      expect((propertiesOf(bucket).PublicAccessBlockConfiguration as Record<string, unknown>)[setting], id).toBe(true);
    }
  });

  it('versions every bucket, disables ACLs, keeps it when the stack goes and lets CloudFormation name it', () => {
    for (const [id, bucket] of buckets) {
      const properties = propertiesOf(bucket);
      expect(properties.VersioningConfiguration, id).toEqual({ Status: 'Enabled' });
      expect(properties.OwnershipControls, id).toEqual({ Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] });
      expect(properties.BucketName, id).toBeUndefined();
      expect(bucket.DeletionPolicy, id).toBe('Retain');
    }
  });

  it('refuses every request that is not TLS, or is TLS older than 1.2, on every bucket', () => {
    for (const [id] of buckets) {
      const policy = policies.find((p) => JSON.stringify(p.Bucket) === JSON.stringify(ref(id)));
      expect(policy, id).toBeDefined();
      const statements = (policy?.PolicyDocument as { Statement: CfnStatement[] }).Statement;
      const resources = [getAtt(id, 'Arn'), { 'Fn::Join': ['', [getAtt(id, 'Arn'), '/*']] }];
      expect(statements).toContainEqual(
        expect.objectContaining({
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 's3:*',
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          Resource: resources,
        }),
      );
      expect(statements).toContainEqual(
        expect.objectContaining({
          Effect: 'Deny',
          Principal: { AWS: '*' },
          Action: 's3:*',
          Condition: { NumericLessThan: { 's3:TlsVersion': 1.2 } },
          Resource: resources,
        }),
      );
    }
  });

  it('never lets anyone overwrite a key of the documents, packets or audit copies (write-once objects)', () => {
    for (const id of [idOf(stack.storage.documents), ...writeOnce]) {
      const policy = policies.find((p) => JSON.stringify(p.Bucket) === JSON.stringify(ref(id)));
      const statements = (policy?.PolicyDocument as { Statement: CfnStatement[] }).Statement;
      expect(statements, id).toContainEqual({
        Sid: 'WriteOnceKeys',
        Effect: 'Deny',
        Principal: { AWS: '*' },
        Action: 's3:PutObject',
        Resource: { 'Fn::Join': ['', [getAtt(id, 'Arn'), '/*']] },
        Condition: { Null: { 's3:if-none-match': 'true' }, Bool: { 's3:ObjectCreationOperation': 'true' } },
      });
    }
    const trail = policies.find((p) => JSON.stringify(p.Bucket) === JSON.stringify(ref(idOf(stack.accountSecurity.trailBucket))));
    expect(JSON.stringify(trail)).not.toContain('WriteOnceKeys');
  });

  it('locks packets and audit copies for seven years by default', () => {
    const mode = environmentSettings(environment).objectLockMode;
    expect(mode).toBe(environment === 'production' ? 'COMPLIANCE' : 'GOVERNANCE');
    for (const id of writeOnce) {
      const [, bucket] = buckets.find(([candidate]) => candidate === id) ?? ['', { Type: '' }];
      expect(propertiesOf(bucket).ObjectLockEnabled, id).toBe(true);
      expect(propertiesOf(bucket).ObjectLockConfiguration, id).toEqual({
        ObjectLockEnabled: 'Enabled',
        Rule: { DefaultRetention: { Mode: mode, Years: 7 } },
      });
    }
  });

  it('does not lock the documents, trail or canary-artifact buckets', () => {
    for (const [id, bucket] of buckets.filter(([candidate]) => !writeOnce.includes(candidate))) {
      expect(propertiesOf(bucket).ObjectLockEnabled, id).toBeUndefined();
      expect(propertiesOf(bucket).ObjectLockConfiguration, id).toBeUndefined();
    }
  });

  it('keeps noncurrent document versions for the 35-day backup window, aborts stale multipart uploads, and expires upload intake copies and Textract\'s copies after a day', () => {
    const [, documents] = buckets.find(([id]) => id === idOf(stack.storage.documents)) ?? ['', { Type: '' }];
    expect(propertiesOf(documents).LifecycleConfiguration).toEqual({
      Rules: [
        {
          Id: 'noncurrent-versions-follow-the-backup-window',
          Status: 'Enabled',
          NoncurrentVersionExpiration: { NoncurrentDays: 35 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
        },
        {
          Id: 'intake-uploads-expire',
          Status: 'Enabled',
          Prefix: 'intake/',
          ExpirationInDays: 1,
          NoncurrentVersionExpiration: { NoncurrentDays: 1 },
        },
        {
          Id: 'intake-delete-markers-expire',
          Status: 'Enabled',
          Prefix: 'intake/',
          ExpiredObjectDeleteMarker: true,
        },
        {
          Id: 'textract-copies-expire',
          Status: 'Enabled',
          Prefix: 'textract/',
          ExpirationInDays: 1,
          NoncurrentVersionExpiration: { NoncurrentDays: 1 },
        },
        {
          Id: 'textract-delete-markers-expire',
          Status: 'Enabled',
          Prefix: 'textract/',
          ExpiredObjectDeleteMarker: true,
        },
      ],
    });
  });
});
