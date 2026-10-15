import { Duration, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export const GITHUB_OIDC_ISSUER = 'token.actions.githubusercontent.com';
export const STS_AUDIENCE = 'sts.amazonaws.com';

/** What `cdk diff --method template` reads besides ReadOnlyAccess. */
export const CLOUDFORMATION_DESCRIBE_ACTIONS = [
  'cloudformation:DescribeStacks',
  'cloudformation:DescribeStackEvents',
  'cloudformation:DescribeStackResource',
  'cloudformation:DescribeStackResources',
  'cloudformation:GetTemplate',
  'cloudformation:GetTemplateSummary',
  'cloudformation:ListStacks',
  'cloudformation:ListStackResources',
];

/** Reads that would return stored contents rather than configuration; refused even where ReadOnlyAccess allows them. */
export const DENIED_CONTENT_READS = ['s3:GetObject*', 'secretsmanager:GetSecretValue', 'kms:Decrypt', 'ssm:GetParameter*'];

export interface PullRequestDiffRoleProps {
  /** `owner/name` of the repository whose pull requests may assume the role. */
  readonly repository: string;
}

/**
 * The read-only role `pnpm cdk:diff` assumes from a pull request to diff the staging stack
 * (docs/adr/0006 planned it; docs/adr/0012 says what the CI workflow needs to use it). Staging holds
 * synthetic data only. The trust accepts GitHub's OIDC token only for this repository's
 * pull_request events, with the STS audience; sessions last an hour. Permissions are AWS's
 * ReadOnlyAccess plus the CloudFormation describe calls the diff makes, with object, secret,
 * parameter and decrypt reads explicitly denied.
 */
export class PullRequestDiffRole extends Construct {
  readonly provider: iam.OidcProviderNative;
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: PullRequestDiffRoleProps) {
    super(scope, id);
    this.provider = new iam.OidcProviderNative(this, 'GitHubOidc', {
      url: `https://${GITHUB_OIDC_ISSUER}`,
      clientIds: [STS_AUDIENCE],
    });
    this.role = new iam.Role(this, 'Role', {
      roleName: 'tp-staging-pull-request-diff',
      description: 'Read-only: cdk diff of the staging stack from this repository pull requests',
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(this.provider.oidcProviderArn, {
        StringEquals: {
          [`${GITHUB_OIDC_ISSUER}:aud`]: STS_AUDIENCE,
          [`${GITHUB_OIDC_ISSUER}:sub`]: `repo:${props.repository}:pull_request`,
        },
      }),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')],
    });
    this.role.addToPolicy(
      new iam.PolicyStatement({ sid: 'CloudFormationDescribe', actions: CLOUDFORMATION_DESCRIBE_ACTIONS, resources: ['*'] }),
    );
    this.role.addToPolicy(
      new iam.PolicyStatement({ sid: 'NoContentReads', effect: iam.Effect.DENY, actions: DENIED_CONTENT_READS, resources: ['*'] }),
    );
  }
}
