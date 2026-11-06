import { describe, expect, it } from 'vitest';

import { FREE_MAIL_DOMAINS, isFreeMailDomain, screeningRateAccount } from './rate';

/**
 * Who a free screening's rate limit counts (test matrix SCR-04, its pure part; decision D21 a): a business address by
 * its domain, a free-mail address by its mailbox, however the address is spelled. Synthetic addresses only.
 */

describe('the screening rate limit’s account', () => {
  it('counts a business address by its domain, and a free-mail address by its mailbox', () => {
    expect(screeningRateAccount('Front.Desk@Clinic.Synthetic.Test')).toBe('domain:clinic.synthetic.test');
    expect(screeningRateAccount('billing+screening@clinic.synthetic.test')).toBe('domain:clinic.synthetic.test');
    expect(screeningRateAccount('clinic.prospect@yahoo.com')).toBe('address:clinic.prospect@yahoo.com');
    expect(screeningRateAccount('')).toBeNull();
    expect(screeningRateAccount(null)).toBeNull();
    expect(screeningRateAccount('no-domain')).toBe('address:no-domain');
  });

  it('reads one Gmail mailbox once whatever its spelling: case, dots, a plus tag, googlemail.com, a trailing dot', () => {
    const mailbox = 'address:aliasprobe@gmail.com';
    for (const spelling of [
      'alias.probe@gmail.com',
      'ALIAS.PROBE@GMAIL.COM',
      'aliasprobe@gmail.com',
      'a.l.i.a.s.p.r.o.b.e@gmail.com',
      'alias.probe+screening@gmail.com',
      'alias.probe+1+2@gmail.com',
      'alias.probe@googlemail.com',
      'alias.probe@gmail.com.',
      'alias.probe@gmail.com..',
      ' alias.probe@gmail.com ',
    ]) {
      expect(screeningRateAccount(spelling), spelling).toBe(mailbox);
    }
    // An address with a character outside ASCII is counted as read (its ASCII letters in lower case): the form refuses it,
    // so it is never validated or mailed, and no Unicode table decides a key (the review of 2026-10-27).
    expect(screeningRateAccount('ＡＬＩＡＳ.ｐｒｏｂｅ@ｇｍａｉｌ.ｃｏｍ')).toBe('address:ＡＬＩＡＳ.ｐｒｏｂｅ@ｇｍａｉｌ.ｃｏｍ');
    expect(screeningRateAccount('Alias.Probé@Gmail.com')).toBe('address:alias.probé@gmail.com');
  });

  it('reads one iCloud mailbox once under its three domains (the review of 2026-10-27)', () => {
    for (const spelling of ['alias.probe@icloud.com', 'Alias.Probe@me.com', 'alias.probe+x@mac.com', 'alias.probe@ME.com.']) {
      expect(screeningRateAccount(spelling), spelling).toBe('address:alias.probe@icloud.com');
    }
    expect(screeningRateAccount('aliasprobe@icloud.com')).toBe('address:aliasprobe@icloud.com');
  });

  it('drops a plus tag at every free-mail domain, and keeps the dots where they name another mailbox', () => {
    expect(screeningRateAccount('clinic.prospect+a@outlook.com')).toBe('address:clinic.prospect@outlook.com');
    expect(screeningRateAccount('clinic.prospect+b@bellsouth.net')).toBe('address:clinic.prospect@bellsouth.net');
    expect(screeningRateAccount('clinic.prospect@yahoo.com.')).toBe('address:clinic.prospect@yahoo.com');
    expect(screeningRateAccount('+only@gmail.com')).toBe('address:+only@gmail.com');
  });

  it('lists the large webmail services and the mail of the large United States internet providers, and their subdomains', () => {
    for (const domain of [
      'gmail.com',
      'yahoo.com',
      'yahoo.co.uk',
      'rocketmail.com',
      'outlook.com',
      'hotmail.com',
      'hotmail.co.uk',
      'aol.com',
      'aim.com',
      'icloud.com',
      'protonmail.com',
      'protonmail.ch',
      'comcast.net',
      'att.net',
      'sbcglobal.net',
      'bellsouth.net',
      'verizon.net',
      'cox.net',
      'charter.net',
      'rr.com',
      'roadrunner.com',
      'earthlink.net',
      'optonline.net',
      'frontier.com',
      'windstream.net',
      'centurylink.net',
    ]) {
      expect(FREE_MAIL_DOMAINS.has(domain), domain).toBe(true);
      expect(isFreeMailDomain(domain), domain).toBe(true);
    }
    expect(isFreeMailDomain('nc.rr.com')).toBe(true);
    expect(isFreeMailDomain('tampabay.rr.com')).toBe(true);
    // A label match, never a suffix of the text: these are businesses.
    for (const domain of ['acme.com', 'notgmail.com', 'clinic.synthetic.test', 'com', 'mail.clinic.synthetic.test']) {
      expect(isFreeMailDomain(domain), domain).toBe(false);
    }
  });
});
