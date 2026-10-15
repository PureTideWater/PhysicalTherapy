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

export const DATABASE_NAME = 'tp';

export const DATABASE_PORT = 5432;

export interface DatabaseProps {
  readonly network: Network;
  readonly key: kms.IKey;
  readonly settings: DatabaseSettings;
}

/**
 * RDS PostgreSQL (PRD 15, Stack: database; PRD 16, backups and restore).
 *
 * In the `data` subnets, never publicly accessible, admitting PostgreSQL only from the web and
 * worker security groups and the rotation functions. Storage is encrypted under the environment
 * key; connections must use TLS 1.2 or later. Automated backups give point-in-time recovery and a
 * daily snapshot, both kept 35 days, and survive the instance's deletion. Multi-AZ and deletion
 * protection follow the environment's settings (production has both).
 *
 * Two logins, two secrets, both encrypted under the environment key: the owner (master) login, and
 * the application login. Both rotate every 30 days through Secrets Manager's hosted PostgreSQL
 * rotation functions, which run in the app subnets and reach Secrets Manager through its endpoint.
 * The owner rotates itself (single user). The application login uses the alternating-users scheme,
 * so a running task's password stays valid through a rotation; its first rotation waits for the
 * schedule because the login exists only after the role bootstrap has created it.
 */
export class Database extends Construct {
  readonly instance: rds.DatabaseInstance;
  readonly securityGroup: ec2.SecurityGroup;
  readonly ownerSecret: secretsmanager.ISecret;
  readonly appSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);
    const { network, key, settings } = props;
    const vpc = network.vpc;

    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'PostgreSQL: from the web, worker and rotation security groups only',
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

    this.appSecret = new rds.DatabaseSecret(this, 'AppLoginSecret', {
      username: APP_LOGIN,
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
    this.appSecret.addRotationSchedule('Rotation', {
      hostedRotation: secretsmanager.HostedRotation.postgreSqlMultiUser({ ...rotation, masterSecret: this.ownerSecret }),
      automaticallyAfter: Duration.days(SECRET_ROTATION_DAYS),
      rotateImmediatelyOnUpdate: false,
    });

    for (const client of [network.webSecurityGroup, network.workerSecurityGroup, rotationSecurityGroup]) {
      this.instance.connections.allowFrom(client, ec2.Port.tcp(DATABASE_PORT), `PostgreSQL from ${client.node.id}`);
    }
  }
}
