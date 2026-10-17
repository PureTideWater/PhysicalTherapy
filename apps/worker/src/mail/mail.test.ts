import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { markSvg, palette } from '@paidwhole/brand';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalMailSender, MailPhiError, type MailMessage, MemoryMailSender, SesMailSender, mailBody, mailBodyHtml, sesMailSender } from './mail';

const MESSAGE: MailMessage = {
  to: ['admin@synthetic.test'],
  subject: 'Support access opened for your practice',
  lines: ['PaidWhole support was given break-glass access to your practice.'],
  links: ['http://localhost:3000/p/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01/support-access/7b6a5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c01'],
};

describe('notice email', () => {
  it('is the fixed lines and then the links', () => {
    expect(mailBody(MESSAGE)).toBe(`${MESSAGE.lines[0] ?? ''}\n\n${MESSAGE.links[0] ?? ''}`);
  });

  it('refuses a link the PHI guard flags, without echoing it', () => {
    expect(() => mailBody({ ...MESSAGE, links: ['http://localhost:3000/claims/123456789'] })).toThrow(new MailPhiError('a notice link may carry PHI; nothing was sent'));
    expect(() => mailBody({ ...MESSAGE, links: ['http://localhost:3000/p/x?patient=jane@synthetic.test'] })).toThrow(MailPhiError);
  });

  it('is sent through SES as plain text and the branded HTML, from PaidWhole at the configured address', async () => {
    const sent: unknown[] = [];
    const ses = new SesMailSender({ client: { send: (command: { input: unknown }) => Promise.resolve(sent.push(command.input)) } as never, from: 'notices@synthetic.test' });
    await ses.send(MESSAGE);
    expect(sent).toEqual([
      {
        FromEmailAddress: 'PaidWhole <notices@synthetic.test>',
        Destination: { ToAddresses: ['admin@synthetic.test'] },
        Content: {
          Simple: {
            Subject: { Data: `${MESSAGE.subject} | PaidWhole`, Charset: 'UTF-8' },
            Body: { Text: { Data: mailBody(MESSAGE), Charset: 'UTF-8' }, Html: { Data: mailBodyHtml(MESSAGE), Charset: 'UTF-8' } },
          },
        },
      },
    ]);
    expect(sesMailSender('notices@synthetic.test')).toBeInstanceOf(SesMailSender);
  });

  it('is kept in memory for tests', async () => {
    const memory = new MemoryMailSender();
    await memory.send(MESSAGE);
    expect(memory.sent).toEqual([{ ...MESSAGE, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE) }]);
  });
});

describe('the local outbox', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes each message to a file named by opaque IDs', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-mail-'));
    await new LocalMailSender(path.join(dir, 'outbox')).send(MESSAGE);
    const [file = ''] = readdirSync(path.join(dir, 'outbox'));
    expect(file).toMatch(/^\d+-[0-9a-f-]{36}\.json$/);
    expect(JSON.parse(readFileSync(path.join(dir, 'outbox', file), 'utf8'))).toEqual({ to: MESSAGE.to, subject: `${MESSAGE.subject} | PaidWhole`, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE) });
  });
});

describe('the branded HTML email (docs/brand/BRAND.md, section 7)', () => {
  const html = mailBodyHtml(MESSAGE);

  it('heads the message with the mark, its fills the brand hex from tokens.ts, and the name beside it', () => {
    expect(html).toContain(markSvg({ size: 24, fills: { ring: palette.ink, keystone: palette.brass } }));
    expect(html).toContain(`fill="${palette.ink}"`);
    expect(html).toContain(`fill="${palette.brass}"`);
    expect(html).toContain('>PaidWhole</td>');
    expect(html).not.toContain('var(--');
  });

  it('carries the same fixed lines and links as the text, escaped, and loads nothing', () => {
    for (const line of MESSAGE.lines) {
      expect(html).toContain(line);
    }
    expect(html).toContain(`href="${MESSAGE.links[0] ?? ''}"`);
    expect(mailBodyHtml({ ...MESSAGE, lines: ['<b>&</b>'] })).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(html).not.toMatch(/<(img|script|link)\b|src=|url\(/i);
  });

  it('refuses a link the PHI guard flags, as the text body does', () => {
    expect(() => mailBodyHtml({ ...MESSAGE, links: ['http://localhost:3000/claims/123456789'] })).toThrow(MailPhiError);
  });
});
