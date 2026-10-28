import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCREENING_MAIL_ACTIONS } from '../lib/constructs/screening-role';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, logicalIdOf, propertiesOf, resourceById, roleStatements, synthesized } from './synth';

/**
 * The screening consumer's task role (docs/adr/0049, 0062; PR 6b-3, the plan's G4): it emails a screening result from
 * results@screening.<domain> through SES, through the screening stream's own identity and set alone (PR 6b-4; docs/adr/0065;
 * the plan's G4), and nothing else.
 */
describe('the screening role\'s actions match what the consumer sends', () => {
  it('covers the one SES command the mail sender makes, and the consumer calls no other AWS service', () => {
    const mail = readFileSync(path.resolve(import.meta.dirname, '../../apps/worker/src/mail/mail.ts'), 'utf8');
    expect([...new Set([...mail.matchAll(/new (\w+Command)\(/g)].map((match) => match[1]))]).toEqual(['SendEmailCommand']);
    expect([...SCREENING_MAIL_ACTIONS]).toEqual(['ses:SendEmail']);
    // The consumer's own code (the screening and its threads) imports no AWS client of its own.
    for (const file of ['apps/worker/src/screening/job.ts', 'apps/worker/src/screening/thread.ts', 'apps/worker/src/screening/consumer.ts', 'apps/worker/src/screening/threads.ts']) {
      expect(readFileSync(path.resolve(import.meta.dirname, '../..', file), 'utf8'), file).not.toMatch(/@aws-sdk\//);
    }
  });
});

describe.each(ENVIRONMENTS)('%s: screening role', (environment) => {
  const { stack, template } = synthesized(environment);
  const roleId = logicalIdOf(stack, stack.screeningRole.role);
  const statements = roleStatements(template, roleId);

  it('is assumed by ECS tasks of this account only, and has no managed policy', () => {
    const role = propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId));
    expect(role.AssumeRolePolicyDocument).toEqual({
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
          Effect: 'Allow',
          Principal: { Service: 'ecs-tasks.amazonaws.com' },
        },
      ],
      Version: '2012-10-17',
    });
    expect(role.ManagedPolicyArns).toBeUndefined();
    expect(role.Policies).toBeUndefined();
  });

  it('sends email only through the screening identity and the screening set, and only from results@screening.<domain>', () => {
    expect(statements).toHaveLength(1);
    const send = statements[0] as CfnStatement;
    expect(send).toMatchObject({ Sid: 'ScreeningResultEmail', Effect: 'Allow', Action: 'ses:SendEmail' });
    const domain = { 'Fn::Select': [1, { 'Fn::Split': ['@', { Ref: PARAMETER_NAMES.mailFromAddress }] }] };
    expect(send.Condition).toEqual({ StringEquals: { 'ses:FromAddress': { 'Fn::Join': ['', ['results@screening.', domain]] } } });
    const resources = send.Resource as unknown[];
    expect(resources).toHaveLength(2);
    const text = JSON.stringify(resources);
    expect(text).toContain(logicalIdOf(stack, stack.mailStreams.screeningIdentity));
    expect(text).toContain(`:configuration-set/tp-${environment}-screening`);
    // Never MailFromAddress's identity, another stream's set or every identity of the account.
    expect(text).not.toContain(logicalIdOf(stack, stack.mailStreams.mailIdentity));
    expect(text).not.toContain(`tp-${environment}-transactional`);
    expect(text).not.toContain(`tp-${environment}-notices`);
    expect(text).not.toContain('identity/*');
  });

  it('reads no secret, bucket, key, queue or model: the login reaches the container through the execution role', () => {
    const text = JSON.stringify(statements);
    for (const forbidden of ['secretsmanager:', 's3:', 'kms:', 'sqs:', 'bedrock:', 'rds:', 'textract:', 'ses:SendRawEmail', 'ses:*', 'ses:Put', 'ses:Get']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});
