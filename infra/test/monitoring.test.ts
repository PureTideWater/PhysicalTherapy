import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { connectionBudget } from '../lib/connections';
import { ENVIRONMENTS, environmentSettings } from '../lib/environments';
import { ROLLING_DEPLOYMENT, STOP_FIRST_DEPLOYMENT } from '../lib/environments';
import {
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_MESSAGE,
  HEARTBEAT_METRIC,
  MISSED_HEARTBEATS_TO_ALARM,
  PLATFORM_HEARTBEAT_METRIC,
  STOP_FIRST_START_ALLOWANCE_SECONDS,
  WORKER_STOP_TIMEOUT_SECONDS,
  missedHeartbeatsToAlarm,
  workerLogGroupName,
} from '../lib/heartbeat';
import { HEAP_MIB } from '../lib/heap';
import {
  JOB_FAILED_MESSAGE,
  JOB_FAILED_METRIC,
  JOB_FAILED_PERIOD_SECONDS,
  JOB_HEAP_ALARM_PERCENT,
  JOB_HEAP_MESSAGE,
  JOB_HEAP_METRIC,
  PRICING_ENGINE_ERRORS_MESSAGE,
  PRICING_ENGINE_ERRORS_METRIC,
} from '../lib/jobs';
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
import {
  CLIENT_CREDENTIAL_REFUSED_MESSAGE,
  CREDENTIAL_PROBE_REFUSED_MESSAGE,
  ENROLMENT_REFUSED_MESSAGE,
  CROSSED_ACCOUNT_REFUSED_MESSAGE,
  KEY_REGISTERED_ACROSS_RESET_CODES,
  KEY_REGISTERED_ACROSS_RESET_MESSAGE,
  PASSWORD_RESET_FAILED_MESSAGE,
  PASSWORD_RESET_OVER_FLOOR_MESSAGE,
  PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES,
  PASSWORD_RESET_NOT_DELIVERED_MESSAGE,
  PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES,
  PASSWORD_RESET_OUTCOME_UNKNOWN_MESSAGE,
  PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM,
  PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM,
  PASSWORD_RESET_REQUESTED_MESSAGE,
  PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE,
  REMOVED_HARDWARE_KEY_USED_MESSAGE,
  RESET_AND_ENROLMENT_COUNTS,
  RESET_REQUESTS_PER_USER,
  SECURITY_ALARM_PERIOD_SECONDS,
  STEP_REFUSED_AFTER_RESET_COUNTED_STEPS,
  STEP_REFUSED_AFTER_RESET_MESSAGE,
  STEP_REFUSED_AFTER_RESET_UNCOUNTED_STEP,
  STEP_START_AHEAD_OF_CLOCK_MESSAGE,
  SIGN_IN_BURST_MESSAGES,
  SIGN_IN_BURST_METRIC,
  resetRequestsRuleName,
} from '../lib/security-events';
import { type CfnResource, type CfnStatement, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, synthesized } from './synth';

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

