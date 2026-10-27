import {
  Duration,
  Stack,
  aws_cloudwatch as cloudwatch,
  type aws_cloudwatch_actions as cloudwatchActions,
  aws_events as events,
  aws_iam as iam,
  type aws_kms as kms,
  aws_ses as ses,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import {
  ACCOUNT_REPUTATION_ALARMS,
  MAIL_EVENTS_OLDEST_LIMIT_SECONDS,
  MAIL_EVENTS_QUEUE,
  MAIL_EVENTS_QUEUE_PERIOD_SECONDS,
  MAIL_EVENTS_RULE_RETRY,
  MAIL_EVENT_TYPES,
  MAIL_FROM_SUBDOMAIN,
  MAIL_STREAMS,
  type MailStream,
  REPUTATION_PERIOD_SECONDS,
  SET_REPUTATION_ALARMS,
  configurationSetName,
  mailEventsDeadLetterQueueName,
  mailEventsQueueName,
} from '../mail';

export interface MailStreamsProps {
  readonly environmentName: EnvironmentName;
  /** The environment key: it encrypts the event queues, and EventBridge may use it for the two rules only. */
  readonly key: kms.Key;
  /** MailFromAddress's domain: the transactional and notices streams' identity. */
  readonly mailFromDomain: string;
  /** screening.<that domain>: the screening stream's own identity (Q12). */
  readonly screeningMailDomain: string;
  /** Notifies the operator topic (Monitoring). */
  readonly notify: cloudwatchActions.SnsAction;
}

/** The rule that sends the three sets' SES events to the event queue. */
export function mailEventsRuleName(environment: EnvironmentName): string {
  return `tp-${environment}-mail-events`;
}

/** The rule that sends the account's two reputation warnings to the event queue (they pause the screening stream). */
export function mailAccountAlarmsRuleName(environment: EnvironmentName): string {
  return `tp-${environment}-mail-account-alarms`;
}

/**
 * Mail in three SES streams (audit #76; docs/adr/0065, D1 to D6; the founder's rulings of 2026-10-21, Q1, Q9 to Q12):
 *
 * - **Three configuration sets**, `tp-<env>-transactional` (Cognito, digests), `tp-<env>-notices` (support-access and
 *   dunning notices) and `tp-<env>-screening` (screening results and failure notices). Every set publishes reputation
 *   metrics, requires TLS, tracks no opens or clicks (no tracking options, and VDM engagement metrics off, so neither the
 *   account's VDM nor a set rewrites a link: the screening's token link and Cognito's codes stay as written), and leaves
 *   SES's Auto Validation off: the screening checks an address at submit and tells the prospect (D9), and no HIPAA
 *   notice is dropped by a heuristic. Transactional and notices use the account's suppression list for bounces and
 *   complaints; the screening set uses no suppression at all (`SuppressedReasons: []`): SES never adds a prospect's
 *   address to the account's list, keeps no copy past the pages' promise, and a screening outcome never silences a
 *   customer's mail. The screening's only suppression is the database's keyed refusal list (Q11 (b)).
 *   `SendingEnabled` is never in the template: the platform's mail_events job keeps the screening set's sending in
 *   step with the database (D5's reconcile), so a deploy never re-enables a paused set.
 * - **Two domain identities** owned by the stack: MailFromAddress's domain (default set transactional) and its
 *   screening subdomain (default set screening), each with Easy DKIM (RSA 2048) and a custom MAIL FROM `bounce.<it>`
 *   that falls back to SES's own on an MX failure (DKIM stays aligned, so DMARC still passes). They verify once the DNS
 *   records the stack outputs are set at the registrar (phase 1); Cognito sends through them in phase 2
 *   (MailIdentitiesVerified, D2).
 * - **The event path** (D4): each set's events (send, reject, bounce, complaint, delivery, delivery delay, rendering
 *   failure) go to the account's default event bus; rule `tp-<env>-mail-events` takes those of the three sets, and rule
 *   `tp-<env>-mail-account-alarms` the two account warnings' ALARM state changes; both target the queue
 *   `tp-<env>-mail-events` (encrypted under the environment key, 4 days, a 60-second visibility, five receives then
 *   `tp-<env>-mail-events-dlq`, kept 14 days), each with the dead-letter queue for what EventBridge cannot deliver in 24
 *   hours. Both queues admit only the two rules and refuse requests without TLS; the key admits EventBridge only for
 *   them. No EventBridge archive is created: it would keep addresses past every promise. The platform's mail_events job
 *   drains the queue through the SQS interface endpoint (Network).
 * - **Nine alarms** to the operator topic: the account's bounce rate (2.5%, the `account_rate` signal; 4%) and
 *   complaint rate (0.05%, the signal; 0.08%), the screening set's bounce (3%) and complaint (0.08%) rates, the
 *   transactional set's bounce rate (2%), a message in the dead-letter queue, and the queue's oldest message past 15
 *   minutes. Monitoring adds the seven counted from the logs. No dimension holds an address: the account's metrics have
 *   none, and a set's has its name.
 */
export class MailStreams extends Construct {
  readonly configurationSets: Readonly<Record<MailStream, ses.ConfigurationSet>>;
  /** MailFromAddress's domain, default set transactional. */
  readonly mailIdentity: ses.EmailIdentity;
  /** The screening subdomain, default set screening. */
  readonly screeningIdentity: ses.EmailIdentity;
  readonly queue: sqs.Queue;
  readonly deadLetterQueue: sqs.Queue;
  readonly eventsRule: events.Rule;
  readonly accountAlarmsRule: events.Rule;
  readonly accountBounceWarningAlarm: cloudwatch.Alarm;
  readonly accountBounceHighAlarm: cloudwatch.Alarm;
  readonly accountComplaintWarningAlarm: cloudwatch.Alarm;
  readonly accountComplaintHighAlarm: cloudwatch.Alarm;
  readonly screeningBounceAlarm: cloudwatch.Alarm;
  readonly screeningComplaintAlarm: cloudwatch.Alarm;
  readonly transactionalBounceAlarm: cloudwatch.Alarm;
  readonly deadLetterAlarm: cloudwatch.Alarm;
  readonly queueAgeAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: MailStreamsProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const environment = props.environmentName;

    const sets: Partial<Record<MailStream, ses.ConfigurationSet>> = {};
    const defaultBus = events.EventBus.fromEventBusName(this, 'DefaultBus', 'default');
    for (const stream of MAIL_STREAMS) {
      const set = new ses.ConfigurationSet(this, `${capitalized(stream)}Set`, {
        configurationSetName: configurationSetName(environment, stream),
        reputationMetrics: true,
        tlsPolicy: ses.ConfigurationSetTlsPolicy.REQUIRE,
        vdmOptions: { engagementMetrics: false },
        disableAutoValidation: true,
        ...(stream === 'screening' ? { disableSuppressionList: true } : { suppressionReasons: ses.SuppressionReasons.BOUNCES_AND_COMPLAINTS }),
      });
      set.addEventDestination('Events', {
        destination: ses.EventDestination.eventBus(defaultBus),
        events: MAIL_EVENT_TYPES.map((type) => sesEvent(type)),
      });
      sets[stream] = set;
    }
    this.configurationSets = sets as Record<MailStream, ses.ConfigurationSet>;

    const identity = (identityId: string, domain: string, set: ses.ConfigurationSet) =>
      new ses.EmailIdentity(this, identityId, {
        identity: ses.Identity.domain(domain),
        configurationSet: set,
        dkimIdentity: ses.DkimIdentity.easyDkim(ses.EasyDkimSigningKeyLength.RSA_2048_BIT),
        mailFromDomain: `${MAIL_FROM_SUBDOMAIN}.${domain}`,
        mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
      });
    this.mailIdentity = identity('MailIdentity', props.mailFromDomain, this.configurationSets.transactional);
    this.screeningIdentity = identity('ScreeningIdentity', props.screeningMailDomain, this.configurationSets.screening);

    // The rules' ARNs from their names: the key's policy names them, and the key must not wait on the rules, whose
    // targets wait on the queue, which waits on the key.
    const ruleArn = (name: string) => `arn:${stack.partition}:events:${stack.region}:${stack.account}:rule/${name}`;
    const ruleArns = [ruleArn(mailEventsRuleName(environment)), ruleArn(mailAccountAlarmsRuleName(environment))];
    const eventBridge = new iam.ServicePrincipal('events.amazonaws.com');

    this.deadLetterQueue = new sqs.Queue(this, 'EventsDeadLetterQueue', {
      queueName: mailEventsDeadLetterQueueName(environment),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.key,
      retentionPeriod: Duration.days(MAIL_EVENTS_QUEUE.deadLetterRetentionDays),
      enforceSSL: true,
    });
    this.queue = new sqs.Queue(this, 'EventsQueue', {
      queueName: mailEventsQueueName(environment),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.key,
      retentionPeriod: Duration.days(MAIL_EVENTS_QUEUE.retentionDays),
      visibilityTimeout: Duration.seconds(MAIL_EVENTS_QUEUE.visibilityTimeoutSeconds),
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: MAIL_EVENTS_QUEUE.maxReceiveCount },
      enforceSSL: true,
    });
    for (const queue of [this.queue, this.deadLetterQueue]) {
      queue.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'MailEventRulesOnly',
          principals: [eventBridge],
          actions: ['sqs:SendMessage'],
          resources: [queue.queueArn],
          conditions: { ArnEquals: { 'aws:SourceArn': ruleArns } },
        }),
      );
    }
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'MailEventRulesToEncryptedQueues',
        principals: [eventBridge],
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: ['*'],
        conditions: { ArnEquals: { 'aws:SourceArn': ruleArns } },
      }),
    );

    // The rules' targets are written here rather than through aws-events-targets, whose SQS target grants an encrypted
    // queue to any rule of the account and the key without a condition.
    const toQueue: events.IRuleTarget = {
      bind: () => ({
        arn: this.queue.queueArn,
        deadLetterConfig: { arn: this.deadLetterQueue.queueArn },
        retryPolicy: {
          maximumEventAgeInSeconds: Duration.hours(MAIL_EVENTS_RULE_RETRY.maxEventAgeHours).toSeconds(),
          maximumRetryAttempts: MAIL_EVENTS_RULE_RETRY.retryAttempts,
        },
      }),
    };
    this.eventsRule = new events.Rule(this, 'EventsRule', {
      ruleName: mailEventsRuleName(environment),
      description: `The ${environment} mail streams' SES events, to the mail events queue`,
      eventPattern: {
        source: ['aws.ses'],
        detail: { mail: { tags: { 'ses:configuration-set': MAIL_STREAMS.map((stream) => configurationSetName(environment, stream)) } } },
      },
      targets: [toQueue],
    });

    const alarm = (alarmId: string, description: string, metric: cloudwatch.IMetric, threshold: number) => {
      const created = new cloudwatch.Alarm(this, alarmId, {
        alarmDescription: description,
        metric,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      created.addAlarmAction(props.notify);
      return created;
    };
    const reputation = (metricName: 'Reputation.BounceRate' | 'Reputation.ComplaintRate', set?: MailStream) =>
      new cloudwatch.Metric({
        namespace: 'AWS/SES',
        metricName,
        statistic: cloudwatch.Stats.MAXIMUM,
        period: Duration.seconds(REPUTATION_PERIOD_SECONDS),
        ...(set === undefined ? {} : { dimensionsMap: { 'ses:configuration-set': configurationSetName(environment, set) } }),
      });
    const percent = (rate: number) => `${String(Math.round(rate * 100_000) / 1000)}%`;
    this.accountBounceWarningAlarm = alarm(
      'AccountBounceWarning',
      `The ${environment} SES account's bounce rate reached ${percent(ACCOUNT_REPUTATION_ALARMS.bounceWarning)}, half of SES's review level: the screening stream pauses (account_rate).`,
      reputation('Reputation.BounceRate'),
      ACCOUNT_REPUTATION_ALARMS.bounceWarning,
    );
    this.accountBounceHighAlarm = alarm(
      'AccountBounceHigh',
      `The ${environment} SES account's bounce rate reached ${percent(ACCOUNT_REPUTATION_ALARMS.bounceHigh)}, near SES's review level of 5%.`,
      reputation('Reputation.BounceRate'),
      ACCOUNT_REPUTATION_ALARMS.bounceHigh,
    );
    this.accountComplaintWarningAlarm = alarm(
      'AccountComplaintWarning',
      `The ${environment} SES account's complaint rate reached ${percent(ACCOUNT_REPUTATION_ALARMS.complaintWarning)}, half of SES's review level: the screening stream pauses (account_rate).`,
      reputation('Reputation.ComplaintRate'),
      ACCOUNT_REPUTATION_ALARMS.complaintWarning,
    );
    this.accountComplaintHighAlarm = alarm(
      'AccountComplaintHigh',
      `The ${environment} SES account's complaint rate reached ${percent(ACCOUNT_REPUTATION_ALARMS.complaintHigh)}, near SES's review level of 0.1%.`,
      reputation('Reputation.ComplaintRate'),
      ACCOUNT_REPUTATION_ALARMS.complaintHigh,
    );
    this.screeningBounceAlarm = alarm(
      'ScreeningSetBounce',
      `The ${environment} screening stream's bounce rate reached ${percent(SET_REPUTATION_ALARMS.screeningBounce)}.`,
      reputation('Reputation.BounceRate', 'screening'),
      SET_REPUTATION_ALARMS.screeningBounce,
    );
    this.screeningComplaintAlarm = alarm(
      'ScreeningSetComplaint',
      `The ${environment} screening stream's complaint rate reached ${percent(SET_REPUTATION_ALARMS.screeningComplaint)}.`,
      reputation('Reputation.ComplaintRate', 'screening'),
      SET_REPUTATION_ALARMS.screeningComplaint,
    );
    this.transactionalBounceAlarm = alarm(
      'TransactionalSetBounce',
      `The ${environment} transactional stream's bounce rate (invitations, codes, digests) reached ${percent(SET_REPUTATION_ALARMS.transactionalBounce)}.`,
      reputation('Reputation.BounceRate', 'transactional'),
      SET_REPUTATION_ALARMS.transactionalBounce,
    );
    this.deadLetterAlarm = alarm(
      'EventsDeadLetter',
      `A ${environment} mail event could not be recorded or delivered and is in the dead-letter queue.`,
      this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(MAIL_EVENTS_QUEUE_PERIOD_SECONDS) }),
      1,
    );
    this.queueAgeAlarm = alarm(
      'EventsQueueAge',
      `The ${environment} mail events queue holds an event older than ${String(MAIL_EVENTS_OLDEST_LIMIT_SECONDS / 60)} minutes: the platform's mail_events job is not draining it.`,
      this.queue.metricApproximateAgeOfOldestMessage({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(MAIL_EVENTS_QUEUE_PERIOD_SECONDS) }),
      MAIL_EVENTS_OLDEST_LIMIT_SECONDS,
    );

    this.accountAlarmsRule = new events.Rule(this, 'AccountAlarmsRule', {
      ruleName: mailAccountAlarmsRuleName(environment),
      description: `The ${environment} SES account's two reputation warnings, to the mail events queue (they pause the screening stream)`,
      eventPattern: {
        source: ['aws.cloudwatch'],
        detailType: ['CloudWatch Alarm State Change'],
        resources: [this.accountBounceWarningAlarm.alarmArn, this.accountComplaintWarningAlarm.alarmArn],
        detail: { state: { value: ['ALARM'] } },
      },
      targets: [toQueue],
    });
  }
}

function capitalized(stream: MailStream): string {
  return `${stream.charAt(0).toUpperCase()}${stream.slice(1)}`;
}

/** An event type's CDK name (CloudFormation's MatchingEventTypes take the same words). */
function sesEvent(type: (typeof MAIL_EVENT_TYPES)[number]): ses.EmailSendingEvent {
  const byName: Readonly<Record<(typeof MAIL_EVENT_TYPES)[number], ses.EmailSendingEvent>> = {
    SEND: ses.EmailSendingEvent.SEND,
    REJECT: ses.EmailSendingEvent.REJECT,
    BOUNCE: ses.EmailSendingEvent.BOUNCE,
    COMPLAINT: ses.EmailSendingEvent.COMPLAINT,
    DELIVERY: ses.EmailSendingEvent.DELIVERY,
    DELIVERY_DELAY: ses.EmailSendingEvent.DELIVERY_DELAY,
    RENDERING_FAILURE: ses.EmailSendingEvent.RENDERING_FAILURE,
  };
  return byName[type];
}
