import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Subnet groups: `edge` for the load balancer (milestone 11), `app` for web and worker, `data` for RDS. */
export const SUBNET_GROUPS = { edge: 'edge', app: 'app', data: 'data' } as const;

/**
 * Interface endpoints, so the private subnets reach AWS without an internet path (PRD 16, network:
 * "VPC endpoints for S3, KMS, Bedrock"; Bedrock through a VPC endpoint, PRD 14 and 15). ECR's API
 * and Docker endpoints let the tasks pull images; the layers come through the S3 gateway endpoint.
 * The RDS API is for the monthly restore drill (it restores a snapshot to a scratch instance and
 * deletes it, PRD 16 Backups and restore), and the SES API for the support-access notices (PRD 5,
 * J15); both are platform jobs on the operator role.
 */
export const INTERFACE_ENDPOINTS: readonly (readonly [string, ec2.InterfaceVpcEndpointAwsService])[] = [
  ['Kms', ec2.InterfaceVpcEndpointAwsService.KMS],
  ['BedrockRuntime', ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME],
  ['SecretsManager', ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER],
  ['CloudWatchLogs', ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS],
  ['EcrApi', ec2.InterfaceVpcEndpointAwsService.ECR],
  ['EcrDocker', ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER],
  ['RdsApi', ec2.InterfaceVpcEndpointAwsService.RDS],
  ['SesApi', ec2.InterfaceVpcEndpointAwsService.EMAIL],
];

/**
 * The VPC (PRD 16, network): two availability zones; private subnets for the database and the
 * tasks; public `edge` subnets for the load balancer and the NAT gateways (they assign no public
 * addresses). The `data` subnets have no route out of the VPC at all. The `app` subnets reach AWS
 * through the endpoints and S3 through its gateway, and the internet only through NAT gateways in
 * the edge subnets, for what has no endpoint the platform can rely on: Cognito's API and the JWKS
 * its tokens are verified against, Stripe's API for billing and the compliance platform's API
 * (docs/adr/0049). The default security group is stripped of its rules.
 *
 * Every task has its own security group with no ingress (the web group admits the load balancer
 * only, added by the compute) and HTTPS egress only, plus PostgreSQL to the database, which the
 * Database construct adds: web, worker (practice jobs), operator (the platform jobs: the audit copy,
 * the restore drill, the support notices and the monitoring schedule) and migration (the one-off
 * migration task, the only one holding the owner login).
 */
export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly appSubnets: ec2.SubnetSelection = { subnetGroupName: SUBNET_GROUPS.app };
  readonly dataSubnets: ec2.SubnetSelection = { subnetGroupName: SUBNET_GROUPS.data };
  readonly endpointSecurityGroup: ec2.SecurityGroup;
  readonly webSecurityGroup: ec2.SecurityGroup;
  readonly workerSecurityGroup: ec2.SecurityGroup;
  readonly operatorSecurityGroup: ec2.SecurityGroup;
  readonly migrationSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: { readonly cidr: string; readonly natGateways: number }) {
    super(scope, id);
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidr),
      maxAzs: 2,
      natGateways: props.natGateways,
      natGatewaySubnets: { subnetGroupName: SUBNET_GROUPS.edge },
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: SUBNET_GROUPS.edge, subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24, mapPublicIpOnLaunch: false },
        { name: SUBNET_GROUPS.app, subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: SUBNET_GROUPS.data, subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
      gatewayEndpoints: {
        S3: { service: ec2.GatewayVpcEndpointAwsService.S3, subnets: [this.appSubnets] },
      },
    });

    this.endpointSecurityGroup = new ec2.SecurityGroup(this, 'EndpointSecurityGroup', {
      vpc: this.vpc,
      description: 'Interface VPC endpoints: HTTPS from inside the VPC',
      allowAllOutbound: false,
    });
    this.endpointSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(443), 'HTTPS from the VPC');
    for (const [endpointId, service] of INTERFACE_ENDPOINTS) {
      this.vpc.addInterfaceEndpoint(endpointId, {
        service,
        subnets: this.appSubnets,
        privateDnsEnabled: true,
        securityGroups: [this.endpointSecurityGroup],
        open: false,
      });
    }

    this.webSecurityGroup = appTierSecurityGroup(this, 'WebSecurityGroup', this.vpc, 'Web tasks (milestone 11)');
    this.workerSecurityGroup = appTierSecurityGroup(this, 'WorkerSecurityGroup', this.vpc, 'Worker tasks (milestone 11)');
    this.operatorSecurityGroup = appTierSecurityGroup(this, 'OperatorSecurityGroup', this.vpc, 'Platform jobs: audit copy, restore drill, support notices (milestone 11)');
    this.migrationSecurityGroup = appTierSecurityGroup(this, 'MigrationSecurityGroup', this.vpc, 'The one-off migration task before each release');
  }
}

/**
 * A security group for something in the app subnets: no ingress, HTTPS egress only: the endpoints,
 * the S3 gateway and, through the NAT gateways, the few internet APIs the tasks call.
 */
export function appTierSecurityGroup(scope: Construct, id: string, vpc: ec2.IVpc, description: string): ec2.SecurityGroup {
  const group = new ec2.SecurityGroup(scope, id, { vpc, description, allowAllOutbound: false });
  group.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to the VPC endpoints, S3 and the NAT gateways');
  return group;
}
