import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { aws_cloudfront as cloudfront } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import {
  COUNTED_COMMON_RULES,
  LOAD_BALANCER_TLS_POLICY,
  MANAGED_RULE_GROUPS,
  RATE_LIMITS,
  STATIC_PATH_PATTERN,
  LOAD_BALANCER_IDLE_TIMEOUT_SECONDS,
  WEB_HEALTH_CHECK,
  WEB_KEEP_ALIVE_MS,
  WEB_PORT,
} from '../lib/constructs/edge';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { getAtt, logicalIdOf, onlyResource, propertiesOf, ref, resourcesOf, synthesized } from './synth';

interface WafRule {
  readonly Name: string;
  readonly Priority: number;
  readonly Action?: Record<string, unknown>;
  readonly OverrideAction?: Record<string, unknown>;
  readonly Statement: Record<string, Record<string, unknown>>;
  readonly VisibilityConfig: { CloudWatchMetricsEnabled: boolean; MetricName: string; SampledRequestsEnabled: boolean };
}

/**
 * PRD 15, Stack: compute ("ECS Fargate for web and worker behind an application load balancer with
 * WAF; CloudFront for static assets only") and Request path for a PHI page; PRD 16, Network ("WAF
 * with managed rules and rate limits") and Encryption ("TLS 1.2 or later everywhere"). Evidence:
 * these CDK assertions.
 */
