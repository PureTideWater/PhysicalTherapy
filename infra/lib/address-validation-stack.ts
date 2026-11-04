import { CfnOutput, CfnParameter, Duration, Fn, RemovalPolicy, Stack, type StackProps, Tags, aws_cloudtrail as cloudtrail, aws_iam as iam, aws_kms as kms, type aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { accountTrail } from './constructs/account-trail';
import { ADDRESS_VALIDATION_ACTIONS } from './constructs/application-role';
import { ROLE_ARN_PATTERN } from './deploy-parameters';
import { type EnvironmentName, environmentSettings, stackName } from './environments';
import { KEY_ROTATION_DAYS } from './retention';

/** `tp-<env>-address-validation`: the stack each environment's address-validation account holds. */
export function addressValidationStackName(environment: EnvironmentName): string {
  return `${stackName(environment)}-address-validation`;
}

/** The role the web assumes there, by name, so the runbook can name it before the stack's output exists. */
export function addressValidationRoleName(environment: EnvironmentName): string {
  return `tp-${environment}-address-validation`;
}

/** The parameter that names the role it trusts: the environment stack's `ApplicationRoleArn` output. */
export const APPLICATION_ROLE_ARN_PARAMETER = 'ApplicationRoleArn';

/**
 * The address-validation account (docs/adr/0065, "Address validation in its own account"; review S3). SES's validation
 * of a screening address (GetEmailAddressInsights, Q1 (g)) is a management event whose request names the address, and
 * SES's API model does not mark that parameter sensitive, so CloudTrail records it as typed. A trail cannot leave out
 * one management event (its selectors filter management events by read or write, and by KMS or RDS Data alone), so in
 * the environment's own account the address would stay in the trail's bucket for as long as the trail is kept. The call
 * is made here instead, in an account of its own, one per environment, which holds nothing else:
 *
 * - a role, `tp-<env>-address-validation`, that only the environment's application role may assume (its account's
 *   root as principal, narrowed by aws:PrincipalArn, and never a principal of this account), allowed
 *   ses:GetEmailAddressInsights and nothing else; the web holds a 15-minute session and renews it;
 * - a trail of the write management events alone, every region and the global services', validated and encrypted
 *   under this account's own key, so changes to the role, the trail and the key are kept as the environment's are, and
 *   SES's validations, which are reads, are never written to it.
 *
 * What remains (the residual, ADR 0065): CloudTrail's event history, which every account keeps for 90 days whatever its
 * trails do and which nobody can turn off or shorten, holds each validation's request in this account for 90 days,
 * readable only by a principal of this account allowed cloudtrail:LookupEvents. The staging check (open item O11;
 * docs/runbooks/deliverability.md, section 2) confirms that CloudTrail reads the call as a read; if it reads it as a
 * write, the trail would keep it, and the screening stays closed until this stack changes.
 */
export class AddressValidationStack extends Stack {
  readonly environmentName: EnvironmentName;
  /** The application role it trusts (the parameter's value). */
  readonly applicationRoleArn: string;
  readonly role: iam.Role;
  readonly key: kms.Key;
  readonly trail: cloudtrail.Trail;
  readonly trailBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps & { readonly environmentName: EnvironmentName }) {
    super(scope, id, { terminationProtection: environmentSettings(props.environmentName).protectFromDeletion, ...props });
    this.environmentName = props.environmentName;
    const environment = props.environmentName;
    Tags.of(this).add('project', 'therapy-platform');
    Tags.of(this).add('environment', environment);

    const parameter = new CfnParameter(this, APPLICATION_ROLE_ARN_PARAMETER, {
      type: 'String',
      description: `The environment stack's ApplicationRoleArn output (${stackName(environment)}): the only role that may assume this account's address-validation role`,
      allowedPattern: `^${ROLE_ARN_PATTERN}$`,
      constraintDescription: 'an IAM role ARN',
    });
    parameter.overrideLogicalId(APPLICATION_ROLE_ARN_PARAMETER);
    this.applicationRoleArn = parameter.valueAsString;
    const applicationAccount = Fn.select(4, Fn.split(':', this.applicationRoleArn));

    this.role = new iam.Role(this, 'Role', {
      roleName: addressValidationRoleName(environment),
      description: `The ${environment} web validates a screening address with SES here, so the call is recorded in this account alone (docs/adr/0065)`,
      assumedBy: new iam.AccountPrincipal(applicationAccount).withConditions({
        ArnEquals: { 'aws:PrincipalArn': this.applicationRoleArn },
        // A stack deployed into the environment's own account would put the call back in its trail.
        StringNotEquals: { 'aws:PrincipalAccount': this.account },
      }),
      maxSessionDuration: Duration.hours(1),
    });
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ScreeningAddressValidation',
        actions: [...ADDRESS_VALIDATION_ACTIONS],
        // GetEmailAddressInsights takes no resource.
        resources: ['*'],
      }),
    );

    this.key = new kms.Key(this, 'Key', {
      description: `Therapy platform ${environment} address validation: the trail's log files`,
      alias: `alias/${addressValidationRoleName(environment)}`,
      enableKeyRotation: true,
      rotationPeriod: Duration.days(KEY_ROTATION_DAYS),
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const { bucket, trail } = accountTrail(this, { trailName: addressValidationRoleName(environment), key: this.key, managementEvents: cloudtrail.ReadWriteType.WRITE_ONLY });
    this.trailBucket = bucket;
    this.trail = trail;

    const outputs: Record<string, string> = {
      // The environment stack's MailValidationRoleArn parameter.
      AddressValidationRoleArn: this.role.roleArn,
      AddressValidationTrailName: addressValidationRoleName(environment),
      AddressValidationTrailBucket: this.trailBucket.bucketName,
    };
    for (const [name, value] of Object.entries(outputs)) {
      new CfnOutput(this, name, { value });
    }
  }
}
