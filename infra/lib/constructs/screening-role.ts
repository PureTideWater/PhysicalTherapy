import { Stack, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** The one call the screening consumer makes to AWS itself (apps/worker/src/mail/mail.ts, SendEmailCommand). */
export const SCREENING_MAIL_ACTIONS = ['ses:SendEmail'] as const;

export interface ScreeningRoleProps {
  /** results@screening.<domain>: the one sender the consumer may name (Q12). */
  readonly screeningMailFromAddress: string;
  /** The screening stream's own SES identity (MailStreams). */
  readonly screeningIdentityArn: string;
  /** The screening stream's configuration set (MailStreams): every result goes through it. */
  readonly screeningConfigurationSetArn: string;
}

/**
 * The task role of the screening consumer (WORKER_JOBS=screening; docs/adr/0049, 0062; the plan's G4): it emails a
 * prospect the link to their result through SES, and does nothing else with AWS. The login's secret reaches the
 * container through the execution role, as every task's does, so this role reads no secret, no bucket and no key.
 *
 * Sending is scoped to the screening stream (PR 6b-4; docs/adr/0065; the plan's G4): its own identity
 * (screening.<domain>) and its configuration set, and only with results@screening.<domain> as the sender
 * (`ses:FromAddress`). SES authorizes a send with a configuration set against both resources, so the consumer can send
 * through no other identity and no other set: never the transactional or notices streams, whose suppression and
 * reputation the screening must not touch. It reads and changes no set and reads no queue: pausing the stream is the
 * platform's (OperatorRole).
 */
export class ScreeningRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ScreeningRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);

    this.role = new iam.Role(this, 'Role', {
      description: 'The screening consumer: emails a screening result through the screening stream, and nothing else',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ScreeningResultEmail',
        actions: [...SCREENING_MAIL_ACTIONS],
        resources: [props.screeningIdentityArn, props.screeningConfigurationSetArn],
        conditions: { StringEquals: { 'ses:FromAddress': props.screeningMailFromAddress } },
      }),
    );
  }
}
