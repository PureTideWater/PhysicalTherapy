# UX PR 6 (`co-001/ux-sign-in-time`), Scout C: security, privacy and the boundaries

Read from the checkout `/home/user/ux-sign-in-time` at `165c599` (claude/build-platform with #74) on 2026-10-28,
against `.claude/agents/security-reviewer.md` (tenant isolation, PHI in URLs, keys, filenames, emails and errors, the
log allowlist, checks in the handler and in Postgres, uploads, model calls). Line numbers are at that commit; paths
are under `apps/web/src/` unless they say otherwise. #42 is **open** (REST `pulls/42`: `state: open`, `merged: false`,
head `co-001/pr-06b-mail-streams`, updated 2026-10-27 21:05 UTC; `gh pr view` is refused here, GraphQL 403). Nothing
in the checkout was changed. Scouts A (`scout-flow.md`) and B (`scout-timer.md`) were read first. Where this report
differs from them, section 9 says so.

## 0. Verdicts in one screen

1. **Keep the email in a separate sealed cookie, written only after the password is proven.** The cookie is
   `tp_sign_in_email`, sealed under the purpose `sign-in-email`, HttpOnly, Secure, SameSite=Lax and Path `/`. Use the
   house adapters unchanged. Its lifetime is absolute: the step's start, plus the step's limit, plus 15 minutes (18
   minutes on the three challenge steps).
   - It is written only on the steps after the password: new password, enrolment, code and key registration. It is
     never written on the hardware-key step, and never on a refusal.
   - It is cleared everywhere the pending step is cleared, except at expiry. It is also replaced or cleared by every
     submission of the first step.
   - `/sign-in` reads it, and fills the Email field only when the reason is `step_expired` (or the design's restart
     reason). The opened value is checked against `emailAddress`.
   - It is never in a URL, a log, an error message or a job payload.
   - The residual risk is the next person at a shared computer seeing the address. It is named in 1.5 and accepted,
     with reasons.
2. **Enumeration: nothing changes, if four rules hold.**
   - The first step's words stay as they are.
   - Its `Set-Cookie` headers are the same for an unknown address and a wrong password.
   - The kept email exists only for a browser that has proven the password.
   - The step marker is computed only after the provider accepted the password, with no extra query before it.

   Two leaks that exist today are recorded for later: `locked` and `invitation_expired` are answered before the
   password is checked.
3. **The deadline in the page leaks nothing.** Only a browser that holds the sealed pending step sees it, and it
   tells that browser only when its own challenge closes. The page must never take a deadline from the request.
4. **Start again opens no way around the rate limits or the lockout.** A new step costs a password through the
   `sign_in` bucket, per address and per email. An expiry is not a failure and does not reset the count, which only
   a session reset does (`sessions.ts:78`). Start again must stay a link to `/sign-in` that re-issues nothing.
5. **The lengths, confirmed.**
   - The limit the page states is 3 minutes: the shorter of Cognito's 180 s (`infra/lib/constructs/identity.ts:14`,
     `:108`; pinned at `infra/test/identity.test.ts:109`; mirrored by the dev provider at `lib/auth/dev-provider.ts:47`)
     and the pending cookie's 300 s (`lib/auth/pending.ts:16`).
   - The warning comes at 60 s left.
   - Key registration stays at 900 s.
   - The kept email lasts the step's limit plus 900 s.
   - The pending cookie lengths do not change.
   - No production path can change any of these from a request or from configuration (5).
6. **Boundaries.**
   - No migration, and no infrastructure or Cognito change. Nothing goes to Lane A.
   - No #42 file is edited. The plan reads `infra/lib/constructs/identity.ts` in a text-pin test, and #42 leaves that
     line alone.
   - The shared documents (`docs/product/test-matrix.md`, `packages/synth/src/cases/{matrix,registry}.ts`) fall under
     LANES rule 6.
   - Three #42 files are in reach and must stay untouched: `lib/http/http.test.ts`, `lib/http/rate-limit.ts` and
     `docs/product/legal-surfaces.md`.
   - Seams with UX PR 7 are in 6.2.
7. **ADR 0081 is warranted, shared with PR 7.** Its scope is the sign-in steps' limit, deadline and kept email
   (PR 6), then recovery (PR 7). It records the one constant, the server's deadline, the kept-email cookie as a narrow
   exception to ADR 0077 D1, the absence of any test knob, and Start again as a link (7).

## 1. Keeping the email for "Start again"

### 1.1 Where the email is today

- Every `Pending` carries `email` (`lib/auth/sign-in.ts:44-50`). The pending value is sealed (AES-256-GCM, AAD
  `v1:<purpose>`, expiry inside the ciphertext: `lib/auth/seal.ts:39-46`, `:57-63`) under `AUTH_COOKIE_SECRET`, with
  the purpose `sign-in-pending` (`pending.ts:13`). A tampered, expired or wrong-purpose value opens to `undefined`.