describe.each(ENVIRONMENTS)('%s: edge', (environment) => {
  const { stack, template } = synthesized(environment);
  const [balancerId, balancer] = onlyResource(template, 'AWS::ElasticLoadBalancingV2::LoadBalancer');
  const attributes = Object.fromEntries((propertiesOf(balancer).LoadBalancerAttributes as { Key: string; Value: string }[]).map((entry) => [entry.Key, entry.Value]));
  const edgeSubnets = stack.network.vpc.selectSubnets({ subnetGroupName: 'edge' }).subnets.map((subnet) => ref(logicalIdOf(stack, subnet as never)));

  it('puts an internet-facing application load balancer in the edge subnets under its own security group', () => {
    expect(propertiesOf(balancer)).toMatchObject({
      Type: 'application',
      Scheme: 'internet-facing',
      Subnets: edgeSubnets,
      SecurityGroups: [getAtt(logicalIdOf(stack, stack.edge.loadBalancerSecurityGroup), 'GroupId')],
    });
    expect(attributes['routing.http.drop_invalid_header_fields.enabled']).toBe('true');
    expect(attributes['deletion_protection.enabled']).toBe(environment === 'production' ? 'true' : 'false');
  });

  it('listens on HTTPS 443 only, with the AppDomainName certificate and TLS 1.2 or later', () => {
    const listeners = resourcesOf(template, 'AWS::ElasticLoadBalancingV2::Listener');
    expect(listeners).toHaveLength(1);
    expect(propertiesOf(listeners[0]?.[1] ?? { Type: '' })).toMatchObject({
      LoadBalancerArn: ref(balancerId),
      Port: 443,
      Protocol: 'HTTPS',
      SslPolicy: LOAD_BALANCER_TLS_POLICY,
      Certificates: [{ CertificateArn: ref(PARAMETER_NAMES.certificateArn) }],
      DefaultActions: [{ Type: 'forward', TargetGroupArn: ref(logicalIdOf(stack, stack.edge.targetGroup)) }],
    });
    expect(LOAD_BALANCER_TLS_POLICY).toBe('ELBSecurityPolicy-TLS13-1-2-Res-2021-06');
    expect(resourcesOf(template, 'AWS::ElasticLoadBalancingV2::ListenerRule')).toEqual([]);
  });

  it('admits HTTPS from the internet and reaches only the web tasks on their port', () => {
    const groupId = logicalIdOf(stack, stack.edge.loadBalancerSecurityGroup);
    const [, group] = resourcesOf(template, 'AWS::EC2::SecurityGroup').find(([id]) => id === groupId) ?? ['', { Type: '' }];
    expect(propertiesOf(group).SecurityGroupIngress).toEqual([expect.objectContaining({ CidrIp: '0.0.0.0/0', IpProtocol: 'tcp', FromPort: 443, ToPort: 443 })]);
    // No egress of its own beyond the one rule to the web tasks.
    expect(propertiesOf(group).SecurityGroupEgress).toBeUndefined();
    const egress = resourcesOf(template, 'AWS::EC2::SecurityGroupEgress')
      .map(([, rule]) => propertiesOf(rule))
      .filter((rule) => JSON.stringify(rule.GroupId) === JSON.stringify(getAtt(groupId, 'GroupId')));
    expect(egress).toEqual([
      expect.objectContaining({ IpProtocol: 'tcp', FromPort: WEB_PORT, ToPort: WEB_PORT, DestinationSecurityGroupId: getAtt(logicalIdOf(stack, stack.network.webSecurityGroup), 'GroupId') }),
    ]);
    const ingress = resourcesOf(template, 'AWS::EC2::SecurityGroupIngress')
      .map(([, rule]) => propertiesOf(rule))
      .filter((rule) => JSON.stringify(rule.GroupId) === JSON.stringify(getAtt(logicalIdOf(stack, stack.network.webSecurityGroup), 'GroupId')));
    expect(ingress).toEqual([expect.objectContaining({ IpProtocol: 'tcp', FromPort: WEB_PORT, ToPort: WEB_PORT, SourceSecurityGroupId: getAtt(groupId, 'GroupId') })]);
  });

  it('health-checks each web task on the sign-in page, by address, before it receives traffic', () => {
    expect(propertiesOf(onlyResource(template, 'AWS::ElasticLoadBalancingV2::TargetGroup')[1])).toMatchObject({
      TargetType: 'ip',
      Port: WEB_PORT,
      Protocol: 'HTTP',
      HealthCheckPath: WEB_HEALTH_CHECK.path,
      Matcher: { HttpCode: WEB_HEALTH_CHECK.healthyHttpCodes },
      HealthCheckIntervalSeconds: 15,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
    });
  });

  describe('the web ACL', () => {
    const [aclId, acl] = onlyResource(template, 'AWS::WAFv2::WebACL');
    const rules = propertiesOf(acl).Rules as WafRule[];

    it('is attached to the load balancer', () => {
      expect(propertiesOf(onlyResource(template, 'AWS::WAFv2::WebACLAssociation')[1])).toEqual({ ResourceArn: ref(balancerId), WebACLArn: getAtt(aclId, 'Arn') });
      expect(propertiesOf(acl)).toMatchObject({ Scope: 'REGIONAL', DefaultAction: { Allow: {} } });
    });

    it('limits every address first, then sign-in, with rate-based rules that block', () => {
      expect(rules.slice(0, 2).map((rule) => rule.Name)).toEqual(['RateLimitAll', 'RateLimitSignIn']);
      expect(rules[0]).toMatchObject({
        Priority: 0,
        Action: { Block: {} },
        Statement: { RateBasedStatement: { Limit: RATE_LIMITS.all.limit, EvaluationWindowSec: 300, AggregateKeyType: 'IP' } },
      });
      expect(rules[0]?.Statement.RateBasedStatement?.ScopeDownStatement).toBeUndefined();
      expect(rules[1]).toMatchObject({
        Priority: 1,
        Action: { Block: {} },
        Statement: { RateBasedStatement: { Limit: RATE_LIMITS.signIn.limit, EvaluationWindowSec: 300, AggregateKeyType: 'IP' } },
      });
      const scope = rules[1]?.Statement.RateBasedStatement?.ScopeDownStatement as { OrStatement: { Statements: { ByteMatchStatement: Record<string, unknown> }[] } };
      expect(scope.OrStatement.Statements.map((statement) => statement.ByteMatchStatement)).toEqual(
        RATE_LIMITS.signIn.pathPrefixes.map((prefix) => ({
          FieldToMatch: { UriPath: {} },
          PositionalConstraint: 'STARTS_WITH',
          SearchString: prefix,
          TextTransformations: [{ Priority: 0, Type: 'LOWERCASE' }],
        })),
      );
      expect(RATE_LIMITS.signIn.limit).toBeLessThan(RATE_LIMITS.all.limit);
    });

    it('then applies the AWS managed IP reputation, common and known-bad-input rule groups, counting only the body-size rule', () => {
      const managed = rules.slice(2);
      expect(managed.map((rule) => rule.Name)).toEqual([...MANAGED_RULE_GROUPS]);
      for (const [index, rule] of managed.entries()) {
        expect(rule.Priority).toBe(2 + index);
        expect(rule.OverrideAction).toEqual({ None: {} });
        expect(rule.Statement.ManagedRuleGroupStatement).toMatchObject({ VendorName: 'AWS', Name: rule.Name });
      }
      const common = managed.find((rule) => rule.Name === 'AWSManagedRulesCommonRuleSet');
      expect(common?.Statement.ManagedRuleGroupStatement?.RuleActionOverrides).toEqual(COUNTED_COMMON_RULES.map((name) => ({ Name: name, ActionToUse: { Count: {} } })));
      for (const rule of managed.filter((candidate) => candidate.Name !== 'AWSManagedRulesCommonRuleSet')) {
        expect(rule.Statement.ManagedRuleGroupStatement?.RuleActionOverrides).toBeUndefined();
      }
      expect(rules).toHaveLength(5);
    });

    it('publishes metrics for every rule and keeps no sampled request (their headers carry session cookies)', () => {
      for (const config of [propertiesOf(acl).VisibilityConfig, ...rules.map((rule) => rule.VisibilityConfig)] as WafRule['VisibilityConfig'][]) {
        expect(config).toMatchObject({ CloudWatchMetricsEnabled: true, SampledRequestsEnabled: false });
        expect(config.MetricName).toMatch(new RegExp(`^tp-${environment}-`));
      }
    });

    it('tells the operator when an address is blocked for sign-in requests', () => {
      const alarm = resourcesOf(template, 'AWS::CloudWatch::Alarm').find(([id]) => id === logicalIdOf(stack, stack.edge.signInRateLimitAlarm))?.[1] ?? { Type: '' };
      const metricName = (name: string) => rules.find((rule) => rule.Name === name)?.VisibilityConfig.MetricName;
      expect(propertiesOf(alarm)).toMatchObject({
        Namespace: 'AWS/WAFV2',
        MetricName: 'BlockedRequests',
        Statistic: 'Sum',
        Period: 300,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching',
        AlarmActions: [ref(logicalIdOf(stack, stack.monitoring.operatorTopic))],
      });
      expect(propertiesOf(alarm).Dimensions).toEqual(
        expect.arrayContaining([
          { Name: 'WebACL', Value: (propertiesOf(acl).VisibilityConfig as WafRule['VisibilityConfig']).MetricName },
          { Name: 'Rule', Value: metricName('RateLimitSignIn') },
          { Name: 'Region', Value: { Ref: 'AWS::Region' } },
        ]),
      );
    });
  });

  describe('CloudFront serves static assets only', () => {
    const [, distribution] = onlyResource(template, 'AWS::CloudFront::Distribution');
    const config = propertiesOf(distribution).DistributionConfig as Record<string, unknown>;
    const behaviors = config.CacheBehaviors as Record<string, unknown>[];
    const fallback = config.DefaultCacheBehavior as Record<string, unknown>;

    it('on the static host with its us-east-1 certificate, TLS 1.2 or later, HTTPS only', () => {
      expect(config.Aliases).toEqual([ref(PARAMETER_NAMES.staticDomainName)]);
      expect(config.ViewerCertificate).toEqual({ AcmCertificateArn: ref(PARAMETER_NAMES.staticCertificateArn), MinimumProtocolVersion: 'TLSv1.2_2021', SslSupportMethod: 'sni-only' });
      for (const behavior of [fallback, ...behaviors]) {
        expect(behavior.ViewerProtocolPolicy).toBe('https-only');
        expect(behavior.AllowedMethods).toEqual(['GET', 'HEAD']);
      }
      expect(config.Logging).toBeUndefined();
    });

    it('fetches from the application host over HTTPS with TLS 1.2, passing on no cookie, header or query string', () => {
      expect(config.Origins).toEqual([
        { Id: expect.any(String), DomainName: ref(PARAMETER_NAMES.appDomainName), CustomOriginConfig: { OriginProtocolPolicy: 'https-only', OriginSSLProtocols: ['TLSv1.2'] } },
      ]);
      for (const behavior of [fallback, ...behaviors]) {
        expect(behavior.OriginRequestPolicyId).toBeUndefined();
        expect(behavior.ForwardedValues).toBeUndefined();
      }
    });

    it('caches Next.js build output alone, and refuses every other path at the edge before it reaches the application', () => {
      expect(behaviors).toHaveLength(1);
      expect(behaviors[0]).toMatchObject({ PathPattern: STATIC_PATH_PATTERN, CachePolicyId: cloudfront.CachePolicy.CACHING_OPTIMIZED.cachePolicyId });
      expect(STATIC_PATH_PATTERN).toBe('/_next/static/*');
      expect(fallback.CachePolicyId).toBe(cloudfront.CachePolicy.CACHING_DISABLED.cachePolicyId);
      const [functionId, edgeFunction] = onlyResource(template, 'AWS::CloudFront::Function');
      expect(fallback.FunctionAssociations).toEqual([{ EventType: 'viewer-request', FunctionARN: getAtt(functionId, 'FunctionARN') }]);
      const code = propertiesOf(edgeFunction).FunctionCode as string;
      const handler = vm.runInNewContext(`${code}\nhandler`) as (event: unknown) => unknown;
      for (const uri of ['/', '/p/7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01/claims', '/api/sign-in/hardware-key/options', '/sign-in']) {
        expect(handler({ request: { uri, method: 'GET', headers: {} } }), uri).toEqual({ statusCode: 404, statusDescription: 'Not Found' });
      }
      expect(propertiesOf(edgeFunction).FunctionConfig).toMatchObject({ Runtime: 'cloudfront-js-2.0' });
    });

    it('lets only the application origin read the assets cross-origin, with HSTS and no content sniffing', () => {
      const [policyId, policy] = onlyResource(template, 'AWS::CloudFront::ResponseHeadersPolicy');
      expect(behaviors[0]?.ResponseHeadersPolicyId).toEqual(ref(policyId));
      expect((propertiesOf(policy).ResponseHeadersPolicyConfig as Record<string, unknown>).CorsConfig).toEqual({
        AccessControlAllowCredentials: false,
        AccessControlAllowHeaders: { Items: ['*'] },
        AccessControlAllowMethods: { Items: ['GET', 'HEAD'] },
        AccessControlAllowOrigins: { Items: [{ 'Fn::Join': ['', ['https://', ref(PARAMETER_NAMES.appDomainName)]] }] },
        OriginOverride: true,
      });
      expect((propertiesOf(policy).ResponseHeadersPolicyConfig as Record<string, unknown>).SecurityHeadersConfig).toEqual({
        ContentTypeOptions: { Override: true },
        StrictTransportSecurity: { AccessControlMaxAgeSec: 31536000, IncludeSubdomains: true, Override: true },
      });
    });
  });
});

