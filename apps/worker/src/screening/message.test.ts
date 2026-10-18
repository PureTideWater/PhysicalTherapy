import { describe, expect, it } from 'vitest';

import { MemoryMailSender, mailBody, mailBodyHtml } from '../mail/mail';
import { EMAIL_LOCKUP_PATH, EMAIL_PROSPECT_LOCKUP_PATH, MAIL_FOOTERS } from '../mail/template';
import { ScreeningMessageError, screeningFailedMessage, screeningResultLink, screeningResultMessage, screeningStartLink } from './message';

/**
 * The screening emails (CO-04; decisions D11 and D21 a): the result's link as the prospect variant, the lockup without
 * the tagline, no figure, date or file value, and refusals that never echo the link (its token is a secret).
 */

const ORIGIN = 'https://app.synthetic.test';
const STATIC = 'https://static.synthetic.test';
const TOKEN = 'qwertyuiopasdfghjklzxcvbnmqwerty';
const LINK = `${ORIGIN}/screening/results/${TOKEN}`;
const TO = 'prospect@clinic.synthetic.test';

/** The words screening never uses (CO-11), and the tagline's (D11). */
const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;

describe('the screening result email', () => {
  const message = screeningResultMessage({ to: TO, link: LINK, rows: 1234 });

  it('goes to the one contact, as the prospect variant, with its link and the row count', () => {
    expect(message.to).toEqual([TO]);
    expect(screeningResultMessage({ to: [TO], link: LINK, rows: 1 }).to).toEqual([TO]);
    expect(message.variant).toBe('prospect');
    expect(message.subject).toBe('Your screening is ready');
    expect(message.links).toEqual([LINK]);
    expect(message.lines[0]).toContain('1,234 rows');
    expect(screeningResultMessage({ to: TO, link: LINK, rows: 1 }).lines[0]).toContain('the 1 row of your upload');
    expect(message.lines.join(' ')).toContain('30 days from your upload');
  });

  it('holds no dollar figure, no date, no code and none of the words screening never uses', () => {
    const body = mailBody(message);
    const html = mailBodyHtml(message, STATIC);
    for (const text of [body, html, message.subject]) {
      expect(text).not.toMatch(FORBIDDEN);
      expect(text).not.toMatch(/\$|\bcents?\b|\bdollars?\b/i);
      expect(text).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    }
    // The only numbers are the row count and the 30 days.
    expect(body.replace(LINK, '').match(/\d[\d,]*/g)).toEqual(['1,234', '30']);
  });

  it('is headed by the lockup without the tagline (D11), with the prospect’s footer, never the customer’s', () => {
    const html = mailBodyHtml(message, STATIC);
    expect([...html.matchAll(/src="([^"]*)"/g)].map((match) => match[1])).toEqual([`${STATIC}${EMAIL_PROSPECT_LOCKUP_PATH}`]);
    expect(html).not.toContain(EMAIL_LOCKUP_PATH);
    expect(html).not.toContain('tagline');
    expect(html).toContain(MAIL_FOOTERS.prospect);
    expect(html).not.toContain(MAIL_FOOTERS.customer);
    expect(html).not.toContain('sign in');
  });

  it('passes the mail PHI guard: the token is lowercase letters, a route word', async () => {
    const memory = new MemoryMailSender();
    await memory.send(message);
    expect(memory.sent).toHaveLength(1);
    expect(memory.sent[0]?.body.endsWith(LINK)).toBe(true);
  });

  it('builds the link from the origin and the token, and refuses any other link without echoing it', () => {
    expect(screeningResultLink(`${ORIGIN}/somewhere?x=1`, TOKEN)).toBe(LINK);
    const refusals = [
      () => screeningResultLink(ORIGIN, 'short'),
      () => screeningResultLink(ORIGIN, TOKEN.toUpperCase()),
      () => screeningResultMessage({ to: TO, link: `${ORIGIN}/screening/results/${TOKEN}?requested=1`, rows: 3 }),
      () => screeningResultMessage({ to: TO, link: `${ORIGIN}/screening/results/${TOKEN}#x`, rows: 3 }),
      () => screeningResultMessage({ to: TO, link: `${ORIGIN}/screening/results/${TOKEN}/more`, rows: 3 }),
      () => screeningResultMessage({ to: TO, link: `ftp://app.synthetic.test/screening/results/${TOKEN}`, rows: 3 }),
      () => screeningResultMessage({ to: TO, link: `https://user:pass@app.synthetic.test/screening/results/${TOKEN}`, rows: 3 }),
      () => screeningResultMessage({ to: TO, link: 'not a link', rows: 3 }),
    ];
    for (const refuse of refusals) {
      expect(refuse).toThrow(ScreeningMessageError);
      try {
        refuse();
      } catch (error) {
        expect((error as Error).message).not.toContain(TOKEN);
        expect((error as Error).message).not.toContain(TOKEN.toUpperCase());
      }
    }
  });

  it('refuses a count that is not a whole number of rows, and more or fewer than one contact', () => {
    for (const rows of [0, -1, 1.5, Number.NaN]) {
      expect(() => screeningResultMessage({ to: TO, link: LINK, rows })).toThrow(new ScreeningMessageError('a screening email counts the rows of its upload, at least one'));
    }
    expect(() => screeningResultMessage({ to: [], link: LINK, rows: 1 })).toThrow(ScreeningMessageError);
    expect(() => screeningResultMessage({ to: [TO, 'other@clinic.synthetic.test'], link: LINK, rows: 1 })).toThrow(ScreeningMessageError);
  });
});

describe('the screening failure email', () => {
  const start = screeningStartLink(`${ORIGIN}/anything`);
  const message = screeningFailedMessage({ to: TO, startOver: start });

  it('links to the screening page only, as the prospect variant', () => {
    expect(start).toBe(`${ORIGIN}/screening`);
    expect(message.links).toEqual([start]);
    expect(message.variant).toBe('prospect');
    expect(message.subject).toBe('Your screening could not be completed');
    const html = mailBodyHtml(message, STATIC);
    expect(html).toContain(`${STATIC}${EMAIL_PROSPECT_LOCKUP_PATH}`);
    expect(html).toContain(MAIL_FOOTERS.prospect);
    expect(mailBody(message)).not.toMatch(FORBIDDEN);
    expect(mailBody(message).replace(start, '')).not.toMatch(/\d/);
  });

  it('refuses any other link', () => {
    expect(() => screeningFailedMessage({ to: TO, startOver: `${ORIGIN}/screening/results/${TOKEN}` })).toThrow(ScreeningMessageError);
    expect(() => screeningFailedMessage({ to: TO, startOver: `${ORIGIN}/screening?x=1` })).toThrow(ScreeningMessageError);
  });
});
