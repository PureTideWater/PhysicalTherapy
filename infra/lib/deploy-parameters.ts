import { CfnCondition, CfnParameter, CfnRule, Fn, Token } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { MAIL_IDENTITIES_VERIFIED_VALUES, SCREENING_SENDER } from './mail';

/** The ImageTag value before any image is released: the services run no task and no migration runs. */
export const NO_IMAGE = 'none';

/** A DNS host name (lowercase labels), as CloudFormation's AllowedPattern reads it. */
const HOST_NAME = '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';

/** An IAM role's ARN, as CloudFormation's AllowedPattern reads it (unanchored; each use anchors it). */
export const ROLE_ARN_PATTERN = 'arn:aws[a-z-]*:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]{1,512}';

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
  screeningConsumer: 'ScreeningConsumer',
  mailIdentitiesVerified: 'MailIdentitiesVerified',
  mailValidationRoleArn: 'MailValidationRoleArn',
} as const;

/** The condition true once MailIdentitiesVerified is `true` (D2's phase 2). */
export const MAIL_IDENTITIES_VERIFIED_CONDITION = 'MailIdentitiesReady';

/** MailValidationRoleArn before the environment's address-validation account holds its stack. */
export const NO_VALIDATION_ROLE = 'none';

/** The condition true once MailValidationRoleArn names a role. */
export const MAIL_VALIDATION_ROLE_CONDITION = 'MailValidationRoleSet';

/** The rule that refuses a release before MailValidationRoleArn names a role (docs/adr/0065; review S3). */
export const RELEASE_NEEDS_VALIDATION_ROLE_RULE = 'ReleaseNeedsAddressValidationRole';

/** The launch value before the screening opens in production: the web keeps it closed (decision 13). */
export const SCREENING_CLOSED = 'closed';

/**
 * A launch value: the release tag the capacity report measured and the report's SHA-256, as the launch check gives it
 * (tools/screening-capacity/launch-check.ts), or `closed`. The CDK app computes it at synthesis (screening-launch.ts);
 * the web reads it with the same pattern (apps/web/src/lib/server/config.ts).
 */
export const SCREENING_LAUNCH_PATTERN = '^(closed|v[0-9A-Za-z.-]{1,60}:[0-9a-f]{64})$';

