import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { palette } from '@paidwhole/brand';
import { afterEach, describe, expect, it } from 'vitest';

import { parseMailQueueMessage } from './events';
import { LocalMailSender, MailAddressError, MailPhiError, type MailMessage, MemoryMailSender, SesMailSender, configuredMailSender, mailBody, mailBodyHtml, sesMailSender } from './mail';
import { MailTagError } from './streams';
import { EMAIL_LOCKUP_PATH, EMAIL_PROSPECT_LOCKUP_PATH, MAIL_FOOTERS } from './template';

/** The CloudFront static host the deployed tasks name (STATIC_ASSET_ORIGIN), which serves the brand art under /brand/. */
const STATIC = 'https://static.synthetic.test';

const PRACTICE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const NOTICE = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e01';
const ADMIN = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f01';
const RUN = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a01';

const MESSAGE: MailMessage = {
  to: ['admin@synthetic.test'],
  subject: 'Support access opened for your practice',
  lines: ['PaidWhole support was given break-glass access to your practice.'],
  links: [`http://localhost:3000/p/${PRACTICE}/support-access/7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c01`],
  identity: { stream: 'notices', kind: 'support_grant_opened', subjectId: NOTICE, practiceId: PRACTICE, recipientUserId: ADMIN },
};

/** An SES client that keeps each command's input and answers with a message ID. */
function sesClient(): { client: never; sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    client: { send: (command: { input: unknown }) => Promise.resolve({ MessageId: `0100019a${String(sent.push(command.input)).padStart(4, '0')}-synthetic-000000` }) } as never,
  };
}

const SENDERS = { transactional: { from: 'notices@synthetic.test' }, notices: { from: 'notices@synthetic.test' }, screening: { from: 'results@screening.synthetic.test', replyTo: 'support@synthetic.test' } };

