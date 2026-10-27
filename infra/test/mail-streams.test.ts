import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { mailAccountAlarmsRuleName, mailEventsRuleName } from '../lib/constructs/mail-streams';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import {
  ACCOUNT_REPUTATION_ALARMS,
  MAIL_EVENTS_OLDEST_LIMIT_SECONDS,
  MAIL_EVENTS_QUEUE,
  MAIL_EVENT_TYPES,
  MAIL_NAMESPACE,
  MAIL_PLATFORM_ALARM_CODES,
  MAIL_PLATFORM_ALARM_PERIOD_SECONDS,
  MAIL_PROBE_UNSENT_ALARM,
  MAIL_SIMULATOR_RECIPIENTS,
  MAIL_STREAMS,
  MAIL_VALIDATION_CAP_CODE,
  MAIL_VALIDATION_CAP_PERIOD_SECONDS,
  MAIL_VALIDATION_DAILY_CAP,
  MAIL_VALIDATION_REFUSED_CODE,
  MAIL_VALIDATION_REFUSED_PERIOD_SECONDS,
  MAIL_WARNING_CODES,
  REPUTATION_PERIOD_SECONDS,
  SET_REPUTATION_ALARMS,
  configurationSetName,
  mailCodeMetricName,
} from '../lib/mail';
import { type CfnResource, type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, propertiesOf, ref, resourceById, resourcesOf, synthesized } from './synth';

const ROOT = path.resolve(import.meta.dirname, '../..');

function source(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

/** Every non-test TypeScript source under a directory, joined. */
function sources(directory: string): string {
  const texts: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'node_modules' && name !== 'test-support') {
          walk(full);
        }
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        texts.push(readFileSync(full, 'utf8'));
      }
    }
  };
  walk(path.join(ROOT, directory));
  return texts.join('\n');
}

/**
 * The mail streams (audit #76; docs/adr/0065; the founder's rulings of 2026-10-21, Q1 and Q9 to Q12; test matrix SCR-21,
 * SEC-18 and JOB-05): three SES configuration sets, two stack-owned identities in two phases, the event path into one
 * encrypted queue, the cut-off that can pause only the screening stream, and the seventeen alarms.
 */
describe('the mail streams\' names and codes match the worker\'s and the web\'s', () => {
  it('names the same three streams as the database\'s closed list', () => {
    expect(source('packages/db/src/schema/operations.ts')).toContain(`export const MAIL_STREAMS = [${MAIL_STREAMS.map((stream) => `'${stream}'`).join(', ')}] as const;`);
  });

  it('builds each set\'s name as the worker does, from the prefix tp-<env>', () => {
    const streams = source('apps/worker/src/mail/streams.ts');
    expect(streams).toContain('return `${prefix}-${stream}`;');
    expect(configurationSetName('production', 'screening')).toBe('tp-production-screening');
  });

  it('probes the two mailbox simulator addresses the worker probes', () => {
    const streams = source('apps/worker/src/mail/streams.ts');
    expect(streams).toContain("MAIL_SIMULATOR_DOMAIN = 'simulator.amazonses.com'");
    expect([...MAIL_SIMULATOR_RECIPIENTS]).toEqual(['success@simulator.amazonses.com', 'bounce@simulator.amazonses.com']);
    expect(streams).toContain('delivered: `success@${MAIL_SIMULATOR_DOMAIN}`, bounced: `bounce@${MAIL_SIMULATOR_DOMAIN}`');
  });

  it('counts the codes the platform jobs log, and the web\'s, and alarms on none of the warnings', () => {
    const worker = sources('apps/worker/src');
    for (const code of [...MAIL_PLATFORM_ALARM_CODES, MAIL_PROBE_UNSENT_ALARM.code, 'MAIL_EVENT_UNREADABLE']) {
      expect(worker, code).toContain(`'${code}'`);
    }
    // An unsendable probe is logged on each minute's run while the probe is due, and the next run tries again.
    expect(source('apps/worker/src/platform/mail-events.ts')).toContain(`error_code: '${MAIL_PROBE_UNSENT_ALARM.code}'`);
    const web = source('apps/web/src/lib/screening/validation.ts') + source('apps/web/src/lib/screening/address.ts');
    for (const code of [MAIL_VALIDATION_CAP_CODE, MAIL_VALIDATION_REFUSED_CODE, 'MAIL_DOMAIN_CHECK_UNAVAILABLE', 'MAIL_VALIDATION_UNAVAILABLE']) {
      expect(web, code).toContain(`'${code}'`);
    }
    const alarmed: readonly string[] = [...MAIL_PLATFORM_ALARM_CODES, MAIL_PROBE_UNSENT_ALARM.code, MAIL_VALIDATION_CAP_CODE, MAIL_VALIDATION_REFUSED_CODE];
    expect(MAIL_WARNING_CODES.filter((code) => alarmed.includes(code))).toEqual([]);
  });

  it('caps the web\'s address validations at the founder\'s numbers, and the web reads the cap the task is given', () => {
    expect(MAIL_VALIDATION_DAILY_CAP).toEqual({ dev: 50, staging: 50, production: 1_000 });
    const config = source('apps/web/src/lib/server/config.ts');
    expect(config).toContain('MAIL_VALIDATION:');
    expect(config).toContain('MAIL_VALIDATION_DAILY_CAP:');
  });
});

