import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENVIRONMENTS } from '../lib/environments';
import { HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_MESSAGE, HEARTBEAT_METRIC, MISSED_HEARTBEATS_TO_ALARM, workerLogGroupName } from '../lib/heartbeat';
import { type CfnStatement, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, synthesized } from './synth';

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

/** PRD 19, monitoring: "worker heartbeat (two misses alert)"; test matrix JOB-04. */
describe.each(ENVIRONMENTS)('%s: worker heartbeat and operator alerts', (environment) => {
  const { stack, template } = synthesized(environment);
  const topic = ref(logicalIdOf(stack, stack.monitoring.operatorTopic));

  it('keeps the worker log group encrypted for a year', () => {
    const [id, group] = onlyResource(template, 'AWS::Logs::LogGroup');
    expect(propertiesOf(group)).toMatchObject({
      LogGroupName: workerLogGroupName(environment),
      RetentionInDays: 365,
      KmsKeyId: getAtt(keyId(template), 'Arn'),
    });
    expect(id).toBe(logicalIdOf(stack, stack.monitoring.workerLogGroup));
  });

  it('counts each heartbeat line as the custom heartbeat metric', () => {
    const [, filter] = onlyResource(template, 'AWS::Logs::MetricFilter');
    expect(propertiesOf(filter)).toEqual({
      LogGroupName: ref(logicalIdOf(stack, stack.monitoring.workerLogGroup)),
      FilterPattern: `{ $.msg = "${HEARTBEAT_MESSAGE}" }`,
      MetricTransformations: [
        { MetricNamespace: HEARTBEAT_METRIC.namespace, MetricName: HEARTBEAT_METRIC.metricName, MetricValue: '1', Unit: 'Count' },
      ],
    });
  });

  it('alarms when two consecutive heartbeat periods are empty, missing data counting as missed', () => {
    const [, alarm] = onlyResource(template, 'AWS::CloudWatch::Alarm');
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
    const [, alarm] = onlyResource(template, 'AWS::CloudWatch::Alarm');
    expect(propertiesOf(alarm).AlarmActions).toEqual([topic]);
    expect(propertiesOf(alarm).OKActions).toEqual([topic]);
    expect(propertiesOf(alarm).AlarmDescription).toBe(`The ${environment} worker missed 2 consecutive heartbeats.`);
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
