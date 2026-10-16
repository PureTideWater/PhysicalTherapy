import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS } from '../lib/environments';
import { HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_MESSAGE, HEARTBEAT_METRIC, MISSED_HEARTBEATS_TO_ALARM, PLATFORM_HEARTBEAT_METRIC, workerLogGroupName } from '../lib/heartbeat';
import { JOB_FAILED_MESSAGE, JOB_FAILED_METRIC, JOB_FAILED_PERIOD_SECONDS, PRICING_ENGINE_ERRORS_MESSAGE, PRICING_ENGINE_ERRORS_METRIC } from '../lib/jobs';
import { LOG_GROUPS, LOG_RETENTION_DAYS, logGroupName } from '../lib/log-groups';
import { SECURITY_ALARM_PERIOD_SECONDS, SIGN_IN_BURST_MESSAGES, SIGN_IN_BURST_METRIC } from '../lib/security-events';
import { type CfnStatement, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, synthesized } from './synth';

describe('the heartbeat contract with the worker', () => {
  it('matches the line apps/worker logs for each beat', () => {
    const worker = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/heartbeat.ts'), 'utf8');
    expect(worker).toContain(`'${HEARTBEAT_MESSAGE}'`);
  });

  it('alarms after exactly two missed beats of one minute each', () => {
    expect(MISSED_HEARTBEATS_TO_ALARM).toBe(2);
    expect(HEARTBEAT_INTERVAL_SECONDS).toBe(60);
  });
});

