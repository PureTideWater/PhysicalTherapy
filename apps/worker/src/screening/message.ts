import type { MailMessage } from '../mail/mail';

/**
 * The emails of a free screening (Change Order 001, CO-04; reconciliation-001, D21 a): the link to the result,
 * sent once the run completes, and the notice that a run could not be completed. A prospect has no account, so
 * the emailed link is how the result reaches the contact (and verifies the address); the browser only says to
 * check the email. Each message is the prospect variant of the mail template: the lockup without the tagline
 * (decision D11, since the tagline says owed and screening never does) and a footer that says why it came.
 *
 * What a message holds: fixed sentences, the count of rows the upload had, and one link. Never a dollar figure, a
 * date, a code, the practice's name or anything from the file; the link's only identifier is the result's
 * unguessable token, which the caller passes in and which is never logged (a refusal here names the rule, never
 * the link). The result email says what is deleted when the link closes and what is kept: a record of counts that
 * names no one (audit #57; the founder's ruling of 2026-10-20, decision 7, the plain list).
 */

/** A result link's path: /screening/results/ and the 32-letter token (apps/worker/src/screening/token.ts). */
const RESULT_PATH = /^\/screening\/results\/[a-z]{32}$/;
/** Where a prospect starts again. */
const START_PATH = '/screening';

export class ScreeningMessageError extends Error {
  override readonly name = 'ScreeningMessageError';
}

function recipients(to: string | readonly string[]): readonly string[] {
  const list = typeof to === 'string' ? [to] : to;
  if (list.length !== 1) {
    throw new ScreeningMessageError('a screening email goes to its one contact');
  }
  return list;
}

function linkWithPath(link: string, accepts: (pathname: string) => boolean, rule: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new ScreeningMessageError(rule);
  }
  if (!/^https?:$/.test(url.protocol) || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '' || !accepts(url.pathname)) {
    throw new ScreeningMessageError(rule);
  }
  return url.href;
}

/** The result's link at the application's origin. */
export function screeningResultLink(origin: string, token: string): string {
  return linkWithPath(`${new URL(origin).origin}/screening/results/${token}`, (pathname) => RESULT_PATH.test(pathname), 'a screening result link is the origin, /screening/results/ and its token');
}

/** The screening page at the application's origin, where a prospect starts again. */
export function screeningStartLink(origin: string): string {
  return `${new URL(origin).origin}${START_PATH}`;
}

function rowsText(rows: number): string {
  if (!Number.isSafeInteger(rows) || rows < 1) {
    throw new ScreeningMessageError('a screening email counts the rows of its upload, at least one');
  }
  return `${rows.toLocaleString('en-US')} ${rows === 1 ? 'row' : 'rows'}`;
}

/** The email that carries a completed screening's link, which opens the result for 30 days from the upload. */
export function screeningResultMessage({ to, link, rows }: { readonly to: string | readonly string[]; readonly link: string; readonly rows: number }): MailMessage {
  return {
    to: recipients(to),
    subject: 'Your screening is ready',
    lines: [
      `The screening you started on the PaidWhole screening page is ready. It covers the ${rowsText(rows)} of your upload.`,
      'The link below opens it for 30 days from your upload, or until a later screening for the same practice or from this address replaces it. Then we delete the result and your details, and keep only a record of counts that names no one: ranges of the file’s rows and dollars, the shares priced, how you heard of us, whether the result was opened or an audit requested, the release and the month.',
      'Anyone with the link can open it, so share it only with people at your practice.',
      'If you did not start a screening, ignore this message; nothing more will be sent.',
      'Open your screening:',
    ],
    links: [linkWithPath(link, (pathname) => RESULT_PATH.test(pathname), 'a screening result link is the origin, /screening/results/ and its token')],
    variant: 'prospect',
  };
}

/** The email sent when a screening could not be completed: a link to start again, nothing else. */
export function screeningFailedMessage({ to, startOver }: { readonly to: string | readonly string[]; readonly startOver: string }): MailMessage {
  return {
    to: recipients(to),
    subject: 'Your screening could not be completed',
    lines: [
      'The screening you started on the PaidWhole screening page could not be completed. No result was made from your upload.',
      'If you did not start a screening, ignore this message. Otherwise you can start again with the same file:',
    ],
    links: [linkWithPath(startOver, (pathname) => pathname === START_PATH, 'a screening start-over link is the origin and /screening')],
    variant: 'prospect',
  };
}