/** The rule that refuses a deploy whose ImageTag is not the tag its launch value was computed for. */
export const SCREENING_LAUNCH_RULE = 'ScreeningLaunchImageTag';

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
 * - ScreeningConsumer (Q1 (b)): `held` (the default) or `running`. Only where the screening consumer starts at launch
 *   (production) does it count: the consumer runs no task until it is `running` or the launch value is not `closed`, so
 *   a deploy that can open the screening always runs its consumer (a launch value with ScreeningConsumer left at
 *   `held`, or reset to it by a rollback across PR 6b-3, still runs it). Elsewhere it runs once released.
 * - MailIdentitiesVerified (audit #76; docs/adr/0065, D2): `false` (the default) in phase 1, while the stack's two SES
 *   identities (MailFromAddress's domain and its screening subdomain) wait for the DNS records the stack outputs: the
 *   user pool keeps Cognito's own sender and the platform sends no probe, so the screening stays closed. `true` in
 *   phase 2, once both identities read verified with DKIM `SUCCESS`: Cognito sends through the transactional set and
 *   the probes start.
 * - MailValidationRoleArn (docs/adr/0065, "Address validation in its own account"; review S3): the role the web assumes
 *   to validate a screening's address with SES, in the environment's address-validation account (the
 *   `AddressValidationRoleArn` output of `tp-<env>-address-validation`, deployed there with this stack's
 *   `ApplicationRoleArn` output), so the call, whose request names the address, is recorded in that account alone.
 *   `none` (the default) until that stack exists; the rule ReleaseNeedsAddressValidationRole refuses a deploy whose
 *   ImageTag names a release while it is `none`, since the web validates through no other path.
 *
 * The screening's sender (Q12) is not a parameter: it is results@screening.<MailFromAddress's domain>, so its identity
 * is always a subdomain of the main one and never the same identity (CloudFormation's rules cannot split an address to
 * compare two domains).
 *
 * The screening's launch value (decision 13; docs/adr/0062) is not a parameter: the CDK app computes it at synthesis
 * from the release's capacity report and the ECR images the stack deploys (screening-launch.ts; the founder's ruling of
 * 2026-10-22) and gives it here, `closed` or `<tag>:<SHA-256>`. A production web keeps the screening closed unless it
 * names the ImageTag the deploy runs, and the rule ScreeningLaunchImageTag refuses a deploy whose ImageTag is another
 * tag. No stack declares a ScreeningLaunch parameter, so CloudFormation refuses one passed with `--parameters`.
 */
export class DeployParameters extends Construct {
  readonly appDomainName: string;
  readonly certificateArn: string;
  readonly staticDomainName: string;
  readonly staticCertificateArn: string;
  readonly mailFromAddress: string;
  /** The domain part of MailFromAddress: the SES identity Cognito sends through. */
  readonly mailFromDomain: string;
  /** screening.<MailFromAddress's domain>: the screening stream's own SES identity (D2). */
  readonly screeningMailDomain: string;
  /** results@<screeningMailDomain>: the one sender of the screening stream (Q12). */
  readonly screeningMailFromAddress: string;
  /** True in phase 2 (MailIdentitiesVerified=true): Cognito sends through SES and the probes run. */
  readonly mailIdentitiesVerified: CfnCondition;
  readonly supportEmail: string;
  readonly securityEmail: string;
  readonly imageTag: string;
  /** `closed` or `<tag>:<report SHA-256>`, computed at synthesis (the web's SCREENING_LAUNCH). */
  readonly screeningLaunch: string;
  /** `held` or `running` (ScreeningConsumer). */
  readonly screeningConsumer: string;
  /** True once ImageTag names a release. */
  readonly released: CfnCondition;
  /** `none`, or the address-validation account's role the web assumes (MailValidationRoleArn). */
  readonly mailValidationRoleArn: string;
  /** True once MailValidationRoleArn names a role. */
  readonly mailValidationRoleSet: CfnCondition;
  private launchedCondition: CfnCondition | undefined;
  private readonly parameterScope: Construct;

  /** `screeningLaunch`: the launch value the CDK app computed (screening-launch.ts); `closed` when none. */
  constructor(scope: Construct, id: string, props: { readonly screeningLaunch?: string } = {}) {
    super(scope, id);
    this.parameterScope = scope;
    const launch = props.screeningLaunch ?? SCREENING_CLOSED;
    if (Token.isUnresolved(launch) || !new RegExp(SCREENING_LAUNCH_PATTERN).test(launch)) {
      throw new Error(`the screening launch value must be ${SCREENING_CLOSED} or <tag>:<64 hex>, as the launch check computes it`);
    }
    this.screeningLaunch = launch;
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
    this.screeningMailDomain = Fn.join('', [`${SCREENING_SENDER.subdomain}.`, this.mailFromDomain]);
    this.screeningMailFromAddress = Fn.join('', [`${SCREENING_SENDER.localPart}@${SCREENING_SENDER.subdomain}.`, this.mailFromDomain]);
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
    this.screeningConsumer = parameter(PARAMETER_NAMES.screeningConsumer, {
      type: 'String',
      description: 'held or running: where the screening consumer starts at launch (production), it runs no task until this is running',
      default: SCREENING_CONSUMER_STATES[0],
      allowedValues: [...SCREENING_CONSUMER_STATES],
    });
    const verified = parameter(PARAMETER_NAMES.mailIdentitiesVerified, {
      type: 'String',
      description: 'false until both SES identities read verified with DKIM SUCCESS (phase 1); true after (phase 2: Cognito sends through SES, probes run)',
      default: MAIL_IDENTITIES_VERIFIED_VALUES[0],
      allowedValues: [...MAIL_IDENTITIES_VERIFIED_VALUES],
    });
    this.mailIdentitiesVerified = new CfnCondition(scope, MAIL_IDENTITIES_VERIFIED_CONDITION, { expression: Fn.conditionEquals(verified, 'true') });
    this.mailIdentitiesVerified.overrideLogicalId(MAIL_IDENTITIES_VERIFIED_CONDITION);
    this.released = new CfnCondition(scope, 'Released', { expression: Fn.conditionNot(Fn.conditionEquals(this.imageTag, NO_IMAGE)) });
    this.released.overrideLogicalId('Released');
    this.mailValidationRoleArn = parameter(PARAMETER_NAMES.mailValidationRoleArn, {
      type: 'String',
      description: `The role the web assumes in the address-validation account to validate a screening address (tp-<env>-address-validation's AddressValidationRoleArn output); ${NO_VALIDATION_ROLE} until that stack exists, and no release runs before`,
      default: NO_VALIDATION_ROLE,
      allowedPattern: `^(${NO_VALIDATION_ROLE}|${ROLE_ARN_PATTERN})$`,
      constraintDescription: `${NO_VALIDATION_ROLE}, or an IAM role ARN`,
    });
    const validationRoleSet = Fn.conditionNot(Fn.conditionEquals(this.mailValidationRoleArn, NO_VALIDATION_ROLE));
    this.mailValidationRoleSet = new CfnCondition(scope, MAIL_VALIDATION_ROLE_CONDITION, { expression: validationRoleSet });
    this.mailValidationRoleSet.overrideLogicalId(MAIL_VALIDATION_ROLE_CONDITION);
    // CloudFormation refuses the deploy before any change: a released web validates only through that role.
    const needsRole = new CfnRule(scope, RELEASE_NEEDS_VALIDATION_ROLE_RULE, {
      assertions: [
        {
          assert: Fn.conditionOr(Fn.conditionEquals(this.imageTag, NO_IMAGE), validationRoleSet),
          assertDescription: `A release runs the web, which validates a screening's address only in the environment's address-validation account (docs/adr/0065): deploy tp-<env>-address-validation there and pass ${PARAMETER_NAMES.mailValidationRoleArn}=<its AddressValidationRoleArn output>, or keep ImageTag=${NO_IMAGE}`,
        },
      ],
    });
    needsRole.overrideLogicalId(RELEASE_NEEDS_VALIDATION_ROLE_RULE);
    if (launch !== SCREENING_CLOSED) {
      // The value names the report of one tag: CloudFormation refuses the deploy before any change unless ImageTag is it.
      const tag = launch.slice(0, launch.lastIndexOf(':'));
      const rule = new CfnRule(scope, SCREENING_LAUNCH_RULE, {
        assertions: [
          {
            assert: Fn.conditionEquals(this.imageTag, tag),
            assertDescription: `The screening's launch value was computed from ${tag}'s capacity report (decision 13): deploy ImageTag=${tag}, or synthesize without -c tp:launchReport, -c tp:launchAttestation and -c tp:launchTag to keep the screening closed`,
          },
        ],
      });
      rule.overrideLogicalId(SCREENING_LAUNCH_RULE);
    }
  }

  /**
   * True once ImageTag names a release and either ScreeningConsumer is `running` or the launch value is not `closed`:
   * the consumer runs whenever the screening can open, so no deploy opens it with no task to price what prospects send
   * (the web opens it only for a launch value naming its own tag, which the rule ScreeningLaunchImageTag holds ImageTag
   * to). The launch value is known at synthesis, so its part of the condition is settled here rather than compared as
   * two literals in the template: with a launch value the consumer runs once released, whatever ScreeningConsumer says;
   * without one, once released and ScreeningConsumer is `running`. Created where a service starts at launch (the
   * screening consumer in production), and nowhere else.
   */
  get screeningLaunched(): CfnCondition {
    if (this.launchedCondition === undefined) {
      const consumerRunning = Fn.conditionEquals(this.screeningConsumer, 'running');
      this.launchedCondition = new CfnCondition(this.parameterScope, 'ScreeningConsumerRunning', {
        // Released's own expression where a launch value is set (a condition is defined by a function, not by a name).
        expression: this.screeningLaunch === SCREENING_CLOSED ? Fn.conditionAnd(this.released, consumerRunning) : Fn.conditionNot(Fn.conditionEquals(this.imageTag, NO_IMAGE)),
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

  /** 'true' in phase 2 (MailIdentitiesVerified), 'false' in phase 1: the platform's MAIL_IDENTITIES_VERIFIED. */
  get mailIdentitiesVerifiedFlag(): string {
    return Token.asString(Fn.conditionIf(this.mailIdentitiesVerified.logicalId, 'true', 'false'));
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
