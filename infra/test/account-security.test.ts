import { describe, expect, it } from 'vitest';

import { FINDING_ALERT_SEVERITY } from '../lib/constructs/account-security';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, roleStatements, synthesized } from './synth';

/** PRD 15 and 16: CloudTrail for the account; GuardDuty with malware scanning of uploaded documents. */
describe.each(ENVIRONMENTS)('%s: account trail and threat detection', (environment) => {
  const { stack, template } = synthesized(environment);
  const documents = logicalIdOf(stack, stack.storage.documents);

  it('records every region and global service events, validated and encrypted', () => {
    const [, trail] = onlyResource(template, 'AWS::CloudTrail::Trail');
    expect(propertiesOf(trail)).toMatchObject({
      TrailName: `tp-${environment}-account`,
      IsLogging: true,
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
      KMSKeyId: getAtt(keyId(template), 'Arn'),
      S3BucketName: ref(logicalIdOf(stack, stack.accountSecurity.trailBucket)),
    });
  });

  it('lets CloudTrail use the key only for this trail', () => {
    const [, key] = onlyResource(template, 'AWS::KMS::Key');
    const statements = (propertiesOf(key).KeyPolicy as { Statement: CfnStatement[] }).Statement.filter(
      (statement) => JSON.stringify(statement.Principal) === JSON.stringify({ Service: 'cloudtrail.amazonaws.com' }),
    );
    expect(statements.map((statement) => statement.Action).sort()).toEqual(['kms:DescribeKey', 'kms:GenerateDataKey*']);
    for (const statement of statements) {
      expect(JSON.stringify(statement.Condition?.StringEquals?.['aws:SourceArn'])).toContain(`:trail/tp-${environment}-account`);
    }
  });

  it('runs a GuardDuty detector watching S3 data events and RDS logins', () => {
    const [, detector] = onlyResource(template, 'AWS::GuardDuty::Detector');
    expect(propertiesOf(detector)).toMatchObject({
      Enable: true,
      FindingPublishingFrequency: 'FIFTEEN_MINUTES',
      Features: [
        { Name: 'S3_DATA_EVENTS', Status: 'ENABLED' },
        { Name: 'RDS_LOGIN_EVENTS', Status: 'ENABLED' },
      ],
    });
  });

  it('scans every new object in the documents bucket for malware and tags it with the result', () => {
    const [, plan] = onlyResource(template, 'AWS::GuardDuty::MalwareProtectionPlan');
    expect(propertiesOf(plan)).toMatchObject({
      ProtectedResource: { S3Bucket: { BucketName: ref(documents) } },
      Actions: { Tagging: { Status: 'ENABLED' } },
    });
    expect((propertiesOf(plan).ProtectedResource as { S3Bucket: Record<string, unknown> }).S3Bucket.ObjectPrefixes).toBeUndefined();
  });

  it('gives the scanner a role GuardDuty alone assumes, confined to the documents bucket', () => {
    const [, plan] = onlyResource(template, 'AWS::GuardDuty::MalwareProtectionPlan');
    const roleId = (propertiesOf(plan).Role as { 'Fn::GetAtt': [string] })['Fn::GetAtt'][0];
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'malware-protection-plan.guardduty.amazonaws.com' },
            Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
          },
        ],
      },
    });
    const statements = roleStatements(template, roleId);
    const s3 = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('s3:')));
    for (const statement of s3) {
      expect(JSON.stringify(statement.Resource), statement.Sid).toContain(documents);
    }
    const kms = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('kms:')));
    expect(kms).toHaveLength(1);
    expect(JSON.stringify(kms[0]?.Condition)).toContain('kms:ViaService');
  });

  it(`sends findings of severity ${String(FINDING_ALERT_SEVERITY)} or more to the operator as one line of IDs`, () => {
    const [, rule] = onlyResource(template, 'AWS::Events::Rule');
    const properties = propertiesOf(rule);
    expect(properties.EventPattern).toEqual({
      source: ['aws.guardduty'],
      'detail-type': ['GuardDuty Finding'],
      detail: { severity: [{ numeric: ['>=', FINDING_ALERT_SEVERITY] }] },
    });
    const [target] = properties.Targets as { Arn: unknown; InputTransformer: { InputPathsMap: Record<string, string> } }[];
    expect(target?.Arn).toEqual(ref(logicalIdOf(stack, stack.monitoring.operatorTopic)));
    expect(Object.values(target?.InputTransformer.InputPathsMap ?? {}).sort()).toEqual(['$.detail.id', '$.detail.severity', '$.detail.type']);
  });
});