- Cookie flags today: `HttpOnly; Secure; SameSite=Lax; Path=/` for pages and actions (`lib/http/next.ts:23`, `:29-34`)
  and for route handlers (`lib/http/handler.ts:44-46`). `CookieJar.set` takes only `maxAgeSeconds`
  (`lib/http/route.ts:34-38`). The product rules state SameSite=Lax (`docs/product/sessions.md:17`, from PRD 6;
  `docs/policies/access-control.md:43-44`). The format is pinned by `lib/http/http.test.ts:133-142`, a #42 file.
- The step pages render the email to the person (`app/sign-in/mfa/page.tsx:19`, enrolment `:22`). Pages are dynamic,
  so Next sends them `private, no-cache, no-store` (`lib/http/next.ts:18-20`).
- **No URL carries the email.**
  - Every redirect is a fixed path with a reason code: `lib/routes/sign-in.ts:22`, `:101`, `:105`, `:111`, `:116`,
    `:119`, `:140`; `lib/http/next.ts:55-73`.
  - `signInPage` accepts only `reason` (`:38`, `:145-152`): zod strips an `?email=` parameter.
  - The edge logs no cookie. The WAF's sampled requests are off because a sample keeps headers
    (`infra/lib/constructs/edge.ts:96-97`, `:165`), and CloudFront passes no cookie (`:99-100`).
  - Framing is refused: `frame-ancestors 'none'` and `X-Frame-Options: DENY` (`lib/http/security-headers.ts:69`,
    `:83`).

### 1.2 The cookie (recommended)