describe.each(ENVIRONMENTS)('%s: mail streams', (environment) => {
  const { stack, template } = synthesized(environment);
  const environmentKey = getAtt(keyId(template), 'Arn');
  const sets = resourcesOf(template, 'AWS::SES::ConfigurationSet');
  const setId = (stream: (typeof MAIL_STREAMS)[number]) => logicalIdOf(stack, stack.mailStreams.configurationSets[stream]);
  const queueId = logicalIdOf(stack, stack.mailStreams.queue);
  const deadLetterId = logicalIdOf(stack, stack.mailStreams.deadLetterQueue);
  const ruleArn = (name: string) => ({ 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':events:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, `:rule/${name}`]] });
  const ruleArns = [ruleArn(mailEventsRuleName(environment)), ruleArn(mailAccountAlarmsRuleName(environment))];

  it('has exactly three configuration sets, one per stream', () => {
    expect(sets.map(([, set]) => propertiesOf(set).Name).sort()).toEqual(MAIL_STREAMS.map((stream) => `tp-${environment}-${stream}`).sort());
  });

  it('publishes reputation metrics, requires TLS, tracks no opens or clicks, and leaves Auto Validation and sending out of the template', () => {
    for (const [id, set] of sets) {
      const properties = propertiesOf(set);
      expect(properties.ReputationOptions, id).toEqual({ ReputationMetricsEnabled: true });
      expect(properties.DeliveryOptions, id).toEqual({ TlsPolicy: 'REQUIRE' });
      expect(properties.TrackingOptions, id).toBeUndefined();
      expect(properties.VdmOptions, id).toEqual({ DashboardOptions: { EngagementMetrics: 'DISABLED' } });
      expect((properties.SuppressionOptions as { ValidationOptions: unknown }).ValidationOptions, id).toEqual({ ConditionThreshold: { ConditionThresholdEnabled: 'DISABLED' } });
      // The reconcile keeps the screening set's sending; a deploy names none (the worker's drift test is the proof).
      expect(properties.SendingOptions, id).toBeUndefined();
    }
    expect(resourcesOf(template, 'AWS::SES::VdmAttributes')).toEqual([]);
  });

  it('suppresses bounces and complaints on the transactional and notices sets, and nothing at all on the screening set', () => {
    for (const stream of ['transactional', 'notices'] as const) {
      expect((propertiesOf(resourceById(template, 'AWS::SES::ConfigurationSet', setId(stream))).SuppressionOptions as { SuppressedReasons: unknown }).SuppressedReasons, stream).toEqual([
        'BOUNCE',
        'COMPLAINT',
      ]);
    }
    expect((propertiesOf(resourceById(template, 'AWS::SES::ConfigurationSet', setId('screening'))).SuppressionOptions as { SuppressedReasons: unknown }).SuppressedReasons).toEqual([]);
  });

  it('sends each set\'s seven event types, and no open, click or subscription, to the default event bus', () => {
    const destinations = resourcesOf(template, 'AWS::SES::ConfigurationSetEventDestination');
    expect(destinations.map(([, destination]) => propertiesOf(destination).ConfigurationSetName).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual(
      MAIL_STREAMS.map((stream) => ref(setId(stream))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
    for (const [id, destination] of destinations) {
      const event = propertiesOf(destination).EventDestination as { Enabled: boolean; EventBridgeDestination: { EventBusArn: unknown }; MatchingEventTypes: string[] };
      expect(event.Enabled, id).toBe(true);
      expect(JSON.stringify(event.EventBridgeDestination.EventBusArn), id).toContain(':event-bus/default');
      expect(event.MatchingEventTypes.sort(), id).toEqual(['bounce', 'complaint', 'delivery', 'deliveryDelay', 'reject', 'renderingFailure', 'send']);
      expect(MAIL_EVENT_TYPES).toHaveLength(7);
    }
  });

  it('owns two domain identities, MailFromAddress\'s domain and its screening subdomain, each with 2048-bit Easy DKIM, a bounce. MAIL FROM and its stream\'s set', () => {
    const domain = { 'Fn::Select': [1, { 'Fn::Split': ['@', { Ref: PARAMETER_NAMES.mailFromAddress }] }] };
    const identities = resourcesOf(template, 'AWS::SES::EmailIdentity');
    expect(identities).toHaveLength(2);
    expect(propertiesOf(resourceById(template, 'AWS::SES::EmailIdentity', logicalIdOf(stack, stack.mailStreams.mailIdentity)))).toMatchObject({
      EmailIdentity: domain,
      ConfigurationSetAttributes: { ConfigurationSetName: ref(setId('transactional')) },
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' },
      MailFromAttributes: { BehaviorOnMxFailure: 'USE_DEFAULT_VALUE', MailFromDomain: { 'Fn::Join': ['', ['bounce.', domain]] } },
    });
    expect(propertiesOf(resourceById(template, 'AWS::SES::EmailIdentity', logicalIdOf(stack, stack.mailStreams.screeningIdentity)))).toMatchObject({
      EmailIdentity: { 'Fn::Join': ['', ['screening.', domain]] },
      ConfigurationSetAttributes: { ConfigurationSetName: ref(setId('screening')) },
      DkimSigningAttributes: { NextSigningKeyLength: 'RSA_2048_BIT' },
      MailFromAttributes: { BehaviorOnMxFailure: 'USE_DEFAULT_VALUE', MailFromDomain: { 'Fn::Join': ['', ['bounce.screening.', domain]] } },
    });
    for (const [id, identity] of identities) {
      // Signing on (the default), and no forwarding change: the stack does not leave it to the account.
      expect((propertiesOf(identity).DkimAttributes as { SigningEnabled?: boolean } | undefined)?.SigningEnabled, id).not.toBe(false);
    }
  });

  it('routes the three sets\' events and the account\'s two warning alarms to the queue, with the dead-letter queue and 24 hours of retries', () => {
    const events = propertiesOf(resourceById(template, 'AWS::Events::Rule', logicalIdOf(stack, stack.mailStreams.eventsRule)));
    expect(events.Name).toBe(mailEventsRuleName(environment));
    expect(events.EventPattern).toEqual({ source: ['aws.ses'], detail: { mail: { tags: { 'ses:configuration-set': MAIL_STREAMS.map((stream) => `tp-${environment}-${stream}`) } } } });
    const alarms = propertiesOf(resourceById(template, 'AWS::Events::Rule', logicalIdOf(stack, stack.mailStreams.accountAlarmsRule)));
    expect(alarms.Name).toBe(mailAccountAlarmsRuleName(environment));
    expect(alarms.EventPattern).toEqual({
      source: ['aws.cloudwatch'],
      'detail-type': ['CloudWatch Alarm State Change'],
      resources: [getAtt(logicalIdOf(stack, stack.mailStreams.accountBounceWarningAlarm), 'Arn'), getAtt(logicalIdOf(stack, stack.mailStreams.accountComplaintWarningAlarm), 'Arn')],
      detail: { state: { value: ['ALARM'] } },
    });
    for (const rule of [events, alarms]) {
      expect(rule.Targets).toEqual([
        {
          Id: 'Target0',
          Arn: getAtt(queueId, 'Arn'),
          DeadLetterConfig: { Arn: getAtt(deadLetterId, 'Arn') },
          RetryPolicy: { MaximumEventAgeInSeconds: 86_400, MaximumRetryAttempts: 185 },
        },
      ]);
    }
    // No archive: it would keep addresses past every promise; the dead-letter queue is the replay path.
    expect(resourcesOf(template, 'AWS::Events::Archive')).toEqual([]);
  });

  it('keeps the queue 4 days under the environment key with a 60-second visibility and five receives, and its dead-letter queue 14 days', () => {
    expect(propertiesOf(resourceById(template, 'AWS::SQS::Queue', queueId))).toMatchObject({
      QueueName: `tp-${environment}-mail-events`,
      KmsMasterKeyId: environmentKey,
      MessageRetentionPeriod: MAIL_EVENTS_QUEUE.retentionDays * 86_400,
      VisibilityTimeout: 60,
      RedrivePolicy: { deadLetterTargetArn: getAtt(deadLetterId, 'Arn'), maxReceiveCount: 5 },
    });
    expect(propertiesOf(resourceById(template, 'AWS::SQS::Queue', deadLetterId))).toMatchObject({
      QueueName: `tp-${environment}-mail-events-dlq`,
      KmsMasterKeyId: environmentKey,
      MessageRetentionPeriod: 14 * 86_400,
    });
    expect(resourcesOf(template, 'AWS::SQS::Queue')).toHaveLength(2);
  });

  it('admits only the two rules to either queue, refuses requests without TLS, and lets EventBridge use the key for those rules alone', () => {
    for (const id of [queueId, deadLetterId]) {
      const [, policy] = resourcesOf(template, 'AWS::SQS::QueuePolicy').find(([, candidate]) => JSON.stringify(propertiesOf(candidate).Queues) === JSON.stringify([ref(id)])) ?? [];
      const statements = (propertiesOf(policy as CfnResource).PolicyDocument as { Statement: CfnStatement[] }).Statement;
      expect(statements).toEqual([
        { Action: 'sqs:*', Condition: { Bool: { 'aws:SecureTransport': 'false' } }, Effect: 'Deny', Principal: { AWS: '*' }, Resource: getAtt(id, 'Arn') },
        {
          Sid: 'MailEventRulesOnly',
          Action: 'sqs:SendMessage',
          Condition: { ArnEquals: { 'aws:SourceArn': ruleArns } },
          Effect: 'Allow',
          Principal: { Service: 'events.amazonaws.com' },
          Resource: getAtt(id, 'Arn'),
        },
      ]);
    }
    const keyPolicy = propertiesOf(resourceById(template, 'AWS::KMS::Key', keyId(template))).KeyPolicy as { Statement: CfnStatement[] };
    const events = keyPolicy.Statement.filter((statement) => JSON.stringify(statement.Principal).includes('events.amazonaws.com'));
    expect(events).toEqual([
      {
        Sid: 'MailEventRulesToEncryptedQueues',
        Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
        Condition: { ArnEquals: { 'aws:SourceArn': ruleArns } },
        Effect: 'Allow',
        Principal: { Service: 'events.amazonaws.com' },
        Resource: '*',
      },
    ]);
    // The rule names the key's policy names are the rules the stack creates.
    expect(propertiesOf(resourceById(template, 'AWS::Events::Rule', logicalIdOf(stack, stack.mailStreams.eventsRule))).Name).toBe(mailEventsRuleName(environment));
    expect(propertiesOf(resourceById(template, 'AWS::Events::Rule', logicalIdOf(stack, stack.mailStreams.accountAlarmsRule))).Name).toBe(mailAccountAlarmsRuleName(environment));
  });

  it('can pause only the screening stream: the one statement that switches a set\'s sending names the screening set alone, and no statement names every identity', () => {
    const statements = resourcesOf(template, 'AWS::IAM::Policy').flatMap(([, policy]) => (propertiesOf(policy).PolicyDocument as { Statement: CfnStatement[] }).Statement);
    const switching = statements.filter((statement) => actionsOf(statement).some((action) => action === 'ses:PutConfigurationSetSendingOptions' || action === 'ses:*'));
    expect(switching).toHaveLength(1);
    const resource = JSON.stringify((switching[0] as CfnStatement).Resource);
    expect(resource).toContain(`configuration-set/tp-${environment}-screening`);
    expect(resource).not.toContain(`tp-${environment}-transactional`);
    expect(resource).not.toContain(`tp-${environment}-notices`);
    expect(JSON.stringify(statements)).not.toContain('identity/*');
    expect(JSON.stringify(statements)).not.toContain('configuration-set/*');
  });

  it('alarms on the account\'s and the sets\' reputation, the dead-letter queue and the queue\'s age, to the operator topic, with no address in a dimension', () => {
    const alarm = (construct: Parameters<typeof logicalIdOf>[1]) => propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, construct)));
    const topic = ref(logicalIdOf(stack, stack.monitoring.operatorTopic));
    const reputation = (metricName: string, threshold: number, set?: string) => ({
      Namespace: 'AWS/SES',
      MetricName: metricName,
      Statistic: 'Maximum',
      Period: REPUTATION_PERIOD_SECONDS,
      Threshold: threshold,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      EvaluationPeriods: 1,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
      ...(set === undefined ? {} : { Dimensions: [{ Name: 'ses:configuration-set', Value: `tp-${environment}-${set}` }] }),
    });
    const streams = stack.mailStreams;
    expect(alarm(streams.accountBounceWarningAlarm)).toMatchObject(reputation('Reputation.BounceRate', ACCOUNT_REPUTATION_ALARMS.bounceWarning));
    expect(alarm(streams.accountBounceHighAlarm)).toMatchObject(reputation('Reputation.BounceRate', ACCOUNT_REPUTATION_ALARMS.bounceHigh));
    expect(alarm(streams.accountComplaintWarningAlarm)).toMatchObject(reputation('Reputation.ComplaintRate', ACCOUNT_REPUTATION_ALARMS.complaintWarning));
    expect(alarm(streams.accountComplaintHighAlarm)).toMatchObject(reputation('Reputation.ComplaintRate', ACCOUNT_REPUTATION_ALARMS.complaintHigh));
    expect(alarm(streams.screeningBounceAlarm)).toMatchObject(reputation('Reputation.BounceRate', SET_REPUTATION_ALARMS.screeningBounce, 'screening'));
    expect(alarm(streams.screeningComplaintAlarm)).toMatchObject(reputation('Reputation.ComplaintRate', SET_REPUTATION_ALARMS.screeningComplaint, 'screening'));
    expect(alarm(streams.transactionalBounceAlarm)).toMatchObject(reputation('Reputation.BounceRate', SET_REPUTATION_ALARMS.transactionalBounce, 'transactional'));
    for (const construct of [streams.accountBounceWarningAlarm, streams.accountBounceHighAlarm, streams.accountComplaintWarningAlarm, streams.accountComplaintHighAlarm]) {
      expect(alarm(construct).Dimensions).toBeUndefined();
    }
    // The founder's numbers (Q9): half of SES's review levels for the warnings, the cut-off's rates for the screening set.
    expect(ACCOUNT_REPUTATION_ALARMS).toEqual({ bounceWarning: 0.025, bounceHigh: 0.04, complaintWarning: 0.0005, complaintHigh: 0.0008 });
    expect(SET_REPUTATION_ALARMS).toEqual({ screeningBounce: 0.03, screeningComplaint: 0.0008, transactionalBounce: 0.02 });
    expect(alarm(streams.deadLetterAlarm)).toMatchObject({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Dimensions: [{ Name: 'QueueName', Value: getAtt(deadLetterId, 'QueueName') }],
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      AlarmActions: [topic],
    });
    expect(alarm(streams.queueAgeAlarm)).toMatchObject({
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateAgeOfOldestMessage',
      Dimensions: [{ Name: 'QueueName', Value: getAtt(queueId, 'QueueName') }],
      Threshold: MAIL_EVENTS_OLDEST_LIMIT_SECONDS,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      AlarmActions: [topic],
    });
  });

  it('counts each platform mail code, an unsent probe and the web\'s refused validation and validation cap from the logs, by the code alone (eight filters)', () => {
    const filters = resourcesOf(template, 'AWS::Logs::MetricFilter').filter(([, filter]) => JSON.stringify(propertiesOf(filter).MetricTransformations).includes(MAIL_NAMESPACE));
    expect(filters).toHaveLength(8);
    const platform = ref(logicalIdOf(stack, stack.monitoring.platformLogGroup));
    const web = ref(logicalIdOf(stack, stack.monitoring.webLogGroup));
    const expected = [
      ...MAIL_PLATFORM_ALARM_CODES.map((code) => ({ code, group: platform, alarm: stack.monitoring.mailCodeAlarms[code], period: MAIL_PLATFORM_ALARM_PERIOD_SECONDS })),
      { code: MAIL_VALIDATION_CAP_CODE, group: web, alarm: stack.monitoring.mailValidationCapAlarm, period: MAIL_VALIDATION_CAP_PERIOD_SECONDS },
      { code: MAIL_VALIDATION_REFUSED_CODE, group: web, alarm: stack.monitoring.mailValidationRefusedAlarm, period: MAIL_VALIDATION_REFUSED_PERIOD_SECONDS },
    ];
    for (const { code, group, alarm, period } of expected) {
      const metricName = mailCodeMetricName(code);
      const filter = filters.find(([, candidate]) => JSON.stringify(propertiesOf(candidate).MetricTransformations).includes(`"MetricName":"${metricName}"`));
      expect(filter, code).toBeDefined();
      expect(propertiesOf((filter as [string, CfnResource])[1])).toMatchObject({
        LogGroupName: group,
        FilterPattern: `{ $.error_code = "${code}" }`,
        MetricTransformations: [{ MetricNamespace: MAIL_NAMESPACE, MetricName: metricName, MetricValue: '1', Unit: 'Count' }],
      });
      expect(propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, alarm)))).toMatchObject({
        Namespace: MAIL_NAMESPACE,
        MetricName: metricName,
        Statistic: 'Sum',
        Period: period,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        AlarmActions: [ref(logicalIdOf(stack, stack.monitoring.operatorTopic))],
      });
    }
    expect(MAIL_VALIDATION_CAP_PERIOD_SECONDS).toBe(86_400);
    // A refused validation refuses every address after it: at once (review S3).
    expect(MAIL_VALIDATION_REFUSED_PERIOD_SECONDS).toBe(300);
    expect(source('apps/web/src/lib/screening/validation.ts')).toContain(`validationRefused: '${MAIL_VALIDATION_REFUSED_CODE}'`);
  });

  it('alarms when a probe could not be sent in each of three five-minute periods, long before a stream\'s readiness lapses at 48 hours (review M3)', () => {
    const metricName = mailCodeMetricName(MAIL_PROBE_UNSENT_ALARM.code);
    expect(metricName).toBe('MailProbeUnsent');
    const filter = resourcesOf(template, 'AWS::Logs::MetricFilter').find(([, candidate]) => JSON.stringify(propertiesOf(candidate).MetricTransformations).includes(`"MetricName":"${metricName}"`));
    expect(filter).toBeDefined();
    expect(propertiesOf((filter as [string, CfnResource])[1])).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.platformLogGroup)),
      FilterPattern: `{ $.error_code = "${MAIL_PROBE_UNSENT_ALARM.code}" }`,
      MetricTransformations: [{ MetricNamespace: MAIL_NAMESPACE, MetricName: metricName, MetricValue: '1', Unit: 'Count' }],
    });
    const unsent = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, stack.monitoring.mailProbeUnsentAlarm)));
    expect(unsent).toMatchObject({
      Namespace: MAIL_NAMESPACE,
      MetricName: metricName,
      Statistic: 'Sum',
      Period: 300,
      EvaluationPeriods: 3,
      DatapointsToAlarm: 3,
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [ref(logicalIdOf(stack, stack.monitoring.operatorTopic))],
    });
    expect(unsent.Dimensions).toBeUndefined();
    // The probes go a day apart and readiness lapses 48 hours after the last one came back: the alarm's 15 minutes of
    // failed sends leave the operator about a day.
    expect(MAIL_PROBE_UNSENT_ALARM).toEqual({ code: 'MAIL_PROBE_UNSENT', periodSeconds: 300, periods: 3 });
    expect(MAIL_PROBE_UNSENT_ALARM.periodSeconds * MAIL_PROBE_UNSENT_ALARM.periods).toBeLessThan(24 * 3600);
    expect(unsent.AlarmDescription).toContain('docs/runbooks/deliverability.md, 3.7');
  });

  it('has seventeen mail alarms', () => {
    const mail = resourcesOf(template, 'AWS::CloudWatch::Alarm').filter(([, alarm]) => {
      const properties = propertiesOf(alarm);
      return properties.Namespace === MAIL_NAMESPACE || properties.Namespace === 'AWS/SES' || (properties.Namespace === 'AWS/SQS' && JSON.stringify(properties.Dimensions).includes('MailStreamsEvents'));
    });
    expect(mail).toHaveLength(17);
  });

  it('outputs every DNS record the founder sets at the registrar, and the sets and queues', () => {
    const outputs = (template.toJSON() as { Outputs: Record<string, { Value: unknown }> }).Outputs;
    for (const prefix of ['Mail', 'ScreeningMail']) {
      for (const name of ['DkimRecord1', 'DkimRecord2', 'DkimRecord3', 'MailFromMxRecord', 'MailFromSpfRecord', 'DmarcRecord']) {
        expect(outputs[`${prefix}${name}`], `${prefix}${name}`).toBeDefined();
      }
    }
    const identity = logicalIdOf(stack, stack.mailStreams.screeningIdentity);
    expect(outputs.ScreeningMailDkimRecord1?.Value).toEqual({ 'Fn::Join': [' ', [getAtt(identity, 'DkimDNSTokenName1'), 'CNAME', getAtt(identity, 'DkimDNSTokenValue1')]] });
    expect(JSON.stringify(outputs.ScreeningMailMailFromMxRecord?.Value)).toContain(' MX 10 feedback-smtp.');
    expect(JSON.stringify(outputs.ScreeningMailMailFromSpfRecord?.Value)).toContain('v=spf1 include:amazonses.com -all');
    expect(JSON.stringify(outputs.ScreeningMailDmarcRecord?.Value)).toContain('v=DMARC1; p=reject; adkim=s; aspf=r');
    expect(JSON.stringify(outputs.MailDmarcRecord?.Value)).toContain('v=DMARC1; p=none');
    expect(outputs.MailEventsQueueUrl?.Value).toEqual(ref(queueId));
    for (const stream of MAIL_STREAMS) {
      expect(outputs[`MailConfigurationSet${stream.charAt(0).toUpperCase()}${stream.slice(1)}`]?.Value, stream).toEqual(ref(setId(stream)));
    }
  });
});