describe('the job-failure contract with the worker (JOB-02)', () => {
  it('matches the line apps/worker logs when a job fails its last attempt', () => {
    const worker = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/worker.ts'), 'utf8');
    expect(worker).toContain(`export const JOB_FAILED_MESSAGE = '${JOB_FAILED_MESSAGE}';`);
    // Three attempts in all: two retries after the first (apps/worker/src/jobs/registry.ts).
    expect(readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/jobs/registry.ts'), 'utf8')).toContain('retryLimit: 2,');
  });
});

describe('the failed sign-in burst contract with the web app (PRD 19: failed sign-in bursts)', () => {
  it('matches the lines apps/web logs for a second-factor burst and a lockout', () => {
    const web = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/auth/sign-in.ts'), 'utf8');
    for (const message of SIGN_IN_BURST_MESSAGES) {
      expect(web).toContain(`logger.warn('${message}'`);
    }
  });
});

describe('the pricing-run alert contract with the worker (ENGINE_ERROR: operator alert)', () => {
  it('matches the line apps/worker logs when a run records engine errors that page the operator', () => {
    const worker = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/price/execute.ts'), 'utf8');
    expect(worker).toContain(`export const ENGINE_ERRORS_MESSAGE = '${PRICING_ENGINE_ERRORS_MESSAGE}';`);
    expect(worker).toContain(`context.logger.error('${PRICING_ENGINE_ERRORS_MESSAGE}'`);
  });
});

/** PRD 19, monitoring: "worker heartbeat (two misses alert)"; test matrix JOB-04. */
describe.each(ENVIRONMENTS)('%s: worker heartbeat and operator alerts', (environment) => {
  const { stack, template } = synthesized(environment);
  const topic = ref(logicalIdOf(stack, stack.monitoring.operatorTopic));

  it('keeps every service log group under /tp/<environment>/, encrypted under the environment key, for a year', () => {
    const groups = resourcesOf(template, 'AWS::Logs::LogGroup');
    expect(groups.map(([, group]) => propertiesOf(group).LogGroupName).sort()).toEqual(LOG_GROUPS.map((name) => logGroupName(environment, name)).sort());
    for (const [id, group] of groups) {
      expect(propertiesOf(group), id).toMatchObject({ RetentionInDays: LOG_RETENTION_DAYS, KmsKeyId: getAtt(keyId(template), 'Arn') });
      expect(group.DeletionPolicy, id).toBe('Retain');
    }
    expect(LOG_RETENTION_DAYS).toBe(365);
    const worker = resourceById(template, 'AWS::Logs::LogGroup', logicalIdOf(stack, stack.monitoring.workerLogGroup));
    expect(propertiesOf(worker).LogGroupName).toBe(workerLogGroupName(environment));
  });

  it('lets CloudWatch Logs use the key only for the stack\'s own log groups', () => {
    const [, key] = onlyResource(template, 'AWS::KMS::Key');
    const statements = (propertiesOf(key).KeyPolicy as { Statement: CfnStatement[] }).Statement.filter((statement) =>
      JSON.stringify(statement.Principal).includes('logs.'),
    );
    expect(statements.map((statement) => statement.Sid)).toEqual(['CloudWatchLogsPlatformLogGroups']);
    expect(JSON.stringify(statements[0]?.Condition?.ArnLike?.['kms:EncryptionContext:aws:logs:arn'])).toContain(`:log-group:/tp/${environment}/*`);
  });

  const filters = resourcesOf(template, 'AWS::Logs::MetricFilter');
  const filterFor = (metricName: string, group = stack.monitoring.workerLogGroup) =>
    filters.find(
      ([, filter]) =>
        JSON.stringify(propertiesOf(filter).MetricTransformations).includes(`"MetricName":"${metricName}"`) &&
        JSON.stringify(propertiesOf(filter).LogGroupName) === JSON.stringify(ref(logicalIdOf(stack, group))),
    )?.[1] ?? { Type: '' };
  const heartbeatAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.heartbeatAlarm));
  const jobAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.jobFailedAlarm));
  const engineErrorsAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.pricingEngineErrorsAlarm));

  const platformHeartbeatAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.platformHeartbeatAlarm));
  const signInAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.failedSignInBurstAlarm));

  it('has the worker, platform and web metric filters and the stack\'s alarms, and no other', () => {
    // Worker: heartbeat, final job failures, pricing engine errors. Platform: heartbeat, final job
    // failures. Web: failed sign-in bursts.
    expect(filters).toHaveLength(6);
    const alarms = [
      stack.monitoring.heartbeatAlarm,
      stack.monitoring.platformHeartbeatAlarm,
      stack.monitoring.jobFailedAlarm,
      stack.monitoring.pricingEngineErrorsAlarm,
      stack.monitoring.failedSignInBurstAlarm,
      stack.edge.signInRateLimitAlarm,
      stack.uptime.webAlarm,
      stack.uptime.apiAlarm,
      stack.uptime.certificateAlarm,
    ].map((alarm) => logicalIdOf(stack, alarm));
    expect(resourcesOf(template, 'AWS::CloudWatch::Alarm').map(([id]) => id).sort()).toEqual(alarms.sort());
  });

  it('sends every alarm to the operator topic, with fixed text that names the environment and no value from a log', () => {
    for (const [id, alarm] of resourcesOf(template, 'AWS::CloudWatch::Alarm')) {
      expect(propertiesOf(alarm).AlarmActions, id).toEqual([topic]);
      const description = propertiesOf(alarm).AlarmDescription;
      expect(typeof description, id).toBe('string');
      // A plain string (no token from the template), naming the environment, with nothing substituted.
      expect(description as string, id).toContain(` ${environment} `);
      expect(description as string, id).not.toMatch(/[{}$<>]/);
      expect(description as string, id).toMatch(/^[A-Z].*\.$/);
    }
  });

  it('counts the platform jobs\' heartbeats as their own metric and alarms after two missed beats, and on recovery', () => {
    expect(propertiesOf(filterFor(PLATFORM_HEARTBEAT_METRIC.metricName, stack.monitoring.platformLogGroup))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.platformLogGroup)),
      FilterPattern: `{ $.msg = "${HEARTBEAT_MESSAGE}" }`,
      MetricTransformations: [{ MetricNamespace: PLATFORM_HEARTBEAT_METRIC.namespace, MetricName: PLATFORM_HEARTBEAT_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
    });
    expect(PLATFORM_HEARTBEAT_METRIC.namespace).not.toBe(HEARTBEAT_METRIC.namespace);
    expect(propertiesOf(platformHeartbeatAlarm)).toMatchObject({
      Namespace: PLATFORM_HEARTBEAT_METRIC.namespace,
      MetricName: PLATFORM_HEARTBEAT_METRIC.metricName,
      Statistic: 'Sum',
      Period: HEARTBEAT_INTERVAL_SECONDS,
      EvaluationPeriods: 2,
      DatapointsToAlarm: 2,
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 1,
      TreatMissingData: 'breaching',
      AlarmActions: [topic],
      OKActions: [topic],
    });
  });

  it('counts the platform jobs\' final failures toward the same job-failure alarm', () => {
    expect(propertiesOf(filterFor(JOB_FAILED_METRIC.metricName, stack.monitoring.platformLogGroup))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.platformLogGroup)),
      FilterPattern: `{ $.msg = "${JOB_FAILED_MESSAGE}" }`,
      MetricTransformations: [{ MetricNamespace: JOB_FAILED_METRIC.namespace, MetricName: JOB_FAILED_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
    });
  });

  it('alarms within five minutes on a burst of failed second factors or a lockout (failed sign-in bursts)', () => {
    expect(propertiesOf(filterFor(SIGN_IN_BURST_METRIC.metricName, stack.monitoring.webLogGroup))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.webLogGroup)),
      FilterPattern: `{ ($.msg = "${SIGN_IN_BURST_MESSAGES[0]}") || ($.msg = "${SIGN_IN_BURST_MESSAGES[1]}") }`,
      MetricTransformations: [{ MetricNamespace: SIGN_IN_BURST_METRIC.namespace, MetricName: SIGN_IN_BURST_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
    });
    expect(propertiesOf(signInAlarm)).toMatchObject({
      Namespace: SIGN_IN_BURST_METRIC.namespace,
      MetricName: SIGN_IN_BURST_METRIC.metricName,
      Statistic: 'Sum',
      Period: SECURITY_ALARM_PERIOD_SECONDS,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
  });

  it('counts each pricing run that recorded engine errors for the operator, and tells the operator within five minutes', () => {
    expect(propertiesOf(filterFor(PRICING_ENGINE_ERRORS_METRIC.metricName))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      FilterPattern: `{ $.msg = "${PRICING_ENGINE_ERRORS_MESSAGE}" }`,
      MetricTransformations: [{ MetricNamespace: PRICING_ENGINE_ERRORS_METRIC.namespace, MetricName: PRICING_ENGINE_ERRORS_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
    });
    expect(propertiesOf(engineErrorsAlarm)).toMatchObject({
      Namespace: PRICING_ENGINE_ERRORS_METRIC.namespace,
      MetricName: PRICING_ENGINE_ERRORS_METRIC.metricName,
      Statistic: 'Sum',
      Period: JOB_FAILED_PERIOD_SECONDS,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
  });

  it('counts each heartbeat line as the custom heartbeat metric', () => {
    const filter = filterFor(HEARTBEAT_METRIC.metricName);
    expect(propertiesOf(filter)).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      FilterPattern: `{ $.msg = "${HEARTBEAT_MESSAGE}" }`,
      MetricTransformations: [
        { MetricNamespace: HEARTBEAT_METRIC.namespace, MetricName: HEARTBEAT_METRIC.metricName, MetricValue: '1', Unit: 'Count' },
      ],
    });
  });

  it('alarms when two consecutive heartbeat periods are empty, missing data counting as missed', () => {
    const alarm = heartbeatAlarm;
    expect(propertiesOf(alarm)).toMatchObject({
      Namespace: HEARTBEAT_METRIC.namespace,
      MetricName: HEARTBEAT_METRIC.metricName,
      Statistic: 'Sum',
      Period: HEARTBEAT_INTERVAL_SECONDS,
      EvaluationPeriods: 2,
      DatapointsToAlarm: 2,
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 1,
      TreatMissingData: 'breaching',
    });
    expect(propertiesOf(alarm).Dimensions).toBeUndefined();
  });

  it('sends the alarm and its recovery to the operator topic', () => {
    const alarm = heartbeatAlarm;
    expect(propertiesOf(alarm).AlarmActions).toEqual([topic]);
    expect(propertiesOf(alarm).OKActions).toEqual([topic]);
    expect(propertiesOf(alarm).AlarmDescription).toBe(`The ${environment} worker missed 2 consecutive heartbeats.`);
  });

  it('counts each job that fails its last attempt, and tells the operator within five minutes (JOB-02, the restore drill included)', () => {
    expect(propertiesOf(filterFor(JOB_FAILED_METRIC.metricName))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      FilterPattern: `{ $.msg = "${JOB_FAILED_MESSAGE}" }`,
      MetricTransformations: [{ MetricNamespace: JOB_FAILED_METRIC.namespace, MetricName: JOB_FAILED_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
    });
    expect(propertiesOf(jobAlarm)).toMatchObject({
      Namespace: JOB_FAILED_METRIC.namespace,
      MetricName: JOB_FAILED_METRIC.metricName,
      Statistic: 'Sum',
      Period: JOB_FAILED_PERIOD_SECONDS,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
    expect(String(propertiesOf(jobAlarm).AlarmDescription)).toMatch(/restore drill/);
  });

  it('encrypts the operator topic, refuses plain HTTP and admits only this account\'s alarms', () => {
    const [, resource] = onlyResource(template, 'AWS::SNS::Topic');
    expect(propertiesOf(resource).KmsMasterKeyId).toEqual(getAtt(keyId(template), 'Arn'));
    const [, policy] = onlyResource(template, 'AWS::SNS::TopicPolicy');
    const statements = (propertiesOf(policy).PolicyDocument as { Statement: CfnStatement[] }).Statement;
    expect(statements).toContainEqual(
      expect.objectContaining({ Effect: 'Deny', Action: 'sns:Publish', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
    );
    const allows = statements.filter((statement) => statement.Effect === 'Allow');
    expect(allows).toHaveLength(1);
    expect(allows[0]).toMatchObject({
      Principal: { Service: 'cloudwatch.amazonaws.com' },
      Action: 'sns:Publish',
      Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
    });
    expect(JSON.stringify(allows[0]?.Condition?.ArnLike)).toContain(':alarm:*');
  });
});