| Property | Value | Why |
|---|---|---|
| Name | `tp_sign_in_email` (next to `SIGN_IN_COOKIE` in `lib/auth/sessions.ts:20`) | The house prefix. No `__Host-`, because no house cookie uses one; see 1.3. |
| Content | The email only, as the flow holds it (already `emailAddress`-normalized: `lib/routes/schemas.ts:22`) | Nothing else. The step code may be added only if the words reviewer takes the step-specific restart words (Scout A, section 6); it leaks nothing, because the password was proven. |
| Protection | **Sealed**: `sealer.seal('sign-in-email', …)`. The purpose is unique; the purposes in use are `sign-in-pending`, `dev-challenge`, `dev-grant` (a derived key), `csrf`, `local-upload`, and the HMAC purposes `rate-limit` and `form-actor`. | Sealing gives confidentiality, not just integrity. A signed-only value shows the address in base64 to anyone who opens the browser's cookie viewer on a shared computer, or reads a saved HAR file. A distinct purpose means a pending value never opens as a kept email, and the reverse. |
| Flags | `HttpOnly; Secure; SameSite=Lax; Path=/` through the existing adapters | See 1.3. |
| Lifetime | Seal expiry and Max-Age = `startedAt + stepSeconds(step) + 900 s`, absolute. That is 1080 s on the new-password, enrolment and code steps, and 1800 s on key registration. | See 1.6. A rewrite (`invalid_password`, `:106-108`; the register options, `:346`) never pushes it later. |
| Written | In `settle`'s `pending` branch (`lib/routes/sign-in.ts:91-101`), for `new_password`, `mfa_setup`, `mfa` and `register_key` only | Each of these exists only after the provider accepted the password. **Not inside `writePending`.** That helper also writes the hardware-key step for any typed address, with no password (`:276`). The flow issues key options for any email (`lib/auth/sign-in.ts:230-237`). |
| Cleared | `writeSession` (`pending.ts:33-37`); the `locked`, `hardware_key_required` and `key_registered` branches (`:109-122`); and every first-step result that is not `pending` (1.5) | The rule is: wherever the pending step is cleared, except at expiry, which is the cookie's purpose. Nothing reads it on the hardware-key page in PR 6. A later PR that fills that page's email (flows-other-19) changes this rule there, with its own reason. |
| Read | Only by `signInPage`. It returns `{ reason, email }`, with `email` set only when the reason is `step_expired` (or the design's restart reason) **and** the cookie opens **and** the opened value passes `emailAddress` | The schema check costs nothing and keeps the value's type honest even if a purpose were ever reused. |
| Shown | As the Email field's `defaultValue` (`app/sign-in/page.tsx:28`). Never in `ActionState`, a notice's words, the step timer's props, or a `data-` attribute. | |

Implementation shape: three helpers in `lib/auth/pending.ts`, named for what they hold: `writeKeptEmail`,
`readKeptEmail` and `clearKeptEmail`. `clearPending` calls `clearKeptEmail`, and `settle`'s `expired` branch deletes
only the pending cookie. `lib/routes/sign-in.ts` then gains a few one-line hunks, which keeps PR 7's merge small.

### 1.3 Each flag, with the safer choice

- **HttpOnly, Secure:** required. Already the adapters' defaults.
- **SameSite: Lax (the house rule), not Strict.**
  - Strict stops only one thing that Lax allows: a cross-site top-level GET to `/sign-in?reason=step_expired`
    carrying the cookie. The server would then render the address into the victim's own page.
  - That page cannot be framed (`security-headers.ts:69,83`). It is not readable across origins, and it is not
    cached (`no-store`). So the request discloses nothing.
  - Lax already keeps the cookie off cross-site subresource requests, the channel of the cross-site leaks that can
    measure a response.
  - Strict would also need a `sameSite` option on `CookieJar` and both adapters. It would break the house invariant
    that `sessions.md:17`, the access-control policy and the comment at `pending.ts:10` state.
  - Lax is therefore the safer *system*: one rule, already tested.
- **Path: `/`, not `/sign-in`.** This differs from Scout A's suggestion.
  - Narrowing the path changes only which requests carry the cookie. The value is sealed and HttpOnly, nothing outside
    `/sign-in` reads it, and nobody is signed in while it lives (`writeSession` clears it).
  - So narrowing gains no confidentiality. It does add a real failure mode: a delete whose `Path` differs from the
    set's does nothing, so the cookie would **outlive** the session open or the lock it should end at.
  - It also needs new options on `CookieJar` (`route.ts:34-38`), `next.ts:23-35` and `handler.ts:44-46`. The test of
    the header format lives in `http.test.ts`, a #42 file.
  - Keep `/`, and use the adapters unchanged.
- **`__Host-` prefix: not now.** It would stop a sibling subdomain from planting the cookie. A planted cookie would
  have to be a value our server sealed. The only harm would be someone else's own address filled in on this browser's
  sign-in page, which the person sees and can change. No credential moves and no session is fixed. The house cookies
  (`tp_session`, `tp_device`, `tp_sign_in`) carry no prefix. `__Host-` for all of them is a separate hardening,
  recorded in 10.

### 1.4 Never in a URL, a log, an error message or a job payload

- **URL.**
  - Start again is a fixed relative link to `/sign-in?reason=…`. It takes no `next` or `returnTo` parameter, so no
    open redirect.
  - Every redirect stays a reason code.
  - `reasonParams` stays `{ reason }`, so `/sign-in?email=…` fills nothing. A unit test asserts that.
  - The e2e test runs `assertNoPhi('url', url, { known: [email] })` from `@tp/observability`, as
    `e2e/unattested.spec.ts:95` does, over every request URL it records and over `page.url()`. The guard already flags
    an email address shape (`packages/observability/src/phi-guard.ts:44`).
- **Log.**
  - The new code logs nothing.
  - The logger keeps allowlisted keys only (`packages/observability/src/fields.ts:9`, `:55-59`).
  - `Sealer.open` swallows its own errors (`seal.ts:64-66`).
  - No `logger` call in `lib/routes/sign-in.ts` or `pending.ts` takes the email. Keep it so; `pnpm lint:logs` checks
    it.
- **Error message.** `readKeptEmail` returns `string | undefined` and never throws. No `ActionState` carries it, which
  keeps ADR 0077's rule that nothing typed is echoed (`docs/adr/0077…:47`).
- **Job payload.** None is enqueued.
- **Audit.** No event is needed. Start again is a link, not a mutation, and the flow already audits each step.

### 1.5 What it reveals on a shared computer, and the mitigations

The exposure: a person proves their password, then walks away or lets the step expire. Within 18 minutes, the next
person at that browser who reaches `/sign-in?reason=step_expired` sees the first person's address in the Email field.
They do not see a password, a code or a session.

Mitigations, all cheap, recommended together:

1. **Filled only on the restart reason.** Plain `/sign-in`, `signed_out`, `idle` and the other reasons fill nothing.
   This narrows *accidental* exposure, the common case. Someone who deliberately types the reason still sees it, as
   below.
2. **Every first-step submission ends the previous attempt.**
   - `signInWithPassword` clears `tp_sign_in` and `tp_sign_in_email` on every result that is not `pending`:
     `credentials`, `no_account`, `locked`, `invitation_expired`.
   - A `pending` result overwrites both.
   - The moment anyone else uses the form, the first person's address and step are gone.
   - It also closes a gap that exists today: an abandoned code step stays usable for up to 5 minutes after the person
     went back to `/sign-in` (a passer-by could type codes into it and so lock the account).
   - Because every refusal clears the same two cookies, unknown-address and wrong-password responses keep identical
     `Set-Cookie` lists (2).
3. **Cleared at session open, at a lock, and on the redirects to the hardware-key page** (1.2).
4. **No cookie on the hardware-key step.**

**The residual risk, accepted.**
- An address is a semi-public identifier.
- The Email field is `autoComplete="username"` (`app/sign-in/page.tsx:28`), so the browser's own autofill already
  offers it on this computer for as long as the person chose to save it.
- The step pages already show it for the pending cookie's 5 minutes.
- The cookie therefore extends a lesser, already-present exposure by at most 15 minutes, on one reason code only.

### 1.6 Keeping it longer than the challenge: acceptable, and for how long

- **Acceptable.** The cookie proves nothing and opens nothing. It only fills a field, and a person must still type
  the password and a code. That is the whole of 2.2.1's "nearest to Extend" (Scout B 1.5): keeping the password, the
  only way to make a restart one action, is refused.
- **For how long: 15 minutes past the step's own limit (the review's figure), counted from the step's start.**
  - Shorter, say 5, would fail the person who left to find their phone or the invitation email. That is the case the
    feature exists for. It would buy back 10 minutes of a low-grade exposure that autofill already has.
  - Longer adds exposure with little gain: past about 15 minutes a person is starting a new visit, not a restart.
  - Count it from `startedAt`, not from each write. Then repeated `invalid_password` rewrites, or any other rewrite,
    cannot keep it alive.
