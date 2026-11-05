import { brandName } from '@paidwhole/brand';

/**
 * The words of every email the Cognito user pool sends (docs/adr/0081, the code-email amendment; docs/brand/BRAND.md,
 * section 1): sentence case, no "please", "{instruction}: {what follows}", no contractions, "reset" and never
 * "recover". No name, no organization, no PHI. Each is set as written: Cognito's mail does not go through the worker's
 * brandedSubject(), so a subject names the product itself.
 *
 * The section 2.5 words of the reset code (the recovery design, UXR-04) are kept word for word.
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

/** The footer of every message the pool sends: the sentence a phishing look-alike cannot keep. */
export const AUTH_MAIL_FOOTER = `${brandName} never asks for your password or a code by email, phone or chat.`;

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
    [`You are invited to ${brandName}. Sign in with this email address, `, username, ', and this temporary password:'],
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
      [`Enter it on the page that sent it within ${String(RESET_STEP_MINUTES)} minutes. If you did not ask for it, ignore this email: your password is unchanged.`],
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** A moment in UTC words: "November 5, 2026 at 14:32 UTC" (the minute, never rounded up). */
export function utcWords(at: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${MONTHS[at.getUTCMonth()] ?? ''} ${String(at.getUTCDate())}, ${String(at.getUTCFullYear())} at ${two(at.getUTCHours())}:${two(at.getUTCMinutes())} UTC`;
}

/**
 * The password-changed email's lines (sent from the follow-on pull request, docs/adr/0091): when, that every device was
 * signed out and the second factor still holds, and the support route, which is to write from the address one signs in
 * with (docs/runbooks/support-mail.md). No link that acts on the account, and no "from where".
 */
export function passwordChangedLines(changedAt: Date, supportEmail: string): readonly string[] {
  return [
    `The password for your ${brandName} account was changed on ${utcWords(changedAt)}, with a code sent to this address.`,
    'Every device signed in to the account was signed out. Signing in still asks for your authenticator code or hardware key.',
    'If you changed it, there is nothing more to do.',
    `If you did not, write to ${supportEmail} from this address now, and we will help you secure the account.`,
  ];
}
