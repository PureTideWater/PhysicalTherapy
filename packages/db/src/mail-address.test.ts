import { describe, expect, it } from 'vitest';

import { canonicalMailbox, canonicalMailboxParts } from './mail-address';
import { MAILBOX_SPELLINGS, MAILBOX_TAGGED_SPELLINGS } from './test-support/mailbox-spellings';

describe('the mailbox an address reaches (S2)', () => {
  it('reads every spelling of one mailbox as one', () => {
    for (const [given, mailbox] of MAILBOX_SPELLINGS) {
      expect(canonicalMailbox(given), JSON.stringify(given)).toBe(mailbox);
    }
  });

  it('keeps a sub-address when asked, but at gmail.com, which delivers every one to the base mailbox (the review of 2026-10-27)', () => {
    for (const [given, mailbox] of MAILBOX_TAGGED_SPELLINGS) {
      expect(canonicalMailbox(given, { keepTag: true }), JSON.stringify(given)).toBe(mailbox);
    }
    // Without a +tag the two keys are one, so a bounce of the base address is found under either.
    for (const [given] of MAILBOX_SPELLINGS) {
      if (!given.includes('+')) {
        expect(canonicalMailbox(given, { keepTag: true }), JSON.stringify(given)).toBe(canonicalMailbox(given));
      }
    }
  });

  it('splits a canonical mailbox into its local part and domain, or none when it has no local part or domain, or a character outside ASCII', () => {
    expect(canonicalMailboxParts(' Jane.Doe+x@GoogleMail.com. ')).toEqual({ local: 'janedoe', domain: 'gmail.com' });
    expect(canonicalMailboxParts('jane.doe+x@clinic.synthetic.test')).toEqual({ local: 'jane.doe', domain: 'clinic.synthetic.test' });
    expect(canonicalMailboxParts('jane.doe+x@clinic.synthetic.test', { keepTag: true })).toEqual({ local: 'jane.doe+x', domain: 'clinic.synthetic.test' });
    expect(canonicalMailboxParts('Jane.Doe@Me.com')).toEqual({ local: 'jane.doe', domain: 'icloud.com' });
    expect(canonicalMailboxParts('@gmail.com')).toBeNull();
    expect(canonicalMailboxParts('jane@.')).toBeNull();
    expect(canonicalMailboxParts('no at sign')).toBeNull();
    expect(canonicalMailboxParts('jané@gmail.com')).toBeNull();
    expect(canonicalMailboxParts('ｊａｎｅ＠ｇｍａｉｌ．ｃｏｍ')).toBeNull();
  });
});
