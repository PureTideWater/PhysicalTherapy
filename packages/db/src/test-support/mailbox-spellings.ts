/**
 * The spellings of one mailbox and the canonical mailbox each reads as (review S2; docs/adr/0065), synthetic addresses only:
 * mail-address.test.ts holds canonicalMailbox() to them, and mail.db.test.ts holds the SQL form, mail_recipient_canonical(),
 * to the same table.
 */
export const MAILBOX_SPELLINGS: readonly (readonly [string, string])[] = [
  // Case and surrounding ASCII white space.
  ['jane.doe@clinic.synthetic.test', 'jane.doe@clinic.synthetic.test'],
  ['  JANE.Doe@Clinic.Synthetic.Test\t', 'jane.doe@clinic.synthetic.test'],
  ['\njane.doe@clinic.synthetic.test\r\n', 'jane.doe@clinic.synthetic.test'],
  ['\v\fjane.doe@clinic.synthetic.test \v', 'jane.doe@clinic.synthetic.test'],
  // Any character outside ASCII: the address stands as read (ASCII white space at its ends dropped and its ASCII letters
  // in lower case), whatever Unicode version the server or Node holds; the screening's form takes only ASCII (the review
  // of 2026-10-27: Node's NFKC and PostgreSQL's differed on U+A7F1).
  ['　jane.doe@clinic.synthetic.test ', '　jane.doe@clinic.synthetic.test'],
  [' jane.doe@clinic.synthetic.test ', ' jane.doe@clinic.synthetic.test '],
  ['ｊａｎｅ．ｄｏｅ＠ｃｌｉｎｉｃ．ｓｙｎｔｈｅｔｉｃ．ｔｅｓｔ', 'ｊａｎｅ．ｄｏｅ＠ｃｌｉｎｉｃ．ｓｙｎｔｈｅｔｉｃ．ｔｅｓｔ'],
  ['réne@clinic.synthetic.test', 'réne@clinic.synthetic.test'],
  ['ÉLISE@Clinic.Synthetic.Test', 'Élise@clinic.synthetic.test'],
  ['Jané.Doe+X@GoogleMail.com.', 'jané.doe+x@googlemail.com.'],
  ['jane@clinic꟱.synthetic.test', 'jane@clinic꟱.synthetic.test'],
  ['KKelvin@gmail.com', 'kKelvin@gmail.com'],
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
  // iCloud: me.com and mac.com reach the icloud.com mailbox of the same name (one account, its names reserved across
  // the three), which keeps its dots.
  ['Jane.Doe@me.com', 'jane.doe@icloud.com'],
  ['jane.doe+screening@Mac.com.', 'jane.doe@icloud.com'],
  ['jane.doe@iCloud.com', 'jane.doe@icloud.com'],
  ['jane.doe@mail.me.com', 'jane.doe@mail.me.com'],
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

/**
 * The same rule with the sub-address kept (keepTag; mail_recipient_canonical(address, true)), which keys a permanent
 * bounce (the review of 2026-10-27): a +tag spelling bounces where the mail server has no sub-addressing, which says
 * nothing of its base mailbox. Gmail delivers every +tag to the base mailbox, so gmail.com drops it even here.
 */
export const MAILBOX_TAGGED_SPELLINGS: readonly (readonly [string, string])[] = [
  ['jane.doe@clinic.synthetic.test', 'jane.doe@clinic.synthetic.test'],
  ['jane.doe+screening@clinic.synthetic.test', 'jane.doe+screening@clinic.synthetic.test'],
  [' JANE.Doe+Screening@Clinic.Synthetic.Test. ', 'jane.doe+screening@clinic.synthetic.test'],
  ['jane.doe+a+b@clinic.synthetic.test', 'jane.doe+a+b@clinic.synthetic.test'],
  ['jane.doe+@clinic.synthetic.test', 'jane.doe+@clinic.synthetic.test'],
  ['+screening@clinic.synthetic.test', '+screening@clinic.synthetic.test'],
  ['jane.doe+x@Mac.com', 'jane.doe+x@icloud.com'],
  ['Jane.Doe+screening@GoogleMail.com', 'janedoe@gmail.com'],
  ['j.a.n.e.d.o.e+a+b@gmail.com', 'janedoe@gmail.com'],
  ['+screening@gmail.com', '+screening@gmail.com'],
  ['Jané.Doe+X@clinic.synthetic.test', 'jané.doe+x@clinic.synthetic.test'],
  ['No At Sign', 'no at sign'],
  ['', ''],
];
