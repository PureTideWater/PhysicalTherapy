# Design: the branded code email and the "password changed" email (`co-001/auth-emails`)

Worktree `/home/user/auth-emails`, base f185655c (#121). Written 2026-11-05 by acting S4 (Lane A's account,
https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) for the workflow's build step. Line numbers are at f185655c.
Status file: `/home/user/ops/approval-summaries/lane-a-auth-emails-status.md`. Scope set by Lane A's orchestrator,
2026-11-05 04:03 UTC (not reopened here). Renders: `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail/renders/`.

## 0. The decision in one paragraph

Part 1, the branded code email, is built in this PR with no migration. A CustomMessage Lambda trigger sets the words of
every message the pool can send, in the brand's voice, in a header-less, text-first HTML frame. The frame has no remote
asset, no link in a code email, and only the plain sign-in address in the invitation. The words live once, in a new
dependency-free package, `@tp/auth-mail`. The Lambda's inline source, the pool's own fallback templates, the dev twin's
two outboxes and `pnpm lint:copy` all read that package. Part 2, the "password changed" email, needs a migration, so it
**cannot ship in this PR**. Its kind is refused by `mail_send`'s CHECKs (`20261107090000_mail_streams.sql:202`,
`:222-226`), and no role that sends mail may read a user's address (`20261015140000_tenancy.sql:501-502` gives tp_app
its own row only; tp_operator has no policy on `"user"`). Section 3 designs the best version: an outbox row written by
the database in the reset's own transaction, then sent by a platform job on the transactional stream. It goes in a
follow-on PR with ADR 0091 once the founder approves the domain model (CO-02). This PR ships that email's words and
frame variant with tests, so only the wiring is left for later.

---

## 1. The CustomMessage trigger (decided by the orchestrator; built here)

### 1.1 What the pool can fire (evidence)

| Trigger source | Fires in this pool? | Evidence |
| --- | --- | --- |
| `CustomMessage_AdminCreateUser` | **Yes**: every invitation, and every resend | `cognito-provider.ts:464-472` (`AdminCreateUser`, `DesiredDeliveryMediums: ['EMAIL']`), `:489` (`MessageAction: 'RESEND'`) |
| `CustomMessage_ForgotPassword` | **Yes**: every reset code | `cognito-provider.ts:504` (`ForgotPasswordCommand`); recovery by email only, `identity.ts:91` |
| `CustomMessage_UpdateUserAttribute` | **Admin only after the fix round** (the web client writes no attribute; S-2). Before it: a user holding an access token can call `UpdateUserAttributes` on `email` directly (the client's write attributes are Cognito's default, all writable, `identity.ts:111-121`; `email` is mutable, `:77`; `autoVerify: { email: true }`, `:76`). The app never calls it (no `UpdateUserAttributes` anywhere in `apps/`) | grep |
| `CustomMessage_VerifyUserAttribute` | **Reachable, unused**: `GetUserAttributeVerificationCode` with an access token | as above |
| `CustomMessage_SignUp` | No: `selfSignUpEnabled: false` (`identity.ts:73`) refuses `SignUp` | |
| `CustomMessage_ResendCode` | No in practice: `ResendConfirmationCode` serves unconfirmed sign-ups, and there are none (admin-created users only) | |
| `CustomMessage_Authentication` | No: email MFA is off (`identity.ts:79`, `email: false`) and email OTP is not a first factor (`:80`) | |

Every source gets its own words (1.4). A source that can never fire still gets correct words, so the table is total; a
source Cognito adds later goes to the pool's fallback template (1.5).

### 1.2 Where it lives

