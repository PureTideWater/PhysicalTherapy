import { Stack, aws_cloudtrail as cloudtrail, aws_iam as iam, type aws_kms as kms, type aws_s3 as s3 } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { privateBucket } from './storage';

export interface AccountTrailProps {
  /** The trail's name; the key admits CloudTrail for this trail alone. */
  readonly trailName: string;
  /** Encrypts the log files and the bucket. */
  readonly key: kms.IKey;
  /**
   * The management events recorded: every one (the environment's account), or the writes alone (the address-validation
   * account, whose only reads are SES's validations of screening addresses; docs/adr/0065).
   */
  readonly managementEvents: cloudtrail.ReadWriteType.ALL | cloudtrail.ReadWriteType.WRITE_ONLY;
}

export interface AccountTrail {
  readonly bucket: s3.Bucket;
  readonly trail: cloudtrail.Trail;
}

/**
 * An account's CloudTrail trail (PRD 16; docs/adr/0012): every region and the global services' events, log file
 * validation, the files encrypted under `key` in a private, TLS-only, versioned bucket kept when the stack goes, and no
 * copy to CloudWatch Logs. The key admits CloudTrail only for this trail (aws:SourceArn). Its constructs are `TrailBucket`
 * and `Trail` in `scope`, so the environment's trail keeps the logical IDs it had inside AccountSecurity.
 */
export function accountTrail(scope: Construct, props: AccountTrailProps): AccountTrail {
  const stack = Stack.of(scope);
  const bucket = privateBucket(scope, 'TrailBucket', props.key);
  const trailArn = `arn:${stack.partition}:cloudtrail:${stack.region}:${stack.account}:trail/${props.trailName}`;
  const cloudtrailPrincipal = new iam.ServicePrincipal('cloudtrail.amazonaws.com');
  props.key.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'CloudTrailEncryptLogs',
      principals: [cloudtrailPrincipal],
      actions: ['kms:GenerateDataKey*'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'aws:SourceArn': trailArn },
        StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': `arn:${stack.partition}:cloudtrail:*:${stack.account}:trail/*` },
      },
    }),
  );
  props.key.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'CloudTrailDescribeKey',
      principals: [cloudtrailPrincipal],
      actions: ['kms:DescribeKey'],
      resources: ['*'],
      conditions: { StringEquals: { 'aws:SourceArn': trailArn } },
    }),
  );
  const trail = new cloudtrail.Trail(scope, 'Trail', {
    trailName: props.trailName,
    bucket,
    encryptionKey: props.key,
    isMultiRegionTrail: true,
    includeGlobalServiceEvents: true,
    enableFileValidation: true,
    managementEvents: props.managementEvents,
    sendToCloudWatchLogs: false,
  });
  return { bucket, trail };
}
