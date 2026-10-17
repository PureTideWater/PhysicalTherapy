import { describe, expect, it } from 'vitest';

import { MAX_MAIL_BYTES, fromAddress, headerText, htmlText, readMail, sesVerified } from './mime';

/** Synthetic messages only: invented people at synthetic.test. */
const mail = (lines: readonly string[]) => Buffer.from(lines.join('\r\n'), 'utf8');

const SES_HEADERS = [
  'Return-Path: <someone@synthetic.test>',
  'Received: from mail.synthetic.test by inbound-smtp.us-east-1.amazonaws.com with SMTP id synthetic',
  'X-SES-Spam-Verdict: PASS',
  'X-SES-Virus-Verdict: PASS',
  'Received-SPF: pass (spfCheck: domain of synthetic.test designates 192.0.2.1 as permitted sender) client-ip=192.0.2.1;',
  'Authentication-Results: amazonses.com;',
  ' spf=pass (spfCheck: domain of synthetic.test designates 192.0.2.1 as permitted sender) client-ip=192.0.2.1; envelope-from=someone@synthetic.test; helo=mail.synthetic.test;',
  ' dkim=pass header.i=@synthetic.test;',
  ' dmarc=pass header.from=synthetic.test;',
];

describe('reading a message mailed to support', () => {
  it('reads the sender, the subject and the plain text of a simple message', () => {
    const read = readMail(mail(['From: Someone Synthetic <Someone@Synthetic.test>', 'To: support@synthetic.test', 'Subject: Where is the export button?', '', 'I cannot find it on the packet screen.', '', 'Thanks']));
    expect(read).toEqual({
      headers: expect.any(Array),
      from: 'someone@synthetic.test',
      subject: 'Where is the export button?',
      text: 'I cannot find it on the packet screen.\n\nThanks',
    });
  });

  it('unfolds headers and decodes encoded words, adjacent ones joined, and raw UTF-8', () => {
    expect(headerText('=?UTF-8?B?V2hlcmUgaXMgdGhl?= =?UTF-8?Q?_export_button=3F?=')).toBe('Where is the export button?');
    expect(headerText('=?iso-8859-1?Q?caf=E9?= menu')).toBe('café menu');
    expect(headerText('=?x-unknown?B?aGVsbG8=?=')).toBe('hello');
    expect(headerText(Buffer.from('Café question', 'utf8').toString('latin1'))).toBe('Café question');
    const read = readMail(mail(['From: someone@synthetic.test', 'Subject: A long', '\tfolded subject', '', 'Text']));
    expect(read?.subject).toBe('A long folded subject');
  });

  it('takes the plain part of a multipart message, decoding base64 and quoted-printable, and never an attachment', () => {
    const read = readMail(
      mail([
        'From: someone@synthetic.test',
        'Subject: Question',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="outer"',
        '',
        'preamble',
        '--outer',
        'Content-Type: multipart/alternative; boundary=inner',
        '',
        '--inner',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        'The caf=C3=A9 screen shows a soft=',
        'break.',
        '--inner',
        'Content-Type: text/html; charset=utf-8',
        '',
        '<p>ignored</p>',
        '--inner--',
        '--outer',
        'Content-Type: text/plain',
        'Content-Disposition: attachment; filename="notes.txt"',
        '',
        'an attachment is never read',
        '--outer--',
      ]),
    );
    expect(read?.text).toBe('The café screen shows a softbreak.');
    const base64 = readMail(mail(['From: someone@synthetic.test', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from('Plain words here.').toString('base64')]));
    expect(base64?.text).toBe('Plain words here.');
  });

  it('reads HTML only when there is no plain text, as its text', () => {
    const read = readMail(
      mail([
        'From: someone@synthetic.test',
        'Content-Type: multipart/alternative; boundary=b',
        '',
        '--b',
        'Content-Type: text/html',
        '',
        '<html><head><style>p{}</style></head><body><p>First &amp; second</p><script>x()</script>line<br>next</body></html>',
        '--b--',
      ]),
    );
    expect(read?.text).toBe('First & second\n line\nnext');
    expect(htmlText('a&nbsp;b &lt;c&gt; &quot;d&quot; &#39;e&apos;')).toBe('a b <c> "d" \'e\'');
  });

  it('reads nothing it cannot: too large, no header, no text, an attachment alone, a part with no boundary, an image', () => {
    expect(readMail(new Uint8Array(MAX_MAIL_BYTES + 1))).toBeNull();
    expect(readMail(Buffer.from(''))).toBeNull();
    expect(readMail(mail(['From: someone@synthetic.test', '', '   ']))?.text).toBeNull();
    expect(readMail(mail(['From: someone@synthetic.test', 'Content-Disposition: attachment', '', 'x']))?.text).toBeNull();
    expect(readMail(mail(['From: someone@synthetic.test', 'Content-Type: multipart/mixed', '', 'x']))?.text).toBeNull();
    expect(readMail(mail(['From: someone@synthetic.test', 'Content-Type: image/png', '', 'x']))?.text).toBeNull();
    // Without a closing delimiter the last part still counts; a message of only a header has no text.
    expect(readMail(mail(['From: someone@synthetic.test', 'Content-Type: multipart/mixed; boundary=b', '', '--b', '', 'unclosed']))?.text).toBe('unclosed');
    expect(readMail(Buffer.from('From: someone@synthetic.test'))?.text).toBeNull();
  });

  it('reads parts no deeper than four and no more than fifty', () => {
    const nested = (depth: number): string[] =>
      depth === 0 ? ['Content-Type: text/plain', '', 'deep'] : [`Content-Type: multipart/mixed; boundary=b${String(depth)}`, '', `--b${String(depth)}`, ...nested(depth - 1), `--b${String(depth)}--`];
    expect(readMail(mail(['From: someone@synthetic.test', ...nested(4)]))?.text).toBe('deep');
    expect(readMail(mail(['From: someone@synthetic.test', ...nested(5)]))?.text).toBeNull();
    const many = Array.from({ length: 60 }, (_, index) => ['--b', 'Content-Type: image/png', '', String(index)]).flat();
    expect(readMail(mail(['From: someone@synthetic.test', 'Content-Type: multipart/mixed; boundary=b', '', ...many, '--b', '', 'too late', '--b--']))?.text).toBeNull();
  });

  it('names exactly one sender, or none', () => {
    expect(fromAddress('"Synthetic, Someone" <someone@synthetic.test>')).toBe('someone@synthetic.test');
    expect(fromAddress('someone@synthetic.test (Someone)')).toBe('someone@synthetic.test');
    expect(fromAddress('one@synthetic.test, two@synthetic.test')).toBeNull();
    expect(fromAddress('<one@synthetic.test>, <two@synthetic.test>')).toBeNull();
    expect(fromAddress('not an address')).toBeNull();
    expect(fromAddress('someone@localhost')).toBeNull();
    expect(fromAddress(undefined)).toBeNull();
    expect(readMail(mail(['From: one@synthetic.test', 'From: two@synthetic.test', '', 'x']))?.from).toBeNull();
  });
});

