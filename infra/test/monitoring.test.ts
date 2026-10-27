import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS } from '../lib/environments';
import { HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_MESSAGE, HEARTBEAT_METRIC, MISSED_HEARTBEATS_TO_ALARM, PLATFORM_HEARTBEAT_METRIC, workerLogGroupName } from '../lib/heartbeat';
import { JOB_FAILED_MESSAGE, JOB_FAILED_METRIC, JOB_FAILED_PERIOD_SECONDS, PRICING_ENGINE_ERRORS_MESSAGE, PRICING_ENGINE_ERRORS_METRIC } from '../lib/jobs';
import { LOG_GROUPS, LOG_RETENTION_DAYS, logGroupName } from '../lib/log-groups';
import { MODEL_BUDGET_ERROR_CODES, MODEL_BUDGET_METRIC, MODEL_BUDGET_PERIOD_SECONDS } from '../lib/models';
import {
  OLDEST_QUEUED_LIMIT_MS,
  OLDEST_QUEUED_METRIC,
  OLDEST_QUEUED_PERIOD_SECONDS,
  QUEUE_MESSAGE,
  RUN_FAILED_ERROR_CODES,
  RUN_FAILED_METRIC,
  RUN_FAILED_PERIOD_SECONDS,
  SCREENING_HEARTBEAT_METRIC,
  SCREENING_NAMESPACE,
  TIME_TO_EMAIL_AFTER_WAITING_MESSAGE,
  TIME_TO_EMAIL_LIMIT_MS,
  TIME_TO_EMAIL_MESSAGE,
  TIME_TO_EMAIL_METRIC,
  TIME_TO_EMAIL_PERIOD_SECONDS,
  UPLOADS_SENT_TO_WAIT_METRIC,
  UPLOADS_SENT_TO_WAIT_PERIOD_SECONDS,
  UPLOAD_SENT_TO_WAIT_MESSAGE,
} from '../lib/screening';
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

describe('the model budget alert contract with the gateway (MOD-05: calls refused; alert)', () => {
  it('matches the error codes the gateway logs when a practice reaches and when it has spent its daily budget', () => {
    const gateway = readFileSync(path.resolve(import.meta.dirname, '../../packages/model-gateway/src/gateway.ts'), 'utf8');
    expect(gateway).toContain(`logger.error('a model call was refused: the practice has spent its daily model budget', { practice_id: practiceId, error_code: '${MODEL_BUDGET_ERROR_CODES[0]}' })`);
    expect(gateway).toContain(`error_code: '${MODEL_BUDGET_ERROR_CODES[1]}'`);
    // error_code is a field the logger keeps (packages/observability's allowlist).
    expect(readFileSync(path.resolve(import.meta.dirname, '../../packages/observability/src/fields.ts'), 'utf8')).toContain("'error_code'");
  });
});

