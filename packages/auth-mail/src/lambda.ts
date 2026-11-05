import { cognitoMessage } from './render';
import { COGNITO_MESSAGE_SOURCES } from './words';

/** The log code of a message left to the pool's own template; a metric filter on it raises an operator alarm. */
export const COGNITO_MESSAGE_FALLBACK = 'COGNITO_MESSAGE_FALLBACK';

/** The handler's one environment variable: the invitation's sign-in page, https://<AppDomainName>/sign-in. */
export const COGNITO_MESSAGE_SIGN_IN_ENV = 'APP_SIGN_IN_URL';

/** The inline source's bound: inlined into the template as the function's ZipFile, it stays small. */
export const COGNITO_MESSAGE_SOURCE_MAX_BYTES = 16 * 1024;

/** Where Cognito's parameters and the sign-in page go in the pre-rendered HTML: characters no word or escape produces. */
const MARK = { code: '\u0000C\u0000', username: '\u0000U\u0000', signInUrl: '\u0000S\u0000' } as const;

/** Each source's subject and HTML, rendered once from the words, with the marks where the values go. */
const TABLE = Object.fromEntries(
  COGNITO_MESSAGE_SOURCES.map((source) => {
    const message = cognitoMessage(source, MARK);
    return [source, { s: message.subject, h: message.html }];
  }),
);

/**
 * The CustomMessage trigger of the user pool (docs/adr/0081, the code-email amendment), as inline CommonJS for Node 22:
 * no require, no SDK, no network. It sets each source's subject and message from the words above, writing Cognito's own
 * placeholders (request.codeParameter, and request.usernameParameter for an invitation) exactly once each, through a
 * replacer function so no replacement pattern is read in them; Cognito fills in the code after it returns.
 *
 * On any doubt it returns the event unchanged, so Cognito sends the pool's own branded, generic template: an unknown
 * source, no request or response, a parameter that is not a placeholder, an invitation whose sign-in page is not
 * https://<host>/sign-in, or any thrown error. It then logs one line of codes: the closed reason and the source only
 * when it is a CustomMessage name. It never reads request.userAttributes (the address) and never logs the event. It
 * refuses nothing, so it tells nothing about an account.
 */
export const COGNITO_MESSAGE_SOURCE = `'use strict';
const T = ${JSON.stringify(TABLE)};
const C = ${JSON.stringify(MARK.code)};
const U = ${JSON.stringify(MARK.username)};
const S = ${JSON.stringify(MARK.signInUrl)};
const SIGN_IN = process.env.${COGNITO_MESSAGE_SIGN_IN_ENV};
const PLACEHOLDER = /^\\{[#$A-Za-z0-9_]{1,32}\\}$/;
const SIGN_IN_PAGE = /^https:\\/\\/[a-z0-9.-]{1,253}\\/sign-in$/;
const SOURCE = /^CustomMessage_[A-Za-z]{1,40}$/;
function fallback(event, reason) {
  let source = 'unrecognized';
  try {
    const named = event && event.triggerSource;
    if (typeof named === 'string' && SOURCE.test(named)) source = named;
  } catch (e) {}
  console.log(JSON.stringify({ error_code: '${COGNITO_MESSAGE_FALLBACK}', reason: reason, trigger_source: source }));
  return event;
}
exports.handler = async (event) => {
  try {
    const named = event && event.triggerSource;
    const t = typeof named === 'string' && Object.prototype.hasOwnProperty.call(T, named) ? T[named] : undefined;
    if (!t) return fallback(event, 'unknown_source');
    const r = event.request;
    if (!r || typeof r !== 'object') return fallback(event, 'no_request');
    if (!event.response || typeof event.response !== 'object') return fallback(event, 'no_response');
    const code = r.codeParameter;
    if (typeof code !== 'string' || !PLACEHOLDER.test(code)) return fallback(event, 'code_parameter');
    let html = t.h.replace(C, () => code);
    if (html.includes(U)) {
      const username = r.usernameParameter;
      if (typeof username !== 'string' || !PLACEHOLDER.test(username)) return fallback(event, 'username_parameter');
      html = html.replace(U, () => username);
    }
    if (html.includes(S)) {
      if (typeof SIGN_IN !== 'string' || !SIGN_IN_PAGE.test(SIGN_IN)) return fallback(event, 'sign_in_url');
      html = html.replace(S, () => SIGN_IN);
    }
    event.response.emailSubject = t.s;
    event.response.emailMessage = html;
    return event;
  } catch (e) {
    return fallback(event, 'error');
  }
};
`;
