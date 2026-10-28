import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPLICATION_ROLE_ARN_PARAMETER, addressValidationRoleName, addressValidationStackName } from '../lib/address-validation-stack';
import { ADDRESS_VALIDATION_ACTIONS } from '../lib/constructs/application-role';
import { MAIL_VALIDATION_ROLE_CONDITION, NO_IMAGE, NO_VALIDATION_ROLE, PARAMETER_NAMES, RELEASE_NEEDS_VALIDATION_ROLE_RULE } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnResource, type CfnStatement, actionsOf, getAtt, logicalIdOf, onlyResource, propertiesOf, ref, resourcesOf, roleStatements, synthesized } from './synth';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Every statement of every IAM policy in a template: inline policies, roles' own policies and managed policies. */
function everyStatement(template: { toJSON(): unknown }): CfnStatement[] {
  const resources = Object.values((template.toJSON() as { Resources: Record<string, CfnResource> }).Resources);
  return resources.flatMap((resource) => {
    const properties = propertiesOf(resource);
    const documents: unknown[] = [];
    if (resource.Type === 'AWS::IAM::Policy' || resource.Type === 'AWS::IAM::ManagedPolicy') {
      documents.push(properties.PolicyDocument);
    }
    if (resource.Type === 'AWS::IAM::Role') {
      for (const policy of (properties.Policies ?? []) as { PolicyDocument: unknown }[]) {
        documents.push(policy.PolicyDocument);
      }
    }
    return documents.flatMap((document) => (document as { Statement: CfnStatement[] }).Statement);
  });
}

/** Whether a statement allows an action matching `wanted` (exactly, or by a `service:*` or `*` wildcard). */
function allows(statement: CfnStatement, wanted: string): boolean {
  if (statement.Effect !== 'Allow') {
    return false;
  }
  const service = wanted.slice(0, wanted.indexOf(':'));
  return actionsOf(statement).some((action) => action === wanted || action === '*' || action === `${service}:*`);
}

/**
 * The screening's address validation in its own account (docs/adr/0065, "Address validation in its own account"; review
 * S3). SES's GetEmailAddressInsights is a management event whose request names the address as typed (SES's API model
 * marks it no more sensitive than any string), and a trail cannot leave out one management event, so the environment's
 * account never makes the call: its web assumes a role in the environment's address-validation account, which holds that
 * role and a trail of writes alone.
 */
