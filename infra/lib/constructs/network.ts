import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** Subnet groups: `edge` for the load balancer (milestone 11), `app` for web and worker, `data` for RDS. */
export const SUBNET_GROUPS = { edge: 'edge', app: 'app', data: 'data' } as const;

/**
 * Interface endpoints, so the private subnets reach AWS without an internet path (PRD 16, network:
 * "VPC endpoints for S3, KMS, Bedrock"; Bedrock through a VPC endpoint, PRD 14 and 15). ECR's API
 * and Docker endpoints let the tasks pull images; the layers come through the S3 gateway endpoint.
 */
export const INTERFACE_ENDPOINTS: readonly (readonly [string, ec2.InterfaceVpcEndpointAwsService])[] = [
  ['Kms', ec2.InterfaceVpcEndpointAwsService.KMS],
  ['BedrockRuntime', ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME],
  ['SecretsManager', ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER],
  ['CloudWatchLogs', ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS],
  ['EcrApi', ec2.InterfaceVpcEndpointAwsService.ECR],
  ['EcrDocker', ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER],
];

/**
 * The VPC (PRD 16, network): two availability zones; private subnets for the database and the
 * worker with no route to the internet; public `edge` subnets that hold nothing until the load
 * balancer arrives with the compute in milestone 11 (they assign no public addresses). There is no
 * NAT gateway: every AWS service the private subnets use has an endpoint. The default security
 * group is stripped of its rules.
 *
 * The web and worker security groups exist now so the database and the endpoints can admit them;
 * the Fargate services attach to them in milestone 11. Their egress is HTTPS only (the endpoints
 * and S3), plus PostgreSQL to the database, which the Database construct adds.
 */
export class Network extends Construct {
  readonly vpc: ec2.Vpc;
  readonly appSubnets: ec2.SubnetSelection = { subnetGroupName: SUBNET_GROUPS.app };
  readonly dataSubnets: ec2.SubnetSelection = { subnetGroupName: SUBNET_GROUPS.data };
  readonly endpointSecurityGroup: ec2.SecurityGroup;
  readonly webSecurityGroup: ec2.SecurityGroup;
  readonly workerSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: { readonly cidr: string }) {
    super(scope, id);
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidr),
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: true,
      subnetConfiguration: [
        { name: SUBNET_GROUPS.edge, subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24, mapPublicIpOnLaunch: false },
        { name: SUBNET_GROUPS.app, subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 22 },
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
  }
}

/**
 * A security group for something in the app subnets: no ingress, HTTPS egress only. The subnets
 * have no internet route, so HTTPS reaches only the endpoints and the S3 gateway.
 */
export function appTierSecurityGroup(scope: Construct, id: string, vpc: ec2.IVpc, description: string): ec2.SecurityGroup {
  const group = new ec2.SecurityGroup(scope, id, { vpc, description, allowAllOutbound: false });
  group.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS to the VPC endpoints and S3');
  return group;
}