describe('the live-heap contract with the worker (docs/adr/0083, D19 and D23)', () => {
  it('matches the line apps/worker logs as each attempt ends, with the peak and the limit as numeric fields', () => {
    const worker = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/worker.ts'), 'utf8');
    expect(worker).toContain(`export const JOB_HEAP_MESSAGE = '${JOB_HEAP_MESSAGE}';`);
    expect(worker).toContain(`logger.info('${JOB_HEAP_MESSAGE}', { job_id: job.id, job_type: type, heap_live_peak_mib: heapLivePeakMib, heap_limit_mib: heapLimitMib });`);
    // Both fields are kept by the logger only as finite numbers (packages/observability's numeric fields).
    expect(readFileSync(path.resolve(import.meta.dirname, '../../packages/observability/src/fields.ts'), 'utf8')).toContain("'heap_live_peak_mib', 'heap_limit_mib'] as const;");
  });

  it('alarms at 75% of the worker heap, 420 MiB', () => {
    expect(JOB_HEAP_ALARM_PERCENT).toBe(75);
    expect((HEAP_MIB.worker * JOB_HEAP_ALARM_PERCENT) / 100).toBe(HEAP_MIB.worker * 0.75);
    expect(HEAP_MIB.worker * 0.75).toBe(420);
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

describe('the reset and enrolment signal contract with the web app (R-11; docs/adr/0088, D7; test matrix SEC-23)', () => {
  const source = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8');

  it('pins the thirteen counted lines, their codes and thresholds, and the per-user line, as literals', () => {
    // Literals, so an edit to the constants cannot pass by changing both sides.
    expect(RESET_AND_ENROLMENT_COUNTS).toEqual([
      {
        metricName: 'PasswordResetNotDeliveredConfig',
        message: 'password reset request not delivered',
        errorCodes: ['UserNotFoundException', 'NotAuthorizedException', 'InvalidParameterException', 'CodeDeliveryFailureException'],
        threshold: 1,
        periodSeconds: 300,
      },
      { metricName: 'PasswordResetNotDeliveredThrottled', message: 'password reset request not delivered', errorCodes: ['LimitExceededException', 'TooManyRequestsException'], threshold: 3, periodSeconds: 3600 },
      { metricName: 'PasswordResetRequestFailed', message: 'password reset request failed', errorCodes: [], threshold: 1, periodSeconds: 300 },
      { metricName: 'SecondFactorEnrolmentRefused', message: 'security event: second-factor enrolment refused', errorCodes: [], threshold: 1, periodSeconds: 300 },
      { metricName: 'ClientCredentialRefused', message: 'security event: client credential refused', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // The start-up probe's refusal (review infra-auth-IA-2): a deploy it rolls back reaches no user, so no other line is written.
      { metricName: 'ClientCredentialProbeRefused', message: 'cognito probe refused', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // A reset request answered after its floor (review security-N-1): its timing could tell an account from none.
      { metricName: 'PasswordResetRequestOverFloor', message: 'password reset request over floor', errorCodes: [], threshold: 3, periodSeconds: 3600 },
      // A completed reset whose sessions were not ended queues no password-changed email, so its line pages (docs/adr/0091, D15).
      { metricName: 'PasswordResetSessionsNotEnded', message: 'security event: password reset sessions not ended', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // A sign-in step begun before a reset and refused after it (docs/adr/0093, D5): every step but the hardware-key sign-in's, where no password was proved.
      {
        metricName: 'SignInStepRefusedAfterReset',
        message: 'security event: sign-in step refused after a password reset',
        errorCodes: ['new_password', 'mfa_setup', 'mfa', 'register_key', 'key_registered'],
        threshold: 1,
        periodSeconds: 300,
      },
      // A hardware key whose registration returned after the reset was recorded (docs/adr/0093, D6): removed or not, it pages.
      { metricName: 'HardwareKeyRegisteredAcrossReset', message: 'security event: hardware key registered across a password reset', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // A reset the provider did not answer for (docs/adr/0093, D9): no password-changed email is queued, so its line pages.
      { metricName: 'PasswordResetOutcomeUnknown', message: 'security event: password reset outcome unknown', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // A sign-in whose typed address and provider subject name two accounts (docs/adr/0093, D5): refused outright, and it pages.
      { metricName: 'SignInRefusedCrossedAccount', message: 'security event: sign-in refused for a crossed account', errorCodes: [], threshold: 1, periodSeconds: 300 },
      // A sign-in answered with a hardware key that two administrators removed (docs/adr/0095): refused, and it pages.
      { metricName: 'RemovedHardwareKeyUsed', message: 'security event: removed hardware key used', errorCodes: [], threshold: 1, periodSeconds: 300 },
    ]);
    // The provider's sign-out is the platform job's, so its one alarm is not among the web's (docs/adr/0095): the two the web had are gone.
    expect(RESET_AND_ENROLMENT_COUNTS.map((count) => count.metricName as string).filter((name) => /ProviderSignOut/.test(name))).toEqual([]);
    expect(PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM).toEqual({ metricName: 'ProviderSignOutNotDelivered', message: 'security event: provider sign-out not delivered', threshold: 1, periodSeconds: 300 });
    expect(STEP_REFUSED_AFTER_RESET_UNCOUNTED_STEP).toBe('key');
    expect(KEY_REGISTERED_ACROSS_RESET_CODES).toEqual(['removed', 'not_removed', 'not_removed_not_locked']);
    expect(STEP_START_AHEAD_OF_CLOCK_MESSAGE).toBe('sign-in step start is ahead of the database clock');
    expect(PASSWORD_RESET_REQUESTED_MESSAGE).toBe('password reset requested');
    expect(RESET_REQUESTS_PER_USER).toEqual({ threshold: 5, periodSeconds: 3600 });
    expect(SECURITY_ALARM_PERIOD_SECONDS).toBe(300);
  });

  it('matches the lines apps/web logs: the provider\'s undelivered request, the flow\'s failed request, refused enrolment, refused credential, the probe\'s refusal, a reset whose sessions were not ended, a removed key used and each account\'s request; and no line about the provider\'s sign-out, which the web no longer asks for', () => {
    const provider = source('apps/web/src/lib/auth/cognito-provider.ts');
    const flow = source('apps/web/src/lib/auth/sign-in.ts');
    expect(provider).toContain(`this.logger.warn('${PASSWORD_RESET_NOT_DELIVERED_MESSAGE}', { error_code: code, request_id: requestId ?? null });`);
    expect(flow).toContain(`this.deps.logger.error('${PASSWORD_RESET_FAILED_MESSAGE}', { request_id: context.requestId, error_code: errorCode(error) });`);
    expect(flow).toContain(`this.deps.logger.warn('${PASSWORD_RESET_OVER_FLOOR_MESSAGE}', { request_id: context.requestId, elapsed_ms: elapsed });`);
    expect(flow).toContain(`this.deps.logger.warn('${ENROLMENT_REFUSED_MESSAGE}', {`);
    expect(flow).toContain(`this.deps.logger.error('${CLIENT_CREDENTIAL_REFUSED_MESSAGE}', {`);
    expect(source('apps/web/src/lib/auth/credential-probe.ts')).toContain(`logger?.error('${CREDENTIAL_PROBE_REFUSED_MESSAGE}', { error_code: code });`);
    // The completed reset that queues no password-changed email (docs/adr/0091, D15): the user's ID and the request's alone.
    expect(flow).toContain(`this.deps.logger.error('${PASSWORD_RESET_SESSIONS_NOT_ENDED_MESSAGE}', { user_id: account.user_id, request_id: context.requestId });`);
    // A hardware key two administrators removed, used at sign-in (docs/adr/0095): the user's ID and the request's alone.
    expect(flow).toContain(`this.deps.logger.error('${REMOVED_HARDWARE_KEY_USED_MESSAGE}', { user_id: userId, request_id: context.requestId });`);
    // The web asks the provider for no sign-out and writes no line about one (docs/adr/0095): neither the reset's nor End membership's.
    for (const file of ['apps/web/src/lib/auth/sign-in.ts', 'apps/web/src/lib/routes/console.ts', 'apps/web/src/lib/routes/settings.ts']) {
      expect(source(file), file).not.toMatch(/provider sign-out/);
    }
    expect(existsSync(path.resolve(import.meta.dirname, '../..', 'apps/web/src/lib/auth/provider-sign-out.ts'))).toBe(false);
    // The user's ID and the request's alone: the address is never in it (the rule keys on $.user_id).
    expect(flow).toContain(`this.deps.logger.info('${PASSWORD_RESET_REQUESTED_MESSAGE}', { user_id: userId, request_id: context.requestId });`);
  });

  it('matches the three lines apps/web logs around a password reset (docs/adr/0093): a step refused, a key registered across it and an unknown outcome', () => {
    const flow = source('apps/web/src/lib/auth/sign-in.ts');
    // The step is the line's error_code: the filter counts five of the six steps by it.
    expect(flow).toContain(`this.deps.logger.warn('${STEP_REFUSED_AFTER_RESET_MESSAGE}', {`);
    expect(flow).toContain(`this.deps.logger.error('${KEY_REGISTERED_ACROSS_RESET_MESSAGE}', {`);
    expect(flow).toContain(`this.deps.logger.error('${PASSWORD_RESET_OUTCOME_UNKNOWN_MESSAGE}', {`);
    for (const code of KEY_REGISTERED_ACROSS_RESET_CODES) {
      expect(flow, code).toContain(`'${code}'`);
    }
    // The crossed account (the user's ID and the request's alone), and the clock fault, which is no security event and is not counted.
    expect(flow).toContain(`this.deps.logger.warn('${CROSSED_ACCOUNT_REFUSED_MESSAGE}', { user_id: account.user_id, request_id: context.requestId });`);
    expect(flow).toContain(`this.deps.logger.error('${STEP_START_AHEAD_OF_CLOCK_MESSAGE}', {`);
    expect(RESET_AND_ENROLMENT_COUNTS.some((count) => (count.message as string) === STEP_START_AHEAD_OF_CLOCK_MESSAGE)).toBe(false);
  });

  it('counts a refused step for exactly the steps the database records, but the hardware-key sign-in step', () => {
    // The closed list of sign_in_step_refused() (migration 20261112090000): the filter's steps and the one left out are all of it.
    const migration = source('packages/db/migrations/20261112090000_sign_in_not_before.sql');
    const listed = /step NOT IN \(([^)]*)\)/.exec(migration)?.[1] ?? '';
    const steps = [...listed.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(steps).toHaveLength(6);
    expect([...STEP_REFUSED_AFTER_RESET_COUNTED_STEPS, STEP_REFUSED_AFTER_RESET_UNCOUNTED_STEP].sort()).toEqual(steps.sort());
  });

  it('splits every code the provider answers as not delivered into exactly the configuration codes and the throttle codes', () => {
    const provider = source('apps/web/src/lib/auth/cognito-provider.ts');
    const listed = /const RESET_NOT_DELIVERED = new Set\(\[([^\]]*)\]\);/.exec(provider)?.[1] ?? '';
    const codes = [...listed.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);
    expect(codes).toHaveLength(6);
    expect([...PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES, ...PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES].sort()).toEqual(codes.sort());
    expect(PASSWORD_RESET_NOT_DELIVERED_CONFIG_CODES.filter((code) => (PASSWORD_RESET_NOT_DELIVERED_THROTTLE_CODES as readonly string[]).includes(code))).toEqual([]);
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
    expect(source('packages/observability/src/fields.ts')).toContain("export const NUMERIC_LOG_FIELDS = ['elapsed_ms', 'record_count', 'heap_live_peak_mib', 'heap_limit_mib'] as const;");
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
  const heapAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.jobHeapAlarm));

  const platformHeartbeatAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.platformHeartbeatAlarm));
  const signInAlarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.failedSignInBurstAlarm));

  it('has the worker, platform and web metric filters and the stack\'s alarms, and no other', () => {
    // Worker: heartbeat, final job failures, pricing engine errors, job heap peaks, model budget events. Platform:
    // heartbeat, final job failures. Screening: heartbeat, final job failures, the time to email, the oldest queued run,
    // failed runs. Web: failed sign-in bursts, model budget events, screening uploads sent to wait. Mail (docs/adr/0065):
    // the platform's seven codes (the sixth a password-changed email not delivered, docs/adr/0091, D9; the seventh a
    // hardware-key email not delivered, docs/adr/0095), an unsent probe,
    // a password-changed email SES accepted whose record failed (D9), and the web's refused validation and validation cap. Reset and enrolment (R-11; docs/adr/0088, D7): the web's
    // undelivered requests (configuration, throttle), failed requests, refused enrolments, refused client credentials,
    // the start-up probe's refusal, a completed reset whose sessions were not ended (docs/adr/0091, D15), a removed
    // hardware key used (docs/adr/0095), and the four around a reset (docs/adr/0093: a step refused
    // after it, a hardware key registered across it, an unknown outcome, a crossed account). Platform again: the
    // job's provider sign-out not delivered (docs/adr/0095), in place of the web's two lines about the provider's sign-out, and the
    // job's own run line, whose absence alarms (docs/adr/0095, D16). The user pool's message trigger (docs/adr/0081, the
    // code-email amendment): a message left to the pool's template, and the web's reset request answered after its floor.
    expect(filters).toHaveLength(42);
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
      stack.monitoring.jobHeapAlarm,
      stack.monitoring.databaseConnectionsAlarm,
      stack.monitoring.failedSignInBurstAlarm,
      stack.monitoring.modelBudgetAlarm,
      stack.edge.signInRateLimitAlarm,
      stack.uptime.webAlarm,
      stack.uptime.apiAlarm,
      stack.uptime.certificateAlarm,
      ...Object.values(stack.monitoring.mailCodeAlarms),
      stack.monitoring.mailProbeUnsentAlarm,
      stack.monitoring.passwordNoticeRecordFailedAlarm,
      stack.monitoring.mailValidationRefusedAlarm,
      stack.monitoring.mailValidationCapAlarm,
      ...Object.values(stack.monitoring.resetAndEnrolmentAlarms),
      stack.monitoring.providerSignOutNotDeliveredAlarm,
      stack.monitoring.providerSignOutsNotRunningAlarm,
      stack.monitoring.resetRequestsPerUserAlarm,
      stack.mailStreams.accountBounceWarningAlarm,
      stack.mailStreams.accountBounceHighAlarm,
      stack.mailStreams.accountComplaintWarningAlarm,
      stack.mailStreams.accountComplaintHighAlarm,
      stack.mailStreams.screeningBounceAlarm,
      stack.mailStreams.screeningComplaintAlarm,
      stack.mailStreams.transactionalBounceAlarm,
      stack.mailStreams.deadLetterAlarm,
      stack.mailStreams.queueAgeAlarm,
      stack.identity.messages.failureAlarm,
      stack.identity.messages.fallbackAlarm,
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

  describe('reset and enrolment signals reach the operator (R-11; docs/adr/0088, D7; test matrix SEC-23)', () => {
    const web = stack.monitoring.webLogGroup;

    it('counts each of the thirteen lines on the web log group alone, by message and, for undelivered requests and a refused step, by code, and alarms at its threshold', () => {
      for (const count of RESET_AND_ENROLMENT_COUNTS) {
        const codes = count.errorCodes as readonly string[];
        const pattern =
          codes.length === 0
            ? `{ $.msg = "${count.message}" }`
            : `{ ($.msg = "${count.message}") && ((${codes.map((code) => `$.error_code = "${code}"`).join(') || (')})) }`;
        expect(propertiesOf(filterFor(count.metricName, web)), count.metricName).toEqual({
          LogGroupName: ref(logicalIdOf(stack, web)),
          FilterPattern: pattern,
          MetricTransformations: [{ MetricNamespace: 'TherapyPlatform/Web', MetricName: count.metricName, MetricValue: '1', Unit: 'Count' }],
        });
        const alarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetAndEnrolmentAlarms[count.metricName]));
        expect(propertiesOf(alarm), count.metricName).toMatchObject({
          Namespace: 'TherapyPlatform/Web',
          MetricName: count.metricName,
          Statistic: 'Sum',
          Period: count.periodSeconds,
          EvaluationPeriods: 1,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
          Threshold: count.threshold,
          TreatMissingData: 'notBreaching',
          AlarmActions: [topic],
        });
        expect(propertiesOf(alarm).Dimensions, count.metricName).toBeUndefined();
      }
      const counted = filters.filter(([, filter]) => RESET_AND_ENROLMENT_COUNTS.some((count) => JSON.stringify(propertiesOf(filter).MetricTransformations).includes(`"MetricName":"${count.metricName}"`)));
      expect(counted).toHaveLength(RESET_AND_ENROLMENT_COUNTS.length);
      expect(counted).toHaveLength(13);
    });

    it('says, for the completed reset that pages (docs/adr/0091, D15), what happened, what to do and which runbook section', () => {
      const notEnded = String(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetAndEnrolmentAlarms.PasswordResetSessionsNotEnded))).AlarmDescription);
      expect(notEnded).toContain('the app could not end the account\'s sessions or record the reset');
      // What to do names what the runbook's control does (End membership, or the founder's break-glass session): it ends the sessions.
      expect(notEnded).toContain('read the user ID from the line, end the account\'s sessions and tell the person another way');
      expect(notEnded).toContain('docs/runbooks/incident-response.md, "A password reset whose sessions were not ended"');
      // Such a reset recorded nothing, so no provider sign-out was queued for it either (docs/adr/0095): the words say so.
      expect(notEnded).toContain('no sign-out at Cognito was queued');
      expect(notEnded.length).toBeLessThanOrEqual(1024);
    });

    it('says, for a removed hardware key used at sign-in (docs/adr/0095), what happened and what to do', () => {
      const used = String(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetAndEnrolmentAlarms.RemovedHardwareKeyUsed))).AlarmDescription);
      expect(used).toContain(`Someone answered a ${environment} hardware-key sign-in with a key that two platform administrators removed from the account; the sign-in was refused`);
      expect(used).toContain('read the user ID from the line');
      expect(used).toContain('treat anything else as an attempted takeover');
      expect(used).toContain('docs/adr/0095');
      expect(used.length).toBeLessThanOrEqual(1024);
    });

    // docs/adr/0095 (Queues item 37): the provider's sign-out after an ended membership, a reset and a key removal is
    // the platform job's (provider_sign_outs), so the alarm for one that does not arrive reads the platform log group.
    it('counts the job\'s undelivered provider sign-out on the platform log group alone, by its words, and alarms on the first', () => {
      const platform = stack.monitoring.platformLogGroup;
      const { metricName, message } = PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM;
      expect(propertiesOf(filterFor(metricName, platform))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, platform)),
        FilterPattern: `{ $.msg = "${message}" }`,
        MetricTransformations: [{ MetricNamespace: 'TherapyPlatform/Worker', MetricName: metricName, MetricValue: '1', Unit: 'Count' }],
      });
      const alarm = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.providerSignOutNotDeliveredAlarm)));
      expect(alarm).toMatchObject({
        Namespace: 'TherapyPlatform/Worker',
        MetricName: metricName,
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 1,
        TreatMissingData: 'notBreaching',
        AlarmActions: [topic],
      });
      expect(alarm.Dimensions).toBeUndefined();
      // One filter holds the metric, and it is not on the web's group: the web writes no such line.
      const holding = filters.filter(([, filter]) => JSON.stringify(propertiesOf(filter).MetricTransformations).includes(`"MetricName":"${metricName}"`));
      expect(holding).toHaveLength(1);
      // Neither of the web's two old alarms is in the template.
      expect(JSON.stringify(template.toJSON())).not.toMatch(/PasswordResetProviderSignOutFailed|MembershipEndProviderSignOutFailed/);
    });

    it('matches the line the job writes, and says what happened, what each code means and what to do', () => {
      const job = readFileSync(path.resolve(import.meta.dirname, '../..', 'apps/worker/src/platform/provider-sign-outs.ts'), 'utf8');
      expect(job).toContain(`export const PROVIDER_SIGN_OUT_NOT_DELIVERED = '${PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM.message}';`);
      // IDs and a code alone: the sign-out's, the account's, the cause's request.
      expect(job).toContain(`logger.error('${PROVIDER_SIGN_OUT_NOT_DELIVERED_ALARM.message}', { sign_out_id: line.sign_out_id, user_id: line.account_id, request_id: line.cause_request_id, error_code: `);
      const words = String(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.providerSignOutNotDeliveredAlarm))).AlarmDescription);
      expect(words).toContain(`A ${environment} account whose membership ended, whose password was reset or whose hardware keys were removed has not been signed out at Cognito by the provider_sign_outs job`);
      expect(words).toContain('the app\'s own sessions ended and its sign-in mark moved when the cause committed');
      expect(words).toContain('LATE:');
      expect(words).toContain('GAVE_UP:');
      expect(words).toContain('docs/adr/0095');
      expect(words.length).toBeLessThanOrEqual(1024);
    });

    // docs/adr/0095, D16: the heartbeat says the platform process is alive and the final-failure filter says a run
    // failed; neither hears a schedule that stops firing this one job, after which no sign-out is sent and none is late.
    it('alarms when the provider_sign_outs job writes no run line for ten minutes, missing data breaching, and says when it returns', () => {
      const platform = stack.monitoring.platformLogGroup;
      expect(PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM).toEqual({ alarmName: 'ProviderSignOutsNotRunning', metricName: 'ProviderSignOutsRun', message: 'provider sign-outs run', periodSeconds: 300, missedPeriods: 2 });
      const { metricName, message } = PROVIDER_SIGN_OUTS_NOT_RUNNING_ALARM;
      expect(propertiesOf(filterFor(metricName, platform))).toEqual({
        LogGroupName: ref(logicalIdOf(stack, platform)),
        FilterPattern: `{ $.msg = "${message}" }`,
        MetricTransformations: [{ MetricNamespace: 'TherapyPlatform/Worker', MetricName: metricName, MetricValue: '1', Unit: 'Count' }],
      });
      const alarm = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.providerSignOutsNotRunningAlarm)));
      expect(alarm).toMatchObject({
        Namespace: 'TherapyPlatform/Worker',
        MetricName: metricName,
        Statistic: 'Sum',
        Period: 300,
        EvaluationPeriods: 2,
        ComparisonOperator: 'LessThanThreshold',
        Threshold: 1,
        TreatMissingData: 'breaching',
        AlarmActions: [topic],
        OKActions: [topic],
      });
      expect(alarm.Dimensions).toBeUndefined();
      const holding = filters.filter(([, filter]) => JSON.stringify(propertiesOf(filter).MetricTransformations).includes(`"MetricName":"${metricName}"`));
      expect(holding).toHaveLength(1);
      // The line is the job's own, written once a run whether or not a step failed, with a count and no ID.
      const job = readFileSync(path.resolve(import.meta.dirname, '../..', 'apps/worker/src/platform/provider-sign-outs.ts'), 'utf8');
      expect(job).toContain(`export const PROVIDER_SIGN_OUTS_RUN = '${message}';`);
      expect(job).toContain(`logger.info('${message}', { record_count: done + failed });`);
      // The job runs every minute, so ten minutes hold ten lines when it is scheduled.
      const jobs = readFileSync(path.resolve(import.meta.dirname, '../..', 'apps/worker/src/jobs/platform.ts'), 'utf8');
      expect(jobs).toContain("provider_sign_outs: '* * * * *',");
      const words = String(alarm.AlarmDescription);
      expect(words).toContain(`The ${environment} provider_sign_outs job has written no run line for ten minutes`);
      expect(words).toContain('no sign-out is being sent at Cognito');
      expect(words).toContain('none can become late, so ProviderSignOutNotDelivered stays silent');
      expect(words).toContain('docs/runbooks/incident-response.md, "The provider sign-out job not running"');
      expect(words).toContain('docs/adr/0095, D16');
      expect(words.length).toBeLessThanOrEqual(1024);
    });

    it('says, for each of the three lines around a password reset (docs/adr/0093), what happened, what to do and which runbook section', () => {
      const description = (metricName: 'SignInStepRefusedAfterReset' | 'HardwareKeyRegisteredAcrossReset' | 'PasswordResetOutcomeUnknown') =>
        String(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetAndEnrolmentAlarms[metricName]))).AlarmDescription);
      const refused = description('SignInStepRefusedAfterReset');
      expect(refused).toContain(`A ${environment} sign-in step begun before the account's latest password reset was answered after it and refused`);
      expect(refused).toContain('at the code step (mfa) tell them their second factor may be known too');
      expect(refused).toContain('docs/runbooks/incident-response.md, "A sign-in step refused after a password reset"');
      expect(refused).toContain('docs/adr/0093, D5');
      const key = description('HardwareKeyRegisteredAcrossReset');
      expect(key).toContain('not_removed: the key is still on the account and the account is locked, so have the key removed through the founder\'s break-glass before anyone unlocks it');
      expect(key).toContain('not_removed_not_locked: the key signs in, so go to the break-glass now');
      expect(key).toContain('docs/runbooks/incident-response.md, "A hardware key registered across a password reset"');
      expect(key).toContain('docs/adr/0093, D6');
      const unknown = description('PasswordResetOutcomeUnknown');
      expect(unknown).toContain(`Cognito did not say whether a ${environment} password reset changed the password`);
      expect(unknown).toContain('sent no password-changed email');
      expect(unknown).toContain('find out at Cognito whether the password changed, and tell the person another way');
      expect(unknown).toContain('docs/runbooks/incident-response.md, "A password reset whose outcome is unknown"');
      expect(unknown).toContain('docs/adr/0093, D9');
      const crossed = String(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetAndEnrolmentAlarms.SignInRefusedCrossedAccount))).AlarmDescription);
      expect(crossed).toContain('the address typed names one account and Cognito\'s subject another');
      expect(crossed).toContain('docs/runbooks/incident-response.md, "A sign-in refused for a crossed account"');
      expect(crossed).toContain('docs/adr/0093, D5');
      for (const text of [refused, key, unknown, crossed]) {
        expect(text.length).toBeLessThanOrEqual(1024);
      }
    });

    it('counts reset requests per user with one contributor rule keyed on the user ID, and no metric filter counts them', () => {
      const rules = resourcesOf(template, 'AWS::CloudWatch::InsightRule');
      expect(rules).toHaveLength(1);
      const [id, rule] = rules[0] as [string, CfnResource & { readonly DependsOn?: readonly string[] }];
      // The rule is itself the CloudFormation resource (an L1), so its logical ID is read from it, not a default child.
      expect(id).toBe(stack.getLogicalId(stack.monitoring.resetRequestsPerUserRule));
      const properties = propertiesOf(rule);
      expect(properties.RuleName).toBe(resetRequestsRuleName(environment));
      expect(properties.RuleState).toBe('ENABLED');
      expect(JSON.parse(properties.RuleBody as string)).toEqual({
        Schema: { Name: 'CloudWatchLogRule', Version: 1 },
        LogGroupNames: [logGroupName(environment, 'web')],
        LogFormat: 'JSON',
        Contribution: { Keys: ['$.user_id'], Filters: [{ Match: '$.msg', In: [PASSWORD_RESET_REQUESTED_MESSAGE] }] },
        AggregateOn: 'Count',
      });
      // The rule reads the web log group by name, so it is created after it.
      expect(rule.DependsOn).toContain(logicalIdOf(stack, web));
      // No metric per user: no filter counts the line (the rule alone does), and none has a dimension.
      for (const [filterId, filter] of filters) {
        expect(String(propertiesOf(filter).FilterPattern), filterId).not.toContain(PASSWORD_RESET_REQUESTED_MESSAGE);
      }
    });

    it('alarms when one user\'s reset requests reach five in an hour, naming no user', () => {
      const alarm = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.resetRequestsPerUserAlarm)));
      expect(alarm).toMatchObject({
        EvaluationPeriods: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 5,
        TreatMissingData: 'notBreaching',
        AlarmActions: [topic],
      });
      const metrics = alarm.Metrics as Record<string, unknown>[];
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        Expression: `INSIGHT_RULE_METRIC('${resetRequestsRuleName(environment)}', 'MaxContributorValue')`,
        Period: 3600,
        ReturnData: true,
      });
      expect(alarm.Dimensions).toBeUndefined();
      expect(alarm.MetricName).toBeUndefined();
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

  it('takes each job\'s live heap peak from the worker\'s log and tells the operator when one passes 75% of the worker heap in five minutes (D23)', () => {
    expect(propertiesOf(filterFor(JOB_HEAP_METRIC.metricName))).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      FilterPattern: `{ $.msg = "${JOB_HEAP_MESSAGE}" }`,
      MetricTransformations: [{ MetricNamespace: JOB_HEAP_METRIC.namespace, MetricName: JOB_HEAP_METRIC.metricName, MetricValue: '$.heap_live_peak_mib' }],
    });
    expect(JOB_HEAP_METRIC.namespace).toBe('TherapyPlatform/Worker');
    expect(propertiesOf(heapAlarm)).toMatchObject({
      Namespace: JOB_HEAP_METRIC.namespace,
      MetricName: JOB_HEAP_METRIC.metricName,
      Statistic: 'Maximum',
      Period: 300,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanThreshold',
      Threshold: HEAP_MIB.worker * 0.75,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
    expect(propertiesOf(heapAlarm).Dimensions).toBeUndefined();
    expect(propertiesOf(heapAlarm).OKActions).toBeUndefined();
  });

  it('tells the operator when the database holds 80% of its max_connections in five minutes, the figure synthesis checked every task against (docs/adr/0083)', () => {
    const budget = connectionBudget(environmentSettings(environment));
    const alarm = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.databaseConnectionsAlarm));
    expect(budget.alarmThreshold).toBe(Math.ceil(budget.maxConnections * 0.8));
    expect(propertiesOf(alarm)).toMatchObject({
      AlarmDescription: `The ${environment} database held ${String(budget.alarmThreshold)} or more connections, 80 percent of the ${String(budget.maxConnections)} the connection budget reads for its class.`,
      Namespace: 'AWS/RDS',
      MetricName: 'DatabaseConnections',
      Dimensions: [{ Name: 'DBInstanceIdentifier', Value: ref(logicalIdOf(stack, stack.database.instance)) }],
      Statistic: 'Maximum',
      Period: 300,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: budget.alarmThreshold,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
    expect(propertiesOf(alarm).OKActions).toBeUndefined();
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

  // Two missed beats where the worker deploys new-before-old; in dev, whose worker deploys stop-first (Lane A's
  // orchestrator, 2026-11-05), ten: a deploy's gap without a worker never pages (round 4).
  const missed = environment === 'dev' ? 10 : 2;

  it('alarms when consecutive heartbeat periods are empty, missing data counting as missed: two, and in dev, whose worker deploys stop-first, its deploy’s whole gap', () => {
    const alarm = heartbeatAlarm;
    expect(propertiesOf(alarm)).toMatchObject({
      Namespace: HEARTBEAT_METRIC.namespace,
      MetricName: HEARTBEAT_METRIC.metricName,
      Statistic: 'Sum',
      Period: HEARTBEAT_INTERVAL_SECONDS,
      EvaluationPeriods: missed,
      DatapointsToAlarm: missed,
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
    expect(propertiesOf(alarm).AlarmDescription).toBe(`The ${environment} worker missed ${String(missed)} consecutive heartbeats.`);
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

/** Lane A's orchestrator, 2026-11-05: a dev deploy never pages (round 4, the instance classes). */
describe('the heartbeat alarm where a deploy stops the worker first', () => {
  it('counts two missed beats for a new-before-old deploy, and for a stop-first deploy every beat its gap can miss', () => {
    expect(missedHeartbeatsToAlarm(ROLLING_DEPLOYMENT)).toBe(MISSED_HEARTBEATS_TO_ALARM);
    expect(MISSED_HEARTBEATS_TO_ALARM).toBe(2);
    // The gap: up to one interval since the old task's last beat, its stop timeout, then the new task's start before its first beat.
    expect(WORKER_STOP_TIMEOUT_SECONDS).toBe(60);
    expect(STOP_FIRST_START_ALLOWANCE_SECONDS).toBe(480);
    expect(missedHeartbeatsToAlarm(STOP_FIRST_DEPLOYMENT)).toBe((HEARTBEAT_INTERVAL_SECONDS + WORKER_STOP_TIMEOUT_SECONDS + STOP_FIRST_START_ALLOWANCE_SECONDS) / HEARTBEAT_INTERVAL_SECONDS);
    expect(missedHeartbeatsToAlarm(STOP_FIRST_DEPLOYMENT)).toBe(10);
  });
});
