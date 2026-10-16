import { CfnOutput, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { AccountSecurity } from './constructs/account-security';
import { ApplicationRole } from './constructs/application-role';
import { Compute } from './constructs/compute';
import { Database } from './constructs/database';
import { Edge } from './constructs/edge';
import { EnvironmentKey } from './constructs/environment-key';
import { Identity } from './constructs/identity';
import { Images } from './constructs/images';
import { Monitoring, type OperatorEndpoints } from './constructs/monitoring';
import { Network } from './constructs/network';
import { OperatorRole } from './constructs/operator-role';
import { PullRequestDiffRole } from './constructs/pull-request-diff-role';
import { Storage } from './constructs/storage';
import { Uptime } from './constructs/uptime';
import { DeployParameters } from './deploy-parameters';
import { type EnvironmentName, type EnvironmentSettings, GITHUB_REPOSITORY, environmentSettings } from './environments';
import { HEARTBEAT_INTERVAL_SECONDS } from './heartbeat';

export interface PlatformStackProps extends StackProps {
  readonly environmentName: EnvironmentName;
  /** Operator alert subscriptions, from deploy-time context (bin/app.ts). */
  readonly operator?: OperatorEndpoints;
  /**
   * False for a deploy that redeploys a previous image (`-c tp:skipMigrations=true`, PRD 18: rollback
   * by redeploying the previous image): its migrations are already applied, and its migrator would
   * refuse the newer history. Every other deploy runs the migration task first.
   */
  readonly runMigrations?: boolean;
}

/**
 * One stack per environment, built from the same constructs (PRD 15, infrastructure as code;
 * milestone 1: network, database, S3, KMS, secrets, identity and monitoring; milestone 11: the image
 * repositories, the Fargate services and the migration task, the load balancer with its web ACL,
 * CloudFront for static assets, and the uptime and certificate checks, docs/adr/0049). What differs
 * per deployment comes in as CloudFormation parameters (DeployParameters).
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
  readonly operator: OperatorRole;
  readonly pullRequestDiff?: PullRequestDiffRole;
  readonly parameters: DeployParameters;
  readonly images: Images;
  readonly edge: Edge;
  readonly compute: Compute;
  readonly uptime: Uptime;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, { terminationProtection: environmentSettings(props.environmentName).protectFromDeletion, ...props });
    this.environmentName = props.environmentName;
    this.settings = environmentSettings(props.environmentName);
    Tags.of(this).add('project', 'therapy-platform');
    Tags.of(this).add('environment', props.environmentName);

    const environmentName = this.environmentName;
    this.parameters = new DeployParameters(this, 'Parameters');
    const parameters = this.parameters;
    this.key = new EnvironmentKey(this, 'EnvironmentKey', { environmentName });
    const key = this.key.key;
    this.network = new Network(this, 'Network', { cidr: this.settings.vpcCidr, natGateways: this.settings.compute.natGateways });
    this.storage = new Storage(this, 'Storage', { key, objectLockMode: this.settings.objectLockMode, uploadOrigin: parameters.appOrigin });
    this.database = new Database(this, 'Database', { network: this.network, key, settings: this.settings.database, environmentName });
    this.identity = new Identity(this, 'Identity', {
      deletionProtection: this.settings.protectFromDeletion,
      relyingPartyId: parameters.appDomainName,
      mailFrom: { address: parameters.mailFromAddress, domain: parameters.mailFromDomain },
    });
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
      appSecret: this.database.appSecret,
    });
    this.operator = new OperatorRole(this, 'Operator', {
      key,
      auditCopies: this.storage.auditCopies,
      operatorSecret: this.database.operatorSecret,
      database: this.database.instance,
      restoreDrillInstanceId: this.database.restoreDrillInstanceId,
    });
    if (this.settings.pullRequestDiffRole) {
      this.pullRequestDiff = new PullRequestDiffRole(this, 'PullRequestDiff', { repository: GITHUB_REPOSITORY });
    }

    this.images = new Images(this, 'Images', { environmentName, key });
    this.edge = new Edge(this, 'Edge', {
      environmentName,
      network: this.network,
      appDomainName: parameters.appDomainName,
      certificateArn: parameters.certificateArn,
      staticDomainName: parameters.staticDomainName,
      staticCertificateArn: parameters.staticCertificateArn,
      deletionProtection: this.settings.protectFromDeletion,
      notify: this.monitoring.notify,
    });
    this.compute = new Compute(this, 'Compute', {
      environmentName,
      settings: this.settings,
      parameters,
      network: this.network,
      key,
      database: this.database,
      identity: this.identity,
      documents: this.storage.documents,
      auditCopies: this.storage.auditCopies,
      repositories: this.images.repositories,
      applicationRole: this.application.role,
      operatorRole: this.operator.role,
      logGroups: {
        web: this.monitoring.webLogGroup,
        worker: this.monitoring.workerLogGroup,
        platform: this.monitoring.platformLogGroup,
        migration: this.monitoring.migrationLogGroup,
      },
      targetGroup: this.edge.targetGroup,
      runMigrations: props.runMigrations ?? true,
    });
    this.uptime = new Uptime(this, 'Uptime', {
      environmentName,
      key,
      appDomainName: parameters.appDomainName,
      staticDomainName: parameters.staticDomainName,
      notify: this.monitoring.notify,
    });

    this.outputs();
  }

  /** What the compute, the deploy jobs and the operator need to find (no secret values). */
  private outputs(): void {
    const values: Record<string, string> = {
      EnvironmentKeyArn: this.key.key.keyArn,
      VpcId: this.network.vpc.vpcId,
      WebSecurityGroupId: this.network.webSecurityGroup.securityGroupId,
      WorkerSecurityGroupId: this.network.workerSecurityGroup.securityGroupId,
      OperatorSecurityGroupId: this.network.operatorSecurityGroup.securityGroupId,
      DocumentsBucket: this.storage.documents.bucketName,
      PacketsBucket: this.storage.packets.bucketName,
      AuditCopiesBucket: this.storage.auditCopies.bucketName,
      AuditCopyLockMode: this.settings.objectLockMode,
      DatabaseEndpoint: this.database.instance.dbInstanceEndpointAddress,
      DatabaseInstanceId: this.database.instance.instanceIdentifier,
      DatabaseSubnetGroup: this.database.subnetGroup.subnetGroupName,
      DatabaseSecurityGroupId: this.database.securityGroup.securityGroupId,
      RestoreDrillInstanceId: this.database.restoreDrillInstanceId,
      OwnerLoginSecretArn: this.database.ownerSecret.secretArn,
      AppLoginSecretArn: this.database.appSecret.secretArn,
      OperatorLoginSecretArn: this.database.operatorSecret.secretArn,
      UserPoolId: this.identity.userPool.userPoolId,
      WebClientId: this.identity.webClient.userPoolClientId,
      OperatorTopicArn: this.monitoring.operatorTopic.topicArn,
      WorkerLogGroup: this.monitoring.workerLogGroup.logGroupName,
      WorkerHeartbeatSeconds: String(HEARTBEAT_INTERVAL_SECONDS),
      ApplicationRoleArn: this.application.role.roleArn,
      OperatorRoleArn: this.operator.role.roleArn,
      QueueLoginSecretArn: this.database.queueSecret.secretArn,
      MigrationSecurityGroupId: this.network.migrationSecurityGroup.securityGroupId,
      WebRepositoryUri: this.images.repositories.web.repositoryUri,
      WorkerRepositoryUri: this.images.repositories.worker.repositoryUri,
      ClusterName: this.compute.cluster.clusterName,
      WebServiceName: this.compute.web.serviceName,
      WorkerServiceName: this.compute.worker.serviceName,
      PlatformServiceName: this.compute.platform.serviceName,
      MigrationTaskFamily: this.compute.migrationTask.family,
      WebLogGroup: this.monitoring.webLogGroup.logGroupName,
      PlatformLogGroup: this.monitoring.platformLogGroup.logGroupName,
      MigrationLogGroup: this.monitoring.migrationLogGroup.logGroupName,
      LoadBalancerDnsName: this.edge.loadBalancer.loadBalancerDnsName,
      StaticAssetsDistributionDomain: this.edge.distribution.distributionDomainName,
      AppOrigin: this.parameters.appOrigin,
      StaticAssetsOrigin: `https://${this.parameters.staticDomainName}`,
    };
    if (this.pullRequestDiff !== undefined) {
      values.PullRequestDiffRoleArn = this.pullRequestDiff.role.roleArn;
    }
    for (const [name, value] of Object.entries(values)) {
      new CfnOutput(this, name, { value });
    }
  }
}
