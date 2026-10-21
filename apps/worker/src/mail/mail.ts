import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { urlPhiFindings } from '@tp/observability';

import { brandedSubject, mailHtml, senderAddress } from './template';

/**
 * Email, links only (PRD 15, Stack: "SES; links only, never PHI in a body"; CLAUDE.md: no PHI in an
 * email body). A message is fixed text, counts and links to the application; the links are checked
 * by the PHI guard before anything is sent. SES in deployed environments; a local outbox directory
 * in development and tests. Each message goes as plain text and as the PaidWhole HTML template
 * (template.ts: the same lines and links under the branded header, whose lockup the CloudFront static host
 * serves, STATIC_ASSET_ORIGIN; without one, a local build, the HTML goes without the art), from "PaidWhole"
 * at the configured address, its subject followed by the product's name.
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
 * header image the static host at `staticOrigin` serves (STATIC_ASSET_ORIGIN), or which goes without it (null).
 */
export function mailBodyHtml(message: MailMessage, staticOrigin: string | null): string {
  mailBody(message);
  return mailHtml(message.subject, message.lines, message.links, staticOrigin);
}

/** SES (the account's verified sender; the configuration set and identity arrive with milestone 11). */
export class SesMailSender implements MailSender {
  constructor(private readonly options: { readonly client: Pick<SESv2Client, 'send'>; readonly from: string; readonly staticOrigin: string | null }) {}

  async send(message: MailMessage): Promise<void> {
    await this.options.client.send(
      new SendEmailCommand({
        FromEmailAddress: senderAddress(this.options.from),
        Destination: { ToAddresses: [...message.to] },
        Content: {
          Simple: {
            Subject: { Data: brandedSubject(message.subject), Charset: 'UTF-8' },
            Body: { Text: { Data: mailBody(message), Charset: 'UTF-8' }, Html: { Data: mailBodyHtml(message, this.options.staticOrigin), Charset: 'UTF-8' } },
          },
        },
      }),
    );
  }
}

export function sesMailSender(from: string, staticOrigin: string | null): SesMailSender {
  return new SesMailSender({ client: new SESv2Client({}), from, staticOrigin });
}

/**
 * Development: each message is a JSON file in a directory, named by opaque IDs. It is written under a hidden name and
 * renamed into place, so a reader of the outbox (the e2e monitoring journey polls it) never reads a message half
 * written.
 */
export class LocalMailSender implements MailSender {
  constructor(
    private readonly dir: string,
    private readonly staticOrigin: string | null,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const body = mailBody(message);
    const html = mailBodyHtml(message, this.staticOrigin);
    await mkdir(this.dir, { recursive: true });
    const name = `${String(Date.now())}-${randomUUID()}`;
    const partial = path.join(this.dir, `.${name}.partial`);
    await writeFile(partial, `${JSON.stringify({ to: message.to, subject: brandedSubject(message.subject), body, html })}\n`, { mode: 0o600 });
    await rename(partial, path.join(this.dir, `${name}.json`));
  }
}

/** Tests: messages kept in memory (their HTML without the art, as a local build sends it, unless a static host is given). */
export class MemoryMailSender implements MailSender {
  readonly sent: (MailMessage & { readonly body: string; readonly html: string })[] = [];

  constructor(private readonly staticOrigin: string | null = null) {}

  send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message, body: mailBody(message), html: mailBodyHtml(message, this.staticOrigin) });
    return Promise.resolve();
  }
}