describe('whether Amazon SES verified the sender', () => {
  const verified = (headers: readonly string[], from = 'someone@synthetic.test') => {
    const read = readMail(mail([...headers, `From: ${from}`, 'Subject: Question', '', 'Text']));
    return read !== null && sesVerified(read);
  };

  it('accepts DMARC passing for the From domain, or DKIM passing for a domain aligned with it, with a clean virus scan', () => {
    expect(verified(SES_HEADERS)).toBe(true);
    const dkimOnly = ['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; spf=fail; dkim=pass header.i=@synthetic.test; dmarc=none'];
    expect(verified(dkimOnly)).toBe(true);
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; dkim=pass header.d=synthetic.test'], 'someone@mail.synthetic.test')).toBe(true);
  });

  it('refuses SPF alone, another domain, a failed or missing virus scan, and results SES did not add', () => {
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; spf=pass smtp.mailfrom=synthetic.test; dkim=fail; dmarc=fail'])).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; dkim=pass header.i=@elsewhere.test; dmarc=pass header.from=elsewhere.test'])).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; dkim=pass header.i=@notsynthetic.test'])).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; dkim=pass; dmarc=pass'])).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: FAIL', ...SES_HEADERS.filter((line) => !line.startsWith('X-SES-Virus'))])).toBe(false);
    expect(verified(SES_HEADERS.filter((line) => !line.startsWith('X-SES-Virus')))).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: PASS'])).toBe(false);
    // The sender's own results, with none of SES's above them, and SES's own refusal above a forged pass.
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: mx.elsewhere.test; dmarc=pass header.from=synthetic.test'])).toBe(false);
    expect(verified(['X-SES-Virus-Verdict: PASS', 'Authentication-Results: amazonses.com; dmarc=fail', 'Authentication-Results: amazonses.com; dmarc=pass header.from=synthetic.test'])).toBe(false);
    expect(verified(SES_HEADERS, 'not an address')).toBe(false);
  });
});
