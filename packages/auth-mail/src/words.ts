import { brandName } from '@paidwhole/brand';

/**
 * The words of every email the Cognito user pool sends (docs/adr/0081, the code-email amendment; docs/brand/BRAND.md,
 * section 1): sentence case, no "please", "{instruction}: {what follows}", no contractions, "reset" and never
 * "recover". No name, no organization, no PHI. Each is set as written: Cognito's mail does not go through the worker's
 * brandedSubject(), so a subject names the product itself.
 *
 * The section 2.5 words of the reset code (the recovery design, UXR-04) are kept word for word, with one sentence
 * added after its 15 minutes (O-8): "If you asked more than once, use the newest code."
 */

/** Every source Cognito's CustomMessage trigger is called with (the AWS Lambda trigger's triggerSource values). */
export const COGNITO_MESSAGE_SOURCES = [
  'CustomMessage_SignUp',
  'CustomMessage_AdminCreateUser',
  'CustomMessage_ResendCode',
  'CustomMessage_ForgotPassword',
  'CustomMessage_UpdateUserAttribute',
  'CustomMessage_VerifyUserAttribute',
  'CustomMessage_Authentication',
] as const;
export type CognitoMessageSource = (typeof COGNITO_MESSAGE_SOURCES)[number];

/** A value the message is given: the code (Cognito's {####}), the invitation's username ({username}) and its sign-in page. */
export type Slot = 'code' | 'username' | 'signInUrl';
/** One run of a paragraph: fixed words, or a slot. */
export type Part = string | { readonly slot: Slot };
export type Paragraph = readonly Part[];

export interface MessageWords {
  readonly subject: string;
  readonly paragraphs: readonly Paragraph[];
}

/**
 * An invitation's temporary password lasts as long as the invitation does (INVITATION_DAYS, infra's
 * identity.ts and packages/db; docs/adr/0053), held equal to it by a test.
 */
export const INVITATION_DAYS = 7;
/** The reset step's own limit, which the page states (RESET_COOKIE_SECONDS, docs/adr/0081 A1), not the provider's hour. */
export const RESET_STEP_MINUTES = 15;
/** Cognito's sign-in session (TOKEN_LIFETIMES.authSession), the time an emailed sign-in code could be used in. */
export const SIGN_IN_CODE_MINUTES = 3;

/** The sender's display name on every message the pool sends, as the worker's mail has it ("PaidWhole <address>"). */
export const AUTH_MAIL_SENDER_NAME = brandName;

/** The footer of every message the pool sends: the sentence a phishing look-alike cannot keep. */
export const AUTH_MAIL_FOOTER = `${brandName} never asks you to send your password or a code to anyone, by email, phone or chat: enter a code only on the ${brandName} page that asked for it.`;

const code = { slot: 'code' } as const;
const username = { slot: 'username' } as const;
const signInUrl = { slot: 'signInUrl' } as const;

const IGNORE_NOTHING_CHANGES = 'Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes.';

const confirmAccount: MessageWords = {
  subject: `Your ${brandName} code`,
  paragraphs: [[`Your code to confirm your ${brandName} account is `, code, '.'], [IGNORE_NOTHING_CHANGES]],
};

const invitation: MessageWords = {
  subject: `Your ${brandName} invitation`,
  paragraphs: [
    // {username} is whatever Cognito puts there (the address, or the pool's internal name in an email-attribute pool),
    // so the words never say which; the person signs in with the address the email came to.
    [`You are invited to ${brandName}. Your account is `, username, '. Sign in with the address this email came to and this temporary password:'],
    [code],
    ['Sign in at ', signInUrl, ` within ${String(INVITATION_DAYS)} days. You then choose your own password and set up an authenticator app.`],
    [`If you did not expect this invitation, ignore this email: it ends after ${String(INVITATION_DAYS)} days.`],
  ],
};

/** Each source's words. A source that cannot fire in this pool (sign-up, resend code, sign-in code) still has true ones. */
export const COGNITO_MESSAGES: Readonly<Record<CognitoMessageSource, MessageWords>> = {
  CustomMessage_ForgotPassword: {
    subject: `Your ${brandName} code`,
    paragraphs: [
      [`Your code to choose a new ${brandName} password is `, code, '.'],
      // "If you asked more than once, use the newest code." (decision O-8, Lane A's orchestrator as the brand owner's
      // delegate, 2026-11-05): true whether or not Cognito voids an earlier code, which is not verified here.
      [`Enter it on the page that sent it within ${String(RESET_STEP_MINUTES)} minutes. If you asked more than once, use the newest code. If you did not ask for it, ignore this email: your password is unchanged.`],
    ],
  },
  CustomMessage_AdminCreateUser: invitation,
  CustomMessage_UpdateUserAttribute: {
    subject: `Your ${brandName} code`,
    paragraphs: [
      [`Your code to confirm this new email address for your ${brandName} account is `, code, '.'],
      ['Enter it on the page that sent it. If you did not ask for it, ignore this email: the address stays unconfirmed.'],
    ],
  },
  CustomMessage_VerifyUserAttribute: {
    subject: `Your ${brandName} code`,
    paragraphs: [[`Your code to confirm this email address for your ${brandName} account is `, code, '.'], [IGNORE_NOTHING_CHANGES]],
  },
  CustomMessage_SignUp: confirmAccount,
  CustomMessage_ResendCode: confirmAccount,
  CustomMessage_Authentication: {
    subject: `Your ${brandName} sign-in code`,
    paragraphs: [
      [`Your ${brandName} sign-in code is `, code, '.'],
      [
        `Enter it on the page that sent it within ${String(SIGN_IN_CODE_MINUTES)} minutes. If you are not signing in, someone may know your password: choose a new one with “Forgot your password?” on the sign-in page.`,
      ],
    ],
  },
};

