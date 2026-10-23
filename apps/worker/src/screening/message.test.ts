import { describe, expect, it } from 'vitest';

import { MemoryMailSender, mailBody, mailBodyHtml } from '../mail/mail';
import { EMAIL_LOCKUP_PATH, EMAIL_PROSPECT_LOCKUP_PATH, MAIL_FOOTERS } from '../mail/template';
import { SCREENING_WAITED, ScreeningMessageError, screeningFailedMessage, screeningResultLink, screeningResultMessage, screeningStartLink } from './message';
import { KEPT_COUNTS, KEPT_SUMMARY, emailKept } from './wording';

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
    // A practice keeps one screening at a time: a later one replaces this one, and its link stops opening it.
    expect(message.lines.join(' ')).toContain('or until a later screening for the same practice or from this address replaces it');
    // What is deleted, and the plain list of what is kept (the founder's ruling of 2026-10-20, decision 7), from the one
    // wording every surface uses: nothing of this screening is kept but its record of counts unless an audit is requested.
    expect(message.lines).toContain(emailKept('none'));
    expect(emailKept('none')).toContain('Then we delete the result and the details you gave, unless an audit is requested from it');
    expect(emailKept('none')).toContain(`We keep a record of counts that names no one: ${KEPT_COUNTS}.`);
  });

  it('tells a prospect whose screening took over an earlier request that their details are kept with it, and for how long', () => {
    const carried = screeningResultMessage({ to: TO, link: LINK, rows: 3, keptWith: 'earlier_request' });
    const text = carried.lines.join(' ');
    expect(carried.lines).toContain(emailKept('earlier_request'));
    expect(text).toContain('An audit was requested for this practice from an earlier screening with the same practice name and ZIP code');
    expect(text).toContain(`we now keep ${KEPT_SUMMARY} with that request, in place of the earlier screening’s, for 12 months from this screening`);
    expect(text).not.toContain('Then we delete the result and the details you gave');
    // The kept summary's list names every column it holds: the email address and the campaign codes among them.
    for (const kept of ['email address', 'ZIP code', 'practice name', 'campaign codes', 'kind of paid click', 'referring firm', 'when the result was first opened']) {
      expect(KEPT_SUMMARY, kept).toContain(kept);
    }
    // The record of counts' list names the link's kind, the open, a refusal's kinds of problem and a replacement.
    for (const kept of ['kind of link', 'how soon the result was first opened', 'kinds of problem', 'followed a refused upload', 'later screening replaced it']) {
      expect(KEPT_COUNTS, kept).toContain(kept);
    }
  });

  it('tells the mailbox\'s owner why a waiting-tier upload waited, which the "sent" page leaves out (Q7; the review of 2026-10-22)', () => {
    const share = screeningResultMessage({ to: TO, link: LINK, rows: 3, waited: 'account_share' });
    const cap = screeningResultMessage({ to: TO, link: LINK, rows: 3, waited: 'daily_cap' });
    expect(share.lines[1]).toBe(SCREENING_WAITED.account_share);
    expect(cap.lines[1]).toBe(SCREENING_WAITED.daily_cap);
    expect(SCREENING_WAITED.account_share).toBe(
      'It waited behind other screenings because, with it, your email address or its organization had sent more than one day’s share of rows for screening that day.',
    );
    expect(SCREENING_WAITED.daily_cap).toBe('It waited behind other screenings because the screening had reached its limit for that day.');
    // A normal-tier upload's email says nothing of waiting.
    expect(screeningResultMessage({ to: TO, link: LINK, rows: 3 }).lines.join(' ')).not.toContain('waited');
    expect(screeningResultMessage({ to: TO, link: LINK, rows: 3, waited: null }).lines).toEqual(screeningResultMessage({ to: TO, link: LINK, rows: 3 }).lines);
  });

  it('holds no dollar figure, no date, no code and none of the words screening never uses', () => {
    const body = mailBody(message);
    const html = mailBodyHtml(message, STATIC);
    for (const text of [body, html, message.subject]) {
      expect(text).not.toMatch(FORBIDDEN);
      // No dollar figure: the kept list names "dollars" as a range kept, never an amount.
      expect(text).not.toMatch(/\$|\bcents?\b|\d[\d,.]*\s*dollars?\b/i);
      expect(text).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
    }
    // The only numbers are the row count, the 30 days and the 12 months.
    expect(body.replace(LINK, '').match(/\d[\d,]*/g)).toEqual(['1,234', '30', '12']);
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
    await memory.send({ ...message, identity: { stream: 'screening', kind: 'screening_result', subjectId: '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b01' } });
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