- After UX PR 66 the same rule gives 30 minutes on enrolment, new password and key registration, and 20 on the code
  step. That PR's security review confirms those with the 15-minute Cognito session; the rule itself needs no change.

### 1.7 Reconciling with ADR 0077

ADR 0077 rules out echoing typed values from the server (`:47`, rejected alternative at `:180-182`). It also never
keeps typed text in browser storage, "because it may hold patient information" (`:246`). The kept email is a
deliberate, narrow exception, and ADR 0081 should say so in those words:

- It is one field.
- It is the person's own sign-in address, schema-checked, never free text.
- It is kept only after the password proved it belongs to an account.
- It is sealed and HttpOnly, so it is not "browser storage" any script can read.
- It lives 18 minutes at most.
- It is rendered on a page load, never carried in `ActionState`.

## 2. Account enumeration

- **The first step's vague refusal must not change.**
  - `credentials` and `no_account` share one message (`lib/routes/sign-in.ts:50-53`), and the first step names no
    field (`:70-75`, `:124`).
  - Pinned today by `lib/routes/sign-in-routes.db.test.ts:204`, which compares text only.
  - Add: for an unknown address and for a wrong password, `data` is equal **and** the set of cookies written is equal.
    Neither writes `tp_sign_in_email`, and both clear the same two cookies (1.5).
- **An expired step says nothing about the address.**
  - `RESTART` is one constant (`:140`). The settle `expired` branch is one constant (`:114-116`).
  - A step page loaded without a valid pending step redirects the same way for anyone (`:174`, `:203`, `:230`,
    `:321`).
  - A browser that never proved a password can open `/sign-in?reason=step_expired`. It gets the generic notice and an
    empty field, because no kept email exists for it.
- **The kept email cannot be minted without the password.** It is written only from `settle`'s `pending` branch for
  the four steps after the password. It is never written by `hardwareKeyOptions` (`:270-278`), whose options are
  issued for any address. Add a test: a key-options call writes no `tp_sign_in_email`.
- **The step marker (UX-128).**
  - Compute the plan (`of 2` or `of 3`) only on the success path: after the provider accepted the password, from the
    account row the flow already holds (`lib/auth/sign-in.ts:163`, `:189`).
  - Add no query, and no work that depends on the address, before the provider's answer. That would be a timing
    difference between known and unknown addresses. One such difference exists today: `invitation_expired`'s query
    at `:172-177` runs only for invited accounts.
  - Carry the plan sealed, never in the URL. Then a crafted link cannot show a wrong count, and the count is shown only
    to the person who proved the password.
- **Found, not this PR's** (recorded in 10):
  - `start` refuses a locked account (`lib/auth/sign-in.ts:164-166`) and an expired invitation (`:172-177`) **before
    the password is checked**.
  - So anyone can learn that an address is locked, or is invited with a lapsed invitation.
  - The first is a common, documented trade-off (the person must be told the account is locked). The second deserves
    a decision.
  - Neither is touched by PR 6. PR 6 must not add a third.

## 3. A deadline in the page

- **What is shown.**
  - A static sentence: "This step stays open for 3 minutes."
  - Page data of `closesIn`, and the `closesAt` that Scout B uses as an anchor key: numbers about this browser's own
    challenge.
  - Shown only on step pages that open the sealed pending step. Without one they redirect (`pendingOf`, `:135-138`).
- **No leak.**
  - The length is Cognito's configured minimum. Anyone who signs in can measure it, and knowing it gives an attacker
    no more time.
  - `closesAt` reveals the server's clock to the millisecond. The `Date` header already gives it to the second, and
    TOTP's 30-second steps make finer knowledge worthless.
  - No email, secret or account fact is added to the timer. `StepTimer`'s props are numbers and the constant restart
    href.
