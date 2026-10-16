import {
  Duration,
  RemovalPolicy,
  Stack,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatchActions,
  aws_iam as iam,
  type aws_kms as kms,
  aws_logs as logs,
  aws_sns as sns,
  aws_sns_subscriptions as subscriptions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import { JOB_FAILED_MESSAGE, JOB_FAILED_METRIC, JOB_FAILED_PERIOD_SECONDS, PRICING_ENGINE_ERRORS_MESSAGE, PRICING_ENGINE_ERRORS_METRIC } from '../jobs';
import {
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_MESSAGE,
  HEARTBEAT_METRIC,
  MISSED_HEARTBEATS_TO_ALARM,
  PLATFORM_HEARTBEAT_METRIC,
  workerLogGroupName,
} from '../heartbeat';
import { logGroupName } from '../log-groups';
import { SECURITY_ALARM_PERIOD_SECONDS, SIGN_IN_BURST_MESSAGES, SIGN_IN_BURST_METRIC } from '../security-events';

/** Where operator alerts are delivered; both optional, set at deploy time (never in the repository). */
export interface OperatorEndpoints {
  readonly email?: string;
  readonly sms?: string;
}

export interface MonitoringProps {
  readonly environmentName: EnvironmentName;
  readonly key: kms.Key;
  readonly operator: OperatorEndpoints;
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
 * heartbeat, missing data counting as missed, and tells the operator when beats resume. Until the
 * worker runs (the first release, docs/adr/0049) the alarm is, correctly, in ALARM.
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
 * its log group and alarm at once. Alarm text is fixed: an alarm name, the environment and a reason,
 * never a value from a log line.
 */
export class Monitoring extends Construct {
  readonly operatorTopic: sns.Topic;
  readonly workerLogGroup: logs.LogGroup;
  readonly webLogGroup: logs.LogGroup;
  readonly platformLogGroup: logs.LogGroup;
  readonly migrationLogGroup: logs.LogGroup;
  readonly heartbeatAlarm: cloudwatch.Alarm;
  readonly platformHeartbeatAlarm: cloudwatch.Alarm;
  readonly jobFailedAlarm: cloudwatch.Alarm;
  readonly pricingEngineErrorsAlarm: cloudwatch.Alarm;
  readonly failedSignInBurstAlarm: cloudwatch.Alarm;
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

    const heartbeats = this.workerLogGroup.addMetricFilter('Heartbeat', {
      filterPattern: logs.FilterPattern.stringValue('$.msg', '=', HEARTBEAT_MESSAGE),
      metricNamespace: HEARTBEAT_METRIC.namespace,
      metricName: HEARTBEAT_METRIC.metricName,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });

    this.heartbeatAlarm = new cloudwatch.Alarm(this, 'WorkerHeartbeatMissed', {
      alarmDescription: `The ${props.environmentName} worker missed ${String(MISSED_HEARTBEATS_TO_ALARM)} consecutive heartbeats.`,
      metric: heartbeats.metric({ statistic: cloudwatch.Stats.SUM, period: Duration.seconds(HEARTBEAT_INTERVAL_SECONDS) }),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      threshold: 1,
      evaluationPeriods: MISSED_HEARTBEATS_TO_ALARM,
      datapointsToAlarm: MISSED_HEARTBEATS_TO_ALARM,
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
  }
}
