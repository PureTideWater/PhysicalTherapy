import {
  Duration,
  RemovalPolicy,
  Stack,
  aws_cloudwatch as cloudwatch,
  type aws_cloudwatch_actions as cloudwatchActions,
  aws_iam as iam,
  type aws_kms as kms,
  aws_lambda as lambda,
  aws_logs as logs,
} from 'aws-cdk-lib';
import { COGNITO_MESSAGE_FALLBACK, COGNITO_MESSAGE_SIGN_IN_ENV, COGNITO_MESSAGE_SOURCE } from '@tp/auth-mail';
import { Construct } from 'constructs';

import { logGroupName } from '../log-groups';

/** Under Cognito's 5-second wait for a trigger, so a hung call ends first and Cognito answers with its error. */
export const COGNITO_MESSAGE_TIMEOUT = Duration.seconds(3);

/** The metric namespace of the user pool's own metrics. */
export const COGNITO_MESSAGES_NAMESPACE = 'TherapyPlatform/Identity';
/** A message left to the pool's own template (the handler's COGNITO_MESSAGE_FALLBACK line). */
export const COGNITO_MESSAGE_FALLBACK_METRIC = 'CognitoMessageFallback';

const ALARM_PERIOD = Duration.minutes(5);

export interface CognitoMessagesProps {
  readonly environmentName: string;
  readonly key: kms.IKey;
  /** The application's host name: the invitation names https://<it>/sign-in. */
  readonly appDomainName: string;
  readonly notify: cloudwatchActions.SnsAction;
}

/**
 * The user pool's CustomMessage trigger (docs/adr/0081, the code-email amendment): every email the pool sends, in the
 * brand's words from @tp/auth-mail, whose inline source this runs. Small and contained: Node 22 on arm64, 128 MB, 3
 * seconds, no VPC, no SDK and no network, one environment variable, and a role of its own that may only write its own
 * log group (no managed policy). Only Cognito may invoke it, for this pool and this account (Identity adds that
 * permission). Its errors and throttles, and any message it leaves to the pool's own template, alarm the operator.
 */
export class CognitoMessages extends Construct {
  readonly handler: lambda.Function;
  readonly role: iam.Role;
  readonly logGroup: logs.LogGroup;
  readonly failureAlarm: cloudwatch.Alarm;
  readonly fallbackAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: CognitoMessagesProps) {
    super(scope, id);
    const stack = Stack.of(this);
    this.logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: logGroupName(props.environmentName, 'cognito-messages'),
      encryptionKey: props.key,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.role = new iam.Role(this, 'Role', {
      description: 'The user pool message trigger: writes its own log group only',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com', { conditions: { StringEquals: { 'aws:SourceAccount': stack.account } } }),
    });
    this.role.addToPolicy(new iam.PolicyStatement({ sid: 'WriteItsOwnLogs', actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [this.logGroup.logGroupArn] }));
    this.handler = new lambda.Function(this, 'Function', {
      description: 'The user pool message trigger: every email the pool sends, in the brand words',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 128,
      timeout: COGNITO_MESSAGE_TIMEOUT,
      handler: 'index.handler',
      code: lambda.Code.fromInline(COGNITO_MESSAGE_SOURCE),
      role: this.role,
      logGroup: this.logGroup,
      environment: { [COGNITO_MESSAGE_SIGN_IN_ENV]: `https://${props.appDomainName}/sign-in` },
    });

    const lambdaMetric = (metricName: string) => this.handler.metric(metricName, { statistic: cloudwatch.Stats.SUM, period: ALARM_PERIOD });
    this.failureAlarm = new cloudwatch.Alarm(this, 'Failures', {
      alarmDescription: `The ${props.environmentName} user pool message trigger failed or was throttled: Cognito could not send a code or an invitation, a reset answered as sent and an invitation failed to its administrator (docs/runbooks/deliverability.md, 3.9).`,
      metric: new cloudwatch.MathExpression({
        expression: 'errors + throttles',
        usingMetrics: { errors: lambdaMetric('Errors'), throttles: lambdaMetric('Throttles') },
        period: ALARM_PERIOD,
      }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.failureAlarm.addAlarmAction(props.notify);

    const fallbacks = this.logGroup.addMetricFilter('Fallbacks', {
      // A term, not a JSON selector: the runtime writes the handler's line as text with a prefix, which { $.field } never matches.
      filterPattern: logs.FilterPattern.allTerms(COGNITO_MESSAGE_FALLBACK),
      metricNamespace: COGNITO_MESSAGES_NAMESPACE,
      metricName: COGNITO_MESSAGE_FALLBACK_METRIC,
      metricValue: '1',
      unit: cloudwatch.Unit.COUNT,
    });
    this.fallbackAlarm = new cloudwatch.Alarm(this, 'Fallback', {
      alarmDescription: `A ${props.environmentName} user pool message went with the pool's generic template, not its own words: read the trigger's log line for its reason code (docs/runbooks/deliverability.md, 3.9).`,
      metric: fallbacks.metric({ statistic: cloudwatch.Stats.SUM, period: ALARM_PERIOD }),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.fallbackAlarm.addAlarmAction(props.notify);
  }
}
