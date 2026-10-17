import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { palette } from '@paidwhole/brand';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalMailSender, MailPhiError, type MailMessage, MemoryMailSender, SesMailSender, mailBody, mailBodyHtml, sesMailSender } from './mail';

/** The CloudFront static host the deployed tasks name (STATIC_ASSET_ORIGIN), which serves the brand art under /brand/. */
const STATIC = 'https://static.synthetic.test';

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
    const ses = new SesMailSender({ client: { send: (command: { input: unknown }) => Promise.resolve(sent.push(command.input)) } as never, from: 'notices@synthetic.test', staticOrigin: STATIC });
    await ses.send(MESSAGE);
    expect(sent).toEqual([
      {
        FromEmailAddress: 'PaidWhole <notices@synthetic.test>',
        Destination: { ToAddresses: ['admin@synthetic.test'] },
        Content: {
          Simple: {
            Subject: { Data: `${MESSAGE.subject} | PaidWhole`, Charset: 'UTF-8' },
            Body: { Text: { Data: mailBody(MESSAGE), Charset: 'UTF-8' }, Html: { Data: mailBodyHtml(MESSAGE, STATIC), Charset: 'UTF-8' } },
          },
        },
      },
    ]);
    expect(sesMailSender('notices@synthetic.test', STATIC)).toBeInstanceOf(SesMailSender);
    expect(sesMailSender('notices@synthetic.test', null)).toBeInstanceOf(SesMailSender);
  });

  it('is kept in memory for tests, without the art unless a static host is given', async () => {
    const memory = new MemoryMailSender(STATIC);
    await memory.send(MESSAGE);
    expect(memory.sent).toEqual([{ ...MESSAGE, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE, STATIC) }]);
    const local = new MemoryMailSender();
    await local.send(MESSAGE);
    expect(local.sent[0]?.html).toBe(mailBodyHtml(MESSAGE, null));
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
    await new LocalMailSender(path.join(dir, 'outbox'), null).send(MESSAGE);
    const [file = ''] = readdirSync(path.join(dir, 'outbox'));
    expect(file).toMatch(/^\d+-[0-9a-f-]{36}\.json$/);
    expect(JSON.parse(readFileSync(path.join(dir, 'outbox', file), 'utf8'))).toEqual({ to: MESSAGE.to, subject: `${MESSAGE.subject} | PaidWhole`, body: mailBody(MESSAGE), html: mailBodyHtml(MESSAGE, null) });
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