describe('notice email', () => {
  it('is the fixed lines and then the links', () => {
    expect(mailBody(MESSAGE)).toBe(`${MESSAGE.lines[0] ?? ''}\n\n${MESSAGE.links[0] ?? ''}`);
  });

  it('refuses a link the PHI guard flags, without echoing it', () => {
    expect(() => mailBody({ ...MESSAGE, links: ['http://localhost:3000/claims/123456789'] })).toThrow(new MailPhiError('a notice link may carry PHI; nothing was sent'));
    expect(() => mailBody({ ...MESSAGE, links: ['http://localhost:3000/p/x?patient=jane@synthetic.test'] })).toThrow(MailPhiError);
  });

  it('is sent through SES as plain text and the branded HTML, from PaidWhole at its stream’s address, through its stream’s set with its identity as tags', async () => {
    const { client, sent } = sesClient();
    const ses = new SesMailSender({ client, staticOrigin: STATIC, streamPrefix: 'tp-production', senders: SENDERS });
    expect(await ses.send(MESSAGE)).toEqual({ messageId: '0100019a0001-synthetic-000000' });
    expect(sent).toEqual([
      {
        FromEmailAddress: 'PaidWhole <notices@synthetic.test>',
        Destination: { ToAddresses: ['admin@synthetic.test'] },
        ConfigurationSetName: 'tp-production-notices',
        EmailTags: [
          { Name: 'tp_kind', Value: 'support_grant_opened' },
          { Name: 'tp_subject', Value: NOTICE },
          { Name: 'tp_practice', Value: PRACTICE },
          { Name: 'tp_recipient', Value: ADMIN },
        ],
        Content: {
          Simple: {
            Subject: { Data: `${MESSAGE.subject} | PaidWhole`, Charset: 'UTF-8' },
            Body: { Text: { Data: mailBody(MESSAGE), Charset: 'UTF-8' }, Html: { Data: mailBodyHtml(MESSAGE, STATIC), Charset: 'UTF-8' } },
          },
        },
      },
    ]);
    expect(sesMailSender({ staticOrigin: STATIC, streamPrefix: 'tp-staging', senders: SENDERS })).toBeInstanceOf(SesMailSender);
    expect(sesMailSender({ staticOrigin: null, streamPrefix: 'tp-staging', senders: SENDERS })).toBeInstanceOf(SesMailSender);
  });

  it('sends a screening message from the screening’s own sender with Reply-To the support address, naming no user (Q12)', async () => {
    const { client, sent } = sesClient();
    const ses = new SesMailSender({ client, staticOrigin: null, streamPrefix: 'tp-production', senders: SENDERS });
    await ses.send({ ...MESSAGE, to: ['prospect@clinic.synthetic.test'], identity: { stream: 'screening', kind: 'screening_result', subjectId: RUN } });
    expect(sent).toEqual([
      expect.objectContaining({
        FromEmailAddress: 'PaidWhole <results@screening.synthetic.test>',
        ReplyToAddresses: ['support@synthetic.test'],
        ConfigurationSetName: 'tp-production-screening',
        EmailTags: [
          { Name: 'tp_kind', Value: 'screening_result' },
          { Name: 'tp_subject', Value: RUN },
        ],
      }),
    ]);
    // A customer stream's message has no Reply-To: replies go to its sender, as before.
    await ses.send({ ...MESSAGE, identity: { stream: 'transactional', kind: 'digest', subjectId: NOTICE, recipientUserId: ADMIN } });
    expect(sent[1]).not.toHaveProperty('ReplyToAddresses');
    expect(sent[1]).toMatchObject({ ConfigurationSetName: 'tp-production-transactional', FromEmailAddress: 'PaidWhole <notices@synthetic.test>' });
  });

  it('refuses before sending a message to two addresses or none, a stream it has no sender for, and a tag that is not an opaque ID', async () => {
    const { client, sent } = sesClient();
    const ses = new SesMailSender({ client, staticOrigin: null, streamPrefix: 'tp-production', senders: { notices: SENDERS.notices } });
    await expect(ses.send({ ...MESSAGE, to: ['admin@synthetic.test', 'other@synthetic.test'] })).rejects.toThrow(MailAddressError);
    await expect(ses.send({ ...MESSAGE, to: [] })).rejects.toThrow(MailAddressError);
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'screening', kind: 'screening_result', subjectId: RUN } })).rejects.toThrow(MailAddressError);
    // An address, or anything but letters, digits, _ and -, never becomes a tag (^[A-Za-z0-9_-]{1,64}$).
    await expect(ses.send({ ...MESSAGE, identity: { ...MESSAGE.identity, subjectId: 'admin@synthetic.test' } })).rejects.toThrow(MailTagError);
    await expect(ses.send({ ...MESSAGE, identity: { ...MESSAGE.identity, recipientUserId: 'x'.repeat(65) } })).rejects.toThrow(MailTagError);
    // The identity must be one the record can hold: the kind its stream's, a subject exactly when the kind has one,
    // a practice only on a support notice, a user never on the screening stream.
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'transactional', kind: 'support_grant_opened', subjectId: NOTICE } })).rejects.toThrow(MailTagError);
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'notices', kind: 'dunning' } })).rejects.toThrow(MailTagError);
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'notices', kind: 'probe', subjectId: NOTICE } })).rejects.toThrow(MailTagError);
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'notices', kind: 'dunning', subjectId: NOTICE, practiceId: PRACTICE } })).rejects.toThrow(MailTagError);
    await expect(ses.send({ ...MESSAGE, identity: { stream: 'screening', kind: 'screening_result', subjectId: RUN, recipientUserId: ADMIN } })).rejects.toThrow(MailTagError);
    expect(sent).toEqual([]);
  });

  it('is built from the configuration: SES with each stream’s sender, or the local outbox with its events directory', () => {
    const ses = configuredMailSender({ kind: 'ses', from: 'notices@synthetic.test', screening: SENDERS.screening, streamPrefix: 'tp-staging' }, STATIC);
    expect(ses).toBeInstanceOf(SesMailSender);
    expect((ses as unknown as { options: { senders: unknown } }).options.senders).toEqual(SENDERS);
    const withoutScreening = configuredMailSender({ kind: 'ses', from: 'notices@synthetic.test', screening: null, streamPrefix: 'tp-staging' }, null);
    expect((withoutScreening as unknown as { options: { senders: unknown } }).options.senders).toEqual({ transactional: SENDERS.transactional, notices: SENDERS.notices });
    expect(configuredMailSender({ kind: 'local', dir: '/tmp/x', eventsDir: null, streamPrefix: 'tp-dev' }, null)).toBeInstanceOf(LocalMailSender);
  });

  it('is kept in memory for tests with the ID it was given, without the art unless a static host is given', async () => {
    const memory = new MemoryMailSender(STATIC);
    const { messageId } = await memory.send(MESSAGE);
    expect(messageId).toMatch(/^[A-Za-z0-9-]{20,100}$/);
    expect(memory.sent).toEqual([{ ...MESSAGE, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE, STATIC), messageId }]);
    const local = new MemoryMailSender();
    await local.send(MESSAGE);
    expect(local.sent[0]?.html).toBe(mailBodyHtml(MESSAGE, null));
    expect(() => local.send({ ...MESSAGE, to: ['a@synthetic.test', 'b@synthetic.test'] })).toThrow(MailAddressError);
  });
});

