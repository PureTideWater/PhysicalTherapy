import { Duration, RemovalPolicy, aws_kms as kms } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import { KEY_ROTATION_DAYS } from '../retention';

/**
 * The environment's customer-managed KMS key (PRD 15, Stack: secrets and keys; PRD 16, encryption).
 * Everything the stack stores at rest is encrypted under it: the database, every bucket, every
 * secret, the alert topic, the worker's logs and the CloudTrail log files. The application wraps a
 * per-practice data key under it (ApplicationRole grants that, with an encryption context of
 * practice_id only), so destroying a practice's wrapped data key at offboarding leaves its files
 * unreadable. The key rotates yearly and is never deleted with the stack.
 *
 * The default key policy delegates to IAM in the account; service principals that cannot hold an
 * IAM policy (CloudTrail, CloudWatch Logs, CloudWatch alarms, EventBridge) are added to the key
 * policy by the construct that needs them, each with conditions where the service supports them.
 */
export class EnvironmentKey extends Construct {
  readonly key: kms.Key;

  constructor(scope: Construct, id: string, props: { readonly environmentName: EnvironmentName }) {
    super(scope, id);
    this.key = new kms.Key(this, 'Key', {
      description: `Therapy platform ${props.environmentName}: data at rest and practice data keys`,
      alias: `alias/tp-${props.environmentName}`,
      enableKeyRotation: true,
      rotationPeriod: Duration.days(KEY_ROTATION_DAYS),
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
