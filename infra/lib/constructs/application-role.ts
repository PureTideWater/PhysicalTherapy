import { type CfnCondition, Stack, type aws_cognito as cognito, aws_iam as iam, type aws_kms as kms, type aws_s3 as s3 } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { bedrockModelArns, pinnedBedrockModels } from '../models';

/** The only encryption-context key the application may use with the environment key directly. */
export const PRACTICE_CONTEXT_KEY = 'practice_id';

/**
 * The Cognito calls the web app makes with its own AWS credentials (apps/web/src/lib/auth/
 * cognito-provider.ts): inviting a user, reading one, and signing one out everywhere. Every other
 * call it makes (sign-in, MFA, passkeys, token revocation) is authorized by the user's own tokens.
 */
export const USER_POOL_ADMIN_ACTIONS = ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:AdminUserGlobalSignOut'] as const;

/** The Bedrock call the model gateway makes (packages/model-gateway/src/providers/bedrock.ts: InvokeModelCommand). */
export const MODEL_INVOKE_ACTIONS = ['bedrock:InvokeModel'] as const;

/** The Textract calls intake's scan reader makes (packages/contracts/src/evidence/scan.ts: TextractPageReader). */
export const TEXTRACT_ACTIONS = ['textract:StartDocumentTextDetection', 'textract:GetDocumentTextDetection'] as const;

/**
 * The SES call the screening's submit makes to check a prospect's address (apps/web/src/lib/screening/validation.ts;
 * Q1 (g)), only in the environment's address-validation account (AddressValidationStack; docs/adr/0065): this role is
 * refused it here.
 */
export const ADDRESS_VALIDATION_ACTIONS = ['ses:GetEmailAddressInsights'] as const;

export interface ApplicationRoleProps {
  readonly key: kms.IKey;
  readonly documents: s3.IBucket;
  readonly packets: s3.IBucket;
  readonly userPool: cognito.IUserPool;
  /** The digests' sender and stream (docs/adr/0065): MailFromAddress, its identity and the transactional set. */
  readonly digestMail: { readonly mailFromAddress: string; readonly identityArn: string; readonly configurationSetArn: string };
  /** The address-validation account's role (MailValidationRoleArn) and the condition true once it is set. */
  readonly addressValidation: { readonly roleArn: string; readonly roleSet: CfnCondition };
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
 * - No database login's secret (docs/adr/0061). ECS injects each task's own logins at its start through
 *   that task definition's execution role (Compute), so neither task reads a secret at run time; the web and
 *   the worker share this role, and with it the worker could otherwise read the web's application login and
 *   connect as it, where the database tells the worker's own login from the web's (tp_job).
 * - Digest email (PRD 5, J17; docs/adr/0039): the worker sends a practice's digests through SES
 *   (SESv2 SendEmail) through MailFromAddress's identity and the transactional stream's set only, from
 *   MailFromAddress alone (docs/adr/0065). A digest carries counts and a sign-in link, never a patient's data.
 * - Address validation (Q1 (g); docs/adr/0065, D9 and "Address validation in its own account"): the screening's
 *   submit asks SES whether a prospect's address can receive mail (GetEmailAddressInsights, $0.01 a call, under the
 *   web's daily cap) as the role MailValidationRoleArn names in the environment's address-validation account, which
 *   this role may assume once the parameter is set (the policy AddressValidationRole, under its condition), so the
 *   call and the address in it are recorded in that account and never in this one's trail. Here the call is refused
 *   (`NoAddressValidationHere`), and so is assuming any role of this account (`NoRoleOfThisAccount`), so the
 *   parameter cannot point the call back here. The worker shares this role and never calls either.
 * - The user pool (docs/adr/0049): the three administrative calls the web app makes, on this
 *   environment's pool only (USER_POOL_ADMIN_ACTIONS).
 * - Models (PRD 14, Provider and data path; docs/adr/0048 and 0054): bedrock:InvokeModel, the one call
 *   the gateway's Bedrock provider makes, on the models the current prompt versions pin and no other
 *   (MODEL_INVOKE_ACTIONS, ../models.ts). The gateway still refuses Bedrock until the pinned models'
 *   prices are confirmed and their evaluation recorded.
 * - Scanned pages (PRD 15, Documents: Textract for scanned PDFs; docs/adr/0055): the asynchronous text
 *   detection intake runs on a clean document's copy under `textract/` (TEXTRACT_ACTIONS). Textract's
 *   actions take no resource, so the statement names `*`; Textract reads the object with this role's
 *   own S3 and through-S3 KMS permissions above.
 */
export class ApplicationRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ApplicationRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const buckets = [props.documents, props.packets];

    this.role = new iam.Role(this, 'Role', {
      description: 'Web and worker tasks: practice data keys, documents, packets, digest email, address validation, pinned models, scanned pages',
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
        sid: 'DigestEmail',
        actions: ['ses:SendEmail'],
        resources: [props.digestMail.identityArn, props.digestMail.configurationSetArn],
        conditions: { StringEquals: { 'ses:FromAddress': props.digestMail.mailFromAddress } },
      }),
      new iam.PolicyStatement({
        sid: 'NoAddressValidationHere',
        effect: iam.Effect.DENY,
        actions: [...ADDRESS_VALIDATION_ACTIONS],
        resources: ['*'],
      }),
      new iam.PolicyStatement({
        sid: 'NoRoleOfThisAccount',
        effect: iam.Effect.DENY,
        actions: ['sts:AssumeRole'],
        resources: [`arn:${stack.partition}:iam::${stack.account}:role/*`],
      }),
      new iam.PolicyStatement({
        sid: 'UserPoolAdministration',
        actions: [...USER_POOL_ADMIN_ACTIONS],
        resources: [props.userPool.userPoolArn],
      }),
      new iam.PolicyStatement({
        sid: 'PinnedModels',
        actions: [...MODEL_INVOKE_ACTIONS],
        resources: pinnedBedrockModels().flatMap((modelId) => bedrockModelArns(modelId, stack.partition, stack.region, stack.account)),
      }),
      new iam.PolicyStatement({
        sid: 'ScannedPages',
        actions: [...TEXTRACT_ACTIONS],
        resources: ['*'],
      }),
    ];
    for (const statement of statements) {
      this.role.addToPolicy(statement);
    }

    // Only once MailValidationRoleArn names a role: before, there is no role to name.
    const validation = new iam.Policy(this, 'AddressValidationRole', {
      roles: [this.role],
      statements: [
        new iam.PolicyStatement({
          sid: 'AssumeAddressValidationRole',
          actions: ['sts:AssumeRole'],
          resources: [props.addressValidation.roleArn],
        }),
      ],
    });
    (validation.node.defaultChild as iam.CfnPolicy).cfnOptions.condition = props.addressValidation.roleSet;
  }
}
