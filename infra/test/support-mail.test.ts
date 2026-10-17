import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SUPPORT_MAIL_BUCKET_ACTIONS, SUPPORT_MAIL_OBJECT_ACTIONS } from '../lib/constructs/operator-role';
import { SUPPORT_MAIL_PREFIX, SUPPORT_MAIL_RETENTION_DAYS } from '../lib/constructs/support-mail';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, roleStatements, synthesized } from './synth';

/**
 * Mail to the support address opens a ticket (PRD 19, Support: "a support address that creates a ticket";
 * docs/adr/0055): SES receives the support address's mail over TLS, scans it and writes it to an inbox bucket
 * under the environment key, which only the platform jobs' role lists and reads, and from which it expires after a
 * week. Evidence: these CDK assertions; the job itself is apps/worker/src/support.
 */

const source = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8');

describe('the support mail contract with the worker', () => {
  it('writes where the job reads, and grants the calls the job makes', () => {
    const inbox = source('apps/worker/src/support/inbox.ts');
    expect(inbox).toContain(`export const SUPPORT_MAIL_PREFIX = '${SUPPORT_MAIL_PREFIX}';`);
    const commands = [...new Set([...inbox.matchAll(/new (\w+)Command\(/g)].map((match) => match[1] ?? ''))].sort();
    expect(commands).toEqual(['GetObject', 'ListObjectsV2']);
    expect([...SUPPORT_MAIL_OBJECT_ACTIONS, ...SUPPORT_MAIL_BUCKET_ACTIONS].sort()).toEqual(['s3:GetObject', 's3:ListBucket']);
    // The platform task's setting is the one the worker reads.
    expect(source('apps/worker/src/config.ts')).toContain("'SUPPORT_MAIL_BUCKET'");
  });
});

describe.each(ENVIRONMENTS)('%s: support mail', (environment) => {
  const { stack, template } = synthesized(environment);
  const inboxId = logicalIdOf(stack, stack.supportMail.bucket);

  it('receives mail to the support address alone, over TLS, scanned, into the inbox under inbound/', () => {
    const [, ruleSet] = onlyResource(template, 'AWS::SES::ReceiptRuleSet');
    expect(propertiesOf(ruleSet).RuleSetName).toBe(`tp-${environment}-support`);
    const [, rule] = onlyResource(template, 'AWS::SES::ReceiptRule');
    expect(propertiesOf(rule).Rule).toEqual({
      Name: 'support-address',
      Enabled: true,
      Recipients: [ref(PARAMETER_NAMES.supportEmail)],
      ScanEnabled: true,
      TlsPolicy: 'Require',
      Actions: [{ S3Action: { BucketName: ref(inboxId), ObjectKeyPrefix: SUPPORT_MAIL_PREFIX } }],
    });
    // The stack does not make its rule set the active one: a region has one, set by the operator (docs/runbooks/support-mail.md).
    expect(JSON.stringify(template.toJSON())).not.toContain('SetActiveReceiptRuleSet');
  });

  it('lets SES of this account alone write the inbox, and expires each message after a week', () => {
    const bucket = resourceById(template, 'AWS::S3::Bucket', inboxId);
    expect(propertiesOf(bucket).LifecycleConfiguration).toEqual({
      Rules: [
        { Id: 'support-mail-expires', Status: 'Enabled', Prefix: SUPPORT_MAIL_PREFIX, ExpirationInDays: SUPPORT_MAIL_RETENTION_DAYS, NoncurrentVersionExpiration: { NoncurrentDays: 1 } },
        { Id: 'support-mail-delete-markers-expire', Status: 'Enabled', Prefix: SUPPORT_MAIL_PREFIX, ExpiredObjectDeleteMarker: true },
      ],
    });
    expect(SUPPORT_MAIL_RETENTION_DAYS).toBe(7);
    const policy = resourcesOf(template, 'AWS::S3::BucketPolicy')
      .map(([, resource]) => propertiesOf(resource))
      .find((properties) => JSON.stringify(properties.Bucket) === JSON.stringify(ref(inboxId)));
    const allows = ((policy?.PolicyDocument as { Statement: CfnStatement[] }).Statement ?? []).filter((statement) => statement.Effect === 'Allow');
    expect(allows).toEqual([
      {
        Effect: 'Allow',
        Principal: { Service: 'ses.amazonaws.com' },
        Action: 's3:PutObject',
        Resource: { 'Fn::Join': ['', [getAtt(inboxId, 'Arn'), `/${SUPPORT_MAIL_PREFIX}*`]] },
        Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
      },
    ]);
  });

  it('admits SES to the environment key only to encrypt through S3, for this account', () => {
    const [, key] = onlyResource(template, 'AWS::KMS::Key');
    const statements = (propertiesOf(key).KeyPolicy as { Statement: CfnStatement[] }).Statement.filter((statement) => JSON.stringify(statement.Principal).includes('ses.amazonaws.com'));
    expect(statements).toEqual([
      {
        Sid: 'SesWritesSupportMail',
        Effect: 'Allow',
        Principal: { Service: 'ses.amazonaws.com' },
        Action: 'kms:GenerateDataKey',
        Resource: '*',
        Condition: {
          StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' }, 'kms:ViaService': { 'Fn::Join': ['', ['s3.', { Ref: 'AWS::Region' }, '.amazonaws.com']] } },
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':s3:::*']] } },
        },
      },
    ]);
    expect(keyId(template)).toBeDefined();
  });

  it('lets the platform jobs list and read the inbox, decrypting through S3, and nothing else of it; the application never', () => {
    const operator = roleStatements(template, logicalIdOf(stack, stack.operator.role));
    const bySid = (sid: string) => operator.find((statement) => statement.Sid === sid) as CfnStatement;
    expect(actionsOf(bySid('SupportMailObjects'))).toEqual([...SUPPORT_MAIL_OBJECT_ACTIONS]);
    expect(bySid('SupportMailObjects').Resource).toEqual({ 'Fn::Join': ['', [getAtt(inboxId, 'Arn'), `/${SUPPORT_MAIL_PREFIX}*`]] });
    expect(actionsOf(bySid('SupportMailBucket'))).toEqual([...SUPPORT_MAIL_BUCKET_ACTIONS]);
    expect(bySid('SupportMailBucket')).toMatchObject({ Resource: getAtt(inboxId, 'Arn'), Condition: { StringLike: { 's3:prefix': [`${SUPPORT_MAIL_PREFIX}*`] } } });
    expect(actionsOf(bySid('SupportMailDecryptThroughS3'))).toEqual(['kms:Decrypt']);
    expect(JSON.stringify(bySid('SupportMailDecryptThroughS3').Condition)).toContain(inboxId);
    const touching = operator.filter((statement) => JSON.stringify(statement).includes(inboxId));
    expect(touching.flatMap(actionsOf).sort()).toEqual(['kms:Decrypt', 's3:GetObject', 's3:ListBucket']);
    expect(JSON.stringify(roleStatements(template, logicalIdOf(stack, stack.application.role)))).not.toContain(inboxId);
  });

  it('names the inbox to the platform task alone, and outputs the bucket and the rule set to activate', () => {
    const tasks = resourcesOf(template, 'AWS::ECS::TaskDefinition').map(([, task]) => propertiesOf(task));
    const withInbox = tasks.filter((task) => JSON.stringify(task.ContainerDefinitions).includes('SUPPORT_MAIL_BUCKET'));
    expect(withInbox.map((task) => task.Family)).toEqual([`tp-${environment}-platform`]);
    expect(JSON.stringify(withInbox[0]?.ContainerDefinitions)).toContain(JSON.stringify({ Name: 'SUPPORT_MAIL_BUCKET', Value: ref(inboxId) }));
    const outputs = template.toJSON().Outputs as Record<string, { Value: unknown }>;
    expect(outputs.SupportMailBucket?.Value).toEqual(ref(inboxId));
    expect(outputs.SupportMailRuleSet?.Value).toEqual(ref(logicalIdOf(stack, stack.supportMail.ruleSet)));
  });
});
