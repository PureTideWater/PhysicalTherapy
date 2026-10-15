import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LocalMailSender, MailPhiError, type MailMessage, MemoryMailSender, SesMailSender, mailBody, sesMailSender } from './mail';

const MESSAGE: MailMessage = {
  to: ['admin@synthetic.test'],
  subject: 'Support access opened for your practice',
  lines: ['Company support was given break-glass access to your practice.'],
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

  it('is sent through SES as plain text from the configured sender', async () => {
    const sent: unknown[] = [];
    const ses = new SesMailSender({ client: { send: (command: { input: unknown }) => Promise.resolve(sent.push(command.input)) } as never, from: 'notices@synthetic.test' });
    await ses.send(MESSAGE);
    expect(sent).toEqual([
      {
        FromEmailAddress: 'notices@synthetic.test',
        Destination: { ToAddresses: ['admin@synthetic.test'] },
        Content: { Simple: { Subject: { Data: MESSAGE.subject, Charset: 'UTF-8' }, Body: { Text: { Data: mailBody(MESSAGE), Charset: 'UTF-8' } } } },
      },
    ]);
    expect(sesMailSender('notices@synthetic.test')).toBeInstanceOf(SesMailSender);
  });

  it('is kept in memory for tests', async () => {
    const memory = new MemoryMailSender();
    await memory.send(MESSAGE);
    expect(memory.sent).toEqual([{ ...MESSAGE, body: mailBody(MESSAGE) }]);
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
    expect(JSON.parse(readFileSync(path.join(dir, 'outbox', file), 'utf8'))).toEqual({ to: MESSAGE.to, subject: MESSAGE.subject, body: mailBody(MESSAGE) });
  });
});
