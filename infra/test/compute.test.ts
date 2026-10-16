import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SKIP_MIGRATIONS_CONTEXT } from '../lib/app';
import { COMMANDS, LOGIN_SECRET_VARIABLES, WORKER_JOBS, WORKER_STOP_TIMEOUT } from '../lib/constructs/compute';
import { WEB_PORT } from '../lib/constructs/edge';
import { MIGRATION_POLL_INTERVAL, MIGRATION_RUN_TYPE, MIGRATION_TIMEOUT } from '../lib/constructs/migration-run';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS, type EnvironmentName, environmentSettings } from '../lib/environments';
import { HEARTBEAT_INTERVAL_SECONDS } from '../lib/heartbeat';
import { RDS_CA_BUNDLE_PATH, launchScript } from '../lib/launch';
import { MIGRATION_RUNNER_SOURCE } from '../lib/migration-runner';
import type { PlatformStack } from '../lib/platform-stack';
import {
  type CfnResource,
  type CfnStatement,
  SYNTH_TIMEOUT_MS,
  actionsOf,
  getAtt,
  logicalIdOf,
  onlyResource,
  propertiesOf,
  ref,
  resourceById,
  resourcesOf,
  roleStatements,
  synthesizeAll,
  synthesized,
} from './synth';

interface ContainerDefinition {
  readonly Name: string;
  readonly Image: unknown;
  readonly EntryPoint?: string[];
  readonly Command?: string[];
  readonly Environment?: { Name: string; Value: unknown }[];
  readonly Secrets?: { Name: string; ValueFrom: unknown }[];
  readonly LogConfiguration?: { LogDriver: string; Options: Record<string, unknown> };
  readonly LinuxParameters?: Record<string, unknown>;
  readonly PortMappings?: Record<string, unknown>[];
  readonly StopTimeout?: number;
  readonly ReadonlyRootFilesystem?: boolean;
  readonly Privileged?: boolean;
}

/** The services' task families, the container each runs and the role it runs as. */
const TASKS = ['web', 'worker', 'platform', 'migration'] as const;
type TaskName = (typeof TASKS)[number];

function container(task: CfnResource): ContainerDefinition {
  const definitions = propertiesOf(task).ContainerDefinitions as ContainerDefinition[];
  expect(definitions).toHaveLength(1);
  return definitions[0] as ContainerDefinition;
}

function environmentOf(definition: ContainerDefinition): Record<string, unknown> {
  return Object.fromEntries((definition.Environment ?? []).map((entry) => [entry.Name, entry.Value]));
}

function secretsOf(definition: ContainerDefinition): Record<string, unknown> {
  return Object.fromEntries((definition.Secrets ?? []).map((entry) => [entry.Name, entry.ValueFrom]));
}

/** `{ Fn::Join: ['', [{ Ref: secret }, ':field::']] }`, ECS's JSON-key secret reference. */
function field(secretLogicalId: string, name: string): unknown {
  return { 'Fn::Join': ['', [ref(secretLogicalId), `:${name}::`]] };
}

/** The four logins' secrets (the attachments their tasks reference). */
function logins(stack: PlatformStack) {
  return {
    owner: logicalIdOf(stack, stack.database.ownerSecret),
    app: logicalIdOf(stack, stack.database.appSecret),
    operator: logicalIdOf(stack, stack.database.operatorSecret),
    queue: logicalIdOf(stack, stack.database.queueSecret),
  };
}

