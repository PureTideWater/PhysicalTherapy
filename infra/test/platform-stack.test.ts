import { App } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { OPERATOR_EMAIL_CONTEXT, OPERATOR_SMS_CONTEXT, buildApp } from '../lib/app';
import { ENVIRONMENTS, stackName } from '../lib/environments';
import { PlatformStack } from '../lib/platform-stack';
import { SYNTH_TIMEOUT_MS, resourcesOf, synthesizeAll, synthesized, templateFor } from './synth';

describe('CDK app', () => {
  it('has one stack per environment', () => {
    const app = buildApp(new App());
    const stacks = app.node.children.filter((child): child is PlatformStack => child instanceof PlatformStack);
    expect(stacks.map((stack) => stack.stackName)).toEqual(['tp-dev', 'tp-staging', 'tp-production']);
    expect(stacks.map((stack) => stack.environmentName)).toEqual([...ENVIRONMENTS]);
  });

  it('synthesizes every stack with its environment tag', { timeout: SYNTH_TIMEOUT_MS }, () => {
    // The stacks were synthesized for their templates already; this reuses that cloud assembly.
    const assembly = synthesized('dev').app.synth();
    for (const environment of ENVIRONMENTS) {
      const artifact = assembly.getStackByName(stackName(environment));
      expect(artifact.tags).toMatchObject({ environment, project: 'therapy-platform' });
    }
  });

  it.each(ENVIRONMENTS)('%s synthesizes without errors or warnings', { timeout: SYNTH_TIMEOUT_MS }, (environment) => {
    const { stack } = synthesized(environment);
    expect(Annotations.fromStack(stack).findError('*', Match.anyValue())).toEqual([]);
    expect(Annotations.fromStack(stack).findWarning('*', Match.anyValue())).toEqual([]);
  });

  it('protects only the production stack from termination', () => {
    expect(ENVIRONMENTS.map((environment) => synthesized(environment).stack.terminationProtection)).toEqual([false, false, true]);
  });

  it.each(ENVIRONMENTS)('%s outputs what the compute and the deploy jobs need, and no secret value', (environment) => {
    const outputs = Object.keys(templateFor(environment).findOutputs('*'));
    expect(outputs).toEqual(
      expect.arrayContaining([
        'EnvironmentKeyArn',
        'VpcId',
        'WebSecurityGroupId',
        'WorkerSecurityGroupId',
        'OperatorSecurityGroupId',
        'DocumentsBucket',
        'PacketsBucket',
        'AuditCopiesBucket',
        'AuditCopyLockMode',
        'DatabaseEndpoint',
        'DatabaseInstanceId',
        'DatabaseSubnetGroup',
        'DatabaseSecurityGroupId',
        'RestoreDrillInstanceId',
        'OwnerLoginSecretArn',
        'AppLoginSecretArn',
        'WorkerLoginSecretArn',
        'OperatorLoginSecretArn',
        'UserPoolId',
        'WebClientId',
        'OperatorTopicArn',
        'WorkerLogGroup',
        'WorkerHeartbeatSeconds',
        'ApplicationRoleArn',
        'OperatorRoleArn',
        'QueueLoginSecretArn',
        'BillingLoginSecretArn',
        'SupportMailBucket',
        'SupportMailRuleSet',
        'MigrationSecurityGroupId',
        'WebRepositoryUri',
        'WorkerRepositoryUri',
        'ClusterName',
        'WebServiceName',
        'WorkerServiceName',
        'PlatformServiceName',
        'ScreeningServiceName',
        'ScreeningLogGroup',
        'ScreeningLoginSecretArn',
        'ScreeningRoleArn',
        'ScreeningSecurityGroupId',
        'MigrationTaskFamily',
        'WebLogGroup',
        'PlatformLogGroup',
        'MigrationLogGroup',
        'LoadBalancerDnsName',
        'StaticAssetsDistributionDomain',
        'AppOrigin',
        'StaticAssetsOrigin',
        // The mail streams (docs/adr/0065): the senders, sets, queues and every DNS record of phase 1.
        'MailIdentityDomain',
        'ScreeningMailIdentityDomain',
        'ScreeningMailFromAddress',
        'MailEventsQueueUrl',
        'MailEventsDeadLetterQueueUrl',
        'MailConfigurationSetTransactional',
        'MailConfigurationSetNotices',
        'MailConfigurationSetScreening',
        ...['Mail', 'ScreeningMail'].flatMap((prefix) =>
          ['DkimRecord1', 'DkimRecord2', 'DkimRecord3', 'MailFromMxRecord', 'MailFromSpfRecord', 'DmarcRecord'].map((name) => `${prefix}${name}`),
        ),
      ]),
    );
    expect(outputs.includes('PullRequestDiffRoleArn')).toBe(environment === 'staging');
    expect(JSON.stringify(templateFor(environment).findOutputs('*'))).not.toMatch(/resolve:secretsmanager|SecretString/);
  });
});

describe('operator alert subscriptions', () => {
  it('subscribe nobody when no deploy-time context names the operator', () => {
    for (const environment of ENVIRONMENTS) {
      expect(resourcesOf(templateFor(environment), 'AWS::SNS::Subscription')).toEqual([]);
    }
  });

  it('subscribe the operator by email and SMS from context', { timeout: SYNTH_TIMEOUT_MS }, () => {
    const stacks = synthesizeAll({ [OPERATOR_EMAIL_CONTEXT]: 'operator@example.test', [OPERATOR_SMS_CONTEXT]: '+15555550100' });
    for (const environment of ENVIRONMENTS) {
      const template = stacks[environment].template;
      template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'email', Endpoint: 'operator@example.test' });
      template.hasResourceProperties('AWS::SNS::Subscription', { Protocol: 'sms', Endpoint: '+15555550100' });
    }
  });

  it('treat an empty context value as absent and refuse a value that is not a string', { timeout: SYNTH_TIMEOUT_MS }, () => {
    const stacks = synthesizeAll({ [OPERATOR_EMAIL_CONTEXT]: '' });
    expect(resourcesOf(stacks.staging.template, 'AWS::SNS::Subscription')).toEqual([]);
    expect(() => buildApp(new App({ context: { [OPERATOR_SMS_CONTEXT]: 5 } }))).toThrow(/tp:operatorSms must be a string/);
  });
});
