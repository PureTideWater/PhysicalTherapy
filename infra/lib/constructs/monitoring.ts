import {
  type CfnCondition,
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatchActions,
  aws_iam as iam,
  type aws_kms as kms,
  aws_logs as logs,
  type aws_rds as rds,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { DATABASE_CONNECTIONS_ALARM_PERCENT } from '../connections';
import type { DeploymentSettings, EnvironmentName } from '../environments';
import { HEAP_MIB } from '../heap';
import {
  JOB_FAILED_MESSAGE,
  JOB_FAILED_METRIC,
  JOB_FAILED_PERIOD_SECONDS,
  JOB_HEAP_ALARM_PERCENT,
  JOB_HEAP_MESSAGE,
  JOB_HEAP_METRIC,
  PRICING_ENGINE_ERRORS_MESSAGE,
  PRICING_ENGINE_ERRORS_METRIC,
} from '../jobs';
import {
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_MESSAGE,
  HEARTBEAT_METRIC,
  MISSED_HEARTBEATS_TO_ALARM,
  PLATFORM_HEARTBEAT_METRIC,
  missedHeartbeatsToAlarm,
  workerLogGroupName,
} from '../heartbeat';
import { logGroupName } from '../log-groups';
import {
  MAIL_NAMESPACE,
  MAIL_PLATFORM_ALARM_CODES,
  MAIL_PLATFORM_ALARM_PERIOD_SECONDS,
  MAIL_PROBE_HOURS,
  MAIL_PROBE_UNSENT_ALARM,
  MAIL_VALIDATION_CAP_CODE,
  MAIL_VALIDATION_CAP_PERIOD_SECONDS,
  MAIL_VALIDATION_REFUSED_CODE,
  MAIL_VALIDATION_REFUSED_PERIOD_SECONDS,
  type MailPlatformAlarmCode,
  PASSWORD_NOTICE_RECORD_FAILED_ALARM,
  mailCodeMetricName,
} from '../mail';
import { MODEL_BUDGET_ERROR_CODES, MODEL_BUDGET_METRIC, MODEL_BUDGET_PERIOD_SECONDS } from '../models';
import {
  OLDEST_QUEUED_LIMIT_MS,
  OLDEST_QUEUED_METRIC,
  OLDEST_QUEUED_PERIODS,
  OLDEST_QUEUED_PERIOD_SECONDS,
  QUEUE_MESSAGE,
  RUN_FAILED_ERROR_CODES,
  RUN_FAILED_METRIC,
  RUN_FAILED_PERIOD_SECONDS,
  SCREENING_HEARTBEAT_METRIC,
  TIME_TO_EMAIL_LIMIT_MS,
  TIME_TO_EMAIL_MESSAGE,
  TIME_TO_EMAIL_METRIC,
  TIME_TO_EMAIL_PERIOD_SECONDS,
  UPLOADS_SENT_TO_WAIT_METRIC,
  UPLOADS_SENT_TO_WAIT_PERIOD_SECONDS,
  UPLOAD_SENT_TO_WAIT_MESSAGE,
} from '../screening';
import {
  PASSWORD_RESET_REQUESTED_MESSAGE,
  RESET_AND_ENROLMENT_COUNTS,
  RESET_REQUESTS_PER_USER,
  type ResetAndEnrolmentMetricName,
  SECURITY_ALARM_PERIOD_SECONDS,
  SIGN_IN_BURST_MESSAGES,
  SIGN_IN_BURST_METRIC,
  resetRequestsRuleName,
} from '../security-events';

/** Where operator alerts are delivered; both optional, set at deploy time (never in the repository). */
export interface OperatorEndpoints {
  readonly email?: string;
  readonly sms?: string;
}

export interface MonitoringProps {
  readonly environmentName: EnvironmentName;
  readonly key: kms.Key;
  readonly operator: OperatorEndpoints;
  /**
   * Where the screening consumer starts at launch (production; Q1 (b)), the condition under which it runs: its
   * heartbeat counts a missing beat as missed only then, so the alarm is OK while the consumer is rightly held at no task
   * and goes to ALARM, and tells the operator, if it does not beat once launched. Elsewhere it runs once released, and
   * a missing beat counts as missed, as the worker's does.
   */
  readonly screeningRuns?: CfnCondition;
  /**
   * The database and its connection budget's figures (infra/lib/connections.ts): its max_connections and the alarm's line,
   * DATABASE_CONNECTIONS_ALARM_PERCENT of it.
   */
  readonly database: { readonly instance: rds.IDatabaseInstance; readonly maxConnections: number; readonly alarmThreshold: number };
  /**
   * How the practice worker's deploy replaces it (environments.ts): where it stops first (dev), its heartbeat alarm waits
   * out the deploy's whole gap (missedHeartbeatsToAlarm), so a deploy never pages.
   */
  readonly workerDeployment: DeploymentSettings;
}

/**
 * Operator alerting and the worker heartbeat (PRD 19, monitoring and alerts; test matrix JOB-04).
 *
 * The operator topic is encrypted under the environment key and accepts only TLS. Alerts carry an
 * alarm or finding name and IDs, never PHI. This account's CloudWatch alarms may publish to it.
 *
 * The worker's log group is created here, encrypted under the environment key, so the heartbeat
 * metric exists before the worker does. A metric filter counts the worker's heartbeat lines as the
 * custom metric HEARTBEAT_METRIC; the alarm fires when two consecutive one-minute periods have no
 * heartbeat, missing data counting as missed, and tells the operator when beats resume. Where the
 * worker deploys stop-first (dev; environments.ts), it waits out a deploy's whole gap instead, ten
 * periods (missedHeartbeatsToAlarm), so a deploy never pages. Until the worker runs (the first
 * release, docs/adr/0049) the alarm is, correctly, in ALARM.
 *
 * A second metric filter counts the line a job logs when it fails its last (third) attempt, the
 * restore drill and the audit copy included (infra/lib/jobs.ts; test matrix JOB-02); its alarm tells
 * the operator within one period. Earlier attempts' failures are retried and raise nothing.
 *
 * A third counts the line a pricing run logs when it recorded an ENGINE_ERROR line that pages the
 * operator (the closed list's remedy for ENGINE_ERROR); its alarm tells the operator the same way.
 *
 * With the compute (milestone 11, docs/adr/0049) each service has its own log group under the same
 * key, kept a year: the web app's, the platform jobs' and the migration task's beside the worker's.
 * The platform jobs log the same heartbeat and final-failure lines as the worker: their heartbeat is
 * its own metric and alarm, and their final failures count toward the same job-failure metric and
 * alarm. The web app's failed sign-in bursts (a second-factor burst, a lockout) are counted from
 * its log group and alarm at once. A practice that reaches or spends its daily model budget (test
 * matrix MOD-05: "calls refused; alert") is counted from the web app's and the worker's log groups,
 * both of which call the model gateway, and alarms at once. Each worker job's live heap peak (its
 * `job heap` line, docs/adr/0083) is taken from the worker's log group, and its maximum alarms above 75%
 * of the worker's heap limit in a five-minute period. Alarm text is fixed: an alarm name, the
 * environment and a reason, never a value from a log line.
 *
 * The screening consumer (docs/adr/0062; PR 6b-3, decisions 13 to 16) logs to its own group (/tp/<env>/screening). Its
 * heartbeat is its own metric and alarm, and its final job failures count toward the job-failure alarm. Three metrics
 * of its own (infra/lib/screening.ts): the time from the web's receipt of an upload to its result's email, which alarms
 * above the 60-second promise; the oldest normal-tier run's wait in the queue, which alarms above two minutes, two
 * minutes in a row; and its failed runs (any error line, or a run out of attempts). The web app's uploads sent to wait
 * (over an account's share or the day's cap, Q7) are counted from the web's group. No metric has a dimension.
 *
 * The mail streams (docs/adr/0065; audit #76) add ten metric filters, each with its alarm: six codes the platform
 * jobs log (infra/lib/mail.ts, MAIL_PLATFORM_ALARM_CODES: the screening stream paused, a notice not delivered to a
 * recipient, a notice with no recipient, an invitation not delivered, a stream with no probe back in 26 hours, logged on
 * every run while it holds, and a password-changed email not delivered, not sent within 24 hours or sent with its record
 * still failing at its fifth try, docs/adr/0091), each
 * alarmed at one in five minutes; a probe the platform could not send (MAIL_PROBE_UNSENT_ALARM), alarmed when each of three five-minute periods
 * has one; the job's code for a password-changed email SES accepted whose record then failed, on each such try
 * (PASSWORD_NOTICE_RECORD_FAILED_ALARM; docs/adr/0091, D9), alarmed at one in five minutes, so the first copy pages;
 * the web's code for an address validation AWS refused (the address-validation account's role or its call),
 * alarmed at one in five minutes; and its code for the day's address validations reaching their cap, alarmed at one in
 * a day. Each is matched on the line's `error_code` and named by it (the failed record by its constant's name), never
 * by a value from the line; MailStreams holds the reputation and queue alarms.
 *
 * Reset and enrolment (R-11; docs/adr/0088, D7; test matrix SEC-23) add thirteen metric filters on the web's group, each
 * with its alarm (infra/lib/security-events.ts, RESET_AND_ENROLMENT_COUNTS): a reset request not delivered for a code
 * that means the app and Cognito disagree or mail is broken, one not delivered for a throttle code, a failed reset
 * request, a refused second-factor enrolment, a refused client credential, the start-up probe's refused credential,
 * three reset requests in an hour answered after their floor (docs/adr/0081), a completed reset whose sessions were
 * not ended, which queued no password-changed email (docs/adr/0091, D15), and a completed reset whose sign-out at the
 * provider failed, after which a key-registration step begun before it can still register a hardware key
 * (docs/adr/0091, D10); and the four of docs/adr/0093: a sign-in step begun before a reset and refused after it (every
 * step but the hardware-key sign-in's), a hardware key registered across a reset, a reset whose outcome at the
 * provider is unknown, and a sign-in refused because its address and its provider subject name two accounts. Reset requests per user are counted by a Contributor Insights rule keyed on the user ID, never
 * by a metric with a user dimension, and alarm at five in an hour; the alarm names no user.
 *
 * The database's connections (docs/adr/0083, "The practice pool"): RDS's DatabaseConnections at its largest in five
 * minutes, alarmed at DATABASE_CONNECTIONS_ALARM_PERCENT (80%) of the instance's max_connections as the connection
 * budget reads it, the figure the stack's synthesis checked every task's pools against.
 */
export class Monitoring extends Construct {
  readonly operatorTopic: sns.Topic;
  readonly workerLogGroup: logs.LogGroup;
  readonly webLogGroup: logs.LogGroup;
  readonly platformLogGroup: logs.LogGroup;
  readonly migrationLogGroup: logs.LogGroup;
  readonly screeningLogGroup: logs.LogGroup;
  readonly heartbeatAlarm: cloudwatch.Alarm;
  readonly platformHeartbeatAlarm: cloudwatch.Alarm;
  readonly jobFailedAlarm: cloudwatch.Alarm;
  readonly pricingEngineErrorsAlarm: cloudwatch.Alarm;
  /** A job's live heap above 75% of the worker's heap limit (D23). */
  readonly jobHeapAlarm: cloudwatch.Alarm;
  /** The database's connections at 80% of its max_connections (docs/adr/0083). */
  readonly databaseConnectionsAlarm: cloudwatch.Alarm;
  readonly failedSignInBurstAlarm: cloudwatch.Alarm;
  readonly modelBudgetAlarm: cloudwatch.Alarm;
  readonly screeningHeartbeatAlarm: cloudwatch.Alarm;
  readonly screeningTimeToEmailAlarm: cloudwatch.Alarm;
  readonly screeningQueueAlarm: cloudwatch.Alarm;
  readonly screeningRunFailedAlarm: cloudwatch.Alarm;
  readonly screeningUploadsSentToWaitAlarm: cloudwatch.Alarm;
  /** One alarm per platform mail code (MAIL_PLATFORM_ALARM_CODES). */
  readonly mailCodeAlarms: Readonly<Record<MailPlatformAlarmCode, cloudwatch.Alarm>>;
  /** A probe that could not be sent for 15 minutes (MAIL_PROBE_UNSENT_ALARM). */
  readonly mailProbeUnsentAlarm: cloudwatch.Alarm;
  /** A password-changed email SES accepted whose record then failed, on each such try: the first copy pages (PASSWORD_NOTICE_RECORD_FAILED_ALARM). */
  readonly passwordNoticeRecordFailedAlarm: cloudwatch.Alarm;
  /** An address validation AWS refused (MAIL_VALIDATION_REFUSED_CODE). */
  readonly mailValidationRefusedAlarm: cloudwatch.Alarm;
  readonly mailValidationCapAlarm: cloudwatch.Alarm;
  /** One alarm per reset or enrolment line counted (RESET_AND_ENROLMENT_COUNTS). */
  readonly resetAndEnrolmentAlarms: Readonly<Record<ResetAndEnrolmentMetricName, cloudwatch.Alarm>>;
  /** Counts each account's reset requests by its user ID (PASSWORD_RESET_REQUESTED_MESSAGE). */
  readonly resetRequestsPerUserRule: cloudwatch.CfnInsightRule;
  /** One user's reset requests reached RESET_REQUESTS_PER_USER in its period. */
  readonly resetRequestsPerUserAlarm: cloudwatch.Alarm;
  /** Notifies the operator topic; every alarm in the stack uses it. */
  readonly notify: cloudwatchActions.SnsAction;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);
    const stack = Stack.of(this);

    this.operatorTopic = new sns.Topic(this, 'OperatorAlerts', {
      displayName: `Therapy platform ${props.environmentName} alerts`,
      masterKey: props.key,
      enforceSSL: true,
    });
    // CloudWatch alarms publish under the service principal, so the topic admits only this
    // account's alarms; the key lets the service encrypt what it publishes (SNS's documented pair).
    const cloudwatchPrincipal = new iam.ServicePrincipal('cloudwatch.amazonaws.com');
    this.operatorTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AlarmsInThisAccount',
        principals: [cloudwatchPrincipal],
        actions: ['sns:Publish'],
        resources: [this.operatorTopic.topicArn],
        conditions: {
          ArnLike: { 'aws:SourceArn': `arn:${stack.partition}:cloudwatch:${stack.region}:${stack.account}:alarm:*` },
          StringEquals: { 'aws:SourceAccount': stack.account },
        },
      }),
    );
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchAlarmsToEncryptedTopic',
        principals: [cloudwatchPrincipal],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
        resources: ['*'],
      }),
    );
    if (props.operator.email !== undefined) {
      this.operatorTopic.addSubscription(new subscriptions.EmailSubscription(props.operator.email));
    }
    if (props.operator.sms !== undefined) {
      this.operatorTopic.addSubscription(new subscriptions.SmsSubscription(props.operator.sms));
    }

    // CloudWatch Logs encrypts the stack's log groups, all named /tp/<environment>/..., and no other.
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsPlatformLogGroups',
        principals: [new iam.ServicePrincipal(`logs.${stack.region}.amazonaws.com`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${stack.partition}:logs:${stack.region}:${stack.account}:log-group:/tp/${props.environmentName}/*`,
          },
        },
      }),
    );
    const logGroup = (id: string, name: string) =>
      new logs.LogGroup(this, id, { logGroupName: name, encryptionKey: props.key, retention: logs.RetentionDays.ONE_YEAR, removalPolicy: RemovalPolicy.RETAIN });
    this.workerLogGroup = logGroup('WorkerLogs', workerLogGroupName(props.environmentName));
    this.webLogGroup = logGroup('WebLogs', logGroupName(props.environmentName, 'web'));
    this.platformLogGroup = logGroup('PlatformLogs', logGroupName(props.environmentName, 'platform'));
    this.migrationLogGroup = logGroup('MigrationLogs', logGroupName(props.environmentName, 'migration'));
    this.screeningLogGroup = logGroup('ScreeningLogs', logGroupName(props.environmentName, 'screening'));

    const heartbeats = this.workerLogGroup.addMetricFilter('Heartbeat', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', HEARTBEAT_MESSAGE),
      metricNamespace: HEARTBEAT_METRIC.namespace,
      metricName: HEARTBEAT_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });

    // Two missed beats, or where the worker's deploy stops it first (dev), every beat that deploy's gap can miss.
    const workerMissedBeats = missedHeartbeatsToAlarm(props.workerDeployment);
    this.heartbeatAlarm = new cloudwatch.Alarm(this, 'WorkerHeartbeatMissed', {
      alarmDescription: `The ${props.environmentName} worker missed ${String(workerMissedBeats)} consecutive heartbeats.`,
      metric: heartbeats.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(HEARTBEAT_INTERVAL_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: workerMissedBeats,
      datapointsToAlarm: workerMissedBeats,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    const notify = new cloudwatchActions.SnsAction(this.operatorTopic);
    this.notify = notify;
    this.heartbeatAlarm.addAlarmAction(notify);
    this.heartbeatAlarm.addOkAction(notify);

    const platformHeartbeats = this.platformLogGroup.addMetricFilter('Heartbeat', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', HEARTBEAT_MESSAGE),
      metricNamespace: PLATFORM_HEARTBEAT_METRIC.namespace,
      metricName: PLATFORM_HEARTBEAT_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    this.platformHeartbeatAlarm = new cloudwatch.Alarm(this, 'PlatformHeartbeatMissed', {
      alarmDescription: `The ${props.environmentName} platform jobs missed ${String(MISSED_HEARTBEATS_TO_ALARM)} consecutive heartbeats.`,
      metric: platformHeartbeats.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(HEARTBEAT_INTERVAL_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: MISSED_HEARTBEATS_TO_ALARM,
      datapointsToAlarm: MISSED_HEARTBEATS_TO_ALARM,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    this.platformHeartbeatAlarm.addAlarmAction(notify);
    this.platformHeartbeatAlarm.addOkAction(notify);

    const failures = this.workerLogGroup.addMetricFilter('JobFailedOnLastAttempt', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', JOB_FAILED_MESSAGE),
      metricNamespace: JOB_FAILED_METRIC.namespace,
      metricName: JOB_FAILED_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    // The platform jobs' final failures (the restore drill, the audit copy) count toward the same metric.
    this.platformLogGroup.addMetricFilter('JobFailedOnLastAttempt', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', JOB_FAILED_MESSAGE),
      metricNamespace: JOB_FAILED_METRIC.namespace,
      metricName: JOB_FAILED_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    // The screening consumer's final failures (a screening_price or sweep job out of attempts) count toward it too.
    this.screeningLogGroup.addMetricFilter('JobFailedOnLastAttempt', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', JOB_FAILED_MESSAGE),
      metricNamespace: JOB_FAILED_METRIC.namespace,
      metricName: JOB_FAILED_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    this.jobFailedAlarm = new cloudwatch.Alarm(this, 'JobFailedOnLastAttempt', {
      alarmDescription: `A ${props.environmentName} job (the restore drill and the audit copy included) failed its third and last attempt.`,
      metric: failures.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(JOB_FAILED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.jobFailedAlarm.addAlarmAction(notify);

    const engineErrors = this.workerLogGroup.addMetricFilter('PricingRunEngineErrors', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', PRICING_ENGINE_ERRORS_MESSAGE),
      metricNamespace: PRICING_ENGINE_ERRORS_METRIC.namespace,
      metricName: PRICING_ENGINE_ERRORS_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    this.pricingEngineErrorsAlarm = new cloudwatch.Alarm(this, 'PricingRunEngineErrors', {
      alarmDescription: `A ${props.environmentName} pricing run recorded engine errors for the operator.`,
      metric: engineErrors.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(JOB_FAILED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.pricingEngineErrorsAlarm.addAlarmAction(notify);

    const heapPeaks = this.workerLogGroup.addMetricFilter('JobHeapLivePeak', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', JOB_HEAP_MESSAGE),
      metricNamespace: JOB_HEAP_METRIC.namespace,
      metricName: JOB_HEAP_METRIC.metricName,
      metricValue: '$.heap_live_peak_mib',
    });
    this.jobHeapAlarm = new cloudwatch.Alarm(this, 'JobHeapLivePeak', {
      alarmDescription: `A ${props.environmentName} worker job saw the live heap pass ${String(JOB_HEAP_ALARM_PERCENT)} percent of the worker heap limit.`,
      metric: heapPeaks.metric({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(JOB_FAILED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: (HEAP_MIB.worker * JOB_HEAP_ALARM_PERCENT) / 100,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.jobHeapAlarm.addAlarmAction(notify);

    this.databaseConnectionsAlarm = new cloudwatch.Alarm(this, 'DatabaseConnections', {
      alarmDescription: `The ${props.environmentName} database held ${String(props.database.alarmThreshold)} or more connections, ${String(DATABASE_CONNECTIONS_ALARM_PERCENT)} percent of the ${String(props.database.maxConnections)} the connection budget reads for its class.`,
      metric: props.database.instance.metricDatabaseConnections({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(JOB_FAILED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: props.database.alarmThreshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.databaseConnectionsAlarm.addAlarmAction(notify);

    const signInBursts = this.webLogGroup.addMetricFilter('FailedSignInBursts', {
      filterPattern: logs.FilterPattern.any(...SIGN_IN_BURST_MESSAGES.map((message) => logs.FilterPattern.stringValue('$.msg', '=', message))),
      metricNamespace: SIGN_IN_BURST_METRIC.namespace,
      metricName: SIGN_IN_BURST_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    this.failedSignInBurstAlarm = new cloudwatch.Alarm(this, 'FailedSignInBurst', {
      alarmDescription: `A ${props.environmentName} account had a burst of failed second factors or was locked after ten failed sign-ins.`,
      metric: signInBursts.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(SECURITY_ALARM_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.failedSignInBurstAlarm.addAlarmAction(notify);

    // The model gateway runs in the web app and in the worker's practice jobs: one metric from both.
    const budgetPattern = logs.FilterPattern.any(...MODEL_BUDGET_ERROR_CODES.map((code) => logs.FilterPattern.stringValue('$.error_code', '=', code)));
    const budgetEvents = [this.webLogGroup, this.workerLogGroup].map((group, index) =>
      group.addMetricFilter(index === 0 ? 'ModelBudgetEvents' : 'ModelBudgetEventsWorker', {
        filterPattern: budgetPattern,
        metricNamespace: MODEL_BUDGET_METRIC.namespace,
        metricName: MODEL_BUDGET_METRIC.metricName,
        metricValue: '1',
        unit: cloudwatch.Unit.COUNT,
      }),
    );
    this.modelBudgetAlarm = new cloudwatch.Alarm(this, 'ModelBudgetReached', {
      alarmDescription: `A ${props.environmentName} practice reached or spent its daily model budget, and model calls are being refused.`,
      metric: (budgetEvents[0] as logs.MetricFilter).metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(MODEL_BUDGET_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.modelBudgetAlarm.addAlarmAction(notify);

    const counted = (group: logs.LogGroup, id: string, metric: { readonly namespace: string; readonly metricName: string }, pattern: logs.IFilterPattern) =>
      group.addMetricFilter(id, { filterPattern: pattern, metricNamespace: metric.namespace, metricName: metric.metricName, metricValue: '1', unit: cloudwatch.Unit.COUNT });
    const measured = (group: logs.LogGroup, id: string, metric: { readonly namespace: string; readonly metricName: string }, message: string) =>
      group.addMetricFilter(id, {
        filterPattern: logs.FilterPattern.stringValue('$.msg', '=', message),
        metricNamespace: metric.namespace,
        metricName: metric.metricName,
        metricValue: '$.elapsed_ms',
        unit: cloudwatch.Unit.MILLISECONDS,
      });

    const screeningBeats = counted(this.screeningLogGroup, 'Heartbeat', SCREENING_HEARTBEAT_METRIC, logs.FilterPattern.stringValue('$.msg', '=', HEARTBEAT_MESSAGE));
    this.screeningHeartbeatAlarm = new cloudwatch.Alarm(this, 'ScreeningHeartbeatMissed', {
      alarmDescription: `The ${props.environmentName} screening consumer missed ${String(MISSED_HEARTBEATS_TO_ALARM)} consecutive heartbeats.`,
      metric: screeningBeats.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(HEARTBEAT_INTERVAL_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: MISSED_HEARTBEATS_TO_ALARM,
      datapointsToAlarm: MISSED_HEARTBEATS_TO_ALARM,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    if (props.screeningRuns !== undefined) {
      (this.screeningHeartbeatAlarm.node.defaultChild as cloudwatch.CfnAlarm).treatMissingData = Fn.conditionIf(
        props.screeningRuns.logicalId,
        cloudwatch.TreatMissingData.BREACHING,
        cloudwatch.TreatMissingData.NOT_BREACHING,
      ).toString();
    }
    this.screeningHeartbeatAlarm.addAlarmAction(notify);
    this.screeningHeartbeatAlarm.addOkAction(notify);

    const timeToEmail = measured(this.screeningLogGroup, 'TimeToEmail', TIME_TO_EMAIL_METRIC, TIME_TO_EMAIL_MESSAGE);
    this.screeningTimeToEmailAlarm = new cloudwatch.Alarm(this, 'ScreeningTimeToEmail', {
      alarmDescription: `A ${props.environmentName} screening result was emailed more than ${String(TIME_TO_EMAIL_LIMIT_MS / 1000)} seconds after its upload was received (the promise, decision 14).`,
      metric: timeToEmail.metric({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(TIME_TO_EMAIL_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: TIME_TO_EMAIL_LIMIT_MS,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.screeningTimeToEmailAlarm.addAlarmAction(notify);

    const oldestQueued = measured(this.screeningLogGroup, 'OldestQueued', OLDEST_QUEUED_METRIC, QUEUE_MESSAGE);
    this.screeningQueueAlarm = new cloudwatch.Alarm(this, 'ScreeningQueueWaiting', {
      alarmDescription: `A ${props.environmentName} screening upload of the normal tier has waited in the queue more than ${String(OLDEST_QUEUED_LIMIT_MS / 60_000)} minutes.`,
      metric: oldestQueued.metric({ statistic: cloudwatch.Stats.MAXIMUM, period: Duration.seconds(OLDEST_QUEUED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      threshold: OLDEST_QUEUED_LIMIT_MS,
      evaluationPeriods: OLDEST_QUEUED_PERIODS,
      datapointsToAlarm: OLDEST_QUEUED_PERIODS,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.screeningQueueAlarm.addAlarmAction(notify);

    const runFailed = counted(
      this.screeningLogGroup,
      'RunFailed',
      RUN_FAILED_METRIC,
      logs.FilterPattern.any(logs.FilterPattern.stringValue('$.level', '=', 'error'), ...RUN_FAILED_ERROR_CODES.map((code) => logs.FilterPattern.stringValue('$.error_code', '=', code))),
    );
    this.screeningRunFailedAlarm = new cloudwatch.Alarm(this, 'ScreeningRunFailed', {
      alarmDescription: `A ${props.environmentName} screening failed: the consumer logged an error, or a run used its last attempt.`,
      metric: runFailed.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(RUN_FAILED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.screeningRunFailedAlarm.addAlarmAction(notify);

    const sentToWait = counted(this.webLogGroup, 'ScreeningUploadsSentToWait', UPLOADS_SENT_TO_WAIT_METRIC, logs.FilterPattern.stringValue('$.msg', '=', UPLOAD_SENT_TO_WAIT_MESSAGE));
    this.screeningUploadsSentToWaitAlarm = new cloudwatch.Alarm(this, 'ScreeningUploadsSentToWait', {
      alarmDescription: `A ${props.environmentName} screening upload was over its account's daily share or the day's cap, and waits behind the normal uploads.`,
      metric: sentToWait.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(UPLOADS_SENT_TO_WAIT_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.screeningUploadsSentToWaitAlarm.addAlarmAction(notify);

    const mailCodeDescriptions: Readonly<Record<MailPlatformAlarmCode, string>> = {
      MAIL_STREAM_PAUSED: `The ${props.environmentName} screening mail stream paused: new screenings are refused until a platform administrator resumes it with a reason (docs/runbooks/deliverability.md).`,
      NOTICE_UNDELIVERED: `A ${props.environmentName} support-access or dunning notice did not reach a recipient: reach the practice or organization another way.`,
      NOTICE_UNDELIVERABLE: `A ${props.environmentName} support-access or dunning notice had no one to send to: reach the practice or organization another way.`,
      INVITATION_UNDELIVERED: `A ${props.environmentName} invitation email was not delivered: tell the inviting administrator.`,
      // One page can stand for several notices: the alarm notifies when it goes into ALARM, not once a line, so the
      // words say to read every line while it is raised (review UX-04 of 2026-11-11), and each line's reason before
      // anyone is told: a notice whose record kept failing went out, up to five times (the delta review, DS-07).
      PASSWORD_NOTICE_UNDELIVERED: `One or more ${props.environmentName} password-changed emails did not reach their accounts, were not sent within 24 hours, or went out with their record failing: read every line while this alarm is raised and each line's reason before you tell anyone (docs/runbooks/deliverability.md, 3.10).`,
      // The hardware-key notices (docs/adr/0095): removed, registration opened, registered after a removal. One page can
      // stand for several notices, as above.
      KEY_NOTICE_UNDELIVERED: `One or more ${props.environmentName} hardware-key emails (keys removed, registration opened, or a new key registered after a removal) did not reach their accounts, were not sent within 24 hours, or were held back because the account's address changed after the removal was requested: read every line while this alarm is raised and each line's reason (undelivered_reason_code) before you tell anyone; AddressChanged is an incident until explained, and the person is told another way, by a channel PaidWhole already holds (docs/runbooks/incident-response.md, the hardware-key section).`,
      MAIL_PROBE_MISSED: `A ${props.environmentName} mail stream's probes have not come back: ${String(MAIL_PROBE_HOURS.missed)} hours after the older of its last delivered and bounced probe, or ${String(MAIL_PROBE_HOURS.firstProof)} hour after the first probe sent since a resume, sent and lost or never sent (then MAIL_PROBE_UNSENT too). It stays raised, and the probes go again hourly, until both come back. Staging and production close the screening ${String(MAIL_PROBE_HOURS.ready)} hours after the last came back, and keep a resumed one closed until both are back; check the identity, the event destination, the rule, the queue and the job (docs/runbooks/deliverability.md, 3.7).`,
    };
    const codeAlarms: Partial<Record<MailPlatformAlarmCode, cloudwatch.Alarm>> = {};
    for (const code of MAIL_PLATFORM_ALARM_CODES) {
      const metricName = mailCodeMetricName(code);
      const filter = counted(this.platformLogGroup, metricName, { namespace: MAIL_NAMESPACE, metricName }, logs.FilterPattern.stringValue('$.error_code', '=', code));
      const alarm = new cloudwatch.Alarm(this, `Mail${metricName}`, {
        alarmDescription: mailCodeDescriptions[code],
        metric: filter.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(MAIL_PLATFORM_ALARM_PERIOD_SECONDS) }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(notify);
      codeAlarms[code] = alarm;
    }
    this.mailCodeAlarms = codeAlarms as Record<MailPlatformAlarmCode, cloudwatch.Alarm>;

    const unsentMetricName = mailCodeMetricName(MAIL_PROBE_UNSENT_ALARM.code);
    const probeUnsent = counted(this.platformLogGroup, unsentMetricName, { namespace: MAIL_NAMESPACE, metricName: unsentMetricName }, logs.FilterPattern.stringValue('$.error_code', '=', MAIL_PROBE_UNSENT_ALARM.code));
    this.mailProbeUnsentAlarm = new cloudwatch.Alarm(this, `Mail${unsentMetricName}`, {
      alarmDescription: `A ${props.environmentName} mail probe could not be sent for 15 minutes: no probe comes back, so staging and production close the screening 48 hours after the last one did; check the operator role's MailProbes statement, both identities and SES's sending (docs/runbooks/deliverability.md, 3.7).`,
      metric: probeUnsent.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(MAIL_PROBE_UNSENT_ALARM.periodSeconds) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: MAIL_PROBE_UNSENT_ALARM.periods,
      datapointsToAlarm: MAIL_PROBE_UNSENT_ALARM.periods,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.mailProbeUnsentAlarm.addAlarmAction(notify);

    // The password_notices job's warning for a message SES accepted whose record then failed (docs/adr/0091, D9): the
    // try is counted and the notice backs off, so the job's retry completes and the failed-job alarm hears nothing;
    // this alarm pages on the first copy, not on the undelivered line at the fifth.
    const recordFailed = counted(
      this.platformLogGroup,
      PASSWORD_NOTICE_RECORD_FAILED_ALARM.metricName,
      { namespace: MAIL_NAMESPACE, metricName: PASSWORD_NOTICE_RECORD_FAILED_ALARM.metricName },
      logs.FilterPattern.stringValue('$.error_code', '=', PASSWORD_NOTICE_RECORD_FAILED_ALARM.code),
    );
    this.passwordNoticeRecordFailedAlarm = new cloudwatch.Alarm(this, `Mail${PASSWORD_NOTICE_RECORD_FAILED_ALARM.metricName}`, {
      alarmDescription: `SES accepted a ${props.environmentName} password-changed email and the platform then could not record it, so the person has a copy and is sent another at each retry (after 1, 5, 15 and 60 minutes) until a try's record succeeds or the notice fails at its fifth: read the job's error (job attempt failed, job_type password_notices), fix the record, and check the copies' mail records before you tell anyone (docs/runbooks/deliverability.md, 3.10, RecordFailed).`,
      metric: recordFailed.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(PASSWORD_NOTICE_RECORD_FAILED_ALARM.periodSeconds) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.passwordNoticeRecordFailedAlarm.addAlarmAction(notify);

    const refusedMetricName = mailCodeMetricName(MAIL_VALIDATION_REFUSED_CODE);
    const validationRefused = counted(this.webLogGroup, refusedMetricName, { namespace: MAIL_NAMESPACE, metricName: refusedMetricName }, logs.FilterPattern.stringValue('$.error_code', '=', MAIL_VALIDATION_REFUSED_CODE));
    this.mailValidationRefusedAlarm = new cloudwatch.Alarm(this, `Mail${refusedMetricName}`, {
      alarmDescription: `AWS refused a ${props.environmentName} screening address validation: the web cannot assume the address-validation account's role, or the role cannot call SES, so every address is checked by DNS alone until it is fixed (docs/runbooks/deliverability.md, 3.8).`,
      metric: validationRefused.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(MAIL_VALIDATION_REFUSED_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.mailValidationRefusedAlarm.addAlarmAction(notify);

    const capMetricName = mailCodeMetricName(MAIL_VALIDATION_CAP_CODE);
    const capReached = counted(this.webLogGroup, capMetricName, { namespace: MAIL_NAMESPACE, metricName: capMetricName }, logs.FilterPattern.stringValue('$.error_code', '=', MAIL_VALIDATION_CAP_CODE));
    this.mailValidationCapAlarm = new cloudwatch.Alarm(this, `Mail${capMetricName}`, {
      alarmDescription: `The ${props.environmentName} screening reached the day's cap on address validations: check the day's submissions for abuse, and raise the cap only with the founder.`,
      metric: capReached.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(MAIL_VALIDATION_CAP_PERIOD_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.mailValidationCapAlarm.addAlarmAction(notify);

    const resetAndEnrolmentDescriptions: Readonly<Record<ResetAndEnrolmentMetricName, string>> = {
      PasswordResetNotDeliveredConfig: `A ${props.environmentName} reset code was not sent to an active, enrolled account for a reason the app and Cognito should never disagree on, or because mail is broken: compare the account in the app and in Cognito, and check Cognito's email setting.`,
      PasswordResetNotDeliveredThrottled: `Cognito throttled ${props.environmentName} reset requests three times in an hour: read the per-user rule's top contributors for a flood against one account, or check the pool's quota.`,
      PasswordResetRequestFailed: `A ${props.environmentName} reset request failed at the provider or the audit write, and the person was answered as if a code was sent: read the line's error code (ClientCredentialError is the client secret).`,
      SecondFactorEnrolmentRefused: `A ${props.environmentName} sign-in that passed the password was refused second-factor enrolment outside a live invitation (docs/adr/0088, D3): read the user ID, and treat it as an attempted takeover until the person is confirmed.`,
      ClientCredentialRefused: `Cognito refused the ${props.environmentName} web client's credential, so sign-in fails for everyone: check the client secret and the client ID the web task was given (docs/adr/0088, D2).`,
      ClientCredentialProbeRefused: `A ${props.environmentName} web task's start-up probe found its Cognito client credential refused, so its health check fails and the deploy rolls back: check the client secret and the client ID the new task definition was given (docs/adr/0088, D8).`,
      PasswordResetSessionsNotEnded: `A ${props.environmentName} password reset changed the password at Cognito, but the app could not end the account's sessions or record the reset, so no password-changed email was queued: read the user ID from the line, end the account's sessions and tell the person another way (docs/runbooks/incident-response.md, "A password reset whose sessions were not ended"; docs/adr/0091, D15).`,
      PasswordResetProviderSignOutFailed: `A ${props.environmentName} password reset was completed, but the sign-out at Cognito that follows it failed, so a hardware-key registration begun before the reset can still be completed for up to 15 minutes: read the user ID from the line, look in the audit log for hardware_key_registered by that user since the reset, and if there is one treat it as a takeover, end the account's sessions and tell the founder; a sign_in by authenticator code is the person's own (docs/runbooks/incident-response.md, "A password reset whose provider sign-out failed"; docs/adr/0091, D10).`,
      MembershipEndProviderSignOutFailed: `A ${props.environmentName} membership was ended and the account's sessions ended with it, but the sign-out at Cognito that follows did not happen, so a hardware-key registration begun before it can still be completed for up to 15 minutes, and nothing sends the sign-out again: read the user ID and the error code from the line, confirm membership_ended in the audit log by the line's request ID, look there for hardware_key_registered by that user since, and if there is one, or the account is thought to be in another's hands, give the user ID to the founder (docs/runbooks/incident-response.md, "An ended membership whose provider sign-out failed").`,
      SignInStepRefusedAfterReset: `A ${props.environmentName} sign-in step begun before the account's latest password reset was answered after it and refused, so someone proved the old password around the reset from another browser or device: read the user ID and the step from the line, tell the person, and at the code step (mfa) tell them their second factor may be known too, which a reset does not change (docs/runbooks/incident-response.md, "A sign-in step refused after a password reset"; docs/adr/0093, D5).`,
      HardwareKeyRegisteredAcrossReset: `A ${props.environmentName} hardware key was registered while the account's password reset was being recorded: read the line's error code. removed: confirm with the person. not_removed: the key is still on the account and the account is locked, so have the key removed through the founder's break-glass before anyone unlocks it. not_removed_not_locked: the key signs in, so go to the break-glass now (docs/runbooks/incident-response.md, "A hardware key registered across a password reset"; docs/adr/0093, D6).`,
      PasswordResetOutcomeUnknown: `Cognito did not say whether a ${props.environmentName} password reset changed the password, so the app ended the account's sessions and sent no password-changed email: read the user ID from the line, find out at Cognito whether the password changed, and tell the person another way (docs/runbooks/incident-response.md, "A password reset whose outcome is unknown"; docs/adr/0093, D9).`,
      SignInRefusedCrossedAccount: `A ${props.environmentName} sign-in was refused because the address typed names one account and Cognito's subject another, which a sound database never holds: read the user ID from the line (the subject's account), compare the app's accounts and Cognito's users for that address, and let neither sign in until they agree (docs/runbooks/incident-response.md, "A sign-in refused for a crossed account"; docs/adr/0093, D5).`,
      PasswordResetRequestOverFloor: `Three ${props.environmentName} password reset requests in an hour were answered after their floor, so their timing could tell an account from none: find the slow call (Cognito, the message trigger's cold start), or raise RESET_REQUEST_FLOOR_MS (docs/adr/0081).`,
    };
    const resetAndEnrolmentAlarms: Partial<Record<ResetAndEnrolmentMetricName, cloudwatch.Alarm>> = {};
    for (const count of RESET_AND_ENROLMENT_COUNTS) {
      const message = logs.FilterPattern.stringValue('$.msg', '=', count.message);
      const codes: readonly string[] = count.errorCodes;
      const pattern =
        codes.length === 0 ? message : logs.FilterPattern.all(message, logs.FilterPattern.any(...codes.map((code) => logs.FilterPattern.stringValue('$.error_code', '=', code))));
      const filter = counted(this.webLogGroup, count.metricName, { namespace: SIGN_IN_BURST_METRIC.namespace, metricName: count.metricName }, pattern);
      const alarm = new cloudwatch.Alarm(this, count.metricName, {
        alarmDescription: resetAndEnrolmentDescriptions[count.metricName],
        metric: filter.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(count.periodSeconds) }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: count.threshold,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(notify);
      resetAndEnrolmentAlarms[count.metricName] = alarm;
    }
    this.resetAndEnrolmentAlarms = resetAndEnrolmentAlarms as Record<ResetAndEnrolmentMetricName, cloudwatch.Alarm>;

    // The rule reads the web group by its fixed name (a plain string in the body), so it is created after the group.
    const ruleName = resetRequestsRuleName(props.environmentName);
    this.resetRequestsPerUserRule = new cloudwatch.CfnInsightRule(this, 'ResetRequestsPerUser', {
      ruleName,
      ruleState: 'ENABLED',
      ruleBody: JSON.stringify({
        Schema: { Name: 'CloudWatchLogRule', Version: 1 },
        LogGroupNames: [logGroupName(props.environmentName, 'web')],
        LogFormat: 'JSON',
        Contribution: { Keys: ['$.user_id'], Filters: [{ Match: '$.msg', In: [PASSWORD_RESET_REQUESTED_MESSAGE] }] },
        AggregateOn: 'Count',
      }),
    });
    this.resetRequestsPerUserRule.node.addDependency(this.webLogGroup);
    this.resetRequestsPerUserAlarm = new cloudwatch.Alarm(this, 'ResetRequestsPerUserAlarm', {
      alarmDescription: `One ${props.environmentName} account had ${String(RESET_REQUESTS_PER_USER.threshold)} or more reset requests in an hour: read the user ID from the per-user rule's top contributors, and check the account's audit events.`,
      metric: new cloudwatch.MathExpression({
        expression: `INSIGHT_RULE_METRIC('${ruleName}', 'MaxContributorValue')`,
        usingMetrics: {},
        period: Duration.seconds(RESET_REQUESTS_PER_USER.periodSeconds),
      }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: RESET_REQUESTS_PER_USER.threshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.resetRequestsPerUserAlarm.addAlarmAction(notify);
  }
}