describe.each(ENVIRONMENTS)('%s: compute', (environment: EnvironmentName) => {
  const { stack, template } = synthesized(environment);
  const settings = environmentSettings(environment);
  const tasks = Object.fromEntries(
    TASKS.map((name) => {
      const found = resourcesOf(template, 'AWS::ECS::TaskDefinition').find(([, task]) => propertiesOf(task).Family === `tp-${environment}-${name}`);
      if (found === undefined) {
        throw new Error(`no ${name} task definition`);
      }
      return [name, found];
    }),
  ) as Record<TaskName, [string, CfnResource]>;
  const definitions = Object.fromEntries(TASKS.map((name) => [name, container(tasks[name][1])])) as Record<TaskName, ContainerDefinition>;
  const services = {
    web: resourceById(template, 'AWS::ECS::Service', logicalIdOf(stack, stack.compute.web)),
    worker: resourceById(template, 'AWS::ECS::Service', logicalIdOf(stack, stack.compute.worker)),
    platform: resourceById(template, 'AWS::ECS::Service', logicalIdOf(stack, stack.compute.platform)),
  };
  const secret = logins(stack);
  const appSubnets = stack.network.vpc.selectSubnets(stack.network.appSubnets).subnets.map((subnet) => ref(logicalIdOf(stack, subnet as never)));

  it('runs one cluster with three services and four task definitions, nothing on EC2', () => {
    expect(propertiesOf(onlyResource(template, 'AWS::ECS::Cluster')[1]).ClusterName).toBe(`tp-${environment}`);
    expect(resourcesOf(template, 'AWS::ECS::Service')).toHaveLength(3);
    expect(resourcesOf(template, 'AWS::ECS::TaskDefinition')).toHaveLength(4);
    expect(resourcesOf(template, 'AWS::AutoScaling::AutoScalingGroup')).toEqual([]);
    expect(resourcesOf(template, 'AWS::EC2::Instance')).toEqual([]);
    for (const [id, task] of resourcesOf(template, 'AWS::ECS::TaskDefinition')) {
      expect(propertiesOf(task), id).toMatchObject({
        NetworkMode: 'awsvpc',
        RequiresCompatibilities: ['FARGATE'],
        RuntimePlatform: { CpuArchitecture: 'X86_64', OperatingSystemFamily: 'LINUX' },
      });
    }
  });

  it.each(TASKS)('sizes the %s task from the environment settings', (name) => {
    const size = settings.compute[name];
    expect(propertiesOf(tasks[name][1])).toMatchObject({ Cpu: String(size.cpu), Memory: String(size.memoryMiB) });
  });

  it('runs every service in the app subnets with no public address, under its own security group', () => {
    const groups = {
      web: stack.network.webSecurityGroup,
      worker: stack.network.workerSecurityGroup,
      platform: stack.network.operatorSecurityGroup,
    };
    for (const [name, service] of Object.entries(services) as [keyof typeof services, CfnResource][]) {
      expect(propertiesOf(service).NetworkConfiguration, name).toEqual({
        AwsvpcConfiguration: { AssignPublicIp: 'DISABLED', SecurityGroups: [getAtt(logicalIdOf(stack, groups[name]), 'GroupId')], Subnets: appSubnets },
      });
      expect(propertiesOf(service), name).toMatchObject({
        LaunchType: 'FARGATE',
        PlatformVersion: 'LATEST',
        EnableExecuteCommand: false,
        ServiceName: `tp-${environment}-${name}`,
        TaskDefinition: ref(tasks[name][0]),
        DeploymentConfiguration: { DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 100, MaximumPercent: 200 },
      });
    }
  });

  it('runs no task until ImageTag names a release, then the environment\'s count', () => {
    for (const [name, service] of Object.entries(services) as [keyof typeof services, CfnResource][]) {
      expect(propertiesOf(service).DesiredCount, name).toEqual({ 'Fn::If': ['Released', settings.compute[name].desiredCount, 0] });
    }
    expect(settings.compute.web.desiredCount).toBe(environment === 'production' ? 2 : 1);
  });

  it('puts only the web service behind the load balancer, on the web port, with a health-check grace period', () => {
    expect(propertiesOf(services.web).LoadBalancers).toEqual([{ ContainerName: 'web', ContainerPort: WEB_PORT, TargetGroupArn: ref(logicalIdOf(stack, stack.edge.targetGroup)) }]);
    expect(propertiesOf(services.web).HealthCheckGracePeriodSeconds).toBe(60);
    expect(propertiesOf(services.worker).LoadBalancers).toBeUndefined();
    expect(propertiesOf(services.platform).LoadBalancers).toBeUndefined();
    expect(definitions.web.PortMappings).toEqual([{ ContainerPort: WEB_PORT, Protocol: 'tcp' }]);
    for (const name of ['worker', 'platform', 'migration'] as const) {
      expect(definitions[name].PortMappings, name).toBeUndefined();
    }
  });

  it('runs the web app and the practice jobs as ApplicationRole, the platform jobs as OperatorRole', () => {
    expect(propertiesOf(tasks.web[1]).TaskRoleArn).toEqual(getAtt(logicalIdOf(stack, stack.application.role), 'Arn'));
    expect(propertiesOf(tasks.worker[1]).TaskRoleArn).toEqual(getAtt(logicalIdOf(stack, stack.application.role), 'Arn'));
    expect(propertiesOf(tasks.platform[1]).TaskRoleArn).toEqual(getAtt(logicalIdOf(stack, stack.operator.role), 'Arn'));
  });

  it('gives the migration task a role with no permission at all (it talks to PostgreSQL only)', () => {
    const roleId = (propertiesOf(tasks.migration[1]).TaskRoleArn as { 'Fn::GetAtt': [string] })['Fn::GetAtt'][0];
    expect(roleId).not.toBe(logicalIdOf(stack, stack.application.role));
    expect(roleId).not.toBe(logicalIdOf(stack, stack.operator.role));
    expect(roleStatements(template, roleId)).toEqual([]);
    expect(propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId)).ManagedPolicyArns).toBeUndefined();
  });

  it('gives each container exactly its logins from Secrets Manager: the operator login to the platform jobs only, the owner login to the migration only', () => {
    const loginFields = (variables: { username: string; password: string }, login: string) => ({
      [variables.username]: field(login, 'username'),
      [variables.password]: field(login, 'password'),
    });
    const urlSecrets = (variable: string, login: string) => ({ [`${variable}_USERNAME`]: field(login, 'username'), [`${variable}_PASSWORD`]: field(login, 'password') });
    expect(secretsOf(definitions.web)).toEqual({
      ...urlSecrets('DATABASE_URL', secret.app),
      ...urlSecrets('QUEUE_DATABASE_URL', secret.queue),
      AUTH_COOKIE_SECRET: ref(logicalIdOf(stack, stack.compute.cookieSecret)),
      STRIPE_SECRET_KEY: field(logicalIdOf(stack, stack.compute.stripeSecret), 'secretKey'),
      STRIPE_WEBHOOK_SECRET: field(logicalIdOf(stack, stack.compute.stripeSecret), 'webhookSecret'),
      STRIPE_PUBLISHABLE_KEY: field(logicalIdOf(stack, stack.compute.stripeSecret), 'publishableKey'),
    });
    expect(secretsOf(definitions.worker)).toEqual({ ...urlSecrets('DATABASE_URL', secret.app), ...urlSecrets('QUEUE_DATABASE_URL', secret.queue) });
    expect(secretsOf(definitions.platform)).toEqual({ ...urlSecrets('OPERATOR_DATABASE_URL', secret.operator), ...urlSecrets('QUEUE_DATABASE_URL', secret.queue) });
    // The migration also reads the three service logins, which it creates when they are missing.
    expect(secretsOf(definitions.migration)).toEqual({
      ...urlSecrets('DATABASE_URL', secret.owner),
      ...loginFields(LOGIN_SECRET_VARIABLES.app, secret.app),
      ...loginFields(LOGIN_SECRET_VARIABLES.operator, secret.operator),
      ...loginFields(LOGIN_SECRET_VARIABLES.queue, secret.queue),
    });
  });

  it('lets each task\'s execution role read only the secrets its container names, and decrypt them only through Secrets Manager', () => {
    const expected: Record<TaskName, string[]> = {
      web: [secret.app, secret.queue, logicalIdOf(stack, stack.compute.cookieSecret), logicalIdOf(stack, stack.compute.stripeSecret)],
      worker: [secret.app, secret.queue],
      platform: [secret.operator, secret.queue],
      migration: [secret.owner, secret.app, secret.operator, secret.queue],
    };
    for (const name of TASKS) {
      const roleId = (propertiesOf(tasks[name][1]).ExecutionRoleArn as { 'Fn::GetAtt': [string] })['Fn::GetAtt'][0];
      const reads = roleStatements(template, roleId).filter((statement) => actionsOf(statement).includes('secretsmanager:GetSecretValue'));
      expect(reads.map((statement) => (statement.Resource as { Ref: string }).Ref).sort(), name).toEqual([...expected[name]].sort());
      const [, key] = onlyResource(template, 'AWS::KMS::Key');
      const grants = (propertiesOf(key).KeyPolicy as { Statement: CfnStatement[] }).Statement.filter(
        (statement) => JSON.stringify(statement.Principal) === JSON.stringify({ AWS: getAtt(roleId, 'Arn') }),
      );
      expect(grants, name).toHaveLength(1);
      expect(grants[0], name).toMatchObject({ Action: 'kms:Decrypt' });
      expect(JSON.stringify(grants[0]?.Condition), name).toContain('secretsmanager.');
    }
  });

  it('keeps every value that is not a secret out of the secrets, and every secret out of the plain settings', () => {
    for (const name of TASKS) {
      const plain = environmentOf(definitions[name]);
      for (const variable of Object.keys(plain)) {
        expect(variable, name).not.toMatch(/PASSWORD|SECRET|_URL$|USERNAME|LOGIN/);
      }
      expect(JSON.stringify(plain), name).not.toMatch(/SecretString|resolve:secretsmanager/);
    }
  });

  it('builds the connection URLs in the container from the secret fields and runs the image\'s own command', () => {
    for (const name of TASKS) {
      expect(definitions[name].EntryPoint, name).toEqual(['/bin/sh', '-c']);
    }
    expect(definitions.web.Command).toEqual([
      launchScript(
        [{ variable: 'DATABASE_URL' }, { variable: 'QUEUE_DATABASE_URL', role: 'tp_queue' }],
        COMMANDS.web,
      ),
    ]);
    expect(definitions.worker.Command).toEqual([launchScript([{ variable: 'DATABASE_URL' }, { variable: 'QUEUE_DATABASE_URL', role: 'tp_queue' }], COMMANDS.worker)]);
    expect(definitions.platform.Command).toEqual([
      launchScript([{ variable: 'OPERATOR_DATABASE_URL' }, { variable: 'QUEUE_DATABASE_URL', role: 'tp_queue' }], COMMANDS.worker),
    ]);
    expect(definitions.migration.Command).toEqual([launchScript([{ variable: 'DATABASE_URL' }], COMMANDS.logins, [COMMANDS.migrate])]);
  });

  it('runs the release named by ImageTag: the web image for the web app, the worker image for the rest', () => {
    const image = (repository: string) => JSON.stringify(definitions[repository as TaskName].Image);
    for (const name of TASKS) {
      expect(image(name), name).toContain(`{"Ref":"${PARAMETER_NAMES.imageTag}"}`);
    }
    expect(image('web')).toContain(logicalIdOf(stack, stack.images.repositories.web));
    for (const name of ['worker', 'platform', 'migration'] as const) {
      expect(image(name), name).toContain(logicalIdOf(stack, stack.images.repositories.worker));
    }
  });

  it('sets the heartbeat the alarms count and the job split on the worker and platform tasks', () => {
    for (const [name, jobs] of [
      ['worker', WORKER_JOBS.worker],
      ['platform', WORKER_JOBS.platform],
    ] as const) {
      expect(environmentOf(definitions[name]), name).toMatchObject({ WORKER_HEARTBEAT_SECONDS: String(HEARTBEAT_INTERVAL_SECONDS), WORKER_JOBS: jobs });
      expect(definitions[name].StopTimeout, name).toBe(WORKER_STOP_TIMEOUT.toSeconds());
    }
    expect(HEARTBEAT_INTERVAL_SECONDS).toBe(60);
  });

  it('runs every container in production mode, trusting the RDS certificate bundle, with an init process', () => {
    for (const name of TASKS) {
      expect(environmentOf(definitions[name]), name).toMatchObject({ NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: RDS_CA_BUNDLE_PATH, DATABASE_NAME: 'tp' });
      expect(definitions[name].LinuxParameters, name).toMatchObject({ InitProcessEnabled: true });
      expect(definitions[name].Privileged, name).toBeUndefined();
    }
  });

  it('configures the web app for Cognito, KMS, the documents bucket and the application origin', () => {
    const plain = environmentOf(definitions.web);
    const appOrigin = { 'Fn::Join': ['', ['https://', ref(PARAMETER_NAMES.appDomainName)]] };
    expect(plain).toMatchObject({
      TP_AUTH_PROVIDER: 'cognito',
      TP_KEY_PROVIDER: 'kms',
      BILLING_PROVIDER: 'stripe',
      BILLING_STRIPE_MODE: environment === 'production' ? 'live' : 'test',
      COGNITO_USER_POOL_ID: ref(logicalIdOf(stack, stack.identity.userPool)),
      COGNITO_CLIENT_ID: ref(logicalIdOf(stack, stack.identity.webClient)),
      DOCUMENTS_BUCKET: ref(logicalIdOf(stack, stack.storage.documents)),
      APP_ORIGIN: appOrigin,
      WEBAUTHN_RP_ID: ref(PARAMETER_NAMES.appDomainName),
      TRUSTED_PROXY_HOPS: '1',
      SUPPORT_EMAIL: ref(PARAMETER_NAMES.supportEmail),
      ESIGN_PROVIDER: 'none',
      TP_ENVIRONMENT: environment,
    });
    expect(plain.KMS_KEY_ID).toEqual(getAtt(logicalIdOf(stack, stack.key.key), 'Arn'));
    expect(plain.DOCUMENTS_KMS_KEY_ID).toEqual(getAtt(logicalIdOf(stack, stack.key.key), 'Arn'));
  });

  it('configures the platform jobs for the audit copies, the RDS restore drill and SES', () => {
    expect(environmentOf(definitions.platform)).toMatchObject({
      AUDIT_COPY_BUCKET: ref(logicalIdOf(stack, stack.storage.auditCopies)),
      AUDIT_COPY_LOCK_MODE: settings.objectLockMode,
      RESTORE_DRILL_MODE: 'rds',
      RESTORE_DRILL_SOURCE_INSTANCE: ref(logicalIdOf(stack, stack.database.instance)),
      RESTORE_DRILL_SCRATCH_INSTANCE: `tp-${environment}-restore-drill`,
      RESTORE_DRILL_INSTANCE_CLASS: `db.${settings.database.instanceType.toString()}`,
      RESTORE_DRILL_SECURITY_GROUPS: getAtt(logicalIdOf(stack, stack.database.securityGroup), 'GroupId'),
      MAIL_FROM: ref(PARAMETER_NAMES.mailFromAddress),
    });
    expect(environmentOf(definitions.platform).DOCUMENTS_BUCKET).toBeUndefined();
    expect(environmentOf(definitions.worker)).toMatchObject({ MAIL_FROM: ref(PARAMETER_NAMES.mailFromAddress), DOCUMENTS_BUCKET: ref(logicalIdOf(stack, stack.storage.documents)) });
    expect(environmentOf(definitions.worker).AUDIT_COPY_BUCKET).toBeUndefined();
  });

  it('sends each container\'s output to its own log group, without blocking on it', () => {
    const groups: Record<TaskName, unknown> = {
      web: ref(logicalIdOf(stack, stack.monitoring.webLogGroup)),
      worker: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      platform: ref(logicalIdOf(stack, stack.monitoring.platformLogGroup)),
      migration: ref(logicalIdOf(stack, stack.monitoring.migrationLogGroup)),
    };
    for (const name of TASKS) {
      expect(definitions[name].LogConfiguration, name).toMatchObject({
        LogDriver: 'awslogs',
        Options: { 'awslogs-group': groups[name], 'awslogs-stream-prefix': name === 'migration' ? 'migrate' : name, mode: 'non-blocking', 'max-buffer-size': String(25 * 1024 * 1024) + 'b' },
      });
    }
  });

  it('keeps the cookie-sealing key in Secrets Manager under the environment key, 43 letters and digits (32 bytes as base64)', () => {
    const cookie = resourceById(template, 'AWS::SecretsManager::Secret', logicalIdOf(stack, stack.compute.cookieSecret));
    expect(propertiesOf(cookie)).toMatchObject({
      KmsKeyId: getAtt(logicalIdOf(stack, stack.key.key), 'Arn'),
      GenerateSecretString: { PasswordLength: 43, ExcludePunctuation: true, IncludeSpace: false },
    });
    expect(Buffer.from('A'.repeat(43), 'base64')).toHaveLength(32);
  });

  it('keeps Stripe\'s keys in Secrets Manager under the environment key, as placeholders the web app refuses until an operator sets them', () => {
    const stripe = resourceById(template, 'AWS::SecretsManager::Secret', logicalIdOf(stack, stack.compute.stripeSecret));
    expect(propertiesOf(stripe)).toMatchObject({
      KmsKeyId: getAtt(logicalIdOf(stack, stack.key.key), 'Arn'),
      GenerateSecretString: { SecretStringTemplate: JSON.stringify({ webhookSecret: 'unset', publishableKey: 'unset' }), GenerateStringKey: 'secretKey' },
    });
    // Only the web app names it.
    expect(secretsOf(definitions.worker)).not.toHaveProperty('STRIPE_SECRET_KEY');
    expect(secretsOf(definitions.platform)).not.toHaveProperty('STRIPE_SECRET_KEY');
  });

  describe('the migration task runs before the new image receives traffic', () => {
    const run = onlyResource(template, MIGRATION_RUN_TYPE);
    const [runId, runResource] = run;

    it('makes every service wait for the migration run', () => {
      expect(runId).toBe(logicalIdOf(stack, stack.compute.migrationRun.resource));
      for (const [name, service] of Object.entries(services)) {
        expect((service as CfnResource & { DependsOn?: string[] }).DependsOn, name).toContain(runId);
      }
    });

    it('runs the migration task definition of the release in the app subnets under the migration security group, once released', () => {
      expect(propertiesOf(runResource)).toMatchObject({
        Cluster: getAtt(logicalIdOf(stack, stack.compute.cluster), 'Arn'),
        TaskDefinition: ref(tasks.migration[0]),
        ContainerName: 'migrate',
        Subnets: appSubnets,
        SecurityGroups: [getAtt(logicalIdOf(stack, stack.network.migrationSecurityGroup), 'GroupId')],
        ImageTag: ref(PARAMETER_NAMES.imageTag),
        Run: { 'Fn::If': ['Released', 'true', 'false'] },
      });
    });

    it('runs the handlers inline, waiting up to the timeout and polling as set, with their logs under the environment key', () => {
      const functions = [stack.compute.migrationRun.onEvent, stack.compute.migrationRun.isComplete].map((fn) =>
        resourceById(template, 'AWS::Lambda::Function', logicalIdOf(stack, fn)),
      );
      for (const fn of functions) {
        expect(propertiesOf(fn)).toMatchObject({ Runtime: 'nodejs22.x', Code: { ZipFile: MIGRATION_RUNNER_SOURCE } });
        expect(propertiesOf(fn).VpcConfig).toBeUndefined();
        expect(propertiesOf(fn).LoggingConfig).toEqual({ LogGroup: ref(logicalIdOf(stack, stack.compute.migrationRun.logGroup)) });
      }
      expect(propertiesOf(functions[0] as CfnResource).Handler).toBe('index.onEvent');
      expect(propertiesOf(functions[1] as CfnResource).Handler).toBe('index.isComplete');
      expect(MIGRATION_RUNNER_SOURCE.length).toBeLessThan(4096);
      expect(MIGRATION_TIMEOUT.toMinutes()).toBeLessThan(60);
      expect(MIGRATION_POLL_INTERVAL.toSeconds()).toBe(15);
      const machine = onlyResource(template, 'AWS::StepFunctions::StateMachine')[1];
      expect(JSON.stringify(propertiesOf(machine).DefinitionString)).toMatch(new RegExp(`IntervalSeconds\\\\":${String(MIGRATION_POLL_INTERVAL.toSeconds())},`));
      expect(propertiesOf(machine).LoggingConfiguration).toBeUndefined();
    });

    it('lets the handlers start only the migration family in this cluster, pass only its roles, and read only this stack', () => {
      const onEvent = roleStatements(template, logicalIdOf(stack, stack.compute.migrationRun.onEvent.role as never));
      const bySid = (statements: CfnStatement[], sid: string) => statements.find((statement) => statement.Sid === sid) as CfnStatement;
      expect(actionsOf(bySid(onEvent, 'StartTheMigrationTask'))).toEqual(['ecs:RunTask']);
      expect(JSON.stringify(bySid(onEvent, 'StartTheMigrationTask').Resource)).toContain(`:task-definition/tp-${environment}-migration:*`);
      expect(bySid(onEvent, 'StartTheMigrationTask').Condition).toEqual({ ArnEquals: { 'ecs:cluster': getAtt(logicalIdOf(stack, stack.compute.cluster), 'Arn') } });
      const passed = bySid(onEvent, 'PassTheMigrationRoles');
      const migrationTask = propertiesOf(tasks.migration[1]);
      expect(passed.Resource).toEqual(expect.arrayContaining([migrationTask.TaskRoleArn, migrationTask.ExecutionRoleArn]));
      expect((passed.Resource as unknown[]).length).toBe(2);
      expect(passed.Condition).toEqual({ StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } });
      expect(bySid(onEvent, 'ReadThisStackStatus')).toMatchObject({ Action: 'cloudformation:DescribeStacks', Resource: { Ref: 'AWS::StackId' } });
      expect(onEvent).toHaveLength(3);
      const isComplete = roleStatements(template, logicalIdOf(stack, stack.compute.migrationRun.isComplete.role as never));
      expect(isComplete).toHaveLength(1);
      expect(bySid(isComplete, 'WatchTheMigrationTask')).toMatchObject({ Action: 'ecs:DescribeTasks', Condition: { ArnEquals: { 'ecs:cluster': getAtt(logicalIdOf(stack, stack.compute.cluster), 'Arn') } } });
    });
  });
});

