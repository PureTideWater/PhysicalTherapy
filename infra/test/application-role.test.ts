import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PRACTICE_CONTEXT_KEY, USER_POOL_ADMIN_ACTIONS } from '../lib/constructs/application-role';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, propertiesOf, resourceById, roleStatements, synthesized } from './synth';

/**
 * PRD 15 and 16: per-practice data keys under the environment key. The application may generate
 * and decrypt data keys only with an encryption context of practice_id alone; every other use of
 * the key is through S3 or Secrets Manager for named resources.
 */
describe('the application role\'s Cognito actions match what the web app sends', () => {
  it('covers every administrative (IAM-signed) command of the Cognito provider, and no other', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/auth/cognito-provider.ts'), 'utf8');
    const admin = [...new Set([...source.matchAll(/new (Admin\w+)Command\(/g)].map((match) => `cognito-idp:${match[1] ?? ''}`))].sort();
    expect(admin).toEqual([...USER_POOL_ADMIN_ACTIONS].sort());
  });
});

describe.each(ENVIRONMENTS)('%s: application role', (environment) => {
  const { stack, template } = synthesized(environment);
  const roleId = logicalIdOf(stack, stack.application.role);
  const statements = roleStatements(template, roleId);
  const kmsStatements = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('kms:')));
  const environmentKey = getAtt(keyId(template), 'Arn');

  it('is assumed by ECS tasks of this account only', () => {
    const role = resourceById(template, 'AWS::IAM::Role', roleId);
    expect(propertiesOf(role).AssumeRolePolicyDocument).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: { Service: 'ecs-tasks.amazonaws.com' },
          Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
        },
      ],
    });
    expect(propertiesOf(role).ManagedPolicyArns).toBeUndefined();
  });

  it('generates and decrypts data keys directly only with practice_id as the whole encryption context', () => {
    const direct = kmsStatements.filter((statement) => statement.Condition?.StringEquals?.['kms:ViaService'] === undefined);
    expect(direct).toEqual([
      {
        Sid: 'PracticeDataKeys',
        Effect: 'Allow',
        Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
        Resource: environmentKey,
        Condition: {
          'ForAllValues:StringEquals': { 'kms:EncryptionContextKeys': [PRACTICE_CONTEXT_KEY] },
          Null: { 'kms:EncryptionContextKeys': 'false' },
        },
      },
    ]);
  });

  it('uses the key otherwise only through S3 for the documents and packets and Secrets Manager for its own login', () => {
    const viaService = kmsStatements.filter((statement) => statement.Condition?.StringEquals?.['kms:ViaService'] !== undefined);
    expect(viaService.map((statement) => statement.Sid).sort()).toEqual(['ApplicationLoginDecrypt', 'BucketEncryptionThroughS3']);
    const s3 = viaService.find((statement) => statement.Sid === 'BucketEncryptionThroughS3');
    const contexts = JSON.stringify(s3?.Condition?.ArnLike?.['kms:EncryptionContext:aws:s3:arn']);
    for (const bucket of [stack.storage.documents, stack.storage.packets]) {
      expect(contexts).toContain(logicalIdOf(stack, bucket));
    }
    // The audit copies are the operator role's; the trail is CloudTrail's.
    expect(contexts).not.toContain(logicalIdOf(stack, stack.storage.auditCopies));
    expect(contexts).not.toContain(logicalIdOf(stack, stack.accountSecurity.trailBucket));
    const secrets = viaService.find((statement) => statement.Sid === 'ApplicationLoginDecrypt');
    expect(actionsOf(secrets as CfnStatement)).toEqual(['kms:Decrypt']);
    expect(JSON.stringify(secrets?.Condition)).toContain(logicalIdOf(stack, stack.database.appSecret));
  });

  it('never allows a KMS action on the key without a condition, nor any key-management action', () => {
    for (const statement of kmsStatements) {
      expect(statement.Condition, statement.Sid).toBeDefined();
      expect(actionsOf(statement).every((action) => action === 'kms:GenerateDataKey' || action === 'kms:Decrypt'), statement.Sid).toBe(true);
      expect(statement.Resource, statement.Sid).toEqual(environmentKey);
    }
  });

  it('reads its own login and never the owner or operator login, nor the audit copies', () => {
    const text = JSON.stringify(statements);
    expect(text).toContain(logicalIdOf(stack, stack.database.appSecret));
    expect(text).not.toContain(logicalIdOf(stack, stack.database.ownerSecret));
    expect(text).not.toContain(logicalIdOf(stack, stack.database.operatorSecret));
    expect(text).not.toContain(logicalIdOf(stack, stack.storage.auditCopies));
  });

  it('sends digest email from this account’s SES identities in its region, and nothing else of SES', () => {
    const ses = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('ses:')));
    expect(ses.map((statement) => statement.Sid)).toEqual(['DigestEmail']);
    expect(actionsOf(ses[0] as CfnStatement)).toEqual(['ses:SendEmail']);
    const resource = JSON.stringify(ses[0]?.Resource);
    expect(resource).toContain(':identity/*');
    expect(resource).toContain('AWS::AccountId');
    expect(resource).toContain('AWS::Region');
  });

  it('makes the web app\'s administrative Cognito calls on this environment\'s user pool only', () => {
    const cognito = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('cognito-idp:')));
    expect(cognito).toEqual([
      { Sid: 'UserPoolAdministration', Effect: 'Allow', Action: [...USER_POOL_ADMIN_ACTIONS], Resource: getAtt(logicalIdOf(stack, stack.identity.userPool), 'Arn') },
    ]);
  });

  it('cannot delete objects, change retention or bypass Object Lock', () => {
    const actions = statements.flatMap(actionsOf);
    expect(actions.filter((action) => /Delete|Retention|LegalHold|Bypass|PutBucket|\*/.test(action))).toEqual([]);
    expect(statements.every((statement) => statement.Effect === 'Allow')).toBe(true);
  });
});