- **The direction that matters is inward.**
  - The server must never take a deadline, a remaining time or a "started" time from the request: not from a form
    field, a query, a header, or any cookie other than the sealed pending step. `closesIn` goes one way, to the page.
  - Enforce from the sealed `startedAt` in `pendingOf`, which runs after the rate-limit guard (`lib/http/invoke.ts:386`)
    and before any provider call.
  - Take `startedAt` from `services.now()` before the provider call where the route can, so the app never states more
    time than Cognito gives. The provider's own `expired` stays the backstop (`lib/auth/sign-in.ts:127-128`).
- **A pending step sealed before the deploy, which has no stamp:** agree with Scout A. Render it without a timer and
  let the provider and the seal's 5 minutes decide, which is exactly today's security.
  - The client cannot strip a stamp, because AES-GCM authenticates the whole value. So a missing stamp only ever means
    a value sealed by the previous release, at most 15 minutes old.
  - **Put the stamp on the sealed object as an added property, not in a wrapper object and not under a new purpose.**
    A rolling deploy runs both versions at once. The old code ignores an unknown property. A wrapper or a purpose bump
    would bounce every sign-in that crosses task versions.

## 4. Rate limits and the lockout

- **Today.**
  - `sign_in` allows 30 per 5 minutes per address and 20 per 15 minutes per account, the account being the typed email
    (`lib/http/rate-limit.ts:39`; `lib/routes/sign-in.ts:158-159`).
  - `mfa` allows 30 per 5 minutes per address and 10 per 5 minutes per account (`rate-limit.ts:40`).
  - For the steps after the password, the "account" is the **raw sealed pending cookie** (`pendingAccount`, `:143`).
  - Subjects are stored as HMACs (`rate-limit.ts:65-67`), and the count is taken before the handler
    (`invoke.ts:386`).
  - The lockout is `user.failed_sign_ins`, counted by `sign_in_failed()` for every rejected password, code or key of a
    known account. It locks at ten consecutive failures and raises a burst event at three second-factor failures in
    15 minutes (`packages/db/functions/sign_in_failed.sql`). It is reset only when a session opens
    (`sign_in_succeeded`, called at `lib/auth/sessions.ts:78`).
- **Start again creates no way around them.**
  - It is a GET link to `/sign-in`, so no rate limit is taken and nothing is issued.
  - A new step needs the password again, which counts against `sign_in` per address and per email. The prefill does
    not change the email it is counted under.
  - An expiry is not a failure, at the provider (`expired`, `sign-in.ts:127-128`) or at the app's deadline
    (`pendingOf` returns `RESTART` before any provider call). So restarting neither adds to nor resets
    `failed_sign_ins`.
  - Each wrong code still counts toward the lock, whichever step it was typed in. An attacker who holds the password
    gets at most nine wrong codes per account before the lock, however often they restart.
- **One property that exists today, unchanged by PR 6.**
  - Because the `mfa` per-account subject is the sealed value, and each new step or rewrite seals afresh (random IV),
    that limit applies per step, not per account.
  - PR 6's 3-minute app deadline makes restarts a little more frequent. The bound that matters, the ten-failure lock,
    is per account and unaffected.
  - Keying the subject on the pending step's email would make the limit per account. That is a separate security
    decision, recorded in 10, not PR 6's.
- **Tests:**
  - A press after the app deadline returns `RESTART`, records no `sign_in_failed` audit event, and leaves
    `failed_sign_ins` unchanged.
  - A first-step refusal still counts in `sign_in` (existing behaviour; nothing to add if the guard is untouched).

## 5. The lengths

| What | Value | Source | Who can change it |
|---|---|---|---|
| Cognito's sign-in session (the challenge) | 180 s | `infra/lib/constructs/identity.ts:14` (`authSession: Duration.minutes(3)`), `:108`; pinned at `infra/test/identity.test.ts:109` | A reviewed infra change only (UX PR 66). #42's diff of both files leaves these lines alone (REST `pulls/42/files`, page 2). |
| Dev provider challenge | 180 s; grant 900 s | `lib/auth/dev-provider.ts:47-48` | Code only. Read it from the constant (Scout A). |
| Pending cookie | 300 s; 900 s for `register_key` | `lib/auth/pending.ts:15-17` | Code only. It depends on `pending.step`, which comes from a sealed, server-made value. |
| **Stated and enforced step limit** | `min(180, 300)` = **180 s** for new password, enrolment and code; 900 s for key registration | New: `PROVIDER_CHALLENGE_SECONDS` and `stepSeconds(step)` beside `pendingSeconds` | Code only, pinned to the infra text by a web unit test (as `lib/auth/primitives.test.ts:65-77` pins the password policy). The test fails when PR 66 moves `authSession` until the constant moves with it. |
| Warning lead | 60 s | New constant | Code only. |
| Kept email | step limit + 900 s, from `startedAt` (1080 s; 1800 s for key registration) | New | Code only. |

