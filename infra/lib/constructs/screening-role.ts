import { Stack, aws_iam as iam } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/** The one call the screening consumer makes to AWS itself (apps/worker/src/mail/mail.ts, SendEmailCommand). */
export const SCREENING_MAIL_ACTIONS = ['ses:SendEmail'] as const;

export interface ScreeningRoleProps {
  /** MailFromAddress: the one sender the consumer may name. */
  readonly mailFromAddress: string;
  /** Its domain: the verified SES identity the address sends through. */
  readonly mailFromDomain: string;
}

/**
 * The task role of the screening consumer (WORKER_JOBS=screening; docs/adr/0049, 0062; the plan's G4): it emails a
 * prospect the link to their result through SES, and does nothing else with AWS. The login's secret reaches the
 * container through the execution role, as every task's does, so this role reads no secret, no bucket and no key.
 *
 * Sending is scoped to MailFromAddress: the identity it sends through (its domain, or the address itself where that is
 * verified too), and only with that address as the sender (`ses:FromAddress`). Once the screening's own sending
 * identity and configuration set exist (PR 6b-4), the role is narrowed to them.
 */
export class ScreeningRole extends Construct {
  readonly role: iam.Role;

  constructor(scope: Construct, id: string, props: ScreeningRoleProps) {
    super(scope, id);
    const stack = Stack.of(this);
    const identity = (name: string) => `arn:${stack.partition}:ses:${stack.region}:${stack.account}:identity/${name}`;

    this.role = new iam.Role(this, 'Role', {
      description: 'The screening consumer: emails a screening result from MailFromAddress, and nothing else',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        conditions: { StringEquals: { 'aws:SourceAccount': stack.account } },
      }),
    });
    this.role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ScreeningResultEmail',
        actions: [...SCREENING_MAIL_ACTIONS],
        resources: [identity(props.mailFromDomain), identity(props.mailFromAddress)],
        conditions: { StringEquals: { 'ses:FromAddress': props.mailFromAddress } },
      }),
    );
  }
}
