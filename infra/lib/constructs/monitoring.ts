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
import {
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_MESSAGE,
  HEARTBEAT_METRIC,
  MISSED_HEARTBEATS_TO_ALARM,
  workerLogGroupName,
} from '../heartbeat';

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
 * worker runs (milestone 11) the alarm is, correctly, in ALARM.
 */
export class Monitoring extends Construct {
  readonly operatorTopic: sns.Topic;
  readonly workerLogGroup: logs.LogGroup;
  readonly heartbeatAlarm: cloudwatch.Alarm;

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

    const logGroupName = workerLogGroupName(props.environmentName);
    props.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsWorkerLogGroup',
        principals: [new iam.ServicePrincipal(`logs.${stack.region}.amazonaws.com`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnEquals: {
            'kms:EncryptionContext:aws:logs:arn': `arn:${stack.partition}:logs:${stack.region}:${stack.account}:log-group:${logGroupName}`,
          },
        },
      }),
    );
    this.workerLogGroup = new logs.LogGroup(this, 'WorkerLogs', {
      logGroupName,
      encryptionKey: props.key,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    });

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
    this.heartbeatAlarm.addAlarmAction(notify);
    this.heartbeatAlarm.addOkAction(notify);
  }
}
