import { runInNewContext } from 'node:vm';

import {
  COGNITO_MESSAGE_FALLBACK,
  COGNITO_MESSAGE_SIGN_IN_ENV,
  COGNITO_MESSAGE_SOURCE,
  INVITATION_DAYS as WORDS_INVITATION_DAYS,
  SIGN_IN_CODE_MINUTES,
  fallbackCodeMessage,
  fallbackInvitationMessage,
} from '@tp/auth-mail';
import { describe, expect, it } from 'vitest';

import { COGNITO_MESSAGES_NAMESPACE, COGNITO_MESSAGE_FALLBACK_METRIC, COGNITO_MESSAGE_TIMEOUT } from '../lib/constructs/cognito-messages';
import { INVITATION_DAYS, TOKEN_LIFETIMES } from '../lib/constructs/identity';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { LOG_RETENTION_DAYS, logGroupName } from '../lib/log-groups';
import { type CfnResource, actionsOf, getAtt, keyId, logicalIdOf, onlyResource, propertiesOf, ref, resourceById, resourcesOf, roleStatements, synthesized } from './synth';

/** A Fn::Join of strings and the AppDomainName parameter, read with the parameter named. */
function joined(value: unknown, domain: string): string {
  const join = (value as { 'Fn::Join'?: [string, unknown[]] })['Fn::Join'];
  if (join === undefined) {
    throw new Error(`not a join: ${JSON.stringify(value)}`);
  }
  return join[1]
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (JSON.stringify(part) === JSON.stringify(ref(PARAMETER_NAMES.appDomainName))) {
        return domain;
      }
      throw new Error(`an unexpected part: ${JSON.stringify(part)}`);
    })
    .join(join[0]);
}

/** The inline handler as Lambda runs it, with a console that records: the one line it logs for an event it leaves to the fallback. */
function fallbackLine(event: Record<string, unknown>): string {
  const lines: string[] = [];
  const record = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  const context = { exports: {} as { handler?: (event: unknown) => Promise<unknown> }, process: { env: {} }, console: { log: record, info: record, warn: record, error: record } };
  runInNewContext(COGNITO_MESSAGE_SOURCE, context);
  void context.exports.handler?.(event);
  if (lines.length !== 1) {
    throw new Error(`expected one line, got ${String(lines.length)}`);
  }
  return lines[0] ?? '';
}

/**
 * CloudWatch Logs' matching of a filter pattern against one log event, for the only kind this group's filter may use:
 * quoted terms, each of which must appear in the event. A JSON selector ({ $.field ... }) matches only an event that is
 * a whole JSON document, which a text-format Lambda line never is, so it is refused here.
 */
function textPatternMatches(pattern: string, event: string): boolean {
  if (pattern.trim().startsWith('{')) {
    throw new Error(`a JSON selector pattern never matches a text-format Lambda line: ${pattern}`);
  }
  const terms = [...pattern.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => (match[1] ?? '').replace(/\\(.)/g, '$1'));
  if (terms.length === 0) {
    throw new Error(`not a quoted-term pattern: ${pattern}`);
  }
  return terms.every((term) => event.includes(term));
}

/**
 * The user pool's CustomMessage trigger (SGN-13, SGN-14; docs/adr/0081, the code-email amendment): every message the
 * pool sends in the brand's words, from a small, contained function that only Cognito invokes, with the pool's own
 * templates as the branded generic fallback.
 */
