import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { MailStream } from '@tp/db';
import { urlPhiFindings } from '@tp/observability';

import type { MailConfig } from '../config';
import { localMailEvents } from './events';
import { DEVELOPMENT_MAIL_STREAM_PREFIX, type MailIdentity, configurationSetName, mailTags } from './streams';
import { type MailVariant, brandedSubject, mailHtml, senderAddress } from './template';

export type { MailVariant } from './template';
export type { MailIdentity } from './streams';

/**
 * Email, links only (PRD 15, Stack: "SES; links only, never PHI in a body"; CLAUDE.md: no PHI in an
 * email body). A message is fixed text, counts and links to the application; the links are checked
 * by the PHI guard before anything is sent. SES in deployed environments; a local outbox directory
 * in development and tests. Each message goes as plain text and as the PaidWhole HTML template
 * (template.ts: the same lines and links under the branded header, whose lockup the CloudFront static host
 * serves, STATIC_ASSET_ORIGIN; without one, a local build, the HTML goes without the art), from "PaidWhole"
 * at its stream's address, its subject followed by the product's name.
 *
 * Each message has one recipient and goes through its stream's SES configuration set with its identity as tags
 * (streams.ts; audit #76, docs/adr/0065): the sender returns SES's message ID, by which the platform's mail_events job
 * records every event of the message. The screening stream's messages go from the screening's own sender with
 * Reply-To the support address (the founder's Q12 ruling of 2026-10-21).
 */

/** What a message says and to whom: one address, fixed sentences and links. */
export interface MailContent {
  /** Exactly one address: a message never names two recipients (SEC-19). An array, as the local outbox writes it. */
  readonly to: readonly string[];
  readonly subject: string;
  /** Fixed sentences written by this codebase, with counts; never a record's values. */
  readonly lines: readonly string[];
  /** Links into the application: opaque IDs only. */
  readonly links: readonly string[];
  /**
   * Who reads it (template.ts): a customer, the default, or a prospect without an account (a screening's link),
   * whose message carries the lockup without the tagline (decision D11) and a footer that says why it came.
   */
  readonly variant?: MailVariant;
}

/** A message as sent: its content and its identity (stream, kind, subject, practice, recipient), which go as SES tags. */
export interface MailMessage extends MailContent {
  readonly identity: MailIdentity;
}

/** What the mail service gave back for an accepted message: its ID, which every event of it carries. */
export interface SentMail {
  readonly messageId: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<SentMail>;
}

export class MailPhiError extends Error {
  override readonly name = 'MailPhiError';
}

/** A message with no recipient or more than one, or one whose stream this sender has no address for: nothing is sent. */
export class MailAddressError extends Error {
  override readonly name = 'MailAddressError';
}