- **No production path can shorten or lengthen them from a request.**
  - The lengths are constants. The step is read from the sealed value. `startedAt` is sealed and set by the server.
    The seal's own expiry is checked on every open (`seal.ts:63`), so a browser that keeps a cookie past its Max-Age
    gains nothing.
- **Nor from configuration.**
  - Production builds the services with no `now`, so the clock is `new Date()` (`lib/server/services.ts:183`,
    `:200-235`).
  - `lib/server/config.ts` has no setting for a length or a clock.
  - The dev provider runs in a production build only under `TP_ALLOW_LOCAL_PROVIDERS=e2e`, which only
    `playwright.config.ts` sets (`config.ts:16`, `:191-215`).
- **Keep it that way: no test knob** (7, D4). The server deadline is tested in `sign-in-routes.db.test.ts` with the
  injected clock it already uses (`:217-224`). The e2e test deletes `tp_sign_in`, which is what the browser does at
  Max-Age, and moves the page's clock with `page.clock` (Scout B 3.4).
  - A knob gated on `TP_ALLOW_LOCAL_PROVIDERS` would go in `config.ts` and `services.ts`, both #42 files. It would also
    put an override of a security limit into the production artifact.
  - A short-challenge persona would put a test branch into `dev-provider.ts` and `dev-store.ts`, PR 7's files.
  - Both rejected.
- **Not confirmed here:** the 15 minutes of UX PR 66. That is the less strict setting, named in the review's 6.1, and
  it is that PR's security review. PR 6 changes no length. It only states the 3 minutes and enforces them app-side,
  which tightens the 3-to-5-minute window in which a dead step still renders.

## 6. The boundaries

### 6.1 Every file the plan touches

The plan is the queue's list plus Scouts A and B and this report. "PR 7" marks a file UX PR 7 changes after this one.