describe.each(ENVIRONMENTS)('%s: the address-validation account', (environment) => {
  const { stack, template, validation } = synthesized(environment);
  const applicationRole = logicalIdOf(stack, stack.application.role);

  it('is its own stack, beside the environment\'s, to deploy into another account', () => {
    expect(validation.stack.stackName).toBe(addressValidationStackName(environment));
    expect(addressValidationStackName(environment)).toBe(`tp-${environment}-address-validation`);
    expect(validation.stack.terminationProtection).toBe(environment === 'production');
    // It trusts the environment's application role by the ARN the environment stack outputs.
    expect((template.toJSON() as { Outputs: Record<string, { Value: unknown }> }).Outputs.ApplicationRoleArn?.Value).toEqual(getAtt(applicationRole, 'Arn'));
    const parameters = (validation.template.toJSON() as { Parameters: Record<string, { AllowedPattern?: string; Default?: string }> }).Parameters;
    expect(Object.keys(parameters).filter((name) => name !== 'BootstrapVersion')).toEqual([APPLICATION_ROLE_ARN_PARAMETER]);
    expect(parameters[APPLICATION_ROLE_ARN_PARAMETER]?.Default).toBeUndefined();
    const pattern = new RegExp(parameters[APPLICATION_ROLE_ARN_PARAMETER]?.AllowedPattern ?? '(?!)');
    expect(pattern.test('arn:aws:iam::111122223333:role/tp-production-ApplicationRole770F378B-0A1B2C3D4E5F')).toBe(true);
    for (const bad of ['none', 'arn:aws:iam::111122223333:user/someone', 'arn:aws:sts::111122223333:assumed-role/x/y', '*']) {
      expect(pattern.test(bad), bad).toBe(false);
    }
  });

  it('holds one role, which only the environment\'s application role may assume, never a principal of its own account', () => {
    const [roleId, role] = onlyResource(validation.template, 'AWS::IAM::Role');
    expect(propertiesOf(role)).toMatchObject({ RoleName: addressValidationRoleName(environment), MaxSessionDuration: 3600 });
    expect(propertiesOf(role).ManagedPolicyArns).toBeUndefined();
    expect(propertiesOf(role).Policies).toBeUndefined();
    const account = { 'Fn::Select': [4, { 'Fn::Split': [':', ref(APPLICATION_ROLE_ARN_PARAMETER)] }] };
    expect(propertiesOf(role).AssumeRolePolicyDocument).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: { AWS: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::', account, ':root']] } },
          Condition: {
            ArnEquals: { 'aws:PrincipalArn': ref(APPLICATION_ROLE_ARN_PARAMETER) },
            StringNotEquals: { 'aws:PrincipalAccount': { Ref: 'AWS::AccountId' } },
          },
        },
      ],
    });
    // Allowed SES's validation and nothing else.
    expect(roleStatements(validation.template, roleId)).toEqual([{ Sid: 'ScreeningAddressValidation', Effect: 'Allow', Action: 'ses:GetEmailAddressInsights', Resource: '*' }]);
    expect(everyStatement(validation.template)).toEqual(roleStatements(validation.template, roleId));
    expect((validation.template.toJSON() as { Outputs: Record<string, { Value: unknown }> }).Outputs.AddressValidationRoleArn?.Value).toEqual(getAtt(roleId, 'Arn'));
  });

  it('records the write management events alone, in every region and of the global services, validated and encrypted under its own key, so it never keeps a validation (a read)', () => {
    const [, trail] = onlyResource(validation.template, 'AWS::CloudTrail::Trail');
    const [keyId] = onlyResource(validation.template, 'AWS::KMS::Key');
    expect(propertiesOf(trail)).toMatchObject({
      TrailName: addressValidationRoleName(environment),
      IsLogging: true,
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
      KMSKeyId: getAtt(keyId, 'Arn'),
      S3BucketName: ref(logicalIdOf(validation.stack, validation.stack.trailBucket)),
      EventSelectors: [{ IncludeManagementEvents: true, ReadWriteType: 'WriteOnly' }],
    });
    // No data events, no advanced selectors, no CloudWatch Logs copy, no Insights.
    expect(propertiesOf(trail).AdvancedEventSelectors).toBeUndefined();
    expect(propertiesOf(trail).CloudWatchLogsLogGroupArn).toBeUndefined();
    expect(propertiesOf(trail).InsightSelectors).toBeUndefined();
    const [, key] = onlyResource(validation.template, 'AWS::KMS::Key');
    expect(propertiesOf(key)).toMatchObject({ EnableKeyRotation: true, RotationPeriodInDays: 365 });
    expect(key.DeletionPolicy).toBe('Retain');
    const [, bucket] = onlyResource(validation.template, 'AWS::S3::Bucket');
    expect(propertiesOf(bucket)).toMatchObject({
      VersioningConfiguration: { Status: 'Enabled' },
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    expect(bucket.DeletionPolicy).toBe('Retain');
  });

  it('holds nothing else: no data, no sending identity, no queue, no other principal', () => {
    const resources = Object.values((validation.template.toJSON() as { Resources: Record<string, CfnResource> }).Resources);
    const types = resources.map((resource) => resource.Type).filter((type) => type !== 'AWS::CDK::Metadata');
    expect(types.sort()).toEqual(['AWS::CloudTrail::Trail', 'AWS::IAM::Policy', 'AWS::IAM::Role', 'AWS::KMS::Alias', 'AWS::KMS::Key', 'AWS::S3::Bucket', 'AWS::S3::BucketPolicy']);
  });

  it('keeps the environment\'s own trail on every management event, read and write', () => {
    const [, trail] = onlyResource(template, 'AWS::CloudTrail::Trail');
    expect(propertiesOf(trail).EventSelectors).toEqual([{ IncludeManagementEvents: true, ReadWriteType: 'All' }]);
  });

  it('never lets a role of the environment\'s account validate an address there: no policy allows it, and the application role is refused it and any role of its own account', () => {
    for (const statement of everyStatement(template)) {
      expect(allows(statement, ADDRESS_VALIDATION_ACTIONS[0]), statement.Sid).toBe(false);
    }
    const statements = roleStatements(template, applicationRole);
    expect(statements.filter((statement) => statement.Effect === 'Deny')).toEqual([
      { Sid: 'NoAddressValidationHere', Effect: 'Deny', Action: 'ses:GetEmailAddressInsights', Resource: '*' },
      {
        Sid: 'NoRoleOfThisAccount',
        Effect: 'Deny',
        Action: 'sts:AssumeRole',
        Resource: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::', { Ref: 'AWS::AccountId' }, ':role/*']] },
      },
    ]);
  });

  it('lets the application role assume the role MailValidationRoleArn names, and only once it names one', () => {
    const policies = resourcesOf(template, 'AWS::IAM::Policy').filter(([, policy]) =>
      (propertiesOf(policy).PolicyDocument as { Statement: CfnStatement[] }).Statement.some((statement) => allows(statement, 'sts:AssumeRole')),
    );
    expect(policies).toHaveLength(1);
    const [, policy] = policies[0] as [string, CfnResource & { Condition?: string }];
    expect(policy.Condition).toBe(MAIL_VALIDATION_ROLE_CONDITION);
    expect(propertiesOf(policy).Roles).toEqual([ref(applicationRole)]);
    expect((propertiesOf(policy).PolicyDocument as { Statement: CfnStatement[] }).Statement).toEqual([
      { Sid: 'AssumeAddressValidationRole', Effect: 'Allow', Action: 'sts:AssumeRole', Resource: ref(PARAMETER_NAMES.mailValidationRoleArn) },
    ]);
    const conditions = (template.toJSON() as { Conditions: Record<string, unknown> }).Conditions;
    expect(conditions[MAIL_VALIDATION_ROLE_CONDITION]).toEqual({ 'Fn::Not': [{ 'Fn::Equals': [ref(PARAMETER_NAMES.mailValidationRoleArn), NO_VALIDATION_ROLE] }] });
  });

  it('refuses a release while MailValidationRoleArn is none, and gives the web the role to assume', () => {
    const rules = (template.toJSON() as { Rules: Record<string, { Assertions: { Assert: unknown; AssertDescription: string }[] }> }).Rules;
    const rule = rules[RELEASE_NEEDS_VALIDATION_ROLE_RULE];
    expect(rule?.Assertions).toHaveLength(1);
    expect(rule?.Assertions[0]?.Assert).toEqual({
      'Fn::Or': [{ 'Fn::Equals': [ref(PARAMETER_NAMES.imageTag), NO_IMAGE] }, { 'Fn::Not': [{ 'Fn::Equals': [ref(PARAMETER_NAMES.mailValidationRoleArn), NO_VALIDATION_ROLE] }] }],
    });
    expect(rule?.Assertions[0]?.AssertDescription).toContain('docs/adr/0065');
    const [, task] = resourcesOf(template, 'AWS::ECS::TaskDefinition').find(([, resource]) => resource.Properties?.Family === `tp-${environment}-web`) ?? [];
    const [container] = (task?.Properties?.ContainerDefinitions ?? []) as { Environment: { Name: string; Value: unknown }[] }[];
    expect(container?.Environment.find((entry) => entry.Name === 'MAIL_VALIDATION_ROLE_ARN')?.Value).toEqual(ref(PARAMETER_NAMES.mailValidationRoleArn));
    // The other tasks never validate.
    for (const [, other] of resourcesOf(template, 'AWS::ECS::TaskDefinition').filter(([, resource]) => resource.Properties?.Family !== `tp-${environment}-web`)) {
      expect(JSON.stringify(other.Properties?.ContainerDefinitions)).not.toContain('MAIL_VALIDATION_ROLE_ARN');
    }
  });
});

describe('the web assumes the address-validation role as the stack names it', () => {
  it('reads MAIL_VALIDATION_ROLE_ARN and takes SES\'s credentials from the role it names', () => {
    const config = readFileSync(path.join(ROOT, 'apps/web/src/lib/server/config.ts'), 'utf8');
    const services = readFileSync(path.join(ROOT, 'apps/web/src/lib/server/services.ts'), 'utf8');
    expect(config).toContain('MAIL_VALIDATION_ROLE_ARN:');
    expect(services).toContain('assumedRoleCredentials(');
  });
});
