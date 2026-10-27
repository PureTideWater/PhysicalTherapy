/**
 * The spellings of one mailbox and the canonical mailbox each reads as (review S2; docs/adr/0065), synthetic addresses only:
 * mail-address.test.ts holds canonicalMailbox() to them, and mail.db.test.ts holds the SQL form, mail_recipient_canonical(),
 * to the same table.
 */
export const MAILBOX_SPELLINGS: readonly (readonly [string, string])[] = [
  // Case, surrounding white space, Unicode compatibility and composed forms.
  ['jane.doe@clinic.synthetic.test', 'jane.doe@clinic.synthetic.test'],
  ['  JANE.Doe@Clinic.Synthetic.Test\t', 'jane.doe@clinic.synthetic.test'],
  ['\njane.doe@clinic.synthetic.test\r\n', 'jane.doe@clinic.synthetic.test'],
  ['　jane.doe@clinic.synthetic.test ', 'jane.doe@clinic.synthetic.test'],
  ['ｊａｎｅ．ｄｏｅ＠ｃｌｉｎｉｃ．ｓｙｎｔｈｅｔｉｃ．ｔｅｓｔ', 'jane.doe@clinic.synthetic.test'],
  ['réne@clinic.synthetic.test', 'réne@clinic.synthetic.test'],
  // Only ASCII letters change case, whatever the locale.
  ['ÉLISE@Clinic.Synthetic.Test', 'Élise@clinic.synthetic.test'],
  // A sub-address, at every domain; dots kept off gmail.com.
  ['jane.doe+screening@clinic.synthetic.test', 'jane.doe@clinic.synthetic.test'],
  ['jane.doe+a+b@clinic.synthetic.test', 'jane.doe@clinic.synthetic.test'],
  // A domain's trailing dots.
  ['jane.doe@clinic.synthetic.test..', 'jane.doe@clinic.synthetic.test'],
  // Gmail: dots, googlemail.com, and both with a sub-address.
  ['Jane.Doe@Gmail.com', 'janedoe@gmail.com'],
  ['j.a.n.e.d.o.e@gmail.com', 'janedoe@gmail.com'],
  ['jane.doe+screening@gmail.com', 'janedoe@gmail.com'],
  ['jane.doe@googlemail.com', 'janedoe@gmail.com'],
  [' JANE.DOE+X@GoogleMail.com. ', 'janedoe@gmail.com'],
  // Google Workspace and every other domain keep their dots.
  ['jane.doe@workspace.synthetic.test', 'jane.doe@workspace.synthetic.test'],
  ['jane.doe@mail.gmail.com', 'jane.doe@mail.gmail.com'],
  // Nothing left to key: kept as read.
  ['+screening@gmail.com', '+screening@gmail.com'],
  ['...@gmail.com', '...@gmail.com'],
  ['.+x@gmail.com', '.+x@gmail.com'],
  // The last @ splits; no local part or no domain stands as read.
  ['a@b@gmail.com', 'a@b@gmail.com'],
  ['@gmail.com', '@gmail.com'],
  ['jane.doe@', 'jane.doe@'],
  ['jane.doe@...', 'jane.doe@...'],
  ['No At Sign', 'no at sign'],
  ['', ''],
];
