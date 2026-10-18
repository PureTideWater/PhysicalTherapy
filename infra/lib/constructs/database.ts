import {
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  type aws_kms as kms,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { DatabaseSettings } from '../environments';
import { BACKUP_RETENTION_DAYS, PASSWORD_EXCLUDED_CHARACTERS, SECRET_ROTATION_DAYS } from '../retention';
import { type Network, appTierSecurityGroup } from './network';

/**
 * The owner login: the RDS master user. The migration and release-load jobs connect as it and
 * `SET ROLE tp_owner` (docs/adr/0009); the role bootstrap grants it tp_owner.
 */
export const OWNER_LOGIN = 'tp_owner_login';

/** The application login: a member of tp_app, created by the role bootstrap from its secret (ADR 0009). */
export const APP_LOGIN = 'tp_app_login';

/**
 * The worker's own login (docs/adr/0061): the practice jobs connect as it, never as the application login. It
 * is a member of tp_app, as the application login is, and of the marker role tp_job, which tells the database a
 * job's connection from a person's request by session_user, so job code records no download of a packet export
 * and attests none, whatever it sets app.actor_id to. The migration task creates it from its secret.
 */
export const WORKER_LOGIN = 'tp_worker_login';

/**
 * The platform jobs' login: a member of tp_operator (owns nothing, cannot bypass row-level security;
 * docs/adr/0014), created from its secret like the application login.
 */
export const OPERATOR_LOGIN = 'tp_operator_login';

/**
 * pg-boss's login (ADR 0004 left its owner open; docs/adr/0049 settles it): a member of the NOLOGIN
 * role QUEUE_ROLE, which owns pg-boss's own schema and nothing else. Every queue connection sets that
 * role at sign-in (connection option `role`), so whatever pg-boss creates is owned by the role whichever
 * of the alternating rotation users is current. It is a member of neither tp_app nor tp_operator, so
 * it reads no practice table, and the web app, the worker and the platform jobs share it. The
 * migration task creates the role, the schema and the login (apps/worker/src/deploy/logins.ts).
 */
export const QUEUE_LOGIN = 'tp_queue_login';
export const QUEUE_ROLE = 'tp_queue';

/**
 * Billing's own login (docs/adr/0055): it may SET ROLE tp_billing without inheriting it, and holds nothing
 * else. Only the web app's billing paths (Stripe's webhook, the organization's billing screens) connect with
 * it; the application login may not switch to tp_billing at all, so no other route can write an invoice.
 */
export const BILLING_LOGIN = 'tp_billing_login';

/** The restore drill's scratch instance in an environment: one at a time, deleted after each drill. */
export function restoreDrillInstanceId(environment: string): string {
  return `tp-${environment}-restore-drill`;
}

export const DATABASE_NAME = 'tp';

export const DATABASE_PORT = 5432;

export interface DatabaseProps {
  readonly network: Network;
  readonly key: kms.IKey;
  readonly settings: DatabaseSettings;
  readonly environmentName: string;
}

/**
 * RDS PostgreSQL (PRD 15, Stack: database; PRD 16, backups and restore).
 *
 * In the `data` subnets, never publicly accessible, admitting PostgreSQL only from the web, worker,
 * operator and migration security groups and the rotation functions. Storage is encrypted under the environment
 * key; connections must use TLS 1.2 or later. Automated backups give point-in-time recovery and a
 * daily snapshot, both kept 35 days, and survive the instance's deletion. Multi-AZ and deletion
 * protection follow the environment's settings (production has both).
 *
 * Six logins, six secrets, all encrypted under the environment key: the owner (master) login,
 * which only the migration task uses; the application login, the web app's; the worker's own login
 * (WORKER_LOGIN), the practice jobs'; the operator login of the platform jobs; pg-boss's queue login
 * (QUEUE_LOGIN); and billing's own login (BILLING_LOGIN).
 * They rotate every 30 days through Secrets Manager's hosted PostgreSQL rotation functions, which run
 * in the app subnets and reach Secrets Manager through its endpoint. The owner rotates itself (single
 * user). The application, worker, operator, queue and billing logins use the alternating-users scheme, so a running task's
 * password stays valid through a rotation; their first rotation waits for the schedule because each
 * login exists only after the deploy job has created it.
 *
 * The restore drill (PRD 16, Backups and restore) restores the newest snapshot to the scratch instance
 * restoreDrillInstanceId() names, in the data subnets under the database's security group, and deletes it.
 */
export class Database extends Construct {
  readonly instance: rds.DatabaseInstance;
  readonly securityGroup: ec2.SecurityGroup;
  readonly ownerSecret: secretsmanager.ISecret;
  readonly appSecret: secretsmanager.ISecret;
  readonly workerSecret: secretsmanager.ISecret;
  readonly operatorSecret: secretsmanager.ISecret;
  readonly queueSecret: secretsmanager.ISecret;
  readonly billingSecret: secretsmanager.ISecret;
  /** The subnet group the instance (and the drill's scratch instance) lives in. */
  readonly subnetGroup: rds.ISubnetGroup;
  readonly restoreDrillInstanceId: string;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);
    const { network, key, settings } = props;
    const vpc = network.vpc;

    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'PostgreSQL: from the web, worker, operator, migration and rotation security groups only',
      allowAllOutbound: false,
    });

    const engine = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_18 });
    const parameterGroup = new rds.ParameterGroup(this, 'Parameters', {
      engine,
      description: 'TLS 1.2 or later on every connection',
      parameters: { 'rds.force_ssl': '1', ssl_min_protocol_version: 'TLSv1.2' },
    });

    this.instance = new rds.DatabaseInstance(this, 'Instance', {
      engine,
      instanceType: settings.instanceType,
      vpc,
      vpcSubnets: network.dataSubnets,
      securityGroups: [this.securityGroup],
      publiclyAccessible: false,
      multiAz: settings.multiAz,
      storageType: rds.StorageType.GP3,
      allocatedStorage: settings.allocatedStorageGiB,
      maxAllocatedStorage: settings.maxAllocatedStorageGiB,
      storageEncrypted: true,
      storageEncryptionKey: key,
      credentials: rds.Credentials.fromGeneratedSecret(OWNER_LOGIN, {
        encryptionKey: key,
        excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      }),
      databaseName: DATABASE_NAME,
      port: DATABASE_PORT,
      parameterGroup,
      backupRetention: Duration.days(BACKUP_RETENTION_DAYS),
      deleteAutomatedBackups: false,
      copyTagsToSnapshot: true,
      deletionProtection: settings.deletionProtection,
      autoMinorVersionUpgrade: true,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });
    if (this.instance.secret === undefined) {
      throw new Error('the database instance has no owner secret');
    }
    this.ownerSecret = this.instance.secret;

    const subnetGroup = this.instance.node.tryFindChild('SubnetGroup');
    if (!(subnetGroup instanceof rds.SubnetGroup)) {
      throw new Error('the database instance has no subnet group');
    }
    this.subnetGroup = subnetGroup;
    this.restoreDrillInstanceId = restoreDrillInstanceId(props.environmentName);

    this.appSecret = new rds.DatabaseSecret(this, 'AppLoginSecret', {
      username: APP_LOGIN,
      encryptionKey: key,
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      masterSecret: this.ownerSecret,
    }).attach(this.instance);
    this.workerSecret = new rds.DatabaseSecret(this, 'WorkerLoginSecret', {
      username: WORKER_LOGIN,
      encryptionKey: key,
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      masterSecret: this.ownerSecret,
    }).attach(this.instance);
    this.operatorSecret = new rds.DatabaseSecret(this, 'OperatorLoginSecret', {
      username: OPERATOR_LOGIN,
      encryptionKey: key,
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      masterSecret: this.ownerSecret,
    }).attach(this.instance);
    this.queueSecret = new rds.DatabaseSecret(this, 'QueueLoginSecret', {
      username: QUEUE_LOGIN,
      encryptionKey: key,
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      masterSecret: this.ownerSecret,
    }).attach(this.instance);
    this.billingSecret = new rds.DatabaseSecret(this, 'BillingLoginSecret', {
      username: BILLING_LOGIN,
      encryptionKey: key,
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
      masterSecret: this.ownerSecret,
    }).attach(this.instance);

    const rotationSecurityGroup = appTierSecurityGroup(this, 'RotationSecurityGroup', vpc, 'Secrets Manager rotation functions');
    const rotation = {
      vpc,
      vpcSubnets: network.appSubnets,
      securityGroups: [rotationSecurityGroup],
      excludeCharacters: PASSWORD_EXCLUDED_CHARACTERS,
    };
    this.ownerSecret.addRotationSchedule('Rotation', {
      hostedRotation: secretsmanager.HostedRotation.postgreSqlSingleUser(rotation),
      automaticallyAfter: Duration.days(SECRET_ROTATION_DAYS),
    });
    for (const secret of [this.appSecret, this.workerSecret, this.operatorSecret, this.queueSecret, this.billingSecret]) {
      secret.addRotationSchedule('Rotation', {
        hostedRotation: secretsmanager.HostedRotation.postgreSqlMultiUser({ ...rotation, masterSecret: this.ownerSecret }),
        automaticallyAfter: Duration.days(SECRET_ROTATION_DAYS),
        rotateImmediatelyOnUpdate: false,
      });
    }

    const clients = [network.webSecurityGroup, network.workerSecurityGroup, network.operatorSecurityGroup, network.migrationSecurityGroup, rotationSecurityGroup];
    for (const client of clients) {
      this.instance.connections.allowFrom(client, ec2.Port.tcp(DATABASE_PORT), `PostgreSQL from ${client.node.id}`);
    }
  }
}
