import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { type CfnResource, getAtt, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, synthesized } from './synth';

/**
 * PRD 16, network: "Private subnets for database and worker; VPC endpoints for S3, KMS, Bedrock ...;
 * WAF with managed rules and rate limits; no public database endpoint". Evidence: these CDK
 * assertions (the web ACL's are in edge.test.ts).
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

  it('gives the data subnets no route out of the VPC, and no private subnet a public address', () => {
    const routes = resourcesOf(template, 'AWS::EC2::Route').map(([, route]) => JSON.stringify(propertiesOf(route).RouteTableId));
    for (const id of idsIn('data')) {
      const table = routeTableOf(id);
      expect(table, id).toBeDefined();
      expect(routes).not.toContain(JSON.stringify(table));
    }
    for (const id of privateSubnets) {
      expect(propertiesOf(resourceById(template, 'AWS::EC2::Subnet', id)).MapPublicIpOnLaunch, id).toBe(false);
    }
  });

  it('routes the app subnets out only through NAT gateways in the edge subnets, one per zone in production (docs/adr/0049)', () => {
    const expected = environmentSettings(environment).compute.natGateways;
    expect(expected).toBe(environment === 'production' ? 2 : 1);
    const nats = resourcesOf(template, 'AWS::EC2::NatGateway');
    expect(nats).toHaveLength(expected);
    expect(resourcesOf(template, 'AWS::EC2::EIP')).toHaveLength(expected);
    const edgeRefs = idsIn('edge').map((id) => JSON.stringify(ref(id)));
    for (const [id, nat] of nats) {
      expect(edgeRefs, id).toContain(JSON.stringify(propertiesOf(nat).SubnetId));
    }
    const natRefs = nats.map(([id]) => JSON.stringify(ref(id)));
    const routes = resourcesOf(template, 'AWS::EC2::Route').map(([, route]) => propertiesOf(route));
    for (const id of idsIn('app')) {
      const table = JSON.stringify(routeTableOf(id));
      const own = routes.filter((route) => JSON.stringify(route.RouteTableId) === table);
      expect(own, id).toHaveLength(1);
      expect(own[0]?.DestinationCidrBlock, id).toBe('0.0.0.0/0');
      expect(natRefs, id).toContain(JSON.stringify(own[0]?.NatGatewayId));
      expect(own[0]?.GatewayId, id).toBeUndefined();
    }
  });

  it('keeps the edge subnets ready for the load balancer without assigning public addresses', () => {
    for (const id of idsIn('edge')) {
      expect(propertiesOf(resourceById(template, 'AWS::EC2::Subnet', id)).MapPublicIpOnLaunch, id).toBe(false);
    }
  });

  it('has interface endpoints for KMS, Bedrock runtime, Secrets Manager, CloudWatch Logs, ECR, the RDS API and the SES API, and an S3 gateway', () => {
    const endpoints = resourcesOf(template, 'AWS::EC2::VPCEndpoint');
    const interfaces = endpoints.filter(([, e]) => propertiesOf(e).VpcEndpointType === 'Interface');
    expect(interfaces.map(([, e]) => endpointService(e)).sort()).toEqual(
      ['bedrock-runtime', 'ecr.api', 'ecr.dkr', 'email', 'kms', 'logs', 'rds', 'secretsmanager'].sort(),
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
    const clients = [stack.network.webSecurityGroup, stack.network.workerSecurityGroup, stack.network.operatorSecurityGroup, stack.network.migrationSecurityGroup].map(
      (group) => getAtt(logicalIdOf(stack, group), 'GroupId'),
    );
    expect(ingress).toHaveLength(5);
    for (const rule of ingress) {
      expect(rule).toMatchObject({ IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432 });
      expect(rule.SourceSecurityGroupId).toBeDefined();
      expect(rule.CidrIp).toBeUndefined();
    }
    expect(ingress.map((rule) => rule.SourceSecurityGroupId)).toEqual(expect.arrayContaining(clients));
    const group = resourceById(template, 'AWS::EC2::SecurityGroup', databaseGroup['Fn::GetAtt'][0]);
    expect(propertiesOf(group).SecurityGroupIngress).toBeUndefined();
  });

  it('lets only the load balancer accept traffic from the internet, and only HTTPS', () => {
    const balancer = logicalIdOf(stack, stack.edge.loadBalancerSecurityGroup);
    const inline = resourcesOf(template, 'AWS::EC2::SecurityGroup').flatMap(([id, group]) =>
      ((propertiesOf(group).SecurityGroupIngress ?? []) as Record<string, unknown>[]).map((rule) => ({ id, rule })),
    );
    const separate = resourcesOf(template, 'AWS::EC2::SecurityGroupIngress').map(([, rule]) => ({
      id: (propertiesOf(rule).GroupId as { 'Fn::GetAtt': [string] })['Fn::GetAtt'][0],
      rule: propertiesOf(rule),
    }));
    const open = [...inline, ...separate].filter(({ rule }) => rule.CidrIp === '0.0.0.0/0' || rule.CidrIpv6 !== undefined);
    expect(open).toEqual([{ id: balancer, rule: expect.objectContaining({ CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 443, ToPort: 443 }) }]);
  });

  it('limits the web, worker, operator and migration groups to HTTPS and PostgreSQL egress', () => {
    for (const group of [stack.network.webSecurityGroup, stack.network.workerSecurityGroup, stack.network.operatorSecurityGroup, stack.network.migrationSecurityGroup]) {
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
