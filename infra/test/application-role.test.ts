import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MODEL_INVOKE_ACTIONS, PRACTICE_CONTEXT_KEY, TEXTRACT_ACTIONS, USER_POOL_ADMIN_ACTIONS } from '../lib/constructs/application-role';
import { bedrockModelArns, pinnedBedrockModels } from '../lib/models';
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

describe('the models the application may invoke (PRD 14, Provider and data path)', () => {
  it('are the Bedrock models each purpose’s current prompt version pins, read from the prompts themselves', () => {
    const dir = path.resolve(import.meta.dirname, '../../packages/model-gateway/prompts');
    const fromPrompts = new Set<string>();
    for (const name of ['propose-contract-terms', 'draft-packet-narrative', 'suggest-evidence-requests', 'read-denial-letter']) {
      const prompt = JSON.parse(readFileSync(path.join(dir, name, 'v1', 'prompt.json'), 'utf8')) as { models: { bedrock: Record<string, string> } };
      for (const id of Object.values(prompt.models.bedrock)) {
        fromPrompts.add(id);
      }
    }
    expect(pinnedBedrockModels()).toEqual([...fromPrompts].sort());
    // The contract prompt's larger model, for contracts marked ambiguous, is among them.
    expect(pinnedBedrockModels().length).toBeGreaterThanOrEqual(2);
  });

  it('match the call the gateway’s Bedrock provider makes', () => {
    const provider = readFileSync(path.resolve(import.meta.dirname, '../../packages/model-gateway/src/providers/bedrock.ts'), 'utf8');
    const commands = [...new Set([...provider.matchAll(/new (\w+)Command\(/g)].map((match) => `bedrock:${match[1] ?? ''}`))].sort();
    expect(commands).toEqual([...MODEL_INVOKE_ACTIONS].sort());
  });

  it('match the calls intake’s Textract reader makes', () => {
    const reader = readFileSync(path.resolve(import.meta.dirname, '../../packages/contracts/src/evidence/scan.ts'), 'utf8');
    const commands = [...new Set([...reader.matchAll(/new (\w+)Command\(/g)].map((match) => `textract:${match[1] ?? ''}`))].sort();
    expect(commands).toEqual([...TEXTRACT_ACTIONS].sort());
    expect(reader).toContain(`export const TEXTRACT_ACTIONS = ['${TEXTRACT_ACTIONS.join("', '")}'] as const;`);
  });

  it('name a foundation model in the region, or an inference profile with the models it routes to', () => {
    expect(bedrockModelArns('vendor.model-one', 'aws', 'us-east-1', '111122223333')).toEqual(['arn:aws:bedrock:us-east-1::foundation-model/vendor.model-one']);
    expect(bedrockModelArns('us.vendor.model-one', 'aws', 'us-east-1', '111122223333')).toEqual([
      'arn:aws:bedrock:us-east-1:111122223333:inference-profile/us.vendor.model-one',
      'arn:aws:bedrock:*::foundation-model/vendor.model-one',
    ]);
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

  it('invokes the pinned models and no other, and nothing else of Bedrock', () => {
    const bedrock = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('bedrock:')));
    expect(bedrock.map((statement) => [statement.Sid, actionsOf(statement)])).toEqual([['PinnedModels', [...MODEL_INVOKE_ACTIONS]]]);
    const resources = JSON.stringify(bedrock[0]?.Resource);
    for (const modelId of pinnedBedrockModels()) {
      expect(resources).toContain(`foundation-model/${modelId}`);
    }
    expect(resources).not.toContain('foundation-model/*');
    expect(resources).toContain('AWS::Region');
  });

  it('runs Textract’s text detection for scanned pages, and nothing else of Textract', () => {
    const textract = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('textract:')));
    expect(textract).toEqual([{ Sid: 'ScannedPages', Effect: 'Allow', Action: [...TEXTRACT_ACTIONS], Resource: '*' }]);
    // Every other statement names its resources.
    expect(statements.filter((statement) => statement.Resource === '*').map((statement) => statement.Sid)).toEqual(['ScannedPages']);
  });

  it('cannot delete objects, change retention or bypass Object Lock', () => {
    const actions = statements.flatMap(actionsOf);
    expect(actions.filter((action) => /Delete|Retention|LegalHold|Bypass|PutBucket|\*/.test(action))).toEqual([]);
    expect(statements.every((statement) => statement.Effect === 'Allow')).toBe(true);
  });
});
