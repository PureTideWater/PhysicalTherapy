import { Stack, type aws_cognito as cognito, aws_iam as iam, type aws_kms as kms, type aws_s3 as s3, type aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** The only encryption-context key the application may use with the environment key directly. */
export const PRACTICE_CONTEXT_KEY = 'practice_id';

/**
 * The Cognito calls the web app makes with its own AWS credentials (apps/web/src/lib/auth/
 * cognito-provider.ts): inviting a user, reading one, and signing one out everywhere. Every other
 * call it makes (sign-in, MFA, passkeys, token revocation) is authorized by the user's own tokens.
 */
export const USER_POOL_ADMIN_ACTIONS = ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminUserGlobalSignOut'] as const;

export interface ApplicationRoleProps {
  readonly key: kms.IKey;
  readonly documents: s3.IBucket;
  readonly packets: s3.IBucket;
  readonly appSecret: secretsmanager.ISecret;
  readonly userPool: cognito.IUserPool;
}

/**
 * The task role the web app and the worker's practice jobs run as (their Fargate services, Compute).
 * Every permission names its resource; none comes from a CDK `grant*` helper, because the bucket
 * helpers would also grant the key without conditions.
 *
 * - Per-practice data keys (PRD 15 and 16): GenerateDataKey and Decrypt on the environment key
 *   directly only when the encryption context is exactly one pair, `practice_id`. A call without a
 *   context, or with any other key beside it, is refused. The application seals every stored object
 *   with a key derived from its practice's data key before it reaches S3 (docs/adr/0018), so this is
 *   also what makes a practice's objects readable, and destroying the data key makes them unreadable.
 * - S3 server-side encryption beneath that: the same two actions only when S3 calls KMS on the role's
 *   behalf for the documents and packets buckets (SSE-KMS under the environment key).
 * - Documents: read and write objects (writes only to new keys, which the bucket policy enforces, as
 *   multipart uploads it may abort) and read their scan tags. Packets: write and read. No delete and
 *   no Object Lock bypass on any bucket: uploads' intake copies expire by lifecycle rule.
 *   The audit copies are the operator role's (OperatorRole), not the application's.
 * - The application login's secret, decrypted only through Secrets Manager. The owner and operator
 *   logins' secrets are not readable by the application.
 * - Digest email (PRD 5, J17; docs/adr/0039): the worker sends a practice's digests through SES
 *   (SESv2 SendEmail) from this account's verified identities in this region only. A digest carries
 *   counts and a sign-in link, never a patient's data.
 * - The user pool (docs/adr/0049): the three administrative calls the web app makes, on this
 *   environment's pool only (USER_POOL_ADMIN_ACTIONS).
 */
export class ApplicationRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ApplicationRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const buckets = [props.documents, props.packets];

    this.role = new iam.Role(this, 'Role', {
      description: 'Web and worker tasks: practice data keys, documents, packets, application login, digest email',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });

    const statements = [
      new iam.PolicyStatement({
        sid: 'PracticeDataKeys',
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          'ForAllValues:StringEquals': { 'kms:EncryptionContextKeys': [PRACTICE_CONTEXT_KEY] },
          Null: { 'kms:EncryptionContextKeys': 'false' },
        },
      }),
      new iam.PolicyStatement({
        sid: 'BucketEncryptionThroughS3',
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${stack.region}.amazonaws.com` },
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': buckets.flatMap((bucket) => [bucket.bucketArn, bucket.arnForObjects('*')]) },
        },
      }),
      new iam.PolicyStatement({
        sid: 'Documents',
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:GetObjectTagging', 's3:PutObject', 's3:AbortMultipartUpload'],
        resources: [props.documents.arnForObjects('*')],
      }),
      new iam.PolicyStatement({
        sid: 'Packets',
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:PutObject'],
        resources: [props.packets.arnForObjects('*')],
      }),
      new iam.PolicyStatement({
        sid: 'ApplicationLogin',
        actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
        resources: [props.appSecret.secretArn],
      }),
      new iam.PolicyStatement({
        sid: 'DigestEmail',
        actions: ['ses:SendEmail'],
        resources: [`arn:${stack.partition}:ses:${stack.region}:${stack.account}:identity/*`],
      }),
      new iam.PolicyStatement({
        sid: 'UserPoolAdministration',
        actions: [...USER_POOL_ADMIN_ACTIONS],
        resources: [props.userPool.userPoolArn],
      }),
      new iam.PolicyStatement({
        sid: 'ApplicationLoginDecrypt',
        actions: ['kms:Decrypt'],
        resources: [props.key.keyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `secretsmanager.${stack.region}.amazonaws.com`,
            'kms:EncryptionContext:SecretARN': props.appSecret.secretArn,
          },
        },
      }),
    ];
    for (const statement of statements) {
      this.role.addToPolicy(statement);
    }
  }
}
