import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { type CfnResource, getAtt, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, synthesized } from './synth';

/**
 * PRD 16, network: "Private subnets for database and worker; VPC endpoints for S3, KMS, Bedrock ...;
 * no public database endpoint". Evidence: these CDK assertions.
 */

function subnetGroup(subnet: CfnResource): string | undefined {
  const tags = (propertiesOf(subnet).Tags ?? []) as { Key: string; Value: string }[];
  return tags.find((tag) => tag.Key === 'aws-cdk:subnet-name')?.Value;
}

/** The service a VPC endpoint's ServiceName names, e.g. `kms` or `ecr.dkr` (`com.amazonaws.<region>.<service>`). */
function endpointService(endpoint: CfnResource): string {
  const name = JSON.stringify(propertiesOf(endpoint).ServiceName);
  const service = /^\{"Fn::Join":\["",\["com\.amazonaws\.",\{"Ref":"AWS::Region"\},"\.([a-z0-9.-]+)"\]\]\}$/.exec(name)?.[1];
  if (service === undefined) {
    throw new Error(`cannot read the service of ${name}`);
  }
  return service;
}

describe.each(ENVIRONMENTS)('%s: network', (environment) => {
  const { stack, template } = synthesized(environment);
  const subnets = resourcesOf(template, 'AWS::EC2::Subnet');
  const idsIn = (group: string) => subnets.filter(([, subnet]) => subnetGroup(subnet) === group).map(([id]) => id);
  const privateSubnets = [...idsIn('app'), ...idsIn('data')];
  const associations = resourcesOf(template, 'AWS::EC2::SubnetRouteTableAssociation').map(([, a]) => propertiesOf(a));
  const routeTableOf = (subnetId: string) =>
    associations.find((a) => JSON.stringify(a.SubnetId) === JSON.stringify(ref(subnetId)))?.RouteTableId;

  it('is one VPC on the environment CIDR with edge, app and data subnets in two zones', () => {
    template.hasResourceProperties('AWS::EC2::VPC', { CidrBlock: environmentSettings(environment).vpcCidr });
    expect(idsIn('edge')).toHaveLength(2);
    expect(idsIn('app')).toHaveLength(2);
    expect(idsIn('data')).toHaveLength(2);
    expect(subnets).toHaveLength(6);
  });

  it('gives the app and data subnets no route out of the VPC and no public addresses', () => {
    const routes = resourcesOf(template, 'AWS::EC2::Route').map(([, route]) => JSON.stringify(propertiesOf(route).RouteTableId));
    for (const id of privateSubnets) {
      const table = routeTableOf(id);
      expect(table, id).toBeDefined();
      expect(routes).not.toContain(JSON.stringify(table));
      expect(propertiesOf(resourceById(template, 'AWS::EC2::Subnet', id)).MapPublicIpOnLaunch, id).toBe(false);
    }
    expect(resourcesOf(template, 'AWS::EC2::NatGateway')).toEqual([]);
    expect(resourcesOf(template, 'AWS::EC2::EIP')).toEqual([]);
  });

  it('keeps the edge subnets ready for the load balancer without assigning public addresses', () => {
    for (const id of idsIn('edge')) {
      expect(propertiesOf(resourceById(template, 'AWS::EC2::Subnet', id)).MapPublicIpOnLaunch, id).toBe(false);
    }
  });

  it('has interface endpoints for KMS, Bedrock runtime, Secrets Manager, CloudWatch Logs and ECR, and an S3 gateway', () => {
    const endpoints = resourcesOf(template, 'AWS::EC2::VPCEndpoint');
    const interfaces = endpoints.filter(([, e]) => propertiesOf(e).VpcEndpointType === 'Interface');
    expect(interfaces.map(([, e]) => endpointService(e)).sort()).toEqual(
      ['bedrock-runtime', 'ecr.api', 'ecr.dkr', 'kms', 'logs', 'secretsmanager'].sort(),
    );
    const appSubnetRefs = idsIn('app').map(ref);
    for (const [id, endpoint] of interfaces) {
      expect(propertiesOf(endpoint).PrivateDnsEnabled, id).toBe(true);
      expect(propertiesOf(endpoint).SubnetIds, id).toEqual(appSubnetRefs);
    }
    const gateways = endpoints.filter(([, e]) => propertiesOf(e).VpcEndpointType === 'Gateway');
    expect(gateways.map(([, e]) => endpointService(e))).toEqual(['s3']);
    expect(propertiesOf(gateways[0]?.[1] ?? { Type: '' }).RouteTableIds).toEqual(idsIn('app').map(routeTableOf));
  });

  it('admits only HTTPS from inside the VPC to the endpoints', () => {
    const groupId = logicalIdOf(stack, stack.network.endpointSecurityGroup);
    const group = resourceById(template, 'AWS::EC2::SecurityGroup', groupId);
    expect(propertiesOf(group).SecurityGroupIngress).toEqual([
      expect.objectContaining({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: getAtt(logicalIdOf(stack, stack.network.vpc), 'CidrBlock') }),
    ]);
  });

  it('strips the default security group of its rules', () => {
    expect(resourcesOf(template, 'Custom::VpcRestrictDefaultSG')).toHaveLength(1);
  });

  it('never exposes the database: not publicly accessible, in the data subnets, PostgreSQL only from named security groups', () => {
    const [, instance] = onlyResource(template, 'AWS::RDS::DBInstance');
    expect(propertiesOf(instance).PubliclyAccessible).toBe(false);
    const [, subnetGroupResource] = onlyResource(template, 'AWS::RDS::DBSubnetGroup');
    expect(propertiesOf(subnetGroupResource).SubnetIds).toEqual(idsIn('data').map(ref));

    const databaseGroup = getAtt(logicalIdOf(stack, stack.database.securityGroup), 'GroupId');
    const ingress = resourcesOf(template, 'AWS::EC2::SecurityGroupIngress')
      .map(([, rule]) => propertiesOf(rule))
      .filter((rule) => JSON.stringify(rule.GroupId) === JSON.stringify(databaseGroup));
    const clients = [stack.network.webSecurityGroup, stack.network.workerSecurityGroup].map((group) =>
      getAtt(logicalIdOf(stack, group), 'GroupId'),
    );
    expect(ingress).toHaveLength(3);
    for (const rule of ingress) {
      expect(rule).toMatchObject({ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432 });
      expect(rule.SourceSecurityGroupId).toBeDefined();
      expect(rule.CidrIp).toBeUndefined();
    }
    expect(ingress.map((rule) => rule.SourceSecurityGroupId)).toEqual(expect.arrayContaining(clients));
    const group = resourceById(template, 'AWS::EC2::SecurityGroup', databaseGroup['Fn::GetAtt'][0]);
    expect(propertiesOf(group).SecurityGroupIngress).toBeUndefined();
  });

  it('lets no security group accept traffic from the internet', () => {
    const inline = resourcesOf(template, 'AWS::EC2::SecurityGroup').flatMap(
      ([, group]) => (propertiesOf(group).SecurityGroupIngress ?? []) as Record<string, unknown>[],
    );
    const separate = resourcesOf(template, 'AWS::EC2::SecurityGroupIngress').map(([, rule]) => propertiesOf(rule));
    for (const rule of [...inline, ...separate]) {
      expect(rule.CidrIp).not.toBe('0.0.0.0/0');
      expect(rule.CidrIpv6).toBeUndefined();
    }
  });

  it('limits the web and worker groups to HTTPS and PostgreSQL egress', () => {
    for (const group of [stack.network.webSecurityGroup, stack.network.workerSecurityGroup]) {
      const id = logicalIdOf(stack, group);
      const resource = resourceById(template, 'AWS::EC2::SecurityGroup', id);
      expect(propertiesOf(resource).SecurityGroupEgress).toEqual([
        expect.objectContaining({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' }),
      ]);
      const egress = resourcesOf(template, 'AWS::EC2::SecurityGroupEgress')
        .map(([, rule]) => propertiesOf(rule))
        .filter((rule) => JSON.stringify(rule.GroupId) === JSON.stringify(getAtt(id, 'GroupId')));
      expect(egress).toEqual([expect.objectContaining({ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432 })]);
    }
  });
});