/**
 * The pool's own verification template, which Cognito sends when the trigger leaves a message unchanged (an unknown
 * source, a missing parameter, an error). Every code source shares it, so its words are true for each: never the
 * reset's.
 */
export const FALLBACK_CODE: MessageWords = {
  subject: `Your ${brandName} code`,
  paragraphs: [[`Your ${brandName} code is `, code, '.'], [IGNORE_NOTHING_CHANGES]],
};

/** The pool's own invitation template: the invitation's words, its sign-in page joined in at synth time. */
export const FALLBACK_INVITATION: MessageWords = invitation;

/** The password-changed email's subject, sent as "Your password was changed | PaidWhole" by the worker's brandedSubject(). */
export const PASSWORD_CHANGED_SUBJECT = 'Your password was changed';

/** A moment as every screen writes it (apps/web's format.ts utc()): "2026-11-05 14:32 UTC" (the minute, never rounded up). */
export function utcMinute(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * The password-changed email's four lines (sent by the worker's password_notices job, docs/adr/0091):
 *
 * 1. When, and that the change was made with a code sent to this address.
 * 2. That every session ended (the sign-in notice's words) and, only to an account with a second factor enrolled
 *    (`secondFactorEnrolled`, the claim's mfa_enrolled), that signing in still asks for it. An account with none (an
 *    invitee who stopped before the authenticator) is never told a factor guards it: its line ends at the sessions.
 * 3. To ignore the email if the reader made the change. Never "nothing more to do": a locked account that resets is
 *    told too, and still has to write to have the lock lifted.
 * 4. If they did not, two routes: to write to the support address from the address they sign in with (the sign-in
 *    screens' phrase, not "this address", which a forwarded mailbox is not; docs/runbooks/support-mail.md), and to tell
 *    their organization's administrator, a route that needs no inbound mail: mail from a sender SES cannot verify, or
 *    from a disabled account, opens no ticket.
 *
 * No link that acts on the account, and no "from where".
 */
export function passwordChangedLines(changedAt: Date, supportEmail: string, secondFactorEnrolled: boolean): readonly string[] {
  return [
    `The password for your ${brandName} account was changed at ${utcMinute(changedAt)}, with a code sent to this address.`,
    secondFactorEnrolled
      ? 'Every session of this account has ended. Signing in still asks for your authenticator code or hardware key.'
      : 'Every session of this account has ended.',
    'If you changed it, ignore this email.',
    `If you did not, write to ${supportEmail} now from the address you sign in with, and tell your organization’s administrator. We will help you secure the account.`,
  ];
}

/** The three hardware-key notices of an account (docs/adr/0095): the notice row's kind. */
export const HARDWARE_KEY_NOTICE_KINDS = ['removed', 'registration_opened', 'registered_after_removal'] as const;
export type HardwareKeyNoticeKind = (typeof HARDWARE_KEY_NOTICE_KINDS)[number];

/** Each hardware-key notice's subject, sent with the product's name after it by the worker's brandedSubject(). */
export const HARDWARE_KEY_NOTICE_SUBJECTS: Readonly<Record<HardwareKeyNoticeKind, string>> = {
  removed: 'Your hardware keys were removed',
  registration_opened: 'Registration of a new hardware key is open',
  registered_after_removal: 'A new hardware key was registered',
};

/** How long an opened registration lasts, in the email's words (the database's hour: hardware_key_removal_opening). */
export const KEY_REGISTRATION_OPEN_HOURS = 1;

/**
 * A hardware-key notice's lines (docs/adr/0095), to the account's own address, from the outbox the database writes in
 * the event's own transaction. What happened and when (UTC, to the minute); what the next sign-in asks for, where that
 * is true of the event; and the one route if the reader did not expect it: the support address, written to from the
 * address they sign in with (the password-changed email's phrase). No name, no practice, no link, no code: the
 * one-time code that opens registration is read to the member by a person and is in no email.
 *
 * - `removed`: the keys were removed by the product's staff; signing in asks for the password and the authenticator
 *   code; a new key is registered only once support opens registration and gives a one-time code.
 * - `registration_opened`: registration is open for one hour from the time; with the one-time code.
 * - `registered_after_removal`: a new key was registered; signing in asks for it from now on.
 */
export function hardwareKeyNoticeLines(kind: HardwareKeyNoticeKind, eventAt: Date, supportEmail: string): readonly string[] {
  const at = utcMinute(eventAt);
  switch (kind) {
    case 'removed':
      return [
        `The hardware keys on your ${brandName} account were removed by ${brandName} at ${at}. Every session of this account has ended.`,
        `Signing in asks for your password and your authenticator code. Before you can register a new hardware key, ${brandName} support opens registration and gives you a one-time code.`,
        `If you did not expect this, write to ${supportEmail} now from the address you sign in with.`,
      ];
    case 'registration_opened':
      return [
        `${brandName} opened registration of a new hardware key on your ${brandName} account at ${at}, for ${KEY_REGISTRATION_OPEN_HOURS} hour.`,
        `To register the key, sign in with your password and your authenticator code, then enter the one-time code ${brandName} support gave you.`,
        `If you did not ask for this, write to ${supportEmail} at once from the address you sign in with.`,
      ];
    case 'registered_after_removal':
      return [
        `A new hardware key was registered on your ${brandName} account at ${at}.`,
        'Signing in asks for this key from now on.',
        `If this was not you, write to ${supportEmail} at once from the address you sign in with.`,
      ];
  }
}
