import { Stack, aws_iam as iam, type aws_kms as kms, type aws_s3 as s3, type aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** The only encryption-context key the application may use with the environment key directly. */
export const PRACTICE_CONTEXT_KEY = 'practice_id';

export interface ApplicationRoleProps {
  readonly key: kms.IKey;
  readonly documents: s3.IBucket;
  readonly packets: s3.IBucket;
  readonly appSecret: secretsmanager.ISecret;
}

/**
 * The task role the web app and the worker run as (their Fargate services arrive in milestone 11).
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
 * - Documents: read and write objects (writes only to new keys, which the bucket policy enforces) and
 *   read their scan tags. Packets: write and read. No delete and no Object Lock bypass on any bucket.
 *   The audit copies are the operator role's (OperatorRole), not the application's.
 * - The application login's secret, decrypted only through Secrets Manager. The owner and operator
 *   logins' secrets are not readable by the application.
 */
export class ApplicationRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ApplicationRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const buckets = [props.documents, props.packets];

    this.role = new iam.Role(this, 'Role', {
      description: 'Web and worker tasks: practice data keys, documents, packets, application login',
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
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:GetObjectTagging', 's3:PutObject'],
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
