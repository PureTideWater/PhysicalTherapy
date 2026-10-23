import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCREENING_MAIL_ACTIONS } from '../lib/constructs/screening-role';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { type CfnStatement, logicalIdOf, propertiesOf, resourceById, roleStatements, synthesized } from './synth';

/**
 * The screening consumer's task role (docs/adr/0049, 0062; PR 6b-3, the plan's G4): it emails a screening result from
 * MailFromAddress through SES, and nothing else. PR 6b-4 narrows it to the screening's own identity and set.
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

  it('sends email only through MailFromAddress\'s identity, and only from that address', () => {
    expect(statements).toHaveLength(1);
    const send = statements[0] as CfnStatement;
    expect(send).toMatchObject({ Sid: 'ScreeningResultEmail', Effect: 'Allow', Action: 'ses:SendEmail' });
    expect(send.Condition).toEqual({ StringEquals: { 'ses:FromAddress': { Ref: PARAMETER_NAMES.mailFromAddress } } });
    const resources = JSON.stringify(send.Resource);
    expect(resources).toContain(':identity/');
    expect(resources).toContain(`{"Ref":"${PARAMETER_NAMES.mailFromAddress}"}`);
    // The domain is MailFromAddress's own (the part after the @), never every identity of the account.
    expect(resources).toContain('"Fn::Split":["@",{"Ref":"MailFromAddress"}]');
    expect(resources).not.toContain('identity/*');
  });

  it('reads no secret, bucket, key, queue or model: the login reaches the container through the execution role', () => {
    const text = JSON.stringify(statements);
    for (const forbidden of ['secretsmanager:', 's3:', 'kms:', 'sqs:', 'bedrock:', 'rds:', 'textract:', 'ses:SendRawEmail', 'ses:*']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });
});
