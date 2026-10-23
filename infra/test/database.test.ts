import { describe, expect, it } from 'vitest';

import { APP_LOGIN, BILLING_LOGIN, OPERATOR_LOGIN, OWNER_LOGIN, QUEUE_LOGIN, SCREENING_LOGIN, WORKER_LOGIN, restoreDrillInstanceId } from '../lib/constructs/database';
import { ENVIRONMENTS } from '../lib/environments';
import { PASSWORD_EXCLUDED_CHARACTERS } from '../lib/retention';
import { getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, resourcesOf, synthesized, transformsOf } from './synth';

/**
 * PRD 15, database; PRD 16, backups and restore and secrets: RDS PostgreSQL, Multi-AZ and deletion
 * protection in production, point-in-time recovery with daily snapshots kept 35 days, TLS-only
 * connections, and separate owner and application logins in Secrets Manager with rotation.
 */
describe.each(ENVIRONMENTS)('%s: database', (environment) => {
  const { stack, template } = synthesized(environment);
  const production = environment === 'production';
  const [, instance] = onlyResource(template, 'AWS::RDS::DBInstance');
  const properties = propertiesOf(instance);

  it('runs PostgreSQL 18, Multi-AZ and deletion-protected in production only', () => {
    expect(properties).toMatchObject({ Engine: 'postgres', EngineVersion: '18', MultiAZ: production, DeletionProtection: production });
    expect(properties.AutoMinorVersionUpgrade).toBe(true);
  });

  it('keeps point-in-time recovery and daily snapshots for 35 days, beyond the instance itself', () => {
    expect(properties.BackupRetentionPeriod).toBe(35);
    expect(properties.DeleteAutomatedBackups).toBe(false);
    expect(properties.CopyTagsToSnapshot).toBe(true);
    expect(instance.DeletionPolicy).toBe('Snapshot');
  });

  it('accepts only TLS 1.2 or later, and logs no bind value of any statement (O11)', () => {
    const [id, group] = onlyResource(template, 'AWS::RDS::DBParameterGroup');
    expect(propertiesOf(group).Parameters).toEqual({ 'rds.force_ssl': '1', ssl_min_protocol_version: 'TLSv1.2', log_parameter_max_length: '0', log_parameter_max_length_on_error: '0' });
    expect(properties.DBParameterGroupName).toEqual(ref(id));
  });

  it('keeps the owner, application, worker, operator, queue, billing and screening logins in seven secrets under the environment key', () => {
    // Every secret but the web app's cookie-sealing key and Stripe's keys (compute.test.ts) is a database login.
    const web = [logicalIdOf(stack, stack.compute.cookieSecret), logicalIdOf(stack, stack.compute.stripeSecret)];
    const secrets = resourcesOf(template, 'AWS::SecretsManager::Secret')
      .filter(([id]) => !web.includes(id))
      .map(([, secret]) => propertiesOf(secret));
    expect(secrets).toHaveLength(7);
    const templates = secrets.map((secret) => {
      const generate = secret.GenerateSecretString as { SecretStringTemplate: unknown; GenerateStringKey: string; ExcludeCharacters: string };
      expect(generate.GenerateStringKey).toBe('password');
      expect(generate.ExcludeCharacters).toBe(PASSWORD_EXCLUDED_CHARACTERS);
      expect(secret.KmsKeyId).toEqual(getAtt(keyId(template), 'Arn'));
      return JSON.stringify(generate.SecretStringTemplate);
    });
    const usernames = templates.map((text) => /\\"username\\":\\"([a-z_]+)\\"/.exec(text)?.[1]).sort();
    expect(usernames).toEqual([APP_LOGIN, BILLING_LOGIN, OPERATOR_LOGIN, OWNER_LOGIN, QUEUE_LOGIN, SCREENING_LOGIN, WORKER_LOGIN].sort());
    // The screening consumer's login (docs/adr/0062): its own secret, never another service's.
    expect(SCREENING_LOGIN).toBe('tp_screening_login');
    expect(properties.MasterUsername).toBe(OWNER_LOGIN);
    // The application, worker, operator, queue, billing and screening logins' secrets name the owner secret, which their alternating-users rotation logs in with.
    const owner = logicalIdOf(stack, stack.database.ownerSecret);
    for (const login of [APP_LOGIN, WORKER_LOGIN, OPERATOR_LOGIN, QUEUE_LOGIN, BILLING_LOGIN, SCREENING_LOGIN]) {
      expect(templates.find((text) => text.includes(login))).toContain(`"masterarn\\":\\"",{"Ref":"${owner}"}`);
    }
  });

  it('names one scratch instance for the restore drill, per environment', () => {
    expect(stack.database.restoreDrillInstanceId).toBe(restoreDrillInstanceId(environment));
    expect(restoreDrillInstanceId(environment)).toBe(`tp-${environment}-restore-drill`);
  });

  it('rotates the owner login by itself and the application, worker, operator, queue, billing and screening logins with alternating users, every 30 days', () => {
    const schedules = resourcesOf(template, 'AWS::SecretsManager::RotationSchedule').map(([, schedule]) => propertiesOf(schedule));
    expect(schedules).toHaveLength(7);
    const owner = logicalIdOf(stack, stack.database.ownerSecret);
    const app = logicalIdOf(stack, stack.database.appSecret);
    const worker = logicalIdOf(stack, stack.database.workerSecret);
    const operator = logicalIdOf(stack, stack.database.operatorSecret);
    const queue = logicalIdOf(stack, stack.database.queueSecret);
    const billing = logicalIdOf(stack, stack.database.billingSecret);
    const screening = logicalIdOf(stack, stack.database.screeningSecret);
    const bySecret = (id: string) => schedules.find((schedule) => JSON.stringify(schedule.SecretId) === JSON.stringify(ref(id)));
    const rotationGroup = { 'Fn::GetAtt': [expect.stringMatching(/^DatabaseRotationSecurityGroup/), 'GroupId'] };

    expect(bySecret(owner)).toMatchObject({
      RotationRules: { ScheduleExpression: 'rate(30 days)' },
      HostedRotationLambda: {
        RotationType: 'PostgreSQLSingleUser',
        KmsKeyArn: getAtt(keyId(template), 'Arn'),
        VpcSecurityGroupIds: rotationGroup,
      },
    });
    expect(bySecret(owner)?.RotateImmediatelyOnUpdate).toBeUndefined();
    for (const login of [app, worker, operator, queue, billing, screening]) {
      expect(bySecret(login)).toMatchObject({
        RotationRules: { ScheduleExpression: 'rate(30 days)' },
        RotateImmediatelyOnUpdate: false,
        HostedRotationLambda: { RotationType: 'PostgreSQLMultiUser', MasterSecretArn: ref(owner), VpcSecurityGroupIds: rotationGroup },
      });
    }
    expect(transformsOf(template)).toContain('AWS::SecretsManager-2024-09-16');
  });

  it('runs the rotation functions in the app subnets', () => {
    for (const [, schedule] of resourcesOf(template, 'AWS::SecretsManager::RotationSchedule')) {
      const subnets = JSON.stringify((propertiesOf(schedule).HostedRotationLambda as { VpcSubnetIds: unknown }).VpcSubnetIds);
      expect(subnets).toMatch(/NetworkVpcappSubnet1/);
      expect(subnets).toMatch(/NetworkVpcappSubnet2/);
      expect(subnets).not.toMatch(/edge|data/);
    }
  });
});
