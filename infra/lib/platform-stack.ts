import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { AccountSecurity } from './constructs/account-security';
import { ApplicationRole } from './constructs/application-role';
import { Database } from './constructs/database';
import { EnvironmentKey } from './constructs/environment-key';
import { Identity } from './constructs/identity';
import { Monitoring, type OperatorEndpoints } from './constructs/monitoring';
import { Network } from './constructs/network';
import { PullRequestDiffRole } from './constructs/pull-request-diff-role';
import { Storage } from './constructs/storage';
import { type EnvironmentName, type EnvironmentSettings, GITHUB_REPOSITORY, environmentSettings } from './environments';
import { HEARTBEAT_INTERVAL_SECONDS } from './heartbeat';

export interface PlatformStackProps extends StackProps {
  readonly environmentName: EnvironmentName;
  /** Operator alert subscriptions, from deploy-time context (bin/app.ts). */
  readonly operator?: OperatorEndpoints;
}

/**
 * One stack per environment, built from the same constructs (PRD 15, infrastructure as code;
 * milestone 1: network, database, S3, KMS, secrets, identity and monitoring). The compute (Fargate
 * web and worker, load balancer, WAF, CloudFront) arrives in milestone 11 and attaches to the
 * subnets, security groups, task role and log group created here.
 */
export class PlatformStack extends Stack {
  readonly environmentName: EnvironmentName;
  readonly settings: EnvironmentSettings;
  readonly key: EnvironmentKey;
  readonly network: Network;
  readonly storage: Storage;
  readonly database: Database;
  readonly identity: Identity;
  readonly monitoring: Monitoring;
  readonly accountSecurity: AccountSecurity;
  readonly application: ApplicationRole;
  readonly pullRequestDiff?: PullRequestDiffRole;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, { terminationProtection: environmentSettings(props.environmentName).protectFromDeletion, ...props });
    this.environmentName = props.environmentName;
    this.settings = environmentSettings(props.environmentName);
    Tags.of(this).add('project', 'therapy-platform');
    Tags.of(this).add('environment', props.environmentName);

    const environmentName = this.environmentName;
    this.key = new EnvironmentKey(this, 'EnvironmentKey', { environmentName });
    const key = this.key.key;
    this.network = new Network(this, 'Network', { cidr: this.settings.vpcCidr });
    this.storage = new Storage(this, 'Storage', { key, objectLockMode: this.settings.objectLockMode });
    this.database = new Database(this, 'Database', { network: this.network, key, settings: this.settings.database });
    this.identity = new Identity(this, 'Identity', { deletionProtection: this.settings.protectFromDeletion });
    this.monitoring = new Monitoring(this, 'Monitoring', { environmentName, key, operator: props.operator ?? {} });
    this.accountSecurity = new AccountSecurity(this, 'AccountSecurity', {
      environmentName,
      key,
      scannedBucket: this.storage.documents,
      operatorTopic: this.monitoring.operatorTopic,
    });
    this.application = new ApplicationRole(this, 'Application', {
      key,
      documents: this.storage.documents,
      packets: this.storage.packets,
      auditCopies: this.storage.auditCopies,
      appSecret: this.database.appSecret,
    });
    if (this.settings.pullRequestDiffRole) {
      this.pullRequestDiff = new PullRequestDiffRole(this, 'PullRequestDiff', { repository: GITHUB_REPOSITORY });
    }

    this.outputs();
  }

  /** What the compute, the deploy jobs and the operator need to find (no secret values). */
  private outputs(): void {
    const values: Record<string, string> = {
      EnvironmentKeyArn: this.key.key.keyArn,
      VpcId: this.network.vpc.vpcId,
      WebSecurityGroupId: this.network.webSecurityGroup.securityGroupId,
      WorkerSecurityGroupId: this.network.workerSecurityGroup.securityGroupId,
      DocumentsBucket: this.storage.documents.bucketName,
      PacketsBucket: this.storage.packets.bucketName,
      AuditCopiesBucket: this.storage.auditCopies.bucketName,
      DatabaseEndpoint: this.database.instance.dbInstanceEndpointAddress,
      OwnerLoginSecretArn: this.database.ownerSecret.secretArn,
      AppLoginSecretArn: this.database.appSecret.secretArn,
      UserPoolId: this.identity.userPool.userPoolId,
      WebClientId: this.identity.webClient.userPoolClientId,
      OperatorTopicArn: this.monitoring.operatorTopic.topicArn,
      WorkerLogGroup: this.monitoring.workerLogGroup.logGroupName,
      WorkerHeartbeatSeconds: String(HEARTBEAT_INTERVAL_SECONDS),
      ApplicationRoleArn: this.application.role.roleArn,
    };
    if (this.pullRequestDiff !== undefined) {
      values.PullRequestDiffRoleArn = this.pullRequestDiff.role.roleArn;
    }
    for (const [name, value] of Object.entries(values)) {
      new CfnOutput(this, name, { value });
    }
  }
}
