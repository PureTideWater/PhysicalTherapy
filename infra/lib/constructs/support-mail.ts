import { Duration, Stack, aws_iam as iam, type aws_kms as kms, type aws_s3 as s3, aws_ses as ses, aws_ses_actions as actions } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { privateBucket } from './storage';

/** Where SES writes each message (SUPPORT_MAIL_PREFIX in apps/worker/src/support/inbox.ts). */
export const SUPPORT_MAIL_PREFIX = 'inbound/';

/** How long a message stays in the inbox: the job reads it within minutes; a week covers a stopped platform service. */
export const SUPPORT_MAIL_RETENTION_DAYS = 7;

export interface SupportMailProps {
  readonly environmentName: string;
  readonly key: kms.IKey;
  /** The published support address (the SupportEmail parameter): the one recipient the rule takes. */
  readonly supportEmail: string;
}

/**
 * Mail to the support address opens a ticket (PRD 19, Support: "a support address that creates a ticket";
 * docs/adr/0055).
 *
 * - The inbox: a private bucket under the environment key (privateBucket), where SES writes each message under
 *   `inbound/` and a lifecycle rule expires it, its noncurrent version and its delete marker after a week. Only
 *   SES writes it (its bucket policy, from this account's receipt rule); only the platform jobs' role reads it
 *   (OperatorRole). It is not write-once: SES cannot send If-None-Match, and every message has its own key.
 * - A receipt rule set with one rule: mail to the support address, over TLS only, scanned for spam and viruses,
 *   written to the inbox. SES adds its verdicts (virus scan, SPF, DKIM, DMARC) to the message's headers, which the
 *   support_mail job reads before it opens a ticket (apps/worker/src/support/mime.ts).
 * - The key admits SES only to encrypt through S3, for this account (the bucket's own ARN cannot be named in the
 *   key's policy without a cycle).
 *
 * Not done by the stack (docs/runbooks/support-mail.md): verifying the support address's domain for receiving,
 * pointing its MX record at SES's inbound endpoint for the region, and making this rule set the active one (a
 * region has one active rule set, so the stack does not take it over).
 */
export class SupportMail extends Construct {
  readonly bucket: s3.Bucket;
  readonly ruleSet: ses.ReceiptRuleSet;

  constructor(scope: Construct, id: string, props: SupportMailProps) {
    super(scope, id);
    const stack = Stack.of(this);
    this.bucket = privateBucket(this, 'Inbox', props.key, {
      lifecycleRules: [
        {
          id: 'support-mail-expires',
          prefix: SUPPORT_MAIL_PREFIX,
          expiration: Duration.days(SUPPORT_MAIL_RETENTION_DAYS),
          noncurrentVersionExpiration: Duration.days(1),
        },
        {
          id: 'support-mail-delete-markers-expire',
          prefix: SUPPORT_MAIL_PREFIX,
          expiredObjectDeleteMarker: true,
        },
      ],
    });
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'SesWritesSupportMail',
        principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
        actions: ['kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'aws:SourceAccount': stack.account, 'kms:ViaService': `s3.${stack.region}.amazonaws.com` },
          // The bucket's own ARN would make the key depend on the bucket it encrypts (a cycle); SES writes to no
          // other bucket of this account than the one its receipt rule names.
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': `arn:${stack.partition}:s3:::*` },
        },
      }),
    );
    this.ruleSet = new ses.ReceiptRuleSet(this, 'RuleSet', {
      receiptRuleSetName: `tp-${props.environmentName}-support`,
      rules: [
        {
          receiptRuleName: 'support-address',
          recipients: [props.supportEmail],
          scanEnabled: true,
          tlsPolicy: ses.TlsPolicy.REQUIRE,
          actions: [new actions.S3({ bucket: this.bucket, objectKeyPrefix: SUPPORT_MAIL_PREFIX })],
        },
      ],
    });
  }
}