describe('the local outbox', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes each message to a file named by opaque IDs, its one address still a one-element array the outbox readers match exactly', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-mail-'));
    const { messageId } = await new LocalMailSender(path.join(dir, 'outbox'), null).send(MESSAGE);
    expect(messageId).toMatch(/^local-[0-9a-f-]{36}$/);
    const files = readdirSync(path.join(dir, 'outbox'));
    // Renamed into place once written: no partial file is left beside it.
    expect(files).toHaveLength(1);
    const [file = ''] = files;
    expect(file).toMatch(/^\d+-[0-9a-f-]{36}\.json$/);
    const written = JSON.parse(readFileSync(path.join(dir, 'outbox', file), 'utf8')) as { to: unknown };
    expect(written).toEqual({ to: ['admin@synthetic.test'], subject: `${MESSAGE.subject} | PaidWhole`, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE, null) });
    // apps/web/e2e/outbox.ts and tools/screening-capacity/run.ts read `to` as an array and call includes(address).
    expect(Array.isArray(written.to)).toBe(true);
    // No events directory: no event is written.
    expect(readdirSync(dir)).toEqual(['outbox']);
  });

  it('writes the events SES’s simulator would publish, by the address’s local part before any +, which the mail_events job reads', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-mail-'));
    const events = path.join(dir, 'events');
    const sender = new LocalMailSender(path.join(dir, 'outbox'), null, { eventsDir: events, streamPrefix: 'tp-dev' });
    mkdirSync(events, { recursive: true });
    const outcomes = async (to: string) => {
      const before = new Set(readdirSync(events));
      const { messageId } = await sender.send({ ...MESSAGE, to: [to], identity: { stream: 'screening', kind: 'screening_result', subjectId: RUN } });
      const added = readdirSync(events)
        .filter((name) => !before.has(name))
        .sort()
        .map((name) => parseMailQueueMessage(readFileSync(path.join(events, name), 'utf8'), 'tp-dev'));
      return { messageId, added };
    };
    const bounced = await outcomes('bounce+e2e7@simulator.amazonses.com');
    expect(bounced.added.map((entry) => (entry.type === 'event' ? [entry.record.event, entry.record.bounceKind, entry.record.bounceSubtype] : entry.type))).toEqual([
      ['send', null, null],
      ['bounce', 'permanent', 'general'],
    ]);
    expect(bounced.added[0]).toMatchObject({ type: 'event', record: { messageId: bounced.messageId, stream: 'screening', kind: 'screening_result', subjectId: RUN, recipient: 'bounce+e2e7@simulator.amazonses.com' } });
    const suppressed = await outcomes('suppressionlist@simulator.amazonses.com');
    expect(suppressed.added.map((entry) => (entry.type === 'event' ? entry.record.bounceSubtype : null))).toEqual([null, 'on_account_suppression_list']);
    const complained = await outcomes('complaint@simulator.amazonses.com');
    expect(complained.added.map((entry) => (entry.type === 'event' ? [entry.record.event, entry.record.complaintType] : null))).toEqual([
      ['send', null],
      ['delivery', null],
      ['complaint', 'abuse'],
    ]);
    const delivered = await outcomes('someone@clinic.synthetic.test');
    expect(delivered.added.map((entry) => (entry.type === 'event' ? entry.record.event : null))).toEqual(['send', 'delivery']);
  });
});

