import { describe, expect, it } from 'vitest';

import { createServices } from '../server/services';
import { securityTxtFile, disclosurePage } from '../routes/security';
import { textHandler } from '../http/handler';
import { DISCLOSURE_PATH, PREFERRED_LANGUAGES, SECURITY_TXT_EXPIRES, SECURITY_TXT_PATH, SECURITY_TXT_RENEW_DAYS, parseSecurityTxt, securityTxt } from './disclosure';

/**
 * The security contact (audit item #20 (f)): security.txt as RFC 9116 states it, from the server's configuration,
 * and an expiry that fails this suite before it passes, so the file is renewed while it is still current.
 */
const DAY = 24 * 60 * 60 * 1000;
const ORIGIN = 'https://app.synthetic.test';
const NOW = new Date('2026-10-20T12:00:00Z');

describe('security.txt', () => {
  const text = securityTxt({ origin: `${ORIGIN}/ignored/path`, contact: 'security@synthetic.test', expires: SECURITY_TXT_EXPIRES });

  it('holds the contact, the expiry, the policy, the language and its canonical address, from the configuration', () => {
    expect(text).toBe(
      [
        `# The security contact of PaidWhole (RFC 9116). How to report a vulnerability, and what to expect: ${ORIGIN}/security`,
        'Contact: mailto:security@synthetic.test',
        `Expires: ${SECURITY_TXT_EXPIRES}`,
        `Policy: ${ORIGIN}${DISCLOSURE_PATH}`,
        `Preferred-Languages: ${PREFERRED_LANGUAGES}`,
        `Canonical: ${ORIGIN}${SECURITY_TXT_PATH}`,
        '',
      ].join('\n'),
    );
    const parsed = parseSecurityTxt(text, { now: NOW, fetchedFrom: `${ORIGIN}/.well-known/security.txt` });
    expect(parsed.problems).toEqual([]);
    expect(Object.fromEntries(parsed.fields)).toEqual({
      Contact: ['mailto:security@synthetic.test'],
      Expires: [SECURITY_TXT_EXPIRES],
      Policy: [`${ORIGIN}/security`],
      'Preferred-Languages': ['en'],
      Canonical: [`${ORIGIN}/.well-known/security.txt`],
    });
  });

  it(`expires less than a year ahead, and is renewed at least ${String(SECURITY_TXT_RENEW_DAYS)} days before it lapses`, () => {
    const expires = Date.parse(SECURITY_TXT_EXPIRES);
    const now = Date.now();
    // When this fails: check that the security address still reaches a person, then move SECURITY_TXT_EXPIRES
    // (apps/web/src/lib/security/disclosure.ts) to a date less than a year ahead.
    expect(expires - now, `security.txt expires on ${SECURITY_TXT_EXPIRES}: renew it`).toBeGreaterThan(SECURITY_TXT_RENEW_DAYS * DAY);
    expect(expires - now, 'RFC 9116 asks for an expiry less than a year ahead').toBeLessThan(365 * DAY);
    expect(new Date(expires).toISOString()).toBe(SECURITY_TXT_EXPIRES);
  });

  it('reports what RFC 9116 refuses, and a file fetched from an address its Canonical does not name', () => {
    const problems = (lines: readonly string[], fetchedFrom?: string) => parseSecurityTxt(`${lines.join('\r\n')}\r\n`, { now: NOW, ...(fetchedFrom === undefined ? {} : { fetchedFrom }) }).problems;
    const good = ['Contact: mailto:security@synthetic.test', `Expires: ${SECURITY_TXT_EXPIRES}`];
    expect(problems(good)).toEqual([]);
    expect(problems([`Expires: ${SECURITY_TXT_EXPIRES}`])).toEqual(['no Contact field']);
    expect(problems(['Contact: mailto:security@synthetic.test'])).toEqual(['Expires appears 0 times, not once']);
    expect(problems([...good, `Expires: ${SECURITY_TXT_EXPIRES}`])).toEqual(['Expires appears 2 times, not once']);
    expect(problems(['Contact: mailto:security@synthetic.test', 'Expires: 30 April 2027'])).toEqual(['Expires is not an RFC 3339 date and time']);
    expect(problems(['Contact: mailto:security@synthetic.test', 'Expires: 2026-01-01T00:00:00.000Z'])).toEqual(['Expires has passed']);
    expect(problems([...good, 'Preferred-Languages: en', 'Preferred-Languages: fr'])).toEqual(['Preferred-Languages appears more than once']);
    expect(problems([...good, 'Policy: http://app.synthetic.test/security'])).toEqual(['Policy is a web URI without https']);
    // The e2e suite's local server is the one plain-http origin a file may name.
    expect(problems([...good, 'Policy: http://localhost:4601/security'])).toEqual([]);
    expect(problems([...good, 'Canonical: /.well-known/security.txt'])).toEqual(['Canonical is not an absolute URI']);
    expect(problems([...good, 'Contacts: mailto:security@synthetic.test'])).toEqual(['line 3 names a field RFC 9116 does not define (Contacts)']);
    expect(problems([...good, 'just words'])).toEqual(['line 3 is neither a field nor a comment']);
    expect(problems(good, `${ORIGIN}/.well-known/security.txt`)).toEqual(['no Canonical field names the address the file was fetched from']);
    expect(parseSecurityTxt('Contact: mailto:security@synthetic.test', { now: NOW }).problems).toContain('the last line does not end with a line feed');
    // Field names are read in any case and kept in RFC 9116's spelling.
    expect(parseSecurityTxt(`contact: mailto:a@synthetic.test\nEXPIRES: ${SECURITY_TXT_EXPIRES}\n`, { now: NOW }).fields.get('Contact')).toEqual(['mailto:a@synthetic.test']);
  });
});

describe('the security routes', () => {
  const services = () => createServices({ origin: ORIGIN, pool: { connect: () => Promise.reject(new Error('no database')) }, provider: undefined as never, keys: undefined as never, sealer: undefined as never, securityEmail: 'report@synthetic.test' });

  it('serve security.txt as plain text from the configuration, without the database', async () => {
    const response = await textHandler(securityTxtFile, services)(new Request(`${ORIGIN}${SECURITY_TXT_PATH}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBeNull();
    const parsed = parseSecurityTxt(await response.text(), { now: NOW, fetchedFrom: `${ORIGIN}${SECURITY_TXT_PATH}` });
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields.get('Contact')).toEqual(['mailto:report@synthetic.test']);
  });

  it('give the disclosure page the security address, publicly and without PHI', async () => {
    expect(disclosurePage.access).toEqual({ kind: 'public' });
    expect(disclosurePage.phi).toBe(false);
    expect(securityTxtFile.phi).toBe(false);
    const outcome = await disclosurePage.invoke({ cookies: { get: () => undefined, set: () => undefined, delete: () => undefined }, params: {}, requestId: 'r', userAgent: null }, services());
    expect(outcome).toEqual({ status: 'ok', data: { securityEmail: 'report@synthetic.test', securityTxtPath: '/.well-known/security.txt' } });
  });
});
