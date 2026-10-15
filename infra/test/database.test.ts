import { describe, expect, it } from 'vitest';

import { APP_LOGIN, OWNER_LOGIN } from '../lib/constructs/database';
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

  it('accepts only TLS 1.2 or later', () => {
    const [id, group] = onlyResource(template, 'AWS::RDS::DBParameterGroup');
    expect(propertiesOf(group).Parameters).toEqual({ 'rds.force_ssl': '1', ssl_min_protocol_version: 'TLSv1.2' });
    expect(properties.DBParameterGroupName).toEqual(ref(id));
  });

  it('keeps the owner and application logins in two secrets under the environment key', () => {
    const secrets = resourcesOf(template, 'AWS::SecretsManager::Secret').map(([, secret]) => propertiesOf(secret));
    expect(secrets).toHaveLength(2);
    const templates = secrets.map((secret) => {
      const generate = secret.GenerateSecretString as { SecretStringTemplate: unknown; GenerateStringKey: string; ExcludeCharacters: string };
      expect(generate.GenerateStringKey).toBe('password');
      expect(generate.ExcludeCharacters).toBe(PASSWORD_EXCLUDED_CHARACTERS);
      expect(secret.KmsKeyId).toEqual(getAtt(keyId(template), 'Arn'));
      return JSON.stringify(generate.SecretStringTemplate);
    });
    const usernames = templates.map((text) => /\\"username\\":\\"([a-z_]+)\\"/.exec(text)?.[1]).sort();
    expect(usernames).toEqual([APP_LOGIN, OWNER_LOGIN].sort());
    expect(properties.MasterUsername).toBe(OWNER_LOGIN);
    // The application login's secret names the owner secret, which its alternating-users rotation logs in with.
    const owner = logicalIdOf(stack, stack.database.ownerSecret);
    expect(templates.find((text) => text.includes(APP_LOGIN))).toContain(`"masterarn\\":\\"",{"Ref":"${owner}"}`);
  });

  it('rotates the owner login by itself and the application login with alternating users, every 30 days', () => {
    const schedules = resourcesOf(template, 'AWS::SecretsManager::RotationSchedule').map(([, schedule]) => propertiesOf(schedule));
    const owner = logicalIdOf(stack, stack.database.ownerSecret);
    const app = logicalIdOf(stack, stack.database.appSecret);
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
    expect(bySecret(app)).toMatchObject({
      RotationRules: { ScheduleExpression: 'rate(30 days)' },
      RotateImmediatelyOnUpdate: false,
      HostedRotationLambda: { RotationType: 'PostgreSQLMultiUser', MasterSecretArn: ref(owner), VpcSecurityGroupIds: rotationGroup },
    });
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