describe('the screening consumer\'s metric contract with the worker and the web app (docs/adr/0062; PR 6b-3)', () => {
  const source = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8');

  it('matches the lines the consumer logs: the time to email, after waiting apart, the queue gauge and a run out of attempts', () => {
    const job = source('apps/worker/src/screening/job.ts');
    expect(job).toContain(`logger.info('${TIME_TO_EMAIL_MESSAGE}', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: elapsedMs });`);
    expect(job).toContain(`logger.info('${TIME_TO_EMAIL_AFTER_WAITING_MESSAGE}', {`);
    expect(job).toContain(`logger.info('${QUEUE_MESSAGE}', { job_id: jobId, record_count: gauge.queued, elapsed_ms: gauge.oldestQueuedMs });`);
    for (const code of RUN_FAILED_ERROR_CODES) {
      expect(job).toContain(`error_code: '${code}'`);
    }
    // The waiting tier's line is not the promise's, so the promise's alarm never counts it.
    expect(TIME_TO_EMAIL_AFTER_WAITING_MESSAGE).not.toBe(TIME_TO_EMAIL_MESSAGE);
  });

  it('matches the line the web app logs for an upload sent to wait', () => {
    expect(source('apps/web/src/lib/screening/routes.ts')).toContain(`services.logger.info('${UPLOAD_SENT_TO_WAIT_MESSAGE}'`);
  });

  it('measures in milliseconds, against the 60-second promise and two minutes in the queue, from numeric fields alone', () => {
    expect(TIME_TO_EMAIL_LIMIT_MS).toBe(60_000);
    expect(OLDEST_QUEUED_LIMIT_MS).toBe(120_000);
    // elapsed_ms is a field the logger keeps only as a finite number (packages/observability's allowlist).
    expect(source('packages/observability/src/fields.ts')).toContain("export const NUMERIC_LOG_FIELDS = ['elapsed_ms', 'record_count'] as const;");
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
    // Worker: heartbeat, final job failures, pricing engine errors, model budget events. Platform:
    // heartbeat, final job failures. Screening: heartbeat, final job failures, the time to email, the oldest queued run,
    // failed runs. Web: failed sign-in bursts, model budget events, screening uploads sent to wait. Mail (docs/adr/0065):
    // the platform's five codes, an unsent probe and the web's validation cap.
    expect(filters).toHaveLength(21);
    const alarms = [
      stack.monitoring.screeningHeartbeatAlarm,
      stack.monitoring.screeningTimeToEmailAlarm,
      stack.monitoring.screeningQueueAlarm,
      stack.monitoring.screeningRunFailedAlarm,
      stack.monitoring.screeningUploadsSentToWaitAlarm,
      stack.monitoring.heartbeatAlarm,
      stack.monitoring.platformHeartbeatAlarm,
      stack.monitoring.jobFailedAlarm,
      stack.monitoring.pricingEngineErrorsAlarm,
      stack.monitoring.failedSignInBurstAlarm,
      stack.monitoring.modelBudgetAlarm,
      stack.edge.signInRateLimitAlarm,
      stack.uptime.webAlarm,
      stack.uptime.apiAlarm,
      stack.uptime.certificateAlarm,
      ...Object.values(stack.monitoring.mailCodeAlarms),
      stack.monitoring.mailProbeUnsentAlarm,
      stack.monitoring.mailValidationCapAlarm,
      stack.mailStreams.accountBounceWarningAlarm,
      stack.mailStreams.accountBounceHighAlarm,
      stack.mailStreams.accountComplaintWarningAlarm,
      stack.mailStreams.accountComplaintHighAlarm,
      stack.mailStreams.screeningBounceAlarm,
      stack.mailStreams.screeningComplaintAlarm,
      stack.mailStreams.transactionalBounceAlarm,
      stack.mailStreams.deadLetterAlarm,
      stack.mailStreams.queueAgeAlarm,
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

  it('counts the platform jobs\' and the screening consumer\'s final failures toward the same job-failure alarm', () => {
    for (const group of [stack.monitoring.platformLogGroup, stack.monitoring.screeningLogGroup]) {
      expect(propertiesOf(filterFor(JOB_FAILED_METRIC.metricName, group))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, group)),
        FilterPattern: `{ $.msg = "${JOB_FAILED_MESSAGE}" }`,
        MetricTransformations: [{ MetricNamespace: JOB_FAILED_METRIC.namespace, MetricName: JOB_FAILED_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
      });
    }
  });

  describe('the screening consumer (docs/adr/0062; PR 6b-3, decisions 14 and 16)', () => {
    const alarm = (construct: Parameters<typeof logicalIdOf>[1]) => propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, construct)));
    const screening = stack.monitoring.screeningLogGroup;

    it('logs to its own group, /tp/<environment>/screening', () => {
      expect(propertiesOf(resourceById(template, 'AWS::Logs::LogGroup', logicalIdOf(stack, screening))).LogGroupName).toBe(logGroupName(environment, 'screening'));
    });

    it('counts its heartbeats as its own metric and alarms after two missed beats, and on recovery; in production only once the consumer is launched', () => {
      expect(propertiesOf(filterFor(SCREENING_HEARTBEAT_METRIC.metricName, screening))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, screening)),
        FilterPattern: `{ $.msg = "${HEARTBEAT_MESSAGE}" }`,
        MetricTransformations: [{ MetricNamespace: SCREENING_NAMESPACE, MetricName: SCREENING_HEARTBEAT_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
      });
      const beats = alarm(stack.monitoring.screeningHeartbeatAlarm);
      expect(beats).toMatchObject({
        Namespace: SCREENING_NAMESPACE,
        MetricName: 'Heartbeat',
        Statistic: 'Sum',
        Period: HEARTBEAT_INTERVAL_SECONDS,
        EvaluationPeriods: 2,
        DatapointsToAlarm: 2,
        ComparisonOperator: 'LessThanThreshold',
        Threshold: 1,
        AlarmActions: [topic],
        OKActions: [topic],
      });
      // Held at no task until launch, the consumer's silence is right: the alarm stays OK until ScreeningConsumer is
      // running, and then alarms (and tells the operator) if it does not beat.
      expect(beats.TreatMissingData).toEqual(
        environment === 'production' ? { 'Fn::If': ['ScreeningConsumerRunning', 'breaching', 'notBreaching'] } : 'breaching',
      );
    });

    it('measures the time from the web\'s receipt to the email in milliseconds, and alarms on any normal-tier upload over 60 seconds in five minutes', () => {
      expect(propertiesOf(filterFor(TIME_TO_EMAIL_METRIC.metricName, screening))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, screening)),
        FilterPattern: `{ $.msg = "${TIME_TO_EMAIL_MESSAGE}" }`,
        MetricTransformations: [{ MetricNamespace: SCREENING_NAMESPACE, MetricName: 'TimeToEmailMs', MetricValue: '$.elapsed_ms', Unit: 'Milliseconds' }],
      });
      expect(alarm(stack.monitoring.screeningTimeToEmailAlarm)).toMatchObject({
        Namespace: SCREENING_NAMESPACE,
        MetricName: 'TimeToEmailMs',
        Statistic: 'Maximum',
        Period: TIME_TO_EMAIL_PERIOD_SECONDS,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanThreshold',
        Threshold: 60_000,
        TreatMissingData: 'notBreaching',
      });
    });

    it('alarms when the oldest normal-tier run has waited more than two minutes, two minutes in a row', () => {
      expect(propertiesOf(filterFor(OLDEST_QUEUED_METRIC.metricName, screening))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, screening)),
        FilterPattern: `{ $.msg = "${QUEUE_MESSAGE}" }`,
        MetricTransformations: [{ MetricNamespace: SCREENING_NAMESPACE, MetricName: 'OldestQueuedMs', MetricValue: '$.elapsed_ms', Unit: 'Milliseconds' }],
      });
      expect(alarm(stack.monitoring.screeningQueueAlarm)).toMatchObject({
        Statistic: 'Maximum',
        Period: OLDEST_QUEUED_PERIOD_SECONDS,
        EvaluationPeriods: 2,
        DatapointsToAlarm: 2,
        ComparisonOperator: 'GreaterThanThreshold',
        Threshold: 120_000,
        TreatMissingData: 'notBreaching',
      });
    });

    it('counts every error line and every run out of attempts as a failed run, and alarms within five minutes', () => {
      expect(propertiesOf(filterFor(RUN_FAILED_METRIC.metricName, screening))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, screening)),
        FilterPattern: '{ ($.level = "error") || ($.error_code = "PRICING_ATTEMPTS_EXHAUSTED") }',
        MetricTransformations: [{ MetricNamespace: SCREENING_NAMESPACE, MetricName: 'RunFailed', MetricValue: '1', Unit: 'Count' }],
      });
      expect(alarm(stack.monitoring.screeningRunFailedAlarm)).toMatchObject({
        Statistic: 'Sum',
        Period: RUN_FAILED_PERIOD_SECONDS,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 1,
        TreatMissingData: 'notBreaching',
      });
    });

    it('counts the web app\'s uploads sent to wait, and alarms on any in an hour', () => {
      expect(propertiesOf(filterFor(UPLOADS_SENT_TO_WAIT_METRIC.metricName, stack.monitoring.webLogGroup))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, stack.monitoring.webLogGroup)),
        FilterPattern: `{ $.msg = "${UPLOAD_SENT_TO_WAIT_MESSAGE}" }`,
        MetricTransformations: [{ MetricNamespace: SCREENING_NAMESPACE, MetricName: 'UploadsSentToWait', MetricValue: '1', Unit: 'Count' }],
      });
      expect(alarm(stack.monitoring.screeningUploadsSentToWaitAlarm)).toMatchObject({
        Statistic: 'Sum',
        Period: UPLOADS_SENT_TO_WAIT_PERIOD_SECONDS,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 1,
        TreatMissingData: 'notBreaching',
      });
    });

    it('names no metric by a value from a log line: no filter and no alarm has a dimension', () => {
      for (const [id, filter] of filters) {
        for (const transformation of propertiesOf(filter).MetricTransformations as Record<string, unknown>[]) {
          expect(transformation.Dimensions, id).toBeUndefined();
        }
      }
      for (const [id, found] of resourcesOf(template, 'AWS::CloudWatch::Alarm').filter(([, candidate]) => propertiesOf(candidate).Namespace === SCREENING_NAMESPACE)) {
        expect(propertiesOf(found).Dimensions, id).toBeUndefined();
      }
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

  it('counts every model budget refusal and crossing in the web app’s and the worker’s logs, and tells the operator within five minutes (MOD-05)', () => {
    const pattern = `{ (${MODEL_BUDGET_ERROR_CODES.map((code) => `$.error_code = "${code}"`).join(') || (')}) }`;
    for (const group of [stack.monitoring.webLogGroup, stack.monitoring.workerLogGroup]) {
      expect(propertiesOf(filterFor(MODEL_BUDGET_METRIC.metricName, group))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, group)),
        FilterPattern: pattern,
        MetricTransformations: [{ MetricNamespace: MODEL_BUDGET_METRIC.namespace, MetricName: MODEL_BUDGET_METRIC.metricName, MetricValue: '1', Unit: 'Count' }],
      });
    }
    const budgetAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.modelBudgetAlarm));
    expect(propertiesOf(budgetAlarm)).toMatchObject({
      Namespace: MODEL_BUDGET_METRIC.namespace,
      MetricName: MODEL_BUDGET_METRIC.metricName,
      Statistic: 'Sum',
      Period: MODEL_BUDGET_PERIOD_SECONDS,
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
