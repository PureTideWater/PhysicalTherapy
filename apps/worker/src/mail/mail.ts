import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { urlPhiFindings } from '@tp/observability';

import { brandedSubject, mailHtml, senderAddress } from './template';

/**
 * Email, links only (PRD 15, Stack: "SES; links only, never PHI in a body"; CLAUDE.md: no PHI in an
 * email body). A message is fixed text, counts and links to the application; the links are checked
 * by the PHI guard before anything is sent. SES in deployed environments; a local outbox directory
 * in development and tests. Each message goes as plain text and as the PaidWhole HTML template
 * (template.ts: the same lines and links under the branded header), from "PaidWhole" at the configured
 * address, its subject followed by the product's name.
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

/**
 * The HTML alternative as sent: checked exactly as the text body is, then set in the brand's template, whose
 * header image is served by the application at `origin` (APP_ORIGIN).
 */
export function mailBodyHtml(message: MailMessage, origin: string): string {
  mailBody(message);
  return mailHtml(message.subject, message.lines, message.links, origin);
}

/** SES (the account's verified sender; the configuration set and identity arrive with milestone 11). */
export class SesMailSender implements MailSender {
  constructor(private readonly options: { readonly client: Pick<SESv2Client, 'send'>; readonly from: string; readonly origin: string }) {}

  async send(message: MailMessage): Promise<void> {
    await this.options.client.send(
      new SendEmailCommand({
        FromEmailAddress: senderAddress(this.options.from),
        Destination: { ToAddresses: [...message.to] },
        Content: {
          Simple: {
            Subject: { Data: brandedSubject(message.subject), Charset: 'UTF-8' },
            Body: { Text: { Data: mailBody(message), Charset: 'UTF-8' }, Html: { Data: mailBodyHtml(message, this.options.origin), Charset: 'UTF-8' } },
          },
        },
      }),
    );
  }
}

export function sesMailSender(from: string, origin: string): SesMailSender {
  return new SesMailSender({ client: new SESv2Client({}), from, origin });
}

/** Development: each message is a JSON file in a directory, named by opaque IDs. */
export class LocalMailSender implements MailSender {
  constructor(
    private readonly dir: string,
    private readonly origin: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const body = mailBody(message);
    const html = mailBodyHtml(message, this.origin);
    await mkdir(this.dir, { recursive: true });
    await writeFile(path.join(this.dir, `${String(Date.now())}-${randomUUID()}.json`), `${JSON.stringify({ to: message.to, subject: brandedSubject(message.subject), body, html })}\n`, { mode: 0o600 });
  }
}

/** Tests: messages kept in memory (their HTML set for the local application unless an origin is given). */
export class MemoryMailSender implements MailSender {
  readonly sent: (MailMessage & { readonly body: string; readonly html: string })[] = [];

  constructor(private readonly origin = 'http://localhost:3000') {}

  send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message, body: mailBody(message), html: mailBodyHtml(message, this.origin) });
    return Promise.resolve();
  }
}
