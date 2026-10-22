import { CfnCondition, CfnParameter, Fn, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** The ImageTag value before any image is released: the services run no task and no migration runs. */
export const NO_IMAGE = 'none';

/** A DNS host name (lowercase labels), as CloudFormation's AllowedPattern reads it. */
const HOST_NAME = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';

/** The CloudFormation parameters each stack takes at deploy time, by name. */
export const PARAMETER_NAMES = {
  appDomainName: 'AppDomainName',
  certificateArn: 'CertificateArn',
  staticDomainName: 'StaticDomainName',
  staticCertificateArn: 'StaticCertificateArn',
  mailFromAddress: 'MailFromAddress',
  supportEmail: 'SupportEmail',
  securityEmail: 'SecurityEmail',
  imageTag: 'ImageTag',
  screeningLaunch: 'ScreeningLaunch',
  screeningConsumer: 'ScreeningConsumer',
} as const;

/** ScreeningLaunch before the screening opens in production: the web keeps it closed (decision 13). */
export const SCREENING_CLOSED = 'closed';

/**
 * A launch value: the release tag the capacity report measured and the report's SHA-256, as the launch check prints it
 * (tools/screening-capacity/launch-check.ts: `ScreeningLaunch=<tag>:<report SHA-256>`), or `closed`.
 */
export const SCREENING_LAUNCH_PATTERN = '^(closed|v[0-9A-Za-z.-]{1,60}:[0-9a-f]{64})$';

/** ScreeningConsumer: production's consumer runs no task until the first launch deploy says `running` (Q1 (b)). */
export const SCREENING_CONSUMER_STATES = ['held', 'running'] as const;

/**
 * What differs per deployment and is never in the repository (docs/adr/0049): the application's host
 * name and its certificate, the static-asset host and its certificate, the sender of every email,
 * and the release's image tag. They are CloudFormation parameters rather than CDK context, so the
 * template the tests assert is the template CloudFormation deploys, and `cdk deploy` keeps each
 * value from the previous deploy unless it is given again (`--previous-parameters`, the default).
 *
 * - AppDomainName: the web app's host (APP_ORIGIN is https://<it>), the passkey relying-party ID
 *   (Cognito allows at most 63 characters), the origin presigned uploads come from, and where the
 *   uptime checks call. Its DNS record points at the load balancer (output LoadBalancerDnsName).
 * - CertificateArn: an ACM certificate for AppDomainName in the stack's region (the load balancer).
 * - StaticDomainName and StaticCertificateArn: the static-asset host CloudFront serves and its ACM
 *   certificate, which CloudFront requires in us-east-1.
 * - MailFromAddress: the address Cognito and the worker send from; its domain is a verified SES
 *   identity in the stack's region before the deploy.
 * - SupportEmail: the support address the support, status and maintenance pages name
 *   (PRD 19, Support; docs/adr/0053); what arrives there the desk records as a ticket.
 * - SecurityEmail: the security address /.well-known/security.txt and the disclosure page (/security)
 *   give for vulnerability reports (audit item #20 (f)): a mailbox the security official reads, never
 *   the support address, whose mail opens tickets only for accounts (the web app refuses the two equal).
 * - ImageTag: the release tag of the web and worker images in this environment's repositories.
 *   `none` (the default) is the first deploy, before any image exists: the services run no task.
 * - ScreeningLaunch (decision 13; docs/adr/0062): `closed` (the default), or `<tag>:<SHA-256>` naming the passing
 *   capacity report of the tag being deployed, as the launch check prints it after verifying both image IDs. A
 *   production web keeps the screening closed unless it names the ImageTag the deploy runs, so a value a later deploy
 *   keeps by omission vouches for no other image and closes the screening instead.
 * - ScreeningConsumer (Q1 (b)): `held` (the default) or `running`. Only where the screening consumer starts at launch
 *   (production) does it count: the consumer runs no task until it is `running` or ScreeningLaunch is not `closed`, so
 *   a deploy that can open the screening always runs its consumer (a launch value with ScreeningConsumer left at
 *   `held`, or reset to it by a rollback across PR 6b-3, still runs it). Elsewhere it runs once released.
 */
export class DeployParameters extends Construct {
  readonly appDomainName: string;
  readonly certificateArn: string;
  readonly staticDomainName: string;
  readonly staticCertificateArn: string;
  readonly mailFromAddress: string;
  /** The domain part of MailFromAddress: the SES identity Cognito sends through. */
  readonly mailFromDomain: string;
  readonly supportEmail: string;
  readonly securityEmail: string;
  readonly imageTag: string;
  /** `closed` or `<tag>:<report SHA-256>` (ScreeningLaunch). */
  readonly screeningLaunch: string;
  /** `held` or `running` (ScreeningConsumer). */
  readonly screeningConsumer: string;
  /** True once ImageTag names a release. */
  readonly released: CfnCondition;
  private launchedCondition: CfnCondition | undefined;
  private readonly parameterScope: Construct;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.parameterScope = scope;
    const parameter = (name: string, props: ConstructorParameters<typeof CfnParameter>[2]) => {
      const created = new CfnParameter(scope, name, props);
      created.overrideLogicalId(name);
      return created.valueAsString;
    };
    this.appDomainName = parameter(PARAMETER_NAMES.appDomainName, {
      type: 'String',
      description: 'The web app host name (APP_ORIGIN, passkey relying-party ID, upload origin, uptime checks)',
      allowedPattern: HOST_NAME,
      maxLength: 63,
      constraintDescription: 'a lowercase host name of at most 63 characters',
    });
    this.certificateArn = parameter(PARAMETER_NAMES.certificateArn, {
      type: 'String',
      description: 'ACM certificate for AppDomainName, in this stack region (the load balancer)',
      allowedPattern: '^arn:aws[a-z-]*:acm:[a-z0-9-]+:[0-9]{12}:certificate/[0-9a-f-]{36}$',
      constraintDescription: 'an ACM certificate ARN',
    });
    this.staticDomainName = parameter(PARAMETER_NAMES.staticDomainName, {
      type: 'String',
      description: 'The static-asset host name CloudFront serves (/_next/static/ and /brand/ only)',
      allowedPattern: HOST_NAME,
      maxLength: 253,
      constraintDescription: 'a lowercase host name',
    });
    this.staticCertificateArn = parameter(PARAMETER_NAMES.staticCertificateArn, {
      type: 'String',
      description: 'ACM certificate for StaticDomainName, in us-east-1 (CloudFront)',
      allowedPattern: '^arn:aws[a-z-]*:acm:us-east-1:[0-9]{12}:certificate/[0-9a-f-]{36}$',
      constraintDescription: 'an ACM certificate ARN in us-east-1',
    });
    this.mailFromAddress = parameter(PARAMETER_NAMES.mailFromAddress, {
      type: 'String',
      description: 'The sender of every email (Cognito and the worker); its domain is a verified SES identity in this region',
      allowedPattern: '^[A-Za-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$',
      constraintDescription: 'an email address on a lowercase domain',
    });
    this.mailFromDomain = Token.asString(Fn.select(1, Fn.split('@', this.mailFromAddress)));
    this.supportEmail = parameter(PARAMETER_NAMES.supportEmail, {
      type: 'String',
      description: 'The support address the support, status and maintenance pages name',
      allowedPattern: '^[A-Za-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$',
      constraintDescription: 'an email address on a lowercase domain',
    });
    this.securityEmail = parameter(PARAMETER_NAMES.securityEmail, {
      type: 'String',
      description: 'The security address security.txt and the disclosure page give for vulnerability reports (not the support address)',
      allowedPattern: '^[A-Za-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$',
      constraintDescription: 'an email address on a lowercase domain',
    });
    this.imageTag = parameter(PARAMETER_NAMES.imageTag, {
      type: 'String',
      description: `The release tag of the web and worker images; ${NO_IMAGE} before the first release (no task runs)`,
      default: NO_IMAGE,
      allowedPattern: '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$',
      constraintDescription: 'an image tag',
    });
    this.screeningLaunch = parameter(PARAMETER_NAMES.screeningLaunch, {
      type: 'String',
      description: 'closed, or <tag>:<SHA-256> of the tag\'s passing screening capacity report, as the launch check prints it (production opens the screening only for the ImageTag it names)',
      default: SCREENING_CLOSED,
      allowedPattern: SCREENING_LAUNCH_PATTERN,
      constraintDescription: 'closed, or a release tag, a colon and the capacity report\'s SHA-256 in lowercase hex',
    });
    this.screeningConsumer = parameter(PARAMETER_NAMES.screeningConsumer, {
      type: 'String',
      description: 'held or running: where the screening consumer starts at launch (production), it runs no task until this is running',
      default: SCREENING_CONSUMER_STATES[0],
      allowedValues: [...SCREENING_CONSUMER_STATES],
    });
    this.released = new CfnCondition(scope, 'Released', { expression: Fn.conditionNot(Fn.conditionEquals(this.imageTag, NO_IMAGE)) });
    this.released.overrideLogicalId('Released');
  }

  /**
   * True once ImageTag names a release and either ScreeningConsumer is `running` or ScreeningLaunch is not `closed`:
   * the consumer runs whenever the screening can open, so no deploy opens it with no task to price what prospects send
   * (the web opens it only for a launch value naming its own tag; a value kept from another tag runs the consumer while
   * the page stays closed, which prices nothing new and costs the consumer's hours). Created where a service starts at
   * launch (the screening consumer in production), and nowhere else.
   */
  get screeningLaunched(): CfnCondition {
    if (this.launchedCondition === undefined) {
      this.launchedCondition = new CfnCondition(this.parameterScope, 'ScreeningConsumerRunning', {
        expression: Fn.conditionAnd(
          this.released,
          Fn.conditionOr(Fn.conditionEquals(this.screeningConsumer, 'running'), Fn.conditionNot(Fn.conditionEquals(this.screeningLaunch, SCREENING_CLOSED))),
        ),
      });
      this.launchedCondition.overrideLogicalId('ScreeningConsumerRunning');
    }
    return this.launchedCondition;
  }

  /** `count` once released and ScreeningConsumer is `running` or a launch value is given, 0 until then (the screening consumer's count at launch). */
  countOnceLaunched(count: number): number {
    return Token.asNumber(Fn.conditionIf(this.screeningLaunched.logicalId, count, 0));
  }

  /** `count` once ImageTag names a release, 0 until then (a service's desired count). */
  countOnceReleased(count: number): number {
    return Token.asNumber(Fn.conditionIf(this.released.logicalId, count, 0));
  }

  /** 'true' once ImageTag names a release, 'false' until then. */
  get releasedFlag(): string {
    return Token.asString(Fn.conditionIf(this.released.logicalId, 'true', 'false'));
  }

  /** The application's origin (APP_ORIGIN). */
  get appOrigin(): string {
    return `https://${this.appDomainName}`;
  }
}