describe('the branded HTML email (docs/brand/BRAND.md, section 7)', () => {
  const html = mailBodyHtml(MESSAGE, STATIC);

  it('heads the message with the outlined lockup and tagline at 160 px from the static host, named PaidWhole, never the name typed as text', () => {
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
    expect(images).toHaveLength(1);
    const [lockup = ''] = images;
    // The CloudFront static host serves /brand/ with Cross-Origin-Resource-Policy: cross-origin; the application
    // keeps same-origin on every response (reconciliation-001, D7), so the art never comes from the application.
    expect(lockup).toContain(`src="${STATIC}/brand/paidwhole-lockup-horizontal-tagline-1200w.png"`);
    expect(lockup).not.toContain(new URL(MESSAGE.links[0] ?? '').origin);
    expect(lockup).toContain('width="160"');
    expect(lockup).toContain('alt="PaidWhole"');
    // The wordmark is the art's: no live text in a face the reader may not have, no inline SVG a client may strip.
    expect(html).not.toContain('Schibsted');
    expect(html).not.toMatch(/<svg\b/);
    expect(html).not.toMatch(/>\s*PaidWhole\s*</);
    expect(html).not.toContain('var(--');
  });

  it('sets it on White with the brand hex from tokens.ts, never the Paper reserved for print', () => {
    expect(html).toContain(`<body style="margin:0;padding:0;background-color:${palette.white};">`);
    expect(html).not.toContain(palette.paper);
    expect(html).toContain(`color:${palette.ink}`);
    expect(html).toContain(`border-bottom:1px solid ${palette.line}`);
  });

  it('carries the same fixed lines and links as the text, escaped, and loads nothing but the lockup', () => {
    for (const line of MESSAGE.lines) {
      expect(html).toContain(line);
    }
    expect(html).toContain(`href="${MESSAGE.links[0] ?? ''}"`);
    expect(mailBodyHtml({ ...MESSAGE, lines: ['<b>&</b>'] }, STATIC)).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(html).not.toMatch(/<(script|link)\b|url\(/i);
    expect([...html.matchAll(/src="([^"]*)"/g)].map((match) => match[1])).toEqual([`${STATIC}/brand/paidwhole-lockup-horizontal-tagline-1200w.png`]);
  });

  it('goes without the art when no static host is configured (a local build), never with the wordmark typed instead', () => {
    const bare = mailBodyHtml(MESSAGE, null);
    expect(bare).not.toMatch(/<img\b/);
    expect(bare).not.toMatch(/src=/);
    expect(bare).not.toContain('/brand/');
    expect(bare).not.toMatch(/>\s*PaidWhole\s*</);
    // Everything else is the same message: the White ground, the lines, the links and the footer.
    expect(bare).toContain(`<body style="margin:0;padding:0;background-color:${palette.white};">`);
    expect(bare).toContain(MESSAGE.lines[0] ?? '');
    expect(bare).toContain(`href="${MESSAGE.links[0] ?? ''}"`);
    expect(bare).toContain('This message carries links only; sign in to see the details.');
    expect(bare.replace(/<tr><td style="padding:20px 24px;[^"]*">.*?<\/td><\/tr>/, '')).toBe(bare);
    expect(html.replace(/<tr><td style="padding:20px 24px;[^"]*">.*?<\/td><\/tr>/, '')).toBe(bare);
  });

  it('refuses a link the PHI guard flags, as the text body does', () => {
    expect(() => mailBodyHtml({ ...MESSAGE, links: ['http://localhost:3000/claims/123456789'] }, STATIC)).toThrow(MailPhiError);
    expect(() => mailBodyHtml({ ...MESSAGE, links: ['http://localhost:3000/claims/123456789'] }, null)).toThrow(MailPhiError);
  });
});

describe('the prospect variant (a screening’s email; CO-04, decision D11)', () => {
  const PROSPECT: MailMessage = {
    to: ['prospect@clinic.synthetic.test'],
    subject: 'Your screening is ready',
    lines: ['The screening you started on the PaidWhole screening page is ready.'],
    links: ['https://app.synthetic.test/screening/results/qwertyuiopasdfghjklzxcvbnmqwerty'],
    variant: 'prospect',
    identity: { stream: 'screening', kind: 'screening_result', subjectId: RUN },
  };
  const html = mailBodyHtml(PROSPECT, STATIC);
  const repository = path.resolve(import.meta.dirname, '../../../..');

  it('heads the message with the lockup without the tagline, at the same 160 px, from the static host', () => {
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
    expect(images).toHaveLength(1);
    const [lockup = ''] = images;
    expect(lockup).toContain(`src="${STATIC}${EMAIL_PROSPECT_LOCKUP_PATH}"`);
    expect(lockup).toContain('width="160"');
    expect(lockup).toContain('height="29"');
    expect(lockup).toContain('alt="PaidWhole"');
    expect(html).not.toContain('tagline');
    expect(EMAIL_PROSPECT_LOCKUP_PATH).not.toContain('tagline');
    // Both arts are the delivered files the static host serves from apps/web/public/brand.
    expect(existsSync(path.join(repository, 'apps/web/public', EMAIL_PROSPECT_LOCKUP_PATH))).toBe(true);
    expect(existsSync(path.join(repository, 'apps/web/public', EMAIL_LOCKUP_PATH))).toBe(true);
  });

  it('ends with the prospect’s footer, which never says to sign in: a prospect has no account', () => {
    expect(html).toContain(MAIL_FOOTERS.prospect);
    expect(html).not.toContain(MAIL_FOOTERS.customer);
    expect(MAIL_FOOTERS.prospect).not.toMatch(/sign in/i);
    expect(MAIL_FOOTERS.prospect).not.toMatch(/\b(?:owed|under-?paid|recovered)\b/i);
  });

  it('leaves a customer’s message as it was: a message without a variant is a customer’s', () => {
    expect(mailBodyHtml(MESSAGE, STATIC)).toBe(mailBodyHtml({ ...MESSAGE, variant: 'customer' }, STATIC));
    expect(mailBodyHtml(MESSAGE, STATIC)).toContain(MAIL_FOOTERS.customer);
    expect(mailBodyHtml(MESSAGE, STATIC)).toContain(EMAIL_LOCKUP_PATH);
  });

  it('keeps the same text body and the same checks: the PHI guard, and no art without a static host', () => {
    expect(mailBody(PROSPECT)).toBe(`${PROSPECT.lines[0] ?? ''}\n\n${PROSPECT.links[0] ?? ''}`);
    expect(() => mailBodyHtml({ ...PROSPECT, links: ['https://app.synthetic.test/claims/123456789'] }, STATIC)).toThrow(MailPhiError);
    const bare = mailBodyHtml(PROSPECT, null);
    expect(bare).not.toMatch(/<img\b/);
    expect(bare).toContain(MAIL_FOOTERS.prospect);
  });
});