- **Words and renderer:** a new workspace package, `packages/auth-mail` (`@tp/auth-mail`, private, `type: module`,
  `main: ./src/index.ts`, as `@paidwhole/brand` is). It depends only on `@paidwhole/brand` (`palette`, `brandName`;
  brand-copy's `brand-words-literal` rule requires the name to be imported, and the hex lint allows brand hex only in
  tokens and the worker template, ADR 0058). Files:
  - `src/words.ts`: `COGNITO_MESSAGES`, a total `Record<CognitoMessageSource, { subject; paragraphs }>`. Each paragraph
    is a list of parts: fixed strings, `{ code }` and `{ username }` slots, and the invitation's `{ signInUrl }`.
    `AUTH_MAIL_FOOTER` is the footer. `FALLBACK_CODE` and `FALLBACK_INVITATION` are for the pool's templates.
  - `src/render.ts`: `cognitoMessage(source, { code, username, signInUrl })` returns `{ subject, html, text }`, and
    `authMailHtml(subject, paragraphs)` returns the frame. The frame is the worker's `mailHtml(..., staticOrigin =
    null)` structure (`apps/worker/src/mail/template.ts:77-93`): White ground, a 560 px card with a Line border, Plex
    Sans at 15/22 in Ink, and a Slate footer, with no header row. The only difference is the footer's words, held by
    a worker test (4.1).
  - `src/lambda.ts`: `COGNITO_MESSAGE_SOURCE`, the handler as inline CommonJS. It is built **at module load** from the
    same table: the HTML and subjects are pre-rendered, with marker tokens where Cognito's parameters go. It has no
    `require`. The shape is in 1.6.
  - `src/index.ts`: re-exports.
- **Infrastructure:** a new construct, `infra/lib/constructs/cognito-messages.ts`, made by `Identity`
  (`identity.ts:69-122`), which passes it as `lambdaTriggers: { customMessage }`. Infra imports a workspace package
  here for the first time; until now it holds copies and app tests read its text (`apps/web/src/lib/auth/primitives.test.ts:66-74`).
  This is a deliberate departure. A copy of user-facing words in infra would drift from the twin's words and sit
  outside brand-copy. The cost is that `infra/package.json` gains `"@tp/auth-mail": "workspace:*"`. That changes the
  manifest and the lockfile, so `pnpm actions:check` and `pnpm toolchain:check` must run (CLAUDE.md Commands).
- **Precedent for inline Lambda code:** `migration-run.ts:66-74` (`lambda.Code.fromInline(MIGRATION_RUNNER_SOURCE)`,
  `NODEJS_22_X`). That source is 2,675 characters; this one is expected to be about 9 to 11 KB (seven sources at about
  1.3 KB of HTML each). CDK 2.275 sets no inline size limit (`aws-lambda/lib/code.js`, `InlineCode` checks only for
  empty code).

### 1.3 The frame and layout (all messages)

- The frame is text-first. Each sentence group is a `<p>`, so the HTML reads the same with every tag stripped. A test
  holds `textContent(html)`, whitespace-normalized, equal to the `text` rendering. Cognito delivers one body, which is
  HTML: there is no multipart text alternative through `emailMessage` (Not verified here, 7.6). So the HTML *is* the
  text a plain client shows, and the `text` form is what the dev twin writes and the e2e reads.
- It has no remote asset: no `<img>`, no `<link>`, no `url(`, no `@import`, and no web font. Plex Sans and Plex Mono
  are named and fall back to system faces, as `template.ts:35` does. The lockup PNG is a remote image (BRAND.md 7: "the
  image loads from the CloudFront static host"), so it is **left out**. BRAND.md 7 then says "the message goes without
  it, and the wordmark is never typed in its place", and the frame obeys: there is no header row, and "PaidWhole" stands
  only in sentences and in the From display name (1.7). An inline data URI or a CID image was considered and rejected:
  many clients block data-URI images (ADR 0058 D7 (c)), and Cognito cannot attach a CID part.
- **The code** sits in its sentence in a mono span (Plex Mono fallback, 20/28, weight 500, letter-spacing 0.08em,
  `white-space: nowrap`). BRAND.md's rule that every code renders in mono applies. The invitation's temporary password
  stands alone on its own line in the same span, so no punctuation ever touches it.
- **No link** in any code email. The invitation names the sign-in page as plain text, `https://<AppDomainName>/sign-in`,
  with no query and no fragment (clients will autolink it). It never carries a code or an address. Without it, a first
  email would not say where to go. The footer's anti-phishing sentence holds for all of them.
- **Colors** come from `palette` (`packages/brand/src/tokens.ts:3-10`). There are no dark rules, as in the worker's
  template, so a client that keeps explicit colors (Apple Mail, Outlook for Mac) shows light, and one that force-inverts
  (Gmail's apps, Outlook.com) inverts it legibly (renders, section 5). Adding dark rules to email is the brand owner's
  call (O-5).

### 1.4 The words (every source)

House voice (BRAND.md 1; the recovery design's 2): sentence case, no "please", "{instruction}: {what follows}", ’ for
apostrophes, no contractions, "reset" and never "recover". No PHI, no name, no organization. The subject is set as
written; Cognito's mail does not go through the worker's `brandedSubject()`. 2.5's "Your PaidWhole code" carries the
name itself.

**Footer (every Cognito message):** "PaidWhole never asks you to send your password or a code to anyone, by email, phone or chat: enter a code only on the PaidWhole page that asked for it." (Fix round, review UX-S2; was "PaidWhole never asks for your password or a code by email, phone or chat.")

| Source | Subject | Body (paragraphs; `{####}` = Cognito's code parameter, `{username}` = its username parameter) |
| --- | --- | --- |
| `ForgotPassword` (**section 2.5, verbatim**) | Your PaidWhole code | (1) "Your code to choose a new PaidWhole password is {####}." (2) "Enter it on the page that sent it within 15 minutes. If you did not ask for it, ignore this email: your password is unchanged." |
| `AdminCreateUser` (invitation and resend) | Your PaidWhole invitation | (1) "You are invited to PaidWhole. Your account is {username}. Sign in with the address this email came to and this temporary password:" (fix round, review UX-S1: the words no longer say what {username} is) (2) {####}, on its own line (3) "Sign in at https://<AppDomainName>/sign-in within 7 days. You then choose your own password and set up an authenticator app." (4) "If you did not expect this invitation, ignore this email: it ends after 7 days." |
| `UpdateUserAttribute` | Your PaidWhole code | (1) "Your code to confirm this new email address for your PaidWhole account is {####}." (2) "Enter it on the page that sent it. If you did not ask for it, ignore this email: the address stays unconfirmed." |
| `VerifyUserAttribute` | Your PaidWhole code | (1) "Your code to confirm this email address for your PaidWhole account is {####}." (2) "Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes." |
| `SignUp`, `ResendCode` | Your PaidWhole code | (1) "Your code to confirm your PaidWhole account is {####}." (2) "Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes." |
| `Authentication` | Your PaidWhole sign-in code | (1) "Your PaidWhole sign-in code is {####}." (2) "Enter it on the page that sent it within 3 minutes. If you are not signing in, someone may know your password: choose a new one with “Forgot your password?” on the sign-in page." |
| Pool verification template (fallback; 1.5) | Your PaidWhole code | (1) "Your PaidWhole code is {####}." (2) "Enter it on the page that sent it. If you did not ask for it, ignore this email: nothing on your account changes." |
| Pool invitation template (fallback) | Your PaidWhole invitation | The `AdminCreateUser` words above, with the sign-in address joined in at synth time |

Where the numbers come from:
- "7 days" comes from `INVITATION_DAYS` (`identity.ts:23`, `tempPasswordValidity` `:89`), as
  `counted(INVITATION_DAYS, 'day')`-style words in the package. A test pins it to identity.ts's text, as
  `primitives.test.ts:66-67` does.
- "15 minutes" is the page's step, not the provider's hour (ADR 0081 A1). It comes from `step-limits.ts`, held by a
  test.
- "3 minutes" is `TOKEN_LIFETIMES.authSession` (`identity.ts:14`).

The `UpdateUserAttribute` sentence is chosen to be true for this pool. With no `keepOriginal` setting, Cognito writes a
new email unverified at once, so "your address is unchanged" would be false. "Stays unconfirmed" is true: an unverified
email is not a sign-in alias. The account-takeover angle is O-3.

### 1.5 Placeholders, the shared-template trap and the fallback

- **Placeholders.** Cognito passes the parameters in `event.request.codeParameter` (`{####}`) and
  `usernameParameter` (`{username}`, set for `AdminCreateUser`), and substitutes them after the Lambda returns. The
  handler puts `request.codeParameter` exactly **once** in every message, and `request.usernameParameter` exactly once
  in the invitation. It never writes the literal itself. If a parameter it needs is missing or is not a string, the
  handler falls back.
- **Fallback.** The handler sets `event.response.emailSubject` and `emailMessage` only when everything is in place. On
  any doubt it returns the event unchanged: an unknown source, a missing parameter, any thrown error. Cognito then uses
  the pool's own template. So the pool's templates are set in `Identity` to the branded fallbacks above:
  - `userVerification: { emailStyle: CODE, emailSubject, emailBody }`
  - `userInvitation: { emailSubject, emailBody }`
  Both use the same frame, rendered at synth time from `@tp/auth-mail`. The verification template is the **shared**
  one: Cognito uses it for every code source. That is why its words are generic, and why reset-specific words are never
  put there (the shared-template trap, recovery design 2.5). The handler throws on no path. A Lambda that cannot run at
  all (throttled, timed out, a platform failure) is 1.8.

### 1.6 The handler (inline source, about 40 lines)

```js
'use strict';
const T = /* JSON at synth: { [source]: { subject, html } } with markers \u0000C\u0000, \u0000U\u0000 */;
const SIGN_IN = process.env.APP_SIGN_IN_URL; // the invitation's only variable text, checked ^https://[a-z0-9.-]+/sign-in$
exports.handler = async (event) => {
  try {
    const t = T[event && event.triggerSource];
    const r = event && event.request;
    if (!t || !r || typeof r.codeParameter !== 'string') return fallback(event, 'unknown');
    if (t.html.includes('\u0000U\u0000') && typeof r.usernameParameter !== 'string') return fallback(event, 'username');
    if (t.html.includes('\u0000S\u0000') && !/^https:\/\/[a-z0-9.-]+\/sign-in$/.test(SIGN_IN || '')) return fallback(event, 'sign_in_url');
    event.response.emailSubject = t.subject;
    event.response.emailMessage = t.html.replace('\u0000C\u0000', r.codeParameter).replace('\u0000U\u0000', r.usernameParameter || '').replace('\u0000S\u0000', SIGN_IN);
    return event;
  } catch (e) { return fallback(event, 'error'); }
};
function fallback(event, why) { console.log(JSON.stringify({ error_code: 'COGNITO_MESSAGE_FALLBACK', reason: why, trigger_source: typeof event?.triggerSource === 'string' && /^CustomMessage_[A-Za-z]{1,40}$/.test(event.triggerSource) ? event.triggerSource : 'unrecognized' })); return event; }
```

- It never reads `request.userAttributes`, which hold the email, and never logs the event. Its one log line holds a
  code, a closed reason and a pattern-checked source. Lambda's own START, END and REPORT lines carry only request IDs.
  `string.replace` with a string pattern replaces once, so a parameter is never duplicated.
  - `$` sequences in a replacement: Cognito's parameter is the literal placeholder `{####}` and the sign-in URL is
    pattern-checked, so no `$&` can occur. A test passes a `$&` parameter anyway, and the build uses a replacer
    function, to be safe.
- **Latency.** No SDK, no network and no `require` mean a cold start of about 150 to 300 ms on Node 22, and about 1 ms
  warm. That stays inside the reset request's 1,500 ms floor (`sign-in.ts:127`, `RESET_REQUEST_FLOOR_MS`). The
  existing `password reset request over floor` log (`sign-in.ts:490-491`) shows if it ever does not.

### 1.7 CDK (the construct) and IAM least privilege

- `lambda.Function`: the settings are:
  - `NODEJS_22_X` (the repo's runtime, `migration-run.ts:69`) on `ARM_64`
  - `memorySize: 128`
  - `timeout: Duration.seconds(3)`, under Cognito's 5-second wait, so a hung call ends first
  - `code: Code.fromInline(COGNITO_MESSAGE_SOURCE)`, `handler: 'index.handler'`
  - no VPC
  - `environment: { APP_SIGN_IN_URL: https://${AppDomainName}/sign-in }`, with no other variable
  - no reserved concurrency, which could throttle invitations
- **Role:** its own `iam.Role`, assumed by `lambda.amazonaws.com` on the condition `aws:SourceAccount` = the account
  (`uptime.ts:141` precedent). It gets **no managed policy** (no `AWSLambdaBasicExecutionRole`). One inline statement
  allows `logs:CreateLogStream` and `logs:PutLogEvents` on its own log group's ARN, and nothing else: no SES, no
  Cognito, no KMS.
- **Log group:** `/tp/<env>/cognito-messages`, with `'cognito-messages'` added to `LOG_GROUPS` (`infra/lib/log-groups.ts:2`).
  It is encrypted with the environment key, which already admits `/tp/<env>/*` (`monitoring.ts:219-224`), keeps 365
  days (`LOG_RETENTION_DAYS`) and is `RETAIN`ed, as `monitoring.ts:230` does.
- **Invoke permission:** CDK's `lambdaTriggers` adds `lambda:InvokeFunction` for `cognito-idp.amazonaws.com` with
  `SourceArn` set to the pool. The construct adds `SourceAccount` too.
- **Alarm:** the function's `Errors` + `Throttles` sum ≥ 1 over 5 minutes goes to the operator topic
  (`monitoring.operatorTopic`), with fixed alarm text and no values.
- **From:** the display name becomes `PaidWhole <MailFromAddress>`, built with `Fn.join` in phase 2 (`identity.ts:102`),
  so Cognito's mail reads "PaidWhole" as the worker's does (`template.ts:57-60`, `senderAddress`). Cognito accepts the
  `Name <address>` form in `EmailConfiguration.From` (Not verified here, 7.6).
- **SES:** nothing changes. Cognito's mail still goes through the transactional configuration set (`identity.ts:104`),
  untagged, recorded as kind `cognito` and resolved to its user by destination (ADR 0065; `apps/worker/src/jobs/platform.ts:33-34`).
  A Lambda cannot add SES tags, and none are needed. The stream's suppression, bounce and probe rules apply unchanged
  (docs/runbooks/deliverability.md). The transactional stream never pauses (`mail_stream_only_screening_pauses`,
  `20261107090000_mail_streams.sql:185`).
- **Cost:** one small function, one log group and one alarm, all cents a month, inside a resource class the stack
  already uses (`migration-run.ts`). No new class is introduced, so no founder decision is needed (O-6 records this for
  the orchestrator).

### 1.8 Failure mode

| Failure | Effect | Handling |
| --- | --- | --- |
| Rendering throws, a parameter is missing, or the source is unknown | Cognito sends the pool's branded fallback template | `COGNITO_MESSAGE_FALLBACK` log line (codes only). A metric filter on it raises an operator alarm, non-paging, with the same text style as `infra/lib/mail.ts` |
| The Lambda cannot run (throttle, timeout, AWS fault) | Cognito fails the call: `UnexpectedLambdaException`, `UserLambdaValidationException` or `InvalidLambdaResponseException` | `ForgotPassword`: the provider rethrows unknown errors (recovery design 3.2, row 3); the flow logs `password reset request failed` and answers "Check your email" at the floor (S-3). Nothing is enumerated. **Invitation:** `createUser` throws, so the administrator sees the invite fail and can retry. The alarm (1.7) pages the operator |
| Deploy order | Pool and function in one stack; CloudFormation creates the function and permission before the pool update | CDK dependency; no window without a message |

The provider maps none of the three Lambda errors to "not delivered" (`cognito-provider.ts`, the 3.2 table). That is
correct: they are our failure, logged at error, not a quota. A test in `cognito-provider.test.ts` pins that
`UnexpectedLambdaException` on `ForgotPassword` rethrows, and `sign-in.db.test.ts` already proves the flow's answer for
a thrown send (`:469`).

### 1.9 The dev twin (same words)

- `apps/web/src/lib/server/services.ts:118-124`'s `resetCodeEmail` is deleted. `devResetOutbox` (`:130-136`) writes
  `{ email, code, subject, text, html }` from `cognitoMessage('CustomMessage_ForgotPassword', { code })`.
  - `text` keeps today's `body` string exactly (2.5, one line). The field is renamed `body` to `text`, or kept as
    `body`: kept as **`body`**, so `http.test.ts:693-703` and `e2e/sign-in.spec.ts:119-130` change only by the added
    fields.
- `devOutbox` (`:110-116`, invitations) writes `{ email, temporaryPassword, subject, body, html }` from
  `cognitoMessage('CustomMessage_AdminCreateUser', { code: temporaryPassword, username: email, signInUrl: origin + '/sign-in' })`.
- **The e2e reads what production delivers.** `resetCodesFor` already reads the code from the body
  (`sign-in.spec.ts:129`, `/password is (\d{6})\./`). `onboarding.spec.ts:42-52` changes from the `temporaryPassword`
  field to the body's own line, the line after "this temporary password:". Both also assert, from `html`, that no
  `<img`, no `href` except the invitation's sign-in address, and no `http` appear. The `email`, `code` and
  `temporaryPassword` fields stay for the http test and for filtering, and hold synthetic accounts only.
- `apps/web` gains `"@tp/auth-mail": "workspace:*"`.

---

## 2. Every message's words

These are in 1.4. The reset code's words are 2.5's, verbatim. The UX review (UXR-04) and the co-founder's delegation
of 2026-10-25 settled them, so they are not changed here. The others are new and go to the UX and brand review (5).
None is legal text.

**The "password changed" words** (part 2; built in this PR as words and frame, sent from PR 2):
- Subject: "Your password was changed". It is sent as "Your password was changed | PaidWhole" by `brandedSubject()`
  (`template.ts:53-55`).
- Lines:
  1. "The password for your PaidWhole account was changed at 2026-11-05 14:32 UTC, with a code sent to this
     address." The time is the audit event's `at`, as every screen writes it (format.ts `utc()`; fix round, UX-N2).
  2. "Every session of this account has ended. Signing in still asks for your authenticator code or hardware key."
     (fix round, UX-N1: the sign-in notice's words). ADR 0091 (follow-on): the lines take the path (reset or
     signed-in change) and whether the global sign-out was confirmed, and say only what the audit event shows
     (security-N-3, UX-N5), with SGN-16 cases for each.
  3. "If you changed it, there is nothing more to do."
  4. "If you did not, write to <support address> from this address now, and we will help you secure the account."
- Footer: the auth footer (1.4).
- There is no link and no "from where". The only coarse location source would be GeoIP, a new vendor or data set with a
  cost (O-4). The user agent is attacker-chosen and says little. A "from where" line is left out, not guessed.
- The support route is docs/runbooks/support-mail.md's "write from the address you sign in with". A message from that
  address opens a ticket in the account's name; one from any other address opens nothing (`unknown_sender`). A new
  runbook item is needed: "Password changed, not by me" (3.8).

---

## 3. The "password changed" email (designed; needs a migration, so it goes in the follow-on PR)

### 3.1 Why a migration is unavoidable (and why no interim is offered)

1. **The kind.** Every message carries `tp_kind` (`streams.ts:100-124`), and `mail_send.kind` and
   `mail_send_stream_kind` are CHECK constraints (`20261107090000_mail_streams.sql:202`, `:222-226`). `MAIL_KINDS` and
   `MAIL_STREAM_KINDS` mirror them (`packages/db/src/schema/operations.ts:123-141`). If a `password_changed` message
   is sent without the migration, each of its SES events fails `operator_record_mail_event` and lands in the
   dead-letter queue (`MAIL_EVENT_NOT_RECORDED_23514`, `platform/mail-events.ts:286-289`).
   - Sending it as `cognito` or `digest` would falsify the record: `cognito` takes no subject (`:226`), and the
     invitation flag reads `cognito` sends. So no honest no-migration send exists.
2. **The address.** A platform job runs as tp_operator, which has no policy on `"user"`, and reads addresses only
   through narrow definer functions (`jobs/platform.ts:18-38`; `operator_support_notice_claim.sql`). A practice job
   runs as tp_app for one practice (`jobs/registry.ts:41-45`, "Every job belongs to exactly one practice"), and a
   password belongs to an account, not a practice.
   - A `withActor(user_id)` job could read the user's own row under `user_self_and_administrators`
     (`20261015140000_tenancy.sql:501-502`). That would be a new kind of job acting as a person who is not present, so
     it is rejected.

**The no-migration path for this PR** therefore ships part 1 in full. For part 2, it ships the words and the worker
template's `account` variant with their tests and nothing that sends. The follow-on PR,
`co-001/password-changed-notice`, adds the migration, the job and ADR 0091, after the founder approves the
regenerated `docs/product/domain-model.md` (CO-02: `pnpm db:domain-model --check --require-approval`).

### 3.2 What triggers it

- **The reset's confirm**, and only that today. `SignInFlow.confirmPasswordReset` writes `password_reset_completed` in
  the revoke transaction (`sign-in.ts:535-538`).
- **No other password-change path exists.** `cognito-provider.ts` calls no `ChangePassword`, `AdminSetUserPassword`
  or `AdminResetUserPassword`, and the application role is pinned against the last two
  (`infra/test/application-role.test.ts:15`). A future Settings change of password writes its own audit action, which
  joins the trigger's list (3.3) in that PR.
- **Not for the invitation's first password** (`passwordChosen`, `sign-in.ts:342-362`, audit `password_changed` at
  `:356`). It is the account's first password, chosen inside a live invitation by whoever holds the invitation's
  temporary password. A "was this you?" email to the same mailbox one second later adds noise, not safety. The ADR
  records this.

### 3.3 How it is enqueued: the database's outbox, in the reset's own transaction (best option)

Migration `<ts>_password_notices.sql` (through `/new-migration`):
- **Table `password_notice`** is global: no practice and no PHI. It holds no address and no name, only IDs and times.
  Like `mail_send` (`:199-251`), it is owner-only, `FORCE ROW LEVEL SECURITY`, and reached through definer functions.
  Columns:
  - `id uuid` primary key
  - `user_id uuid NOT NULL REFERENCES "user"`
  - `audit_event_id uuid NOT NULL UNIQUE` (the reset's event, the idempotency key)
  - `changed_at timestamptz NOT NULL` (the event's `at`)
  - `state` in (`pending`, `sent`, `delivered`, `undelivered`, `failed`)
  - `attempts int`, `next_attempt_at`
  - `ses_message_id text UNIQUE`
  - `error_code text CHECK (~ '^[A-Za-z]{1,64}$')`
  - `sent_at`, `expires_at` (= `changed_at` + 90 days, as the other customer streams' records)
- **Trigger** `AFTER INSERT ON audit_event FOR EACH ROW WHEN (NEW.action = 'password_reset_completed')` inserts the
  pending row `ON CONFLICT (audit_event_id) DO NOTHING`. The outbox row commits or rolls back with the revoke and the
  event, and no request can skip it, as no request can suppress a support notice (ADR 0065 D10). The web changes not
  at all.
  - The trigger's failure has the same profile as the audit insert it follows. The transaction is already retried once
    and reported (`sign-in.ts:533-546`). Cognito's reset is never undone, because Cognito committed it before.
- **Rejected alternatives:**
  - A pg-boss job from the web after the commit loses the email if the process dies between the commit and the send.
    It also puts a `user_id` in a payload for no gain.
  - An enqueue inside the transaction would need the web role on `pgboss` tables.
  - A web-side SES send is the side channel the scope forbids.
- `MAIL_KINDS` and the two CHECKs gain `password_changed` (transactional). `mail_send_subject` then requires the
  subject, which is the notice's ID.
- **Functions for tp_operator:**
  - `operator_password_notices_due()` returns IDs.
  - `operator_password_notice_claim(id)` takes `FOR UPDATE SKIP LOCKED` on a pending, due row and returns `user_id`,
    `"user".email` and `changed_at`. This is the only place the address is read.
  - `operator_password_notice_sent(id, message_id, request)` sets the state to `sent` and writes the audit event
    `password_notice_sent` (`actor_kind 'system'`, `object_type 'user'`, `object_id` = the user, `purpose` =
    `password_changed`, `request_id` = the job's).
  - `operator_password_notice_failed(id, error_code, permanent, request)` schedules a retry after 1, 5, 15 and 60
    minutes. It fails after the fifth try, or at once on `PERMANENT_SEND_ERRORS` (`streams.ts:61`). It then writes
    `password_notice_undelivered`.
- **`operator_record_mail_event`** mirrors a `password_changed` message's state onto its notice by message ID:
  delivered, or bounced, suppressed, rejected or complained as `undelivered` plus the audit event. It returns
  `password_notice_undelivered` for the log, as `notice_undelivered` and `invitation_undelivered` are returned today
  (`mail-events.ts:296`).
- `audit_event_record` (`:886-892`) adds both new actions to the list tp_app may not write.
- `mail_expiry` deletes expired notices.

### 3.4 The worker job

- **The platform job** is `password_notices`, every minute (`PLATFORM_JOB_TYPES`/`PLATFORM_JOB_PAYLOADS`/`PLATFORM_SCHEDULES`,
  `jobs/platform.ts:44-56`, `:94-106`). Its payload is `{}`: nothing about the person rides in pg-boss. The handler,
  `apps/worker/src/platform/password-notices.ts`, follows `support-notices.ts`. Each due notice gets one transaction
  as tp_operator: claim, then send one message, then `..._sent`, then commit. A throw rolls back and a new transaction
  records `..._failed`.
- **The message:**
  - `to: [email]`, `subject`, `lines` (2), `links: []`, `variant: 'account'`
  - `identity: { stream: 'transactional', kind: 'password_changed', subjectId: notice.id, recipientUserId: user_id }`
  - It goes through `SesMailSender` (`mail.ts:123-153`): one recipient, tags of IDs only, the transactional set, and
    From `PaidWhole <MAIL_FROM>`.
- **Template:** `template.ts` gains `MailVariant 'account'`. It keeps the customer header, because the worker's emails
  carry the lockup from the static host (BRAND.md 7), and uses `AUTH_MAIL_FOOTER` imported from `@tp/auth-mail`.
  `mailBody` with no links stays valid (`mail.ts:72-80`). The header is unchanged, so ADR 0058's header baseline holds.
- **Words:** `passwordChangedMessage(changedAt, supportEmail)` in `@tp/auth-mail` (`utcWords(date)` gives "November 5,
  2026 at 14:32 UTC"). The worker's config gains `SUPPORT_EMAIL`, set from the stack's `SupportEmail` parameter on the
  platform service (`compute.ts`), as the web has it (`apps/web/src/lib/server/config.ts:51`).
- **Log lines** carry IDs and codes only (`pnpm lint:logs`):
  - `password notice sent` `{ job_id, notice_id, user_id }`
  - `password notice send failed` `{ job_id, notice_id, error_code: sendErrorName(e) }` (`streams.ts:64-67`)
  - `password notice not delivered` `{ job_id, notice_id, user_id, error_code: 'PASSWORD_NOTICE_UNDELIVERED' }`, a new
    `MAIL_LOG_CODES` entry with a non-paging metric filter
- **Idempotency:** one row per audit event (UNIQUE). The claim uses `SKIP LOCKED`, and the message ID is recorded in
  the claim's transaction. A retry reaches only rows still `pending`, so one notice is sent once, but for SES accepting
  a message whose commit then fails (the same residue as `support-notices.ts:21-22`). The job's own pg-boss singleton
  makes runs exclusive.
- **Stream rules:** the transactional set keeps the account's suppression list. A suppressed or bounced address is
  recorded `undelivered` and logged, and nothing else happens: there is no one else to tell. Nothing pauses the
  transactional stream.
- **The reset is never blocked or undone.** The send happens up to a minute later, in another process. A failed send
  changes only the notice's row.

### 3.5 Tests for part 2 (in the follow-on PR, each failing first)

- `packages/db` db test:
  - The trigger writes one pending notice for `password_reset_completed` and none for `password_changed` or any other
    action.
  - A replayed event adds none.
  - tp_app cannot read or write `password_notice` or write the two actions.
  - Claim gives the address only for a due, pending row.
  - The retry schedule is 1, 5, 15 and 60 minutes, then failed; permanent errors fail at once.
  - The mail event mirror handles every terminal state.
  - Expiry works.
  - The catalog and cross-tenant tests pass with the new global table registered.
- `apps/worker/src/platform/password-notices.db.test.ts`:
  - It sends once with `MemoryMailSender`, with the identity tags.
  - A second run sends nothing.
  - A throwing sender leaves the row pending with its attempt counted.
  - It writes `password_notice_sent`.
  - The payload is `{}`, and no log line holds the address (a spy logger, plus `pnpm lint:logs`).
- `apps/web/src/lib/auth/sign-in.db.test.ts`: a confirmed reset leaves exactly one pending notice for the user. A
  refused or invalid confirm leaves none.
- e2e `sign-in.spec.ts`, after the reset journey: the platform job runs (as `e2e/worker.ts` drives jobs). The local
  outbox holds one "Your password was changed | PaidWhole" message to the synthetic address, with the support address
  and no link.

### 3.6 ADR

ADR 0091: "Tell an account's address when its password changes, from an outbox the database writes in the change's own
transaction". It is its own ADR, not an amendment, because it adds a table, a mail kind and a platform job across ADR
0065's streams.

### 3.7 Matrix

SGN-16 (6.2).

### 3.8 Runbook

`docs/runbooks/support-mail.md`, sign-in help tickets, gains a new item: **"Password changed, not by me".**
1. Treat it as a mailbox compromise: someone read the code in that mailbox.
2. With the organization's administrator, disable the user (Settings), which ends access. The second factor still
   guards the account, because a reset never removes it (ADR 0081 A5).
3. Ask the person to secure the mailbox, then reset again.
4. Work by ticket ID and user ID only.

The words of that item are the orchestrator's to confirm (O-7).

---

## 4. Tests for this PR (each written to fail first)

### 4.1 Words and frame (`packages/auth-mail/src/*.test.ts`, unit; brand-copy reads the package)

- Every `CognitoMessageSource` has an entry (a type-level total record, plus a runtime list equal to the seven
  sources).
- Every message:
  - has the code slot exactly once; the invitation has the username slot exactly once, and its sign-in slot once
  - has a subject of 1 to 140 characters and a rendered message of 6 to 20,000 characters, with sample parameters
    filled in and with the literal placeholders (Cognito's limits, 7.3)
  - has stripped-tag text equal to `text`
  - has no `<img`, `<link`, `<script`, `<style`, `url(`, `@import` or `src=`, and no `href` (the invitation's
    autolinked address is plain text)
  - contains `http` only in the invitation's sign-in line, with no `?` or `#`
- The `ForgotPassword` text equals 2.5's sentence, word for word, with `{####}` in place of the code.
- "7 days" stems from `INVITATION_DAYS`, held equal to `identity.ts`'s text (`primitives.test.ts:66-67` style). "15
  minutes" stems from `step-limits.ts`.
- **A snapshot of each message's HTML and text**, eight files under `packages/auth-mail/src/__snapshots__`, written by
  vitest's own `-u`. It is the review's record of the exact words.
- `tools/brand-copy/scan.ts`: `'packages/auth-mail/src'` joins `COPY_ROOTS` (`:51-61`).
  `tools/brand-copy/scan.test.ts` asserts the root is read and that every word passes (no forbidden term, the name
  imported).
- Worker `template.test.ts`: `mailHtml(subject, lines, [], null, 'account')` equals `authMailHtml(subject, lines)` for
  the same lines. The footer comes from `AUTH_MAIL_FOOTER`, so the two frames cannot drift.

### 4.2 The handler (`packages/auth-mail/src/lambda.test.ts`, unit, `node:vm`)

- It runs `COGNITO_MESSAGE_SOURCE` in a fresh `vm` context with `process.env.APP_SIGN_IN_URL` set and a `console` spy.
- For each source, with a synthetic event (`userAttributes.email` set to `someone@clinic.synthetic.test`), the response
  subject and message equal `cognitoMessage(source, { code: '{####}', username: '{username}', signInUrl })`.
- An unknown source, a missing `request`, a non-string `codeParameter`, an invitation without `usernameParameter`, and
  a bad sign-in URL each leave `response` untouched. Each logs one line, `{ error_code, reason, trigger_source }`, and
  the log holds no `@`.
- A parameter of `$&$1` is placed literally.
- The source holds no `require(`, `import`, `fetch`, `http` (but the sign-in slot's check) or `process.env` other than
  `APP_SIGN_IN_URL`, and is at most 16 KiB.

### 4.3 CDK (`infra/test/identity.test.ts`, extended; a new `infra/test/cognito-messages.test.ts`)

- The pool's `LambdaConfig.CustomMessage` is the function's ARN.
- The function:
  - `Runtime nodejs22.x`, `Architectures [arm64]`, `MemorySize 128`, `Timeout 3`, no `VpcConfig`
  - `Code.ZipFile` equal to `COGNITO_MESSAGE_SOURCE`
  - `Environment.Variables` exactly `{ APP_SIGN_IN_URL }`, joined from `AppDomainName`
- The role has no `ManagedPolicyArns`, and its one statement holds exactly the two `logs:` actions on the group's ARN
  (`roleStatements` helper, `infra/test/synth.ts`).
- The permission: principal `cognito-idp.amazonaws.com`, `SourceArn` the pool, `SourceAccount` the account.
- The log group is `/tp/<env>/cognito-messages`, with the environment key, 365 days and `Retain`.
- The alarms: `Errors`+`Throttles`, and the `COGNITO_MESSAGE_FALLBACK` metric filter, each to the operator topic.
- `VerificationMessageTemplate` has `DefaultEmailOption CONFIRM_WITH_CODE`, and the subject and body of the fallback,
  with `{####}`. `AdminCreateUserConfig.InviteMessageTemplate` has `{username}` and `{####}`.
- Phase 2's `From` is `PaidWhole <…>`.
- `infra/test/application-role.test.ts` stays green: no new Cognito action for the app.
- Synthesis: `cdk synth` under the lock, and the stack's snapshots, if any, through their own update.

### 4.4 Provider and flow (unit and db)

- `cognito-provider.test.ts`: `ForgotPassword` failing with `UnexpectedLambdaException`, `UserLambdaValidationException`
  or `InvalidLambdaResponseException` rethrows, never resolves (the 3.2 table's row 3). `AdminCreateUser` failing with
  each of them rethrows from `createUser`.
- `sign-in.db.test.ts:469` already covers the flow's answer to a thrown send. No new db test is needed for part 1,
  which touches no table.

### 4.5 The twin and the e2e

- `http.test.ts:693-703`: the reset outbox file has `subject`, `body` (2.5's sentence), `html` (equal to
  `cognitoMessage(...).html` with the code), `email` and `code`.
- A new case does the same for the invitation outbox.
- `e2e/sign-in.spec.ts`: `resetCodesFor` already reads the code from the body. It adds an assertion that the newest
  reset message's `html` has no remote asset and no link.
- `e2e/onboarding.spec.ts:42-52` reads the temporary password from the body's line after "this temporary password:".
  It asserts the sign-in address in the body is the e2e origin's `/sign-in`.

### 4.6 Logs

`pnpm lint:logs` over the changed TypeScript. The inline source's one log line is held by 4.2.

### 4.7 Matrix

`fixtures.test.ts:33` checks that `docs/product/test-matrix.md` and `packages/synth/src/cases/matrix.ts` match for
SGN-13 to SGN-15, and that the registry's `none(...)` entries exist (`registry.ts:969-997` style).

---

## 5. What is rendered for the review (done; synthetic values)

The renders are in `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail/renders/`,
made by `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail/scripts/render.mjs`.
That script is a scratch copy of the proposed words and frame. The build's renders must come from `@tp/auth-mail`
itself, and are redone in the review step.

There are eight emails: `forgot-password`, `invitation`, `new-address`, `confirm-address`, `confirm-account`,
`sign-in-code`, `fallback-code` and `password-changed`. Each has:
- `.html` and `.txt`, the text with its subject and trigger
- `-600-light.png`, `-390-light.png`, `-600-dark-inverted.png` and `-390-dark-inverted.png`

That makes 48 files.

- **Light:** Chrome at 600 and 390 px with `prefers-color-scheme: light`.
- **Dark:** `prefers-color-scheme: dark` **and** a forced-inversion approximation (`html{filter:invert(1)
  hue-rotate(180deg)}`, images inverted back). The brand's email CSS has no dark rules, so a dark-respecting client
  (Apple Mail, Outlook for Mac) shows the light render unchanged. The inverted shot approximates the clients that
  invert anyway (Gmail's apps, Outlook.com).
- **Seen:** the code emails stay legible in both. The password-changed email's lockup PNG on a forced-dark client is
  **Ink on near-black, close to unreadable** (`password-changed-600-dark-inverted.png`). This applies to every worker
  email today, not only this one, and is O-5.
- In the renders, the lockup is embedded as a data URI only to stand in for the static host. The sent message keeps
  the static host's URL (`template.ts:66-71`).

---

## 6. ADR and test matrix

### 6.1 ADR: an amendment to ADR 0081 is enough for this PR

Append `## Amendment: the code email and every Cognito message (co-001/auth-emails, 2026-11-05)` before "Revisit
when". It closes the forgotten-password amendment's "Not covered" item, "the branded code email ... (Lane A, #42
files)" (ADR 0081 line 274), and its "Revisit when" line, "Lane A brands the code email" (`:313`). It contains:
- **B1. The CustomMessage trigger:** what it does and why, and the rejected CustomEmailSender. That trigger would allow
  a multipart text and HTML message with SES tags, but it needs a KMS key and an SES and KMS call per message inside
  Cognito's 5 seconds, a network dependency that can fail on the path of every code.
- **B2. The words of every source**, and why the pool templates are the generic fallback (the shared template).
- **B3. The frame:** text-first, no remote asset, no header art (BRAND.md 7's rule for a message with no art), the
  code in mono, no link but the invitation's plain sign-in address, the footer.
- **B4. The failure mode and the alarms.**
- **B5. The twin's outboxes** use the package's words, and the e2e reads them.
- **B6. Not covered:** the "password changed" email (ADR 0091, with a migration); dark rules (O-5); the attribute
  writes (O-3); the organization's name in the invitation (O-2).
- **B7. Not verified here** (7.6).

ADR 0088 is not amended. Its enrolment rule is unchanged: the invitation's words say "set up an authenticator app",
which is D3's path.

### 6.2 Test-matrix rows (`docs/product/test-matrix.md` after SGN-08, and `packages/synth/src/cases/matrix.ts`, module 19, no-file)

The section intro, `test-matrix.md:427-428`, gains: "SGN-13 to SGN-15 are the code email's (co-001/auth-emails);
SGN-16 is the password-changed email's (ADR 0091)". SGN-09 to SGN-12 are not used here; they are left as the
orchestrator assigned.

| ID | Case | Assertion |
| --- | --- | --- |
| SGN-13 | Every message the user pool sends is the brand’s | Each CustomMessage source (forgot password, invitation and its resend, attribute update, attribute verification, sign-up, resend code and authentication) has its own subject and words from `@tp/auth-mail`: the reset code’s are section 2.5’s word for word, the invitation names the sign-in page as plain text with no query and states 7 days from `INVITATION_DAYS`; each message holds Cognito’s code parameter once (the invitation its username parameter once), stays within Cognito’s subject and message lengths, reads the same with its tags stripped, and holds no image, font, stylesheet or link (but the invitation’s sign-in address); the pool’s own verification and invitation templates are the branded generic fallback, never reset-specific words; the copy lint reads the package |
| SGN-14 | The message trigger is small and contained | The trigger is an inline Node 22 function with no dependency, network or VPC, 128 MB and a 3-second timeout, one environment variable, a role with only its own log group’s two write actions and no managed policy, invoked only by Cognito for this pool and account; an unknown source, a missing parameter or a thrown error returns the event unchanged (Cognito sends the fallback template) and logs one line of codes with no address; the function’s errors, throttles and fallbacks alarm the operator; a reset request whose code Cognito could not send for the trigger answers alike at its floor, and an invitation it could not send fails visibly |
| SGN-15 | The local identity provider delivers what Cognito delivers | The development provider’s invitation and reset outboxes hold each message’s subject, text and HTML from `@tp/auth-mail`, and the e2e journeys read the temporary password and the reset code from the message’s own text, with no remote asset and no link but the sign-in address |
| SGN-16 | A password change is told to the account’s address | (follow-on PR, ADR 0091) A completed reset writes one pending notice in its own transaction, by the database, and a refused or invalid one none; the platform job sends one message on the transactional stream (kind `password_changed`, subject the notice) to the account’s address read only by the claim, with the change’s time in UTC words, the support route and no link, records `password_notice_sent`, retries after 1, 5, 15 and 60 minutes and fails at once on a permanent error, records an undelivered message and logs it by IDs; no payload or log holds the address; the reset is never blocked or undone by the notice |

---

## 7. Risks

7.1 **The shared-template trap.** Without the trigger, `ForgotPassword`, `VerifyUserAttribute`, `UpdateUserAttribute`
and `ResendCode` share `VerificationMessageTemplate`. With it, each source has its own words. The pool template stays
generic, because it is the fallback for all of them. The test in 4.1 refuses reset-specific words there.

7.2 **`{####}` is required.** Cognito refuses a verification message or invitation without its placeholders
(`InvalidLambdaResponseException`, so the code is not sent). The handler checks before it writes, and falls back
rather than return a message without the placeholder (4.2). It uses `request.codeParameter`, never a typed literal.

7.3 **Length limits.** These come from AWS's documentation, as remembered here; the follow-on step re-checks them
against AWS's pages and records the page in the ADR:
- the Lambda's `emailMessage`: up to 20,000 UTF-8 characters
- `emailSubject`: up to 140
- the pool's `VerificationMessageTemplate.EmailMessage` and the invite `EmailMessage`: 6 to 20,000 with the
  placeholders

The messages are about 1.3 KB. The CloudFormation inline `ZipFile` limit for the function's source, about 11 KB here,
is also re-checked (older documentation said 4,096 characters). The fallback, if a limit binds, is
`Code.fromAsset` over a file the package writes at synth: no bundler and the same source. 4.2 caps the source at
16 KiB.

7.4 **SES configuration set and suppression.** These are unchanged. Cognito's messages go through the transactional
set untagged. A reset code to an address on the account's suppression list is silently not delivered, as an invitation
is today. Deliverability runbook 3.4's release step covers it. The runbook gets one sentence: "a reset code is held
back the same way".

7.5 **Invited users.**
- The invitation email changes from Cognito's default ("Your username is ... and temporary password is ...") to the
  branded words with the sign-in address and 7 days.
- A resend (`MessageAction: 'RESEND'`) goes through the same source and words.
- The e2e's way of reading the temporary password changes (4.5).
- Cognito's temporary passwords contain symbols. Cognito substitutes them after the Lambda returns, and the Lambda
  cannot escape them, so a `<` or `&` lands raw in HTML. Most clients show `&` correctly, but a `<` followed by a letter
  could be read as a tag and hide characters. The mitigation, if staging shows it, is that `createUser` supplies
  `TemporaryPassword` from an alphabet with no `<>&"'`. Cognito's resend generates its own, so that would also need the
  resend to set one. It is a staging check (7.6), not built blind.
- No "password changed" email for the invitation's first password (3.2).

7.6 **Not verified here** (the founder's pool smoke check, phase 2 on staging, with a synthetic account):
- Cognito sends `emailMessage` as an HTML-only body. Check the raw MIME `Content-Type`.
- The display-name `From` is accepted.
- The resend fires `CustomMessage_AdminCreateUser`.
- Cognito substitutes the parameters once and falls back to the pool template when the response is unchanged.
- A real reset's cold-start latency stays under the 1,500 ms floor.
- A temporary password with symbols renders whole.

7.7 **Overlap.** ADR 0088 release N+1 (the confidential client) edits `identity.ts` as well. Whichever merges second
rebases its client change by merge, never by force.

7.8 **The new workspace dependency of infra.** It is a convention change (1.2). If the orchestrator wants infra kept
dependency-free, the alternative is `infra/lib/cognito-messages.ts` holding the source, with a web test holding it
equal to `@tp/auth-mail` by text. That is two copies of the words, so it is not recommended.

---

## 8. Open questions for the orchestrator (each with the recommended answer)

- **O-1. The migration for part 2** (founder, CO-02). *Recommended:* a follow-on PR, `co-001/password-changed-notice`:
  the table, the audit_event trigger, the kind and the functions (3.3), with ADR 0091 and SGN-16. The founder approves
  the regenerated domain model. This PR ships part 1 plus part 2's words and template variant.
- **O-2. The organization's name in the invitation** ("Northside Therapy invited you"), passed through `ClientMetadata`
  on `AdminCreateUser`. *Recommended:* later, as its own item. It needs escaping of a customer-entered value inside
  the Lambda, and a decision on whether a practice name that is a clinician's name belongs in mail.
- **O-3. Attribute writes. CLOSED in the fix round (review security-S-2):** `keepOriginal: { email: true }` on the pool
  and an empty `writeAttributes` on the web client are in this PR (ADR 0081 B4a); staging confirms CloudFormation
  accepts the empty list and first sign-in still completes.
- **O-4. "From where" in the password-changed email.** *Recommended:* leave it out. The only coarse, safe source is
  GeoIP, a new vendor or data set with a cost, which is the founder's call.
- **O-5. Dark mode in email** (brand owner). The lockup PNG is unreadable under forced inversion (5). *Recommended:*
  the brand owner rules on an opaque White plate in the lockup PNG, or a reversed variant shown through
  `prefers-color-scheme`. This touches ADR 0058's header baselines and every worker email, so it is not this PR.
- **O-6. Cost.** One function, one log group and two alarms, cents a month, inside a resource class the stack already
  has. *Recommended:* no founder decision needed. Recorded so the orchestrator can say otherwise.
- **O-7. The runbook's "Password changed, not by me" steps** (3.8). *Recommended:* as written, confirmed by the
  orchestrator before the follow-on PR.
- **O-8. The words of the messages other than 2.5's** (invitation, attribute, authentication, fallback and password
  changed). *Recommended:* as in 1.4 and 2, through the UX and brand review with the renders. They are not legal text.
  Fix round: the footer, the invitation's first paragraph and two password-changed lines changed (UX-S1, UX-S2,
  UX-N1, UX-N2). For the co-founder (UX-N4, ruled words, not changed): a possible addition to section 2.5, "A new
  request replaces this code.", after the 15 minutes, since two requests send two identical messages.

---

## 9. Files (this PR)

New:
- `packages/auth-mail/package.json`, `tsconfig.json`
- `packages/auth-mail/src/{index,words,render,lambda}.ts` and their tests, and `src/__snapshots__/*` (vitest `-u`)
- `infra/lib/constructs/cognito-messages.ts`
- `infra/test/cognito-messages.test.ts`

Changed:
- `infra/lib/constructs/identity.ts`: the trigger, the fallback templates and the From display name
- `infra/lib/log-groups.ts` (`cognito-messages`)
- `infra/lib/platform-stack.ts`: passes the key, the environment, `AppDomainName` and the operator topic to `Identity`
- `infra/package.json`
- `infra/test/identity.test.ts`
- `apps/web/package.json`
- `apps/web/src/lib/server/services.ts`: `devOutbox` and `devResetOutbox`
- `apps/web/src/lib/http/http.test.ts`
- `apps/web/src/lib/auth/cognito-provider.test.ts`
- `apps/web/e2e/sign-in.spec.ts`, `apps/web/e2e/onboarding.spec.ts`
- `apps/worker/package.json`
- `apps/worker/src/mail/template.ts` (`'account'` variant and footer)
- `apps/worker/src/mail/template.test.ts`, new or extended
- `tools/brand-copy/scan.ts` (`COPY_ROOTS`), `tools/brand-copy/scan.test.ts`
- `docs/adr/0081-...md` (amendment)
- `docs/product/test-matrix.md` (SGN-13 to SGN-15; the intro names SGN-16)
- `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`
- `docs/runbooks/deliverability.md` (one sentence, 7.4)
- `pnpm-lock.yaml` (by `pnpm install` only)

Not touched: any migration, `docs/product/domain-model.md`, `content/releases/**`, `LANES.md`, `lanes/*.md`,
`HANDOFF.md` and `.gitleaksignore`.

Commits, one concern each:
1. `@tp/auth-mail` words, frame and tests
2. The handler source and its vm tests
3. Infra: construct, identity, log group and CDK tests
4. The twin's outboxes and the e2e
5. Worker template `account` variant
6. brand-copy root
7. ADR 0081 amendment, the matrix and synth rows, the runbook sentence

Follow-on PR (O-1):
- the migration and the regenerated `domain-model.md` and `packages/db/functions/*` (by their generator)
- `operations.ts` kinds
- `apps/worker/src/platform/password-notices.ts`, `jobs/platform.ts` and `config.ts`
- `infra/lib/constructs/compute.ts` (`SUPPORT_EMAIL`) and `infra/lib/mail.ts` (metric filter)
- `streams.ts` `MAIL_LOG_CODES`
- `docs/adr/0091-...md`
- `docs/runbooks/support-mail.md`
- SGN-16

---

## 10. Build notes (2026-11-05, the build step)

- Built as designed (part 1 in full; part 2's words and the worker's `account` variant, nothing that sends). No
  migration.
- Departures, each for accuracy:
  - The twin's `body` is the message's full text (paragraphs apart by a blank line, then the footer), not one line, so
    it is exactly what Cognito delivers; the e2e reads the code and the temporary password from it.
  - The handler also requires each parameter to have a placeholder's shape (`{` + `#`, `$`, letters, digits or `_` +
    `}`), so nothing Cognito passes can open markup; a replacer function writes it literally.
  - The invoke permission is added by hand (not `lambdaTriggers`) to name `SourceAccount` as well as `SourceArn`. On
    the first deploy it is created just after the pool names the function: a window of seconds in which a code email
    fails as a Lambda error (ADR 0081, B4).
  - CDK leaves its default SMS words in the verification template; the pool has no SMS configuration (tested).
  - The renders add a third mode, `dark-preferred`, beside `light` and `dark-inverted`.
  - SGN-16 is not added to the matrix in this PR (its tests would not exist yet); the intro keeps it for ADR 0091.
- **O-9 (new). Inline-code and Cognito length limits unverified.** AWS's documentation was not reachable from the
  session (docs.aws.amazon.com is outside its network allowance). The inline source is 13,548 bytes (cap 16 KiB in
  the tests). *Recommended:* the founder's staging deploy confirms CloudFormation accepts the `ZipFile`; if it refuses,
  switch to `Code.fromAsset` of the same text (the stack has no asset today, so that adds the bootstrap bucket's use).