describe('the edge contract with the web app', () => {
  it('health-checks the route that asks the database, which the web app serves to anyone', () => {
    const route = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/app/api/health/route.ts'), 'utf8');
    expect(route).toContain('routeHandler(healthCheck');
    const support = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/routes/support.ts'), 'utf8');
    expect(support).toMatch(/id: 'public\.health',\s+kind: 'handler',\s+path: '\/api\/health'/);
    expect(support).toContain("await client.query('SELECT 1')");
    expect(WEB_HEALTH_CHECK.path).toBe('/api/health');
  });

  it('keeps a silent connection open longer than a model call can take, and the web server longer still', () => {
    const config = readFileSync(path.resolve(import.meta.dirname, '../../packages/model-gateway/src/config.ts'), 'utf8');
    const timeout = /export const CALL_TIMEOUT_MS = ([\d_]+);/.exec(config)?.[1];
    expect(timeout).toBeDefined();
    const callSeconds = Number((timeout ?? '0').replaceAll('_', '')) / 1000;
    // Two attempts at the call timeout, and a minute for the database work around them.
    expect(LOAD_BALANCER_IDLE_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(2 * callSeconds + 60);
    expect(WEB_KEEP_ALIVE_MS).toBeGreaterThan(LOAD_BALANCER_IDLE_TIMEOUT_SECONDS * 1000);
  });

  it('rate-limits the paths the sign-in routes are registered under', () => {
    const routes = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/routes/sign-in.ts'), 'utf8');
    const paths = [...routes.matchAll(/path: '([^']+)'/g)].map((match) => match[1] ?? '');
    expect(paths.length).toBeGreaterThan(0);
    for (const routePath of paths) {
      expect(RATE_LIMITS.signIn.pathPrefixes.some((prefix) => routePath.startsWith(prefix)), routePath).toBe(true);
    }
  });
});
