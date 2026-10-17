import {
  Duration,
  Size,
  Stack,
  type aws_ecr as ecr,
  aws_ecs as ecs,
  type aws_elasticloadbalancingv2 as elbv2,
  type aws_ec2 as ec2,
  type aws_iam as iam,
  type aws_kms as kms,
  type aws_logs as logs,
  type aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { DeployParameters } from '../deploy-parameters';
import type { EnvironmentName, EnvironmentSettings, ServiceSettings, TaskSize } from '../environments';
import { HEARTBEAT_INTERVAL_SECONDS } from '../heartbeat';
import { type ConnectionUrl, DATABASE_SETTINGS, RDS_CA_BUNDLE_PATH, launchScript, secretVariables } from '../launch';
import { logGroupName } from '../log-groups';
import { DATABASE_NAME, QUEUE_ROLE } from './database';
import type { Database } from './database';
import { WEB_KEEP_ALIVE_MS, WEB_PORT } from './edge';
import type { Identity } from './identity';
import { MigrationRun } from './migration-run';
import type { Network } from './network';

/** What each container runs once its connection URLs are built (the images' own commands). */
export const COMMANDS = {
  web: ['node', 'apps/web/server.js'],
  worker: ['node', '--enable-source-maps', 'dist/main.js'],
  migrate: ['node', '--enable-source-maps', 'dist/migrate.js'],
  logins: ['node', '--enable-source-maps', 'dist/logins.js'],
} as const;

/**
 * The secret fields the migration task's second step reads (apps/worker/src/deploy/logins.ts
 * LOGIN_VARIABLES): the current username and password of the logins it creates when missing.
 */
export const LOGIN_SECRET_VARIABLES = {
  app: { username: 'TP_APP_LOGIN_USERNAME', password: 'TP_APP_LOGIN_PASSWORD' },
  operator: { username: 'TP_OPERATOR_LOGIN_USERNAME', password: 'TP_OPERATOR_LOGIN_PASSWORD' },
  queue: { username: 'TP_QUEUE_LOGIN_USERNAME', password: 'TP_QUEUE_LOGIN_PASSWORD' },
  billing: { username: 'TP_BILLING_LOGIN_USERNAME', password: 'TP_BILLING_LOGIN_PASSWORD' },
} as const;

/** The worker's job split (apps/worker/src/config.ts readWorkerJobs): practice jobs, or platform jobs. */
export const WORKER_JOBS = { worker: 'practice', platform: 'platform' } as const;

/** How long ECS waits after SIGTERM: the worker drains its active jobs (apps/worker/src/shutdown.ts). */
export const WORKER_STOP_TIMEOUT = Duration.seconds(60);

/** The queue connection: pg-boss's login, every session as the role that owns its schema. */
const QUEUE: ConnectionUrl = { variable: 'QUEUE_DATABASE_URL', role: QUEUE_ROLE };

export interface ComputeProps {
  readonly environmentName: EnvironmentName;
  readonly settings: EnvironmentSettings;
  readonly parameters: DeployParameters;
  readonly network: Network;
  readonly key: kms.IKey;
  readonly database: Database;
  readonly identity: Identity;
  readonly documents: s3.IBucket;
  readonly auditCopies: s3.IBucket;
  readonly repositories: { readonly web: ecr.IRepository; readonly worker: ecr.IRepository };
  readonly applicationRole: iam.IRole;
  readonly operatorRole: iam.IRole;
  readonly logGroups: { readonly web: logs.ILogGroup; readonly worker: logs.ILogGroup; readonly platform: logs.ILogGroup; readonly migration: logs.ILogGroup };
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  /** False only for a deploy that redeploys a previous image (`-c tp:skipMigrations=true`). */
  readonly runMigrations: boolean;
}

interface ContainerSpec {
  readonly name: string;
  readonly image: ecs.ContainerImage;
  readonly logGroup: logs.ILogGroup;
  readonly command: readonly string[];
  /** Commands run to completion, in order, before `command`. */
  readonly before?: readonly (readonly string[])[];
  readonly urls: readonly { readonly url: ConnectionUrl; readonly secret: secretsmanager.ISecret }[];
  readonly environment: Readonly<Record<string, string>>;
  readonly secrets?: Readonly<Record<string, ecs.Secret>>;
  readonly port?: number;
  readonly stopTimeout?: Duration;
}

/**
 * The compute (PRD 15, Stack: compute, Environments; PRD 18, Releases; docs/adr/0049): one ECS
 * cluster, three Fargate services and a one-off migration task, all in the app subnets with no
 * public address, each under its own security group, its own log group (kept a year, under the
 * environment key) and the existing task roles:
 *
 * - web: the Next.js server behind the load balancer, as ApplicationRole, with the application, queue
 *   and billing logins and the cookie-sealing secret.
 * - worker: the practice jobs (WORKER_JOBS=practice), as ApplicationRole, with the application and
 *   queue logins.
 * - platform: the platform jobs (WORKER_JOBS=platform: the audit copy, the restore drill, the support
 *   notices, the monitoring schedule), as OperatorRole, with the operator and queue logins; the only
 *   task with the operator login, and without the application login.
 * - migration: the worker image's migrator with the owner login, the only task with it, then the
 *   logins the services connect as, created from their secrets when missing (it reads their current
 *   username and password, and sets a password only when it creates the login); run by the
 *   migration run before any service moves to a new task definition.
 *
 * Secrets reach a container only from Secrets Manager (ECS reads them at start through each task's
 * execution role); every other setting is plain configuration. The worker and platform tasks beat
 * every HEARTBEAT_INTERVAL_SECONDS, the period the heartbeat alarms count. Services run the image
 * named by the ImageTag parameter and no task until it names a release; a deployment that fails its
 * health checks rolls back by itself; no task can be shelled into (ECS Exec off).
 */
export class Compute extends Construct {
  readonly cluster: ecs.Cluster;
  readonly cookieSecret: secretsmanager.Secret;
  /** Stripe's keys for the web app (docs/adr/0050), which an operator sets: a JSON object of secretKey, webhookSecret and publishableKey. */
  readonly stripeSecret: secretsmanager.Secret;
  readonly web: ecs.FargateService;
  readonly worker: ecs.FargateService;
  readonly platform: ecs.FargateService;
  readonly migrationTask: ecs.FargateTaskDefinition;
  readonly migrationRun: MigrationRun;
  private readonly props: ComputeProps;

  constructor(scope: Construct, id: string, props: ComputeProps) {
    super(scope, id);
    this.props = props;
    const { environmentName, settings, parameters, network, database } = props;
    const stack = Stack.of(this);
    const compute = settings.compute;

    this.cluster = new ecs.Cluster(this, 'Cluster', { clusterName: `tp-${environmentName}`, vpc: network.vpc });

    // The web app seals the sign-in state the browser carries between steps with this key
    // (AUTH_COOKIE_SECRET, a base64 32-byte key): 43 letters and digits decode to 32 bytes.
    this.cookieSecret = new secretsmanager.Secret(this, 'CookieSecret', {
      description: `Therapy platform ${environmentName}: the web app's sign-in cookie sealing key`,
      encryptionKey: props.key,
      generateSecretString: { passwordLength: 43, excludePunctuation: true, includeSpace: false },
    });

    // Stripe's live keys (docs/adr/0050; docs/runbooks/billing.md): created with placeholders, which the web
    // app refuses at start, until an operator writes the account's keys. Only the web app reads them.
    this.stripeSecret = new secretsmanager.Secret(this, 'StripeSecret', {
      description: `Therapy platform ${environmentName}: Stripe's secret key, webhook signing secret and publishable key`,
      encryptionKey: props.key,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ webhookSecret: 'unset', publishableKey: 'unset' }),
        generateStringKey: 'secretKey',
        excludePunctuation: true,
        includeSpace: false,
      },
    });

    const webImage = ecs.ContainerImage.fromEcrRepository(props.repositories.web, parameters.imageTag);
    const workerImage = ecs.ContainerImage.fromEcrRepository(props.repositories.worker, parameters.imageTag);
    const appOrigin = parameters.appOrigin;
    const common = {
      NODE_ENV: 'production',
      AWS_REGION: stack.region,
      NODE_EXTRA_CA_CERTS: RDS_CA_BUNDLE_PATH,
      [DATABASE_SETTINGS.host]: database.instance.dbInstanceEndpointAddress,
      [DATABASE_SETTINGS.port]: database.instance.dbInstanceEndpointPort,
      [DATABASE_SETTINGS.name]: DATABASE_NAME,
    };
    const keyArn = props.key.keyArn;
    // The model path (packages/model-gateway/src/config.ts): Bedrock in the task's own region, through
    // the VPC's interface endpoint, on the models the application role may invoke (docs/adr/0048).
    const modelPath = { MODEL_PROVIDER: 'bedrock', BEDROCK_REGION: stack.region };

    const webTask = this.taskDefinition('Web', `tp-${environmentName}-web`, compute.web, props.applicationRole);
    this.container(webTask, {
      name: 'web',
      image: webImage,
      logGroup: props.logGroups.web,
      command: COMMANDS.web,
      urls: [
        { url: { variable: 'DATABASE_URL' }, secret: database.appSecret },
        { url: QUEUE, secret: database.queueSecret },
        // Billing's own login, for the webhook and the billing screens alone (docs/adr/0055).
        { url: { variable: 'BILLING_DATABASE_URL' }, secret: database.billingSecret },
      ],
      environment: {
        ...common,
        APP_ORIGIN: appOrigin,
        WEBAUTHN_RP_ID: parameters.appDomainName,
        TP_AUTH_PROVIDER: 'cognito',
        COGNITO_USER_POOL_ID: props.identity.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.identity.webClient.userPoolClientId,
        TP_KEY_PROVIDER: 'kms',
        KMS_KEY_ID: keyArn,
        DOCUMENTS_BUCKET: props.documents.bucketName,
        DOCUMENTS_KMS_KEY_ID: keyArn,
        BILLING_PROVIDER: 'stripe',
        // Live Stripe in the production environment only; dev and staging bill in Stripe's test mode.
        BILLING_STRIPE_MODE: environmentName === 'production' ? 'live' : 'test',
        // The load balancer is the one proxy in front of the tasks: the client's address is the last
        // X-Forwarded-For entry it appends (rate limits; docs/adr/0053).
        TRUSTED_PROXY_HOPS: '1',
        SUPPORT_EMAIL: parameters.supportEmail,
        // No e-signature vendor is chosen yet: agreements are recorded in the console (docs/adr/0053).
        ESIGN_PROVIDER: 'none',
        TP_ENVIRONMENT: environmentName,
        // Longer than the load balancer's idle timeout, so it never reuses a connection the server closed.
        KEEP_ALIVE_TIMEOUT: String(WEB_KEEP_ALIVE_MS),
        ...modelPath,
        // The static host the image's assets load from (its assetPrefix, apps/web/Dockerfile), for the CSP.
        STATIC_ASSET_ORIGIN: `https://${parameters.staticDomainName}`,
      },
      secrets: {
        AUTH_COOKIE_SECRET: ecs.Secret.fromSecretsManager(this.cookieSecret),
        STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(this.stripeSecret, 'secretKey'),
        STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(this.stripeSecret, 'webhookSecret'),
        STRIPE_PUBLISHABLE_KEY: ecs.Secret.fromSecretsManager(this.stripeSecret, 'publishableKey'),
      },
      port: WEB_PORT,
    });

    const workerTask = this.taskDefinition('Worker', `tp-${environmentName}-worker`, compute.worker, props.applicationRole);
    this.container(workerTask, {
      name: 'worker',
      image: workerImage,
      logGroup: props.logGroups.worker,
      command: COMMANDS.worker,
      urls: [
        { url: { variable: 'DATABASE_URL' }, secret: database.appSecret },
        { url: QUEUE, secret: database.queueSecret },
      ],
      environment: {
        ...common,
        WORKER_JOBS: WORKER_JOBS.worker,
        WORKER_HEARTBEAT_SECONDS: String(HEARTBEAT_INTERVAL_SECONDS),
        DOCUMENTS_BUCKET: props.documents.bucketName,
        TP_KEY_PROVIDER: 'kms',
        KMS_KEY_ID: keyArn,
        MAIL_FROM: parameters.mailFromAddress,
        APP_ORIGIN: appOrigin,
        // The evaluate-permitted task runs from the worker's task definition (docs/adr/0054).
        ...modelPath,
      },
      stopTimeout: WORKER_STOP_TIMEOUT,
    });

    const platformTask = this.taskDefinition('Platform', `tp-${environmentName}-platform`, compute.platform, props.operatorRole);
    this.container(platformTask, {
      name: 'platform',
      image: workerImage,
      logGroup: props.logGroups.platform,
      command: COMMANDS.worker,
      urls: [
        { url: { variable: 'OPERATOR_DATABASE_URL' }, secret: database.operatorSecret },
        { url: QUEUE, secret: database.queueSecret },
      ],
      environment: {
        ...common,
        WORKER_JOBS: WORKER_JOBS.platform,
        WORKER_HEARTBEAT_SECONDS: String(HEARTBEAT_INTERVAL_SECONDS),
        AUDIT_COPY_BUCKET: props.auditCopies.bucketName,
        AUDIT_COPY_LOCK_MODE: settings.objectLockMode,
        RESTORE_DRILL_MODE: 'rds',
        RESTORE_DRILL_SOURCE_INSTANCE: database.instance.instanceIdentifier,
        RESTORE_DRILL_SCRATCH_INSTANCE: database.restoreDrillInstanceId,
        RESTORE_DRILL_INSTANCE_CLASS: `db.${settings.database.instanceType.toString()}`,
        RESTORE_DRILL_SUBNET_GROUP: database.subnetGroup.subnetGroupName,
        RESTORE_DRILL_SECURITY_GROUPS: database.securityGroup.securityGroupId,
        MAIL_FROM: parameters.mailFromAddress,
        APP_ORIGIN: appOrigin,
      },
      stopTimeout: WORKER_STOP_TIMEOUT,
    });

    this.migrationTask = this.taskDefinition('Migration', `tp-${environmentName}-migration`, compute.migration);
    const loginField = (secret: secretsmanager.ISecret, variables: { readonly username: string; readonly password: string }) => ({
      [variables.username]: ecs.Secret.fromSecretsManager(secret, 'username'),
      [variables.password]: ecs.Secret.fromSecretsManager(secret, 'password'),
    });
    this.container(this.migrationTask, {
      name: 'migrate',
      image: workerImage,
      logGroup: props.logGroups.migration,
      // The migrations, then the logins the services connect as (created when missing).
      before: [COMMANDS.migrate],
      command: COMMANDS.logins,
      urls: [{ url: { variable: 'DATABASE_URL' }, secret: database.ownerSecret }],
      environment: common,
      secrets: {
        ...loginField(database.appSecret, LOGIN_SECRET_VARIABLES.app),
        ...loginField(database.operatorSecret, LOGIN_SECRET_VARIABLES.operator),
        ...loginField(database.queueSecret, LOGIN_SECRET_VARIABLES.queue),
        ...loginField(database.billingSecret, LOGIN_SECRET_VARIABLES.billing),
      },
    });
    const appSubnets = network.vpc.selectSubnets(network.appSubnets).subnets;
    this.migrationRun = new MigrationRun(this, 'MigrationRun', {
      key: props.key,
      logGroupName: logGroupName(environmentName, 'migration-runner'),
      cluster: this.cluster,
      taskDefinition: this.migrationTask,
      containerName: 'migrate',
      subnets: appSubnets,
      securityGroup: network.migrationSecurityGroup,
      imageTag: parameters.imageTag,
      run: props.runMigrations ? parameters.releasedFlag : 'false',
    });

    this.web = this.service('Web', webTask, compute.web, network.webSecurityGroup, `tp-${environmentName}-web`, true);
    this.web.attachToApplicationTargetGroup(props.targetGroup);
    this.worker = this.service('Worker', workerTask, compute.worker, network.workerSecurityGroup, `tp-${environmentName}-worker`, false);
    this.platform = this.service('Platform', platformTask, compute.platform, network.operatorSecurityGroup, `tp-${environmentName}-platform`, false);
    for (const service of [this.web, this.worker, this.platform]) {
      service.node.addDependency(this.migrationRun.resource);
    }
  }

  private taskDefinition(id: string, family: string, size: TaskSize, taskRole?: iam.IRole): ecs.FargateTaskDefinition {
    return new ecs.FargateTaskDefinition(this, `${id}Task`, {
      family,
      cpu: size.cpu,
      memoryLimitMiB: size.memoryMiB,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
      ...(taskRole === undefined ? {} : { taskRole }),
    });
  }

  private container(task: ecs.FargateTaskDefinition, spec: ContainerSpec): ecs.ContainerDefinition {
    const secrets: Record<string, ecs.Secret> = { ...spec.secrets };
    for (const { url, secret } of spec.urls) {
      const variables = secretVariables(url);
      secrets[variables.username] = ecs.Secret.fromSecretsManager(secret, 'username');
      secrets[variables.password] = ecs.Secret.fromSecretsManager(secret, 'password');
    }
    return task.addContainer(spec.name, {
      containerName: spec.name,
      image: spec.image,
      essential: true,
      entryPoint: ['/bin/sh', '-c'],
      command: [launchScript(spec.urls.map((entry) => entry.url), spec.command, spec.before)],
      environment: { ...spec.environment },
      secrets,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: spec.logGroup,
        streamPrefix: spec.name,
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: Size.mebibytes(25),
      }),
      linuxParameters: new ecs.LinuxParameters(this, `${spec.name}LinuxParameters`, { initProcessEnabled: true }),
      ...(spec.port === undefined ? {} : { portMappings: [{ containerPort: spec.port, protocol: ecs.Protocol.TCP }] }),
      ...(spec.stopTimeout === undefined ? {} : { stopTimeout: spec.stopTimeout }),
    });
  }

  private service(id: string, task: ecs.FargateTaskDefinition, settings: ServiceSettings, securityGroup: ec2.ISecurityGroup, serviceName: string, behindLoadBalancer: boolean): ecs.FargateService {
    return new ecs.FargateService(this, `${id}Service`, {
      serviceName,
      cluster: this.cluster,
      taskDefinition: task,
      desiredCount: this.props.parameters.countOnceReleased(settings.desiredCount),
      assignPublicIp: false,
      vpcSubnets: this.props.network.appSubnets,
      securityGroups: [securityGroup],
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      enableExecuteCommand: false,
      propagateTags: ecs.PropagatedTagSource.SERVICE,
      ...(behindLoadBalancer ? { healthCheckGracePeriod: Duration.seconds(60) } : {}),
    });
  }
}