describe.each(ENVIRONMENTS)('%s: the user pool’s messages', (environment) => {
  const { stack, template } = synthesized(environment);
  const messages = stack.identity.messages;
  const [poolId, pool] = onlyResource(template, 'AWS::Cognito::UserPool');
  const poolProperties = propertiesOf(pool);
  const functionId = logicalIdOf(stack, messages.handler);
  const fn = propertiesOf(resourceById(template, 'AWS::Lambda::Function', functionId));
  const logGroupId = logicalIdOf(stack, messages.logGroup);
  const topic = ref(logicalIdOf(stack, stack.monitoring.operatorTopic));

  it('sends every message through the function, as the pool’s CustomMessage trigger', () => {
    expect(poolProperties.LambdaConfig).toEqual({ CustomMessage: getAtt(functionId, 'Arn') });
  });

  it('runs the words’ own inline source on Node 22, arm64, 128 MB, inside Cognito’s wait, outside any VPC, with one variable', () => {
    expect(fn).toMatchObject({ Runtime: 'nodejs22.x', Architectures: ['arm64'], MemorySize: 128, Timeout: 3, Handler: 'index.handler' });
    expect(COGNITO_MESSAGE_TIMEOUT.toSeconds()).toBeLessThan(5);
    expect((fn.Code as { ZipFile: unknown }).ZipFile).toBe(COGNITO_MESSAGE_SOURCE);
    expect(fn.VpcConfig).toBeUndefined();
    expect(fn.Layers).toBeUndefined();
    expect(fn.ReservedConcurrentExecutions).toBeUndefined();
    const variables = (fn.Environment as { Variables: Record<string, unknown> }).Variables;
    expect(Object.keys(variables)).toEqual([COGNITO_MESSAGE_SIGN_IN_ENV]);
    expect(joined(variables[COGNITO_MESSAGE_SIGN_IN_ENV], 'app.synthetic.test')).toBe('https://app.synthetic.test/sign-in');
    expect(fn.LoggingConfig).toEqual({ LogGroup: ref(logGroupId) });
  });

  it('has a role of its own that writes its own log group and nothing else, with no managed policy', () => {
    const roleId = (fn.Role as { 'Fn::GetAtt': [string, string] })['Fn::GetAtt'][0];
    const role = propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId));
    expect(role.ManagedPolicyArns).toBeUndefined();
    expect(role.Policies).toBeUndefined();
    expect(role.AssumeRolePolicyDocument).toEqual({
      Version: '2012-10-17',
      Statement: [{ Action: 'sts:AssumeRole', Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } } }],
    });
    const statements = roleStatements(template, roleId);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.Effect).toBe('Allow');
    expect(actionsOf(statements[0] as never).sort()).toEqual(['logs:CreateLogStream', 'logs:PutLogEvents']);
    expect(statements[0]?.Resource).toEqual(getAtt(logGroupId, 'Arn'));
    // No other resource names this role.
    const users = resourcesOf(template, 'AWS::Lambda::Function').filter(([, other]) => JSON.stringify(propertiesOf(other).Role) === JSON.stringify(getAtt(roleId, 'Arn')));
    expect(users.map(([id]) => id)).toEqual([functionId]);
  });

  it('may be invoked by Cognito only, for this pool and this account', () => {
    const permissions = resourcesOf(template, 'AWS::Lambda::Permission').filter(([, permission]) => JSON.stringify(propertiesOf(permission).FunctionName) === JSON.stringify(getAtt(functionId, 'Arn')));
    expect(permissions.map(([, permission]) => propertiesOf(permission))).toEqual([
      { Action: 'lambda:InvokeFunction', FunctionName: getAtt(functionId, 'Arn'), Principal: 'cognito-idp.amazonaws.com', SourceArn: getAtt(poolId, 'Arn'), SourceAccount: { Ref: 'AWS::AccountId' } },
    ]);
  });

  it('logs to /tp/<env>/cognito-messages under the environment key, kept a year and retained', () => {
    const group: CfnResource = resourceById(template, 'AWS::Logs::LogGroup', logGroupId);
    expect(propertiesOf(group)).toMatchObject({ LogGroupName: logGroupName(environment, 'cognito-messages'), KmsKeyId: getAtt(keyId(template), 'Arn'), RetentionInDays: LOG_RETENTION_DAYS });
    expect(group.DeletionPolicy).toBe('Retain');
  });

  it('alarms the operator on the function’s errors and throttles, and on a message left to the fallback', () => {
    const failure = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, messages.failureAlarm)));
    expect(failure).toMatchObject({ ComparisonOperator: 'GreaterThanOrEqualToThreshold', Threshold: 1, EvaluationPeriods: 1, TreatMissingData: 'notBreaching', AlarmActions: [topic] });
    const metrics = failure.Metrics as { Id: string; Expression?: string; MetricStat?: { Metric: { MetricName: string; Namespace: string; Dimensions: unknown[] }; Period: number; Stat: string } }[];
    expect(metrics.find((metric) => metric.Expression !== undefined)?.Expression).toBe('errors + throttles');
    expect(metrics.filter((metric) => metric.MetricStat !== undefined).map((metric) => [metric.Id, metric.MetricStat?.Metric.Namespace, metric.MetricStat?.Metric.MetricName, metric.MetricStat?.Period, metric.MetricStat?.Stat, metric.MetricStat?.Metric.Dimensions])).toEqual([
      ['errors', 'AWS/Lambda', 'Errors', 300, 'Sum', [{ Name: 'FunctionName', Value: ref(functionId) }]],
      ['throttles', 'AWS/Lambda', 'Throttles', 300, 'Sum', [{ Name: 'FunctionName', Value: ref(functionId) }]],
    ]);
    expect(String(failure.AlarmDescription)).not.toMatch(/\$|\{/);
    expect(failure.AlarmDescription).toContain('docs/runbooks/deliverability.md, 3.9');

    const filters = resourcesOf(template, 'AWS::Logs::MetricFilter').filter(([, candidate]) => JSON.stringify(propertiesOf(candidate).LogGroupName) === JSON.stringify(ref(logGroupId)));
    expect(filters).toHaveLength(1);
    expect(propertiesOf((filters[0] as [string, CfnResource])[1])).toMatchObject({
      FilterPattern: `"${COGNITO_MESSAGE_FALLBACK}"`,
      MetricTransformations: [{ MetricNamespace: COGNITO_MESSAGES_NAMESPACE, MetricName: COGNITO_MESSAGE_FALLBACK_METRIC, MetricValue: '1', Unit: 'Count' }],
    });
    const fallback = propertiesOf(resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, messages.fallbackAlarm)));
    expect(fallback).toMatchObject({
      Namespace: COGNITO_MESSAGES_NAMESPACE,
      MetricName: COGNITO_MESSAGE_FALLBACK_METRIC,
      Statistic: 'Sum',
      Period: 300,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      Threshold: 1,
      TreatMissingData: 'notBreaching',
      AlarmActions: [topic],
    });
    expect(fallback.AlarmDescription).toContain('docs/runbooks/deliverability.md, 3.9');
  });

  it('counts the line the handler really logs on a fallback, as the Node 22 runtime writes it to the log group', () => {
    const filters = resourcesOf(template, 'AWS::Logs::MetricFilter').filter(([, candidate]) => JSON.stringify(propertiesOf(candidate).LogGroupName) === JSON.stringify(ref(logGroupId)));
    const pattern = String(propertiesOf((filters[0] as [string, CfnResource])[1]).FilterPattern);
    // The function sets no LoggingConfig.LogFormat, so the runtime writes console.log as text with a prefix.
    expect((fn.LoggingConfig as { LogFormat?: unknown }).LogFormat).toBeUndefined();
    const line = fallbackLine({ triggerSource: 'CustomMessage_Unknown', request: {}, response: {} });
    const text = `2026-11-05T04:00:00.000Z\tsynthetic-request-id\tINFO\t${line}\n`;
    expect(textPatternMatches(pattern, text)).toBe(true);
    expect(textPatternMatches(pattern, '2026-11-05T04:00:00.000Z\tsynthetic-request-id\tINFO\tsome other line\n')).toBe(false);
  });

  it('sets the pool’s own templates to the branded, generic fallback: the code with {####}, the invitation with {username}, {####} and its sign-in page', () => {
    const code = fallbackCodeMessage();
    expect(poolProperties.VerificationMessageTemplate).toMatchObject({ DefaultEmailOption: 'CONFIRM_WITH_CODE', EmailSubject: code.subject, EmailMessage: code.html });
    // CDK's default SMS words stay in the template, but the pool cannot send a text: it has no SMS configuration.
    expect(poolProperties.SmsConfiguration).toBeUndefined();
    const invite = (poolProperties.AdminCreateUserConfig as { InviteMessageTemplate: { EmailSubject: string; EmailMessage: unknown } }).InviteMessageTemplate;
    const expected = fallbackInvitationMessage('https://app.synthetic.test/sign-in');
    expect(invite.EmailSubject).toBe(expected.subject);
    expect(joined(invite.EmailMessage, 'app.synthetic.test')).toBe(expected.html);
  });

  it('sends Cognito’s mail in phase 2 as PaidWhole <MailFromAddress>', () => {
    const configuration = (poolProperties.EmailConfiguration as { 'Fn::If': [string, { From: unknown }, unknown] })['Fn::If'][1];
    expect(configuration.From).toEqual({ 'Fn::Join': ['', ['PaidWhole <', { Ref: PARAMETER_NAMES.mailFromAddress }, '>']] });
  });
});

describe('the words keep the pool’s numbers', () => {
  it('7 days and 3 minutes are identity.ts’s', () => {
    expect(WORDS_INVITATION_DAYS).toBe(INVITATION_DAYS);
    expect(SIGN_IN_CODE_MINUTES).toBe(TOKEN_LIFETIMES.authSession.toMinutes());
  });
});