/** The body as sent: the lines, then each link on its own line. Refuses a link the PHI guard flags. */
export function mailBody(message: MailContent): string {
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
export function mailBodyHtml(message: MailContent, staticOrigin: string | null): string {
  mailBody(message);
  return mailHtml(message.subject, message.lines, message.links, staticOrigin, message.variant ?? 'customer');
}

/** The one recipient, or MailAddressError: a message never goes to two addresses or to none. */
export function soleRecipient(message: MailContent): string {
  const [to, ...others] = message.to;
  if (to === undefined || others.length > 0 || to.trim() === '') {
    throw new MailAddressError('a message goes to exactly one address; nothing was sent');
  }
  return to;
}

/** Everything a sender checks before it sends: one recipient, tags of opaque IDs, links the PHI guard passes. */
function checked(message: MailMessage, staticOrigin: string | null): { to: string; tags: ReturnType<typeof mailTags>; body: string; html: string } {
  const to = soleRecipient(message);
  const tags = mailTags(message.identity);
  return { to, tags, body: mailBody(message), html: mailBodyHtml(message, staticOrigin) };
}

/** Where a stream's messages go from, and where a reply goes (the screening's: the support address). */
export interface MailSenderAddress {
  readonly from: string;
  readonly replyTo?: string;
}

export interface SesMailSenderOptions {
  readonly client: Pick<SESv2Client, 'send'>;
  readonly staticOrigin: string | null;
  /** The configuration sets' prefix (MAIL_STREAM_PREFIX, `tp-<environment>`). */
  readonly streamPrefix: string;
  /** The address each stream this sender sends on goes from; a stream with none is refused before sending. */
  readonly senders: Readonly<Partial<Record<MailStream, MailSenderAddress>>>;
}

/** SES: the message's stream's configuration set and sender, its identity as tags, and SES's message ID back. */
export class SesMailSender implements MailSender {
  constructor(private readonly options: SesMailSenderOptions) {}

  async send(message: MailMessage): Promise<SentMail> {
    const { to, tags, body, html } = checked(message, this.options.staticOrigin);
    const sender = this.options.senders[message.identity.stream];
    if (sender === undefined) {
      throw new MailAddressError('this sender has no address for the message’s stream; nothing was sent');
    }
    const result = await this.options.client.send(
      new SendEmailCommand({
        FromEmailAddress: senderAddress(sender.from),
        Destination: { ToAddresses: [to] },
        ...(sender.replyTo === undefined ? {} : { ReplyToAddresses: [sender.replyTo] }),
        ConfigurationSetName: configurationSetName(this.options.streamPrefix, message.identity.stream),
        EmailTags: tags,
        Content: {
          Simple: {
            Subject: { Data: brandedSubject(message.subject), Charset: 'UTF-8' },
            Body: { Text: { Data: body, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    const messageId = (result as { MessageId?: string } | undefined)?.MessageId;
    if (messageId === undefined || messageId === '') {
      throw new Error('the mail service accepted a message without its ID');
    }
    return { messageId };
  }
}

export function sesMailSender(options: Omit<SesMailSenderOptions, 'client'>): SesMailSender {
  return new SesMailSender({ client: new SESv2Client({}), ...options });
}

/**
 * The sender a configuration names: SES with each stream's address (MAIL_FROM on the transactional and notices
 * streams, the screening's own sender and Reply-To on its stream), or the local outbox with its events directory.
 */
export function configuredMailSender(mail: MailConfig, staticOrigin: string | null): MailSender {
  if (mail.kind === 'local') {
    return new LocalMailSender(mail.dir, staticOrigin, { eventsDir: mail.eventsDir, streamPrefix: mail.streamPrefix });
  }
  const customer = { from: mail.from };
  return sesMailSender({
    staticOrigin,
    streamPrefix: mail.streamPrefix,
    senders: { transactional: customer, notices: customer, ...(mail.screening === null ? {} : { screening: { from: mail.screening.from, replyTo: mail.screening.replyTo } }) },
  });
}

/** The local sender's settings beyond its outbox: where simulator-shaped events go, and the sets' prefix they name. */
export interface LocalMailOptions {
  /** A directory the platform's local mail_events source reads (MAIL_EVENTS_DIR); none writes no event. */
  readonly eventsDir?: string | null;
  readonly streamPrefix?: string;
}

/** Writes a file under a hidden name and renames it into place; named by the time, then `order` (events in sequence), then a UUID. */
async function writeAtomically(dir: string, content: string, order?: number): Promise<void> {
  await mkdir(dir, { recursive: true });
  const name = order === undefined ? `${String(Date.now())}-${randomUUID()}` : `${String(Date.now())}-${String(order)}-${randomUUID()}`;
  const partial = path.join(dir, `.${name}.partial`);
  await writeFile(partial, content, { mode: 0o600 });
  await rename(partial, path.join(dir, `${name}.json`));
}

/**
 * Development: each message is a JSON file in a directory, named by opaque IDs. It is written under a hidden name and
 * renamed into place, so a reader of the outbox (the e2e monitoring journey polls it) never reads a message half
 * written. `to` stays a one-element array, so the outbox's readers keep matching an address exactly. With an events
 * directory, each message's SES events are written there too, as SES's mailbox simulator would send them (events.ts).
 */
export class LocalMailSender implements MailSender {
  constructor(
    private readonly dir: string,
    private readonly staticOrigin: string | null,
    private readonly options: LocalMailOptions = {},
  ) {}

  async send(message: MailMessage): Promise<SentMail> {
    const { to, body, html } = checked(message, this.staticOrigin);
    const messageId = `local-${randomUUID()}`;
    await writeAtomically(this.dir, `${JSON.stringify({ to: [to], subject: brandedSubject(message.subject), body, html })}\n`);
    const eventsDir = this.options.eventsDir ?? null;
    if (eventsDir !== null) {
      const events = localMailEvents({ messageId, to, identity: message.identity, streamPrefix: this.options.streamPrefix ?? DEVELOPMENT_MAIL_STREAM_PREFIX, at: new Date() });
      for (const [order, event] of events.entries()) {
        await writeAtomically(eventsDir, `${JSON.stringify(event)}\n`, order);
      }
    }
    return { messageId };
  }
}

/** Tests: messages kept in memory with the ID each was given (their HTML without the art, as a local build sends it, unless a static host is given). */
export class MemoryMailSender implements MailSender {
  readonly sent: (MailMessage & { readonly body: string; readonly html: string; readonly messageId: string })[] = [];

  constructor(private readonly staticOrigin: string | null = null) {}

  send(message: MailMessage): Promise<SentMail> {
    const { body, html } = checked(message, this.staticOrigin);
    const messageId = `memory-${randomUUID()}`;
    this.sent.push({ ...message, body, html, messageId });
    return Promise.resolve({ messageId });
  }
}