describe('a rollback by redeploying the previous image', () => {
  it('starts no migration task when the deploy says so, and refuses a flag that is not true or false', { timeout: SYNTH_TIMEOUT_MS }, () => {
    const stacks = synthesizeAll({ [SKIP_MIGRATIONS_CONTEXT]: 'true' });
    for (const environment of ENVIRONMENTS) {
      expect(propertiesOf(onlyResource(stacks[environment].template, MIGRATION_RUN_TYPE)[1]).Run).toBe('false');
    }
    expect(propertiesOf(onlyResource(synthesizeAll({ [SKIP_MIGRATIONS_CONTEXT]: 'false' }).staging.template, MIGRATION_RUN_TYPE)[1]).Run).toEqual({
      'Fn::If': ['Released', 'true', 'false'],
    });
    expect(() => synthesizeAll({ [SKIP_MIGRATIONS_CONTEXT]: 'yes' })).toThrow(/tp:skipMigrations must be true or false/);
  });
});

/** The settings the task definitions give each application, against what it reads. */
describe('the compute contract with the applications', () => {
  const source = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8');
  const { stack, template } = synthesized('staging');
  const definitionOf = (family: string) => {
    const found = resourcesOf(template, 'AWS::ECS::TaskDefinition').find(([, task]) => propertiesOf(task).Family === family);
    return container((found as [string, CfnResource])[1]);
  };
  // Set for the runtime, the AWS SDK or the launch script rather than read by the application's own config.
  const infrastructure = new Set(['NODE_ENV', 'AWS_REGION', 'NODE_EXTRA_CA_CERTS', 'DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME']);
  const configured = (definition: ContainerDefinition) => [
    ...Object.keys(environmentOf(definition)).filter((name) => !infrastructure.has(name)),
    ...Object.keys(secretsOf(definition)).filter((name) => !/_URL_(USERNAME|PASSWORD)$/.test(name) && !/^TP_[A-Z]+_LOGIN_(USERNAME|PASSWORD)$/.test(name)),
  ];

  it('sets only settings the web app reads (apps/web/src/lib/server/config.ts, and billing\'s in apps/web/src/lib/billing/config.ts)', () => {
    const config = source('apps/web/src/lib/server/config.ts') + source('apps/web/src/lib/billing/config.ts');
    for (const name of [...configured(definitionOf('tp-staging-web')), 'DATABASE_URL', 'QUEUE_DATABASE_URL']) {
      expect(config, name).toContain(`${name}:`);
    }
  });

  it('sets only settings the worker reads (apps/worker/src/config.ts)', () => {
    const config = source('apps/worker/src/config.ts');
    for (const family of ['tp-staging-worker', 'tp-staging-platform']) {
      for (const name of [...configured(definitionOf(family)), 'QUEUE_DATABASE_URL', 'OPERATOR_DATABASE_URL']) {
        expect(config, `${family} ${name}`).toMatch(new RegExp(`'${name}'|env\\.${name}\\b`));
      }
    }
  });

  it('runs the commands the images hold: the web server, the worker bundle and its migrator', () => {
    expect(source('apps/web/Dockerfile')).toContain('CMD ["node", "apps/web/server.js"]');
    expect(source('apps/worker/Dockerfile')).toContain('CMD ["node", "--enable-source-maps", "dist/main.js"]');
    expect(COMMANDS.web).toEqual(['node', 'apps/web/server.js']);
    expect(COMMANDS.worker).toEqual(['node', '--enable-source-maps', 'dist/main.js']);
    // The worker bundle carries the migrator beside main.js, and the image the migrations it applies
    // (packages/db's MIGRATIONS_DIR is ../migrations from the bundle).
    expect(source('apps/worker/build.ts')).toMatch(/migrate: '\.\.\/\.\.\/packages\/db\/src\/cli\/migrate\.ts'/);
    expect(source('apps/worker/Dockerfile')).toContain('/repo/packages/db/migrations ./migrations');
    expect(source('packages/db/src/migrate.ts')).toContain("path.resolve(import.meta.dirname, '../migrations')");
  });

  it('gives the migration task\'s login step exactly the secret fields it reads, and bundles it beside the migrator', () => {
    const logins = source('apps/worker/src/deploy/logins.ts');
    for (const variables of Object.values(LOGIN_SECRET_VARIABLES)) {
      expect(logins).toContain(`{ username: '${variables.username}', password: '${variables.password}' }`);
    }
    expect(Object.keys(secretsOf(definitionOf('tp-staging-migration'))).filter((name) => name.startsWith('TP_')).sort()).toEqual(
      Object.values(LOGIN_SECRET_VARIABLES).flatMap((variables) => [variables.username, variables.password]).sort(),
    );
    expect(source('apps/worker/build.ts')).toContain("logins: 'src/deploy/logins-cli.ts'");
    expect(COMMANDS.logins).toEqual(['node', '--enable-source-maps', 'dist/logins.js']);
    // The queue role the login step creates is the one every queue connection sets.
    expect(logins).toContain("export const QUEUE_ROLE = 'tp_queue';");
  });

  it('points Node at the RDS certificate bundle both images carry', () => {
    for (const file of ['apps/web/Dockerfile', 'apps/worker/Dockerfile']) {
      expect(source(file), file).toContain(RDS_CA_BUNDLE_PATH);
    }
  });

  it('serves the web app on the port the image listens on', () => {
    expect(source('apps/web/Dockerfile')).toContain(`PORT=${String(WEB_PORT)}`);
    expect(stack.compute.web.serviceName).toBeDefined();
  });
});
