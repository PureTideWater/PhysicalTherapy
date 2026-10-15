import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { urlPhiFindings } from '@tp/observability';

/**
 * Email, links only (PRD 15, Stack: "SES; links only, never PHI in a body"; CLAUDE.md: no PHI in an
 * email body). A message is fixed text, counts and links to the application; the links are checked
 * by the PHI guard before anything is sent. SES in deployed environments; a local outbox directory
 * in development and tests.
 */

export interface MailMessage {
  readonly to: readonly string[];
  readonly subject: string;
  /** Fixed sentences written by this codebase, with counts; never a record's values. */
  readonly lines: readonly string[];
  /** Links into the application: opaque IDs only. */
  readonly links: readonly string[];
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export class MailPhiError extends Error {
  override readonly name = 'MailPhiError';
}

/** The body as sent: the lines, then each link on its own line. Refuses a link the PHI guard flags. */
export function mailBody(message: MailMessage): string {
  for (const link of message.links) {
    const url = new URL(link);
    if (urlPhiFindings(`${url.pathname}${url.search}`).length > 0) {
      throw new MailPhiError('a notice link may carry PHI; nothing was sent');
    }
  }
  return [...message.lines, '', ...message.links].join('\n');
}

/** SES (the account's verified sender; the configuration set and identity arrive with milestone 11). */
export class SesMailSender implements MailSender {
  constructor(private readonly options: { readonly client: Pick<SESv2Client, 'send'>; readonly from: string }) {}

  async send(message: MailMessage): Promise<void> {
    await this.options.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.options.from,
        Destination: { ToAddresses: [...message.to] },
        Content: { Simple: { Subject: { Data: message.subject, Charset: 'UTF-8' }, Body: { Text: { Data: mailBody(message), Charset: 'UTF-8' } } } },
      }),
    );
  }
}

export function sesMailSender(from: string): SesMailSender {
  return new SesMailSender({ client: new SESv2Client({}), from });
}

/** Development: each message is a JSON file in a directory, named by opaque IDs. */
export class LocalMailSender implements MailSender {
  constructor(private readonly dir: string) {}

  async send(message: MailMessage): Promise<void> {
    const body = mailBody(message);
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, `${String(Date.now())}-${randomUUID()}.json`), `${JSON.stringify({ to: message.to, subject: message.subject, body })}\n`, { mode: 0o600 });
  }
}

/** Tests: messages kept in memory. */
export class MemoryMailSender implements MailSender {
  readonly sent: (MailMessage & { readonly body: string })[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message, body: mailBody(message) });
    return Promise.resolve();
  }
}
