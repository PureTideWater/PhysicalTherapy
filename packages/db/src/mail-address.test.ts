import { describe, expect, it } from 'vitest';

import { canonicalMailbox, canonicalMailboxParts } from './mail-address';
import { MAILBOX_SPELLINGS } from './test-support/mailbox-spellings';

describe('the mailbox an address reaches (S2)', () => {
  it('reads every spelling of one mailbox as one', () => {
    for (const [given, mailbox] of MAILBOX_SPELLINGS) {
      expect(canonicalMailbox(given), JSON.stringify(given)).toBe(mailbox);
    }
  });

  it('splits a canonical mailbox into its local part and domain, or none when it has no local part or domain', () => {
    expect(canonicalMailboxParts(' Jane.Doe+x@GoogleMail.com. ')).toEqual({ local: 'janedoe', domain: 'gmail.com' });
    expect(canonicalMailboxParts('jane.doe+x@clinic.synthetic.test')).toEqual({ local: 'jane.doe', domain: 'clinic.synthetic.test' });
    expect(canonicalMailboxParts('@gmail.com')).toBeNull();
    expect(canonicalMailboxParts('jane@.')).toBeNull();
    expect(canonicalMailboxParts('no at sign')).toBeNull();
  });
});