| File | PR 6's change | #42 | PR 7 | Migration, infra or Cognito |
|---|---|---|---|---|
| `lib/auth/pending.ts` | The constants, `stepSeconds`, `startedAt` sealed as an added property, the kept-email helpers, `clearPending` clearing it | no | no | no |
| `lib/auth/sessions.ts` | The `KEPT_EMAIL_COOKIE` name beside `SIGN_IN_COOKIE` (or define it in `pending.ts` and leave this file alone) | no | no | no |
| `lib/routes/sign-in.ts` | The kept-email write and clears in `settle`, the clears on a refused first step, the deadline in `pendingOf`, `signInPage`'s `email`, the step pages' `closesIn` and plan | no | **yes** | no |
| `app/sign-in/page.tsx` | `defaultValue={email}` | no | **yes** | no |
| `app/sign-in/new-password/page.tsx`, `enroll/page.tsx`, `mfa/page.tsx` | `StepTimer`, the limit sentence, the marker | no | `mfa/page.tsx` **yes** | no |
| `app/sign-in/register-key/page.tsx` (Scouts A and B: add it) | The timer and "Step 3 of 3" | no | no | no |
| `app/sign-in/notice.tsx` (words; Scout B's focus) | `step_expired`'s words, now that the email is kept | no | **yes** | no |
| `components/step-timer.tsx` (new), `step-timer.test.tsx`, `step-timer.browser.test.tsx` | The component and its tests | no | no | no |
| `components/test-support/browser.ts`, `forms-harness.tsx` | The clock option and the harness form | no | no | no |
| `lib/auth/dev-provider.ts` | `CHALLENGE_MS` from the constant (one line) | no | **yes** | no |
| `lib/auth/sign-in.ts` | **Leave alone** if the plan and `startedAt` ride on the sealed object in `pending.ts` (Scout B). Otherwise an optional field in `Pending`. | no | **yes** (heavily) | no |
| `lib/routes/sign-in-routes.db.test.ts`, `e2e/sign-in.spec.ts`, `scripts/synthetic-personas.ts` | Tests and two personas | no | `sign-in.spec.ts` yes (new tests) | no |
| A web unit test pinning `authSession` (in `primitives.test.ts` or the new `step-timer.test.tsx`) | Reads `infra/lib/constructs/identity.ts` as text | It reads a #42 file and edits none | no | no |
| `packages/synth/src/expected/types.ts` (module 19, SGN) | `'SGN'` | no | no | no |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`, `fixtures/synthetic/SGN-0{1..4}/expected.json` (new) | SGN-01 to SGN-04 | **yes** (the first three: shared documents, LANES rule 6) | yes (SGN-05 to SGN-08) | no |
| `docs/adr/0081-…` (new) | 7 | no | yes (extends it) | no |

**Must stay untouched**, each with the reason it is in reach:

- `lib/http/http.test.ts` (#42) pins the cookie header. That is one more reason to keep Path `/`.
- `lib/http/rate-limit.ts` (#42): no new bucket. PR 7 also reuses `sign_in`.
- `lib/server/services.ts` and `config.ts` (#42): no knob.
- `e2e/prepare.ts` and `env.ts` (#42).
- `infra/lib/constructs/identity.ts` and `infra/test/identity.test.ts` (#42; UX PR 66).
- `docs/product/legal-surfaces.md` (#42). The kept-email cookie is a strictly necessary sign-in cookie, of the same
  class as `tp_sign_in`. It carries no legal words, so it needs no row there. The privacy notice (#51) is counsel's and
  the founder's: if it lists cookies, it should name this one. That is recorded for them, not written here.
- `lib/http/next.ts`, `handler.ts` and `route.ts` are not #42 files, but this design needs no change to them.
- `lib/routes/account.ts` (sign-out) needs no change. `writeSession` already cleared the kept email at sign-in, and
  `signed_out` does not fill the field.
- `docs/product/sessions.md` stays as it is. Its header admits only rules the build plan states, so the step limit
  and the kept email go in ADR 0081.

Nothing here needs a migration, an infrastructure change or a Cognito change. **Nothing goes to Lane A.**

### 6.2 Seams for UX PR 7 (forgot your password)

- **One home for the cookie logic.**
  - The kept-email helpers and the step constants live in `lib/auth/pending.ts`, a file PR 7 does not list.
  - Better still for imports: put the constants in a small module with no imports (for example
    `lib/auth/step-limits.ts`). Then `dev-provider.ts`, the pages and the client `StepTimer` can read them without
    pulling in `sessions.ts` and `@tp/db/runtime`.
  - `lib/routes/sign-in.ts` gets only calls, so PR 7's new routes meet few hunks.
- **Leave `lib/auth/sign-in.ts` and the `Pending` union alone** (Scout B). PR 7 adds a reset flow there.
- **A rule PR 7 inherits: the kept email is written only after a secret is proven.**
  - For PR 7 that means after `ConfirmForgotPassword` succeeds, which proves control of the mailbox. `/sign-in` then
    opens with the email filled, on PR 7's own reason (for example `password_reset`).
  - Not on the reset *request*. With `preventUserExistenceErrors: true` (`identity.ts:103`), writing it there would not
    enumerate, but it would let any visitor fill the field with any address, and break the invariant the tests pin.
  - The reset's code step can carry the address in the pending cookie as a new step kind.
- **`notice.tsx`: add entries, never reshape.** PR 6 changes `step_expired`'s words (and the notice's focus, if taken).
  PR 7 adds its reasons to the same `REASONS` map and `SIGN_IN_REASONS` list (`lib/routes/sign-in.ts:23-35`).
- **`mfa/page.tsx`.** PR 6 wraps the card's content in `StepTimer`; PR 7's lost-factor line goes outside the card. The
  hunks then do not meet.
- **`page.tsx`.** PR 6 changes the Email field's line only; PR 7 adds the forgot-password link and the help lines.
- **`dev-provider.ts`.** PR 6's one line; PR 7's reset methods are elsewhere in the file.
- **A stale `key` step** sends staff to the password page (`components/hardware-key.tsx:91-95` and `RESTART`; Scout A,
  section 6). PR 7 lists `hardware-key.tsx`, so it can take the fix. PR 6 should not touch it.

## 7. ADR 0081: warranted, shared with PR 7

**Why an ADR.** The design makes security-relevant decisions that bind four later PRs (7, 14, 66 and 86):

- it keeps an identifier after a step ends;
- it makes a narrow exception to ADR 0077 D1;
- it adds an app-side deadline above the provider;
- it rules out any test knob.

ADR 0016's sign-in steps ("a five-minute HttpOnly cookie", `docs/adr/0016…:31`) gain a deadline and a second cookie.

Recommended scope: *"Sign-in steps: state and enforce the limit that binds, warn before it, and start again with the
email kept; recover a forgotten password"*. PR 6 writes D1 to D6 and PR 7 adds its own.

- **D1. One limit.**
  - `PROVIDER_CHALLENGE_SECONDS` mirrors Cognito's `authSession` and is text-pinned to the infra source.
  - `stepSeconds(step)` is the shorter of that and the pending cookie (key registration: the access token's 15
    minutes).
  - The page states it, the warning counts to it, and the server enforces it from a sealed `startedAt`.
  - The provider's own expiry is the backstop.
  - Nothing in a request or in configuration changes it.
  - UX PR 66 moves the infra value, the cookie and the constant together.
- **D2. The kept email.** The cookie specification in 1.2, with the reasons in 1.3 and 1.6. The residual
  shared-computer exposure is named and accepted (1.5). The exception to ADR 0077 D1 is stated in the words of 1.7.
- **D3. Start again is a link.** It is a GET with no side effect, and it re-issues nothing. A new step costs the
  password, through `sign_in`. An expiry is not a failure and resets nothing. Every first-step submission ends the
  previous attempt.
- **D4. No test knob.** The server's deadline is tested with the injected clock in db tests. The browser is tested
  with `page.clock`. The e2e expiry is the pending cookie's deletion. The rejected knobs and the reasons are in 5.
- **D5. Enumeration.** The four rules of section 2, and the step marker computed on the success path only.
- **D6. Conformance.** 2.2.1 is met in part, recorded for audit #103 (Scout B 1.5).
- **PR 7 adds:** the reset answers alike for any address; it uses the `sign_in` bucket; it records its two security
  events; the second factor is still asked; and the kept email is written after the code is proven (6.2).

## 8. Tests the security review asks for

These are added to Scouts A and B's lists. Rows SGN-01 to SGN-04 can cite them.

- **`sign-in-routes.db.test.ts`.** It has the injected clock. Extend its `Browser` so it records Max-Age.
  1. A first step with an unknown address and one with a wrong password give equal `data` and an equal set of written
     cookie names. Neither writes `tp_sign_in_email`.
  2. A first step that succeeds writes `tp_sign_in_email`, sealed: the value contains neither the address, nor its
     local part, nor `base64url(address)`. It opens only under `sign-in-email`, not under `sign-in-pending`, and the
     reverse also fails. Max-Age is 1080.
  3. `hardwareKeyOptions` writes no `tp_sign_in_email`.
  4. At `startedAt + 180 s + 1 ms`, the page and the action both return `RESTART`, with the cookie still alive. No
     `sign_in_failed` audit event is recorded and `failed_sign_ins` is unchanged. At `startedAt + 179 s` the press
     reaches the provider.
  5. An `invalid_password` rewrite keeps `startedAt`, and keeps the kept email's expiry.
  6. `signInPage` returns `email` for `reason=step_expired` with a valid cookie. It returns none with no reason, with
     `signed_out`, with an expired or tampered cookie, or with a cookie sealed for another purpose. `?email=` fills
     nothing.
  7. The kept email is cleared on session open, on a lock, on `hardware_key_required` and on `key_registered`, and by
     a refused first step. It is kept on `expired`.
- **`e2e/sign-in.spec.ts`.**
  - `assertNoPhi('url', …, { known: [email] })` over every recorded request URL and `page.url()`.
  - The kept-email cookie, from `context.cookies()`: `httpOnly: true`, `secure: true`, `sameSite: 'Lax'`, `path: '/'`,
    a value without the address, and an expiry within 18 minutes.
  - After a full sign-in, no `tp_sign_in` or `tp_sign_in_email` remains.
- **The unit pin.** `authSession: Duration.minutes(${PROVIDER_CHALLENGE_SECONDS / 60})` is present in
  `infra/lib/constructs/identity.ts`, and `stepSeconds` for the three challenge steps is `min(that, 300)`.

## 9. Where this differs from Scouts A and B

- **Path.** Scout A offers narrowing to `/sign-in` as an option. This report recommends `/`, the adapters unchanged
  (1.3): narrowing gains no confidentiality, risks a delete that fails, and its test belongs in a #42 file.
- **Where the write goes.** Scout B writes the email cookie "with each `writePending`". That would also write it for
  the hardware-key step, for any typed address. Write it in `settle`'s `pending` branch, for the four steps after the
  password only (1.2).
- **Filling the field.** Taken from Scout B's open point 7: only on the restart reason. Added: every first-step
  submission clears both cookies unless it opens a new step (1.5).
- **Counting the lifetime.** Scout A writes "the step limit plus 15 min" at each write. This report counts it from
  `startedAt`, so no rewrite extends it (1.6).
- **The stamp.** Agrees with Scout A: an unstamped step is left to the provider. It adds the condition that the stamp
  be an added property on the sealed object (3).

## 10. Recorded, not this PR's

- **Enumeration that exists today** (2): a locked account and a lapsed invitation are answered before the password is
  checked (`lib/auth/sign-in.ts:164-177`). This is for the security reviewer's backlog. The invitation case deserves a
  decision: answer it only after the password, or accept it, since an invitee's address is not secret from the person
  who invited them.
- **The `mfa` per-account limit is keyed on the sealed pending value** (`lib/routes/sign-in.ts:143`), so it limits per
  step, not per account. The ten-failure lock is the real bound. Keying on the step's email is a separate decision,
  and a change to how many attempts a person gets.
- **`__Host-` for every house cookie**, which would block a sibling subdomain from planting one. The value is low while
  no sibling host serves untrusted content, but cheap to adopt across the board in one PR.
- **An abandoned step's DoS on a shared computer.** Today a passer-by can type wrong codes into another person's live
  step and lock the account, within its 5 minutes. PR 6's 3-minute deadline and the clearing on any first-step
  submission (1.5) narrow this. They do not remove it.
- **The privacy notice (#51)**, if it lists cookies, should name `tp_sign_in_email`. That is counsel's and the
  founder's text.
