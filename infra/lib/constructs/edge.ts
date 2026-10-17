import {
  Duration,
  Stack,
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_cloudwatch as cloudwatch,
  type aws_cloudwatch_actions as cloudwatchActions,
  aws_ec2 as ec2,
  aws_elasticloadbalancingv2 as elbv2,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import { SECURITY_ALARM_PERIOD_SECONDS } from '../security-events';
import { type Network, SUBNET_GROUPS } from './network';

/** The web container's port behind the load balancer (apps/web/Dockerfile: PORT=3000). */
export const WEB_PORT = 3000;

/**
 * What the load balancer asks of each web task (a public page that renders on the server, so a task
 * that cannot serve pages leaves the target group). The uptime checks call the same page from outside.
 */
export const WEB_HEALTH_CHECK = { path: '/api/health', healthyHttpCodes: '200' } as const;

/**
 * How long the load balancer keeps a silent connection (docs/adr/0055). A model call runs inside the request
 * that asks for it (docs/adr/0052): two attempts of up to 60 seconds each (PRD 14), with the database work
 * around them. The idle timeout stands well above that, so a slow answer reaches the screen as the notice and
 * hand entry, not as the load balancer's 504. The web server keeps its connections open longer still
 * (WEB_KEEP_ALIVE_MS), so the load balancer never reuses one the server has just closed.
 */
export const LOAD_BALANCER_IDLE_TIMEOUT_SECONDS = 180;
export const WEB_KEEP_ALIVE_MS = (LOAD_BALANCER_IDLE_TIMEOUT_SECONDS + 5) * 1000;

/** TLS 1.2 and 1.3 only, with forward-secret AEAD ciphers (ELBSecurityPolicy-TLS13-1-2-Res-2021-06). */
export const LOAD_BALANCER_TLS_POLICY = elbv2.SslPolicy.TLS13_RES;

/** The only paths CloudFront serves: Next.js's content-hashed build output (no page, route or PHI). */
export const STATIC_PATH_PATTERN = '/_next/static/*';

/**
 * The web ACL's rate limits, per client address over five minutes (WAF's window). Every request
 * counts toward the general limit; sign-in pages and the sign-in API also count toward their own,
 * lower one, which a password-spraying address reaches long before an office of people signing in.
 */
export const RATE_LIMITS = {
  all: { limit: 3000, windowSeconds: 300 },
  signIn: { limit: 300, windowSeconds: 300, pathPrefixes: ['/sign-in', '/api/sign-in'] },
} as const;

/** AWS managed rule groups on the web ACL, in evaluation order after the rate rules. */
export const MANAGED_RULE_GROUPS = ['AWSManagedRulesAmazonIpReputationList', 'AWSManagedRulesCommonRuleSet', 'AWSManagedRulesKnownBadInputsRuleSet'] as const;

/**
 * Common rule set rules counted rather than blocked: SizeRestrictions_BODY blocks any body over
 * 8 KB, and a server action's form (a packet narrative, a posting template) can be larger. Uploads
 * never pass the load balancer (presigned PUTs go to S3).
 */
export const COUNTED_COMMON_RULES = ['SizeRestrictions_BODY'] as const;

export interface EdgeProps {
  readonly environmentName: EnvironmentName;
  readonly network: Network;
  readonly appDomainName: string;
  readonly certificateArn: string;
  readonly staticDomainName: string;
  readonly staticCertificateArn: string;
  readonly deletionProtection: boolean;
  readonly notify: cloudwatchActions.SnsAction;
}

/**
 * The edge (PRD 15, Stack: compute, and Request path for a PHI page: "browser to CloudFront (static)
 * and the load balancer (dynamic); WAF"; PRD 16, Network: "WAF with managed rules and rate limits").
 *
 * - An internet-facing application load balancer in the edge subnets, HTTPS only: one listener on
 *   443 with the AppDomainName certificate and TLS 1.2 or later, no listener on 80, a security group
 *   that admits 443 alone and reaches only the web tasks on their port. Invalid header fields are
 *   dropped; production is deletion-protected. Its target group checks WEB_HEALTH_CHECK, which touches the
 *   database, so a task whose pool is starved is replaced.
 * - A regional web ACL on it: two rate-based rules (all requests, and sign-in) first, then the AWS
 *   managed IP reputation, common and known-bad-input rule groups. Metrics go to CloudWatch; sampled
 *   requests are off, because a sampled request keeps its headers, session cookies among them. A
 *   block by the sign-in rate rule tells the operator (a failed sign-in burst from one address).
 * - CloudFront on the static host for STATIC_PATH_PATTERN only, cached, fetched from the
 *   application's own host over HTTPS with no cookie, header or query string passed on. The web image
 *   is built with the host as Next's assetPrefix and its task names it for the CSP (STATIC_ASSET_ORIGIN;
 *   docs/adr/0055), so pages load their scripts, styles and fonts from here. Every other
 *   path is answered 404 at the edge by a CloudFront function and never reaches the application, so
 *   no page, route or PHI is ever cached or served by CloudFront. TLS 1.2 or later, HTTPS only.
 */
export class Edge extends Construct {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly loadBalancerSecurityGroup: ec2.SecurityGroup;
  readonly listener: elbv2.ApplicationListener;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  readonly webAcl: wafv2.CfnWebACL;
  readonly distribution: cloudfront.Distribution;
  readonly signInRateLimitAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: EdgeProps) {
    super(scope, id);
    const vpc = props.network.vpc;

    this.loadBalancerSecurityGroup = new ec2.SecurityGroup(this, 'LoadBalancerSecurityGroup', {
      vpc,
      description: 'Load balancer: HTTPS from the internet, to the web tasks only',
      allowAllOutbound: false,
    });
    this.loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS from the internet');
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetGroupName: SUBNET_GROUPS.edge },
      securityGroup: this.loadBalancerSecurityGroup,
      dropInvalidHeaderFields: true,
      deletionProtection: props.deletionProtection,
      http2Enabled: true,
      idleTimeout: Duration.seconds(LOAD_BALANCER_IDLE_TIMEOUT_SECONDS),
    });
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'Web', {
      vpc,
      port: WEB_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: Duration.seconds(30),
      healthCheck: {
        path: WEB_HEALTH_CHECK.path,
        healthyHttpCodes: WEB_HEALTH_CHECK.healthyHttpCodes,
        interval: Duration.seconds(15),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    this.listener = this.loadBalancer.addListener('Https', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [elbv2.ListenerCertificate.fromArn(props.certificateArn)],
      sslPolicy: LOAD_BALANCER_TLS_POLICY,
      open: false,
      defaultTargetGroups: [this.targetGroup],
    });

    const metricPrefix = `tp-${props.environmentName}`;
    const visibility = (name: string): wafv2.CfnWebACL.VisibilityConfigProperty => ({
      cloudWatchMetricsEnabled: true,
      metricName: `${metricPrefix}-${name}`,
      sampledRequestsEnabled: false,
    });
    const signInPaths: wafv2.CfnWebACL.StatementProperty[] = RATE_LIMITS.signIn.pathPrefixes.map((prefix) => ({
      byteMatchStatement: {
        fieldToMatch: { uriPath: {} },
        positionalConstraint: 'STARTS_WITH',
        searchString: prefix,
        textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
      },
    }));
    const rules: wafv2.CfnWebACL.RuleProperty[] = [
      {
        name: 'RateLimitAll',
        priority: 0,
        action: { block: {} },
        visibilityConfig: visibility('rate-limit-all'),
        statement: { rateBasedStatement: { limit: RATE_LIMITS.all.limit, evaluationWindowSec: RATE_LIMITS.all.windowSeconds, aggregateKeyType: 'IP' } },
      },
      {
        name: 'RateLimitSignIn',
        priority: 1,
        action: { block: {} },
        visibilityConfig: visibility('rate-limit-sign-in'),
        statement: {
          rateBasedStatement: {
            limit: RATE_LIMITS.signIn.limit,
            evaluationWindowSec: RATE_LIMITS.signIn.windowSeconds,
            aggregateKeyType: 'IP',
            scopeDownStatement: { orStatement: { statements: signInPaths } },
          },
        },
      },
      ...MANAGED_RULE_GROUPS.map(
        (name, index): wafv2.CfnWebACL.RuleProperty => ({
          name,
          priority: 2 + index,
          overrideAction: { none: {} },
          visibilityConfig: visibility(name),
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name,
              ...(name === 'AWSManagedRulesCommonRuleSet'
                ? { ruleActionOverrides: COUNTED_COMMON_RULES.map((rule) => ({ name: rule, actionToUse: { count: {} } })) }
                : {}),
            },
          },
        }),
      ),
    ];
    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: `${metricPrefix}-web`,
      description: 'The application load balancer: rate limits and AWS managed rules',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('web-acl'),
      rules,
    });
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.loadBalancer.loadBalancerArn,
      webAclArn: this.webAcl.attrArn,
    });
    this.signInRateLimitAlarm = new cloudwatch.Alarm(this, 'SignInRateLimited', {
      alarmDescription: `An address sent more ${props.environmentName} sign-in requests than the web ACL allows and was blocked.`,
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: { WebACL: `${metricPrefix}-web-acl`, Rule: `${metricPrefix}-rate-limit-sign-in`, Region: Stack.of(this).region },
        statistic: cloudwatch.Stats.SUM,
        period: Duration.seconds(SECURITY_ALARM_PERIOD_SECONDS),
      }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.signInRateLimitAlarm.addAlarmAction(props.notify);

    const application = new origins.HttpOrigin(props.appDomainName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
    });
    const staticOnly = new cloudfront.Function(this, 'StaticOnly', {
      comment: 'Refuses every path outside /_next/static/ at the edge',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline('function handler(event) { return { statusCode: 404, statusDescription: "Not Found" }; }'),
    });
    const headers = new cloudfront.ResponseHeadersPolicy(this, 'StaticHeaders', {
      comment: 'Static assets: readable by the application origin, HSTS, no sniffing',
      corsBehavior: {
        accessControlAllowOrigins: [`https://${props.appDomainName}`],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowHeaders: ['*'],
        accessControlAllowCredentials: false,
        originOverride: true,
      },
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
      },
      // The application answers every response Cross-Origin-Resource-Policy: same-origin; the pages load these
      // assets from the static host, another origin, so the browser would refuse them under that header.
      customHeadersBehavior: { customHeaders: [{ header: 'Cross-Origin-Resource-Policy', value: 'cross-origin', override: true }] },
    });
    this.distribution = new cloudfront.Distribution(this, 'StaticAssets', {
      comment: `Therapy platform ${props.environmentName}: static assets only`,
      domainNames: [props.staticDomainName],
      certificate: acm.Certificate.fromCertificateArn(this, 'StaticCertificate', props.staticCertificateArn),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      sslSupportMethod: cloudfront.SSLMethod.SNI,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableLogging: false,
      defaultBehavior: {
        origin: application,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: [{ function: staticOnly, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        [STATIC_PATH_PATTERN]: {
          origin: application,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          responseHeadersPolicy: headers,
        },
      },
    });
  }
}
