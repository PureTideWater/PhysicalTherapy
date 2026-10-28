# UX PR 6 (`co-001/ux-sign-in-time`), Scout A: the sign-in flow and its time limits

Read from the checkout `/home/user/ux-sign-in-time` at `165c599` (claude/build-platform with #74). Line numbers are
at that commit. Every path is under `apps/web/src/` unless it says otherwise. Nothing in the checkout was changed.
The dev-stack reproduction ran a scratch Playwright spec (outside the repository) against the production build with
the local identity provider, on its own database `tp_e2e_sgnscout` (PostgreSQL 18, port 5433), synthetic personas
only; see section 1.2.

## 0. Answers in one screen

1. **What a person sees today.** No step says it has a limit. Past Cognito's 3 minutes the step page still loads as
   if it were live, because its cookie lasts 5. The person types, presses the button, and lands on
   `/sign-in?reason=step_expired`. That page says "Start again: That sign-in step expired. Start again from your
   email and password." and both fields are empty. Past 5 minutes, even a reload sends them there. The dev provider
   expires its challenges at 3 minutes like Cognito does, and the reproduction confirms all of this (1.2).
2. **The binding limit today is Cognito's 3-minute sign-in session.** It is set in
   `infra/lib/constructs/identity.ts:14,108`, mirrored by the dev provider at `lib/auth/dev-provider.ts:47`, and is
   shorter than the 5-minute pending cookie (`lib/auth/pending.ts:15-17`). The one constant is a mirrored
   `PROVIDER_CHALLENGE_SECONDS = 180` next to `pendingSeconds` in `pending.ts`, plus a
   `stepSeconds(step) = min(challenge, cookie)` there. Three things read it: the dev provider, the step pages and
   `pendingOf`. A web unit test reads the infra file's text to pin it, the way `primitives.test.ts:65-77` already
   pins `PASSWORD_MIN_LENGTH` and `INVITATION_DAYS`. Nothing in infra changes.
3. **Where the email is.** It sits inside the pending cookie `tp_sign_in`, which is AES-256-GCM sealed (encrypted
   and authenticated), bound to a purpose, carries an expiry, and is HttpOnly, Secure, SameSite=Lax with path `/`.
   With Cognito it is also inside the sealed challenge. The safest way to keep it for "Start again" is a **separate
   sealed HttpOnly cookie** that holds only the email. It is written only when a step after the password is
   written, so only after the password was proven: no enumeration. It lasts the step limit plus 15 minutes, is
   cleared when a session opens or the account locks, and `/sign-in` reads it to fill the Email field. The same
   cookie cannot do this job, because it is cleared or dropped at expiry. Page state cannot either, because it needs
   script, is readable by any script on the origin, and misses expiries the server finds.
4. **Paths and markers.** Steps can be counted after the email-and-password screen (UX-128's wording):
   - Invited customer: "Step 1 of 2: choose a password", "Step 2 of 2: set up two-step verification".
   - Invited staff member: three steps, the third being "register your hardware key". That third step is on
     `register-key/page.tsx`, which is not on the queue's file list (4.2).
   - Ordinary sign-in, by code or by key: no marker.
   - A restart after the new password was saved: no marker, because only the enrolment step is left.

   The server has to decide the count from the provider's answer and the account row, and carry it in the sealed
   pending step, because the URL and the page cannot know it.
5. **A server-rendered deadline needs a stamp.** The pending step needs a server-clock `startedAt`, set when the
   provider issued this step's challenge. It must not be reset by a rewrite of the cookie (an invalid new password
   rewrites it today). The server computes the time left from `startedAt` and the constant. The browser counts only
   the time elapsed since it received that figure, and never compares the deadline with its own clock. The server
   also enforces the deadline in `pendingOf`, which only ever shortens a step to the length Cognito already enforces.

## 1. What a person sees today when a step outlives its challenge

### 1.1 From the code

A step has two clocks. Neither is shown anywhere.

| Clock | Length | Set at | What happens when it runs out |
|---|---|---|---|
| The provider's challenge: Cognito's sign-in session, or the dev provider's sealed challenge | 3 min | `infra/lib/constructs/identity.ts:14` (`authSession: Duration.minutes(3)`) and `:108` (`authSessionValidity`); dev: `lib/auth/dev-provider.ts:47` (`CHALLENGE_MS = 3 * 60_000`), `:88-90` | The step's next provider call answers "expired". Cognito returns `NotAuthorizedException` ("Invalid session for the user, session is expired.", pinned at `lib/auth/cognito-provider.test.ts:83-93`), which `STALE` maps to `{ kind: 'expired' }` (`cognito-provider.ts:90-91,179-181`, `:226-228`, `:249-251`). The dev provider's `open()` returns nothing (`dev-provider.ts:92-95`), so each call answers `expired` (`:134-136`, `:147-150`, `:156-160`, `:171-175`). The flow turns that into `refused('expired')` (`lib/auth/sign-in.ts:127-128`). `settle` clears the pending cookie and redirects to `/sign-in?reason=step_expired` (`lib/routes/sign-in.ts:112-116`). |
| The pending cookie `tp_sign_in` | 5 min (15 for `register_key`) | `lib/auth/pending.ts:15-17,23-26`: the seal's expiry and the cookie's Max-Age are both `now + seconds` | The browser drops the cookie, and the sealed value no longer opens anyway (`lib/auth/seal.ts:104`). `pendingOf` returns undefined (`lib/routes/sign-in.ts:135-138`), and every step page and action returns `RESTART = { redirect: '/sign-in?reason=step_expired' }` (`:140`; pages at `:174`, `:203`, `:230`, `:321`; actions at `:191`, `:218`, `:245`). |

What the person meets, step by step:

- **Code step (`/sign-in/mfa`).** The page says nothing about time (`app/sign-in/mfa/page.tsx:12-29`).
  - Between 3 and 5 minutes: a reload still renders the page, because `pendingOf` only checks the cookie and nothing
    can see that Cognito's session has died. The person types a correct code and presses "Sign in". `answerTotp`
    gets `expired` and the browser is redirected to `/sign-in?reason=step_expired`.
  - After 5 minutes, even a reload redirects there.
  - A wrong code inside the window gets "That did not match." on the code field (`:123-124`, `:75`). It does not
    rewrite the cookie, so both clocks keep running.
- **Enrolment (`/sign-in/enroll`).** The 3 minutes start when the step is entered, not when the page is read.
  - `settle` calls `beginTotpSetup` as it writes the step (`lib/routes/sign-in.ts:93-99`). Cognito then calls
    `AssociateSoftwareToken`, which returns a new session (`cognito-provider.ts:222-224`), and the dev provider
    seals a new 3-minute challenge (`dev-provider.ts:152-153`).
  - Inside that window the person must read the instructions, add a 32-character key to a phone by typing it (no QR
    code: UX-128), and enter a code (`app/sign-in/enroll/page.tsx:21-34`).
  - On expiry the authenticator app already holds an entry for this account that will never be valid. The restart
    issues a new secret under the same label: `totp.ts:12-13,26-28` uses the issuer `TOTP_ISSUER` and the email as
    the label. Depending on the app, the old entry stays beside the new one, and the person may then read the
    wrong code. Not handled today. See 6.
- **New password (`/sign-in/new-password`).**
  - Past 3 minutes, a valid password goes to Cognito (`cognito-provider.ts:206`). The expired session comes back as
    `expired`. The `password` stage skips `WRONG_CODE` at `:176`, so it reaches `STALE` at `:179`. The person is
    sent to `/sign-in?reason=step_expired`, and the new password was **not** saved: they must start again with the
    **temporary** password from the invitation.
  - A password the policy refuses never reaches Cognito (`:201-204`). The `invalid_password` branch then
    **rewrites the pending cookie with a fresh 5 minutes** (`lib/routes/sign-in.ts:106-108`), while Cognito's
    3 minutes keep running. This is the one place where the cookie's clock and the challenge's clock drift apart
    (see 5).
- **Enrolment after the new password was saved (invited path).** Cognito and the dev provider save the password
  before they ask for enrolment (`dev-provider.ts:142-144`; Cognito's NEW_PASSWORD_REQUIRED answer). An enrolment
  that expires therefore restarts with the **new** password, and goes straight to `/sign-in/enroll` with no
  new-password step. The database still says `invited`, because `status` becomes `active` only when a session opens
  (`packages/db/migrations/20261015180000_tenancy_hardening.sql:482-494`).
- **The landing page.** `/sign-in?reason=step_expired` shows the notice "Start again" / "That sign-in step expired.
  Start again from your email and password." (`app/sign-in/notice.tsx:14`; `Alert role="status"` at `:26-29`). The
  Email field is empty: the route returns only `{ reason }` (`lib/routes/sign-in.ts:145-152`), and the field has no
  value (`app/sign-in/page.tsx:28`). The words do not say *which* password: after an expired new-password step it
  is the temporary one, and after an expired enrolment it is the new one.
- **Key steps.**
  - A stale `key` step's `RESTART` from `/api/sign-in/hardware-key/verify` is followed by
    `window.location.assign` (`components/hardware-key.tsx:91-95`). That sends a staff member to the
    *password* page with "Start again from your email and password", although their role signs in with a key.
    This is outside PR 6's files; recorded in 6.
  - `register-key` has its own 15-minute cookie, and its real limit is the 15-minute access-token grant (see 2).

### 1.2 Reproduced in the dev stack

Scratch spec `…/scratchpad/sgn-repro/specs/expiry.spec.ts`: the production build with `TP_AUTH_PROVIDER=dev`, real
time, three synthetic personas in parallel. Results:

All 3 passed in 7.3 minutes, 2026-10-28 03:22-03:30Z. Observations
(`…/scratchpad/sgn-repro/observations.txt`):

| Scenario | Observed |
|---|---|
| A. Code step, enrolled customer persona | At `/sign-in/mfa` the `tp_sign_in` cookie is HttpOnly, Secure, SameSite=Lax, path `/`, with 300 s left (its value is 355 characters on the dev provider). **After 185 s a reload still renders "Verification code"**, a live-looking step. A **correct** code, pressed, lands on `/sign-in?reason=step_expired`. The notice reads "Start again / That sign-in step expired. Start again from your email and password." **The Email field is empty**, there is no email in the URL, and the pending cookie is gone. Screenshot: `…/scratchpad/sgn-repro/A-after-expiry.png`. The notice has the same neutral look as the staff note below it. |
| B. Code step, past 5 minutes | At 305 s the browser has dropped the cookie. A reload redirects to `/sign-in?reason=step_expired`, with the same notice and an empty Email field. |
| C. Invited customer (`invited` persona) | **New password at 185 s:** a valid new password, pressed, lands on `step_expired` with the Email empty. The temporary password still works afterwards, so the new one was not saved (screenshot `C1-new-password-expired.png`). **Enrolment at 185 s:** a correct code for the shown secret, pressed, lands on `step_expired`. **The temporary password is then refused** ("Not done / That did not match…"), because the new password *was* saved. **The chosen password goes straight to `/sign-in/enroll` with a new secret**: the restart path is one step shorter, and the first secret is orphaned in the authenticator. |

The dev provider models expiry faithfully at 3 minutes. The 3-to-5-minute window is real: the page loads as live and
fails only on the press. The landing page gives no hint of which password to use.

## 2. The binding limit, where each is set, and the one constant

| Limit | Value | Where it is set | Applies to |
|---|---|---|---|
| Cognito's sign-in session (`authSessionValidity`) | 3 min, Cognito's minimum, chosen on purpose ("The sign-in session (the time to answer an MFA challenge) is Cognito's minimum", `identity.ts:7-8`) | `infra/lib/constructs/identity.ts:14,108`; pinned by `infra/test/identity.test.ts:109` (`toBe(3)`). Both are #42 files (`pr42-files.txt:97,112`); #42 is **open** (`gh api …/pulls/42`: open, not merged). | Every challenge: NEW_PASSWORD_REQUIRED, MFA_SETUP (after AssociateSoftwareToken / VerifySoftwareToken), SOFTWARE_TOKEN_MFA, WEB_AUTHN |
| Dev provider challenge | 3 min ("the user pool's sign-in session") | `lib/auth/dev-provider.ts:25-26,47` | The same, locally |
| Pending cookie | 5 min; 15 for `register_key` | `lib/auth/pending.ts:6-11,15-17` (private `pendingSeconds`) | Every step page and action (`pendingOf`) |
| Access-token grant behind `register_key` | 15 min from the TOTP success | `identity.ts:11` (`accessToken`); dev `GRANT_MS` `dev-provider.ts:48` | Key registration only. `hardwareKeyRegistrationOptions` rewrites the cookie with a fresh 15 minutes, keeping `{ ...pending }` (`lib/routes/sign-in.ts:346`), so the cookie can outlive the grant by up to the time already spent. |

**Which binds:** the 3-minute challenge, in production and in dev, for new password, enrolment and code (3 < 5). For
key registration it is the 15-minute grant, counted from the TOTP success (cookie 15 = grant 15, and the cookie is
reset once, at options).

**The one constant, with no infra change.** `apps/web` cannot import `infra/` (CDK's `Duration`; the web app has no
dependency on `@tp/infra`). The repository already mirrors identity values into the web app and pins them with a
text read of the infra source:

- `lib/auth/password.ts:10` mirrors `PASSWORD_MIN_LENGTH`.
- `lib/auth/primitives.test.ts:65-77` reads `infra/lib/constructs/identity.ts` and asserts
  `export const PASSWORD_MIN_LENGTH = 12;` and `tempPasswordValidity: Duration.days(INVITATION_DAYS)`.

Recommended:

- In `lib/auth/pending.ts`, next to `pendingSeconds`, export
  `PROVIDER_CHALLENGE_SECONDS = 3 * 60` ("Cognito's sign-in session, `authSession` in
  infra/lib/constructs/identity.ts").
- Also export `stepSeconds(step)`:
  - for the challenge steps, `Math.min(PROVIDER_CHALLENGE_SECONDS, pendingSeconds(step))`, which is 180;
  - for `register_key`, `pendingSeconds('register_key')`, which is 900 and equals the access token.
- Readers:
  1. the dev provider's `CHALLENGE_MS` (`dev-provider.ts:47`), so dev stays the user pool's twin from one value.
     `dev-provider.ts` is not on the queue's file list and not a #42 file; one line.
  2. `pendingOf` (the server's deadline, section 5).
  3. The step pages, which pass the limit and the time left to `StepTimer` as numbers. `components/step-timer.tsx`
     is a client component and must not import `pending.ts`, which imports `sessions.ts` and through it
     `@tp/db/runtime`.
- Tests:
  - A web unit test reads `identity.ts` and asserts
    `authSession: Duration.minutes(${PROVIDER_CHALLENGE_SECONDS / 60})`. UX PR 66, which raises it to 15, then
    fails until the constant moves with it.
  - A second assertion: `stepSeconds` for `mfa`, `mfa_setup` and `new_password` equals
    `min(PROVIDER_CHALLENGE_SECONDS, 300)`. This is the queue's "shorter of Cognito's 3 minutes and the pending
    cookie".
- The cookie lengths stay as they are.

## 3. Where the email lives, and the safest way to keep it

**Today.**

- Every `Pending` variant carries `email` (`lib/auth/sign-in.ts:44-50`).
- With Cognito the challenge string inside it also holds `{ s, u, email }` (`cognito-provider.ts:61-67,153-157`).
- The pending value is sealed with AES-256-GCM under the server key (`AUTH_COOKIE_SECRET`). It is bound to the
  purpose `sign-in-pending` by the AAD, with the expiry inside the ciphertext (`lib/auth/seal.ts:80-87,90-108`;
  `pending.ts:13,19-26`). So the email is encrypted and authenticated, and a tampered or expired cookie opens to
  nothing.
- Cookie flags: `HttpOnly; Secure; SameSite=Lax; Path=/` for page and action responses (`lib/http/next.ts:23,30`)
  and for handler responses (`lib/http/handler.ts:44-46`). The `CookieJar` takes only `maxAgeSeconds`
  (`lib/http/route.ts:34-38`).
- Pages render as private and no-store (`lib/http/next.ts:19-20`), so an email rendered into `/sign-in` is never
  cached by a shared cache.
- The step pages show the email to the person (new-password and mfa `CardTitle`, enrolment description).
- The email is **never** in a URL today: every redirect carries a reason code only (`lib/routes/sign-in.ts:22`,
  `:116`, `:140`; `lib/http/next.ts:55-58`).

**The options for "Start again" with the email kept.**

| Option | Verdict |
|---|---|
| The same pending cookie, kept longer | No. `settle` clears it on expiry (`:115`), and past 5 minutes the browser has dropped it. Lengthening it would also lengthen the life of what it carries (Cognito's session string, the TOTP secret during enrolment, the access-token grant for `register_key`) and would make `pendingOf` treat a dead step as live. |
| Page state (the step page puts the email in `sessionStorage` or memory, and `/sign-in` reads it) | No. It needs script: a person without JavaScript, or a press before hydration, gets nothing. It misses the expiries the server finds (the redirect after the press, or after a reload past 5 minutes). It puts the email where any script on the origin can read it, where an HttpOnly cookie keeps it from script. It does not reach a new tab. It also strains `PRD.md:256` ("no screen depends on client-side state that a refresh loses"). |
| **A separate sealed, HttpOnly cookie holding only the email (recommended)** | Yes. Details below. |

How the recommended cookie works:

- **Name and purpose:** for example `tp_sign_in_email`, with the seal purpose `sign-in-email`, so a pending value
  never opens as it and the reverse.
- **Written** beside `writePending` for the steps after the password: `new_password`, `mfa_setup`, `mfa` and
  `register_key`. That means only after the provider accepted the password.
- **Not written** for the `key` step. Its options are issued for any email (`lib/auth/sign-in.ts:230-237`), and the
  key page keeps its own field.
- **Length:** Max-Age and seal expiry are `stepSeconds(step) + 15 min`, as UX-012 sets.
- **Cleared** by `writeSession` (`pending.ts:33-37`) and on `locked` (`lib/routes/sign-in.ts:120-122`).
- **Read** by `signInPage` (`lib/routes/sign-in.ts:145-152`), which returns `{ reason, email }`. `/sign-in` fills
  the Email field with it (`app/sign-in/page.tsx:28`; `Field` passes `defaultValue` through
  `ComponentProps<'input'>`, `components/field.tsx:75`), on any reason. The "Start again" button is then a plain
  link to `/sign-in`, which needs no new action, and the email never enters the URL.
- **Writing happens in actions only.** A Next server component cannot set cookies. The writes therefore go in
  `settle` (the actions), and the page route only reads, as every sign-in page route does today.
- **Account enumeration.**
  - The first step's vague words stay: `credentials` and `no_account` share one message (`:51-53`), and the first
    step never names a field (`:70-74`).
  - The new cookie exists only for a browser that has already proven the password and been sent to the next step.
    So whether it is set tells nothing that the redirect has not already told. The page shows back only the
    address that this browser itself typed.
  - The ActionForm already keeps a refused first step's typed email in the browser (ADR 0077). The new cookie adds
    nothing for a refusal.
- **What a separate cookie gains.**
  - The pending cookie stays the same size. It already carries Cognito's session string and, during enrolment,
    the secret; a browser caps a cookie at about 4 KB.
  - The kept email cannot outlive its purpose by riding on the pending cookie.
- **Security trade-off (the safer choice).** The remaining exposure is visual: on a shared front-desk computer, the
  next person who opens `/sign-in` within about 18 minutes of an abandoned step sees the address prefilled.
  - Taking the shorter lifetime makes "Start again" fail for a person who comes back after a break, and serves no
    one.
  - Consuming the cookie on first read (one-time) is not safer, because the same browser holds it, and a reload
    would lose it.
  - Recommended, therefore: the 15 minutes, cleared at session open and at a lock, plus a path narrowed to
    `/sign-in`. The path covers `/sign-in` and `/sign-in/*`, where the actions post, and the cookie then rides on
    no other request. Narrowing needs a `path` option on `CookieJar.set` and its two adapters
    (`next.ts:23-35`, `handler.ts:44-46`). That is three small edits outside the queue's file list, none a #42
    file. The design decides.
- **For PR 7 (forgot your password).** It can reuse the same helper: after a reset, `/sign-in` opens with the
  email filled. Name it for what it holds (`writeSignInEmail`, `readSignInEmail`, `clearSignInEmail` in
  `pending.ts`), not for the expiry. Write it only on a result that leaks nothing:
  `preventUserExistenceErrors: true`, at `identity.ts:103`, keeps Cognito's reset answer the same for unknown
  addresses. The same helper can serve flows-other-19 later: the email filled on `/sign-in/hardware-key` after a
  key is registered.

## 4. The paths and what a step marker would say

### 4.1 Every path from the code

The flow goes `start` → `after(step)` (`lib/auth/sign-in.ts:119-134,162-179`). `authenticated` applies the staff
rule (`:136-159`).

| Who | Screens, in order | Notes |
|---|---|---|
| Customer, enrolled (the everyday path) | `/sign-in` → `/sign-in/mfa` → workspace | Cognito answers SOFTWARE_TOKEN_MFA (`cognito-provider.ts:97`) |
| Customer, invited (temporary password) | `/sign-in` (temporary password) → `/sign-in/new-password` → `/sign-in/enroll` → workspace | NEW_PASSWORD_REQUIRED, then MFA_SETUP (`:95-96`); `invitation_expired` refused first (`sign-in.ts:170-177`) |
| Customer whose enrolment expired after the new password was saved, or any account with a password but no TOTP | `/sign-in` (own password) → `/sign-in/enroll` → workspace | One step left |
| Staff (`hardware_key_required`), invited | `/sign-in` (temporary password) → `/sign-in/new-password` → `/sign-in/enroll` → `/sign-in/register-key` → `/sign-in/hardware-key?reason=key_registered` (email typed again, key touched) → workspace | MFA is required in the pool, so TOTP is enrolled first. The TOTP success has no key, which gives `register_key` (`sign-in.ts:146-149`). After registration the pending step is cleared (`routes/sign-in.ts:109-111`). |
| Staff, TOTP enrolled, no key yet | `/sign-in` → `/sign-in/mfa` → `/sign-in/register-key` → `/sign-in/hardware-key?reason=key_registered` → workspace | |
| Staff with a key (the everyday path) | `/sign-in/hardware-key` (email, key) → workspace | A password and code sign-in instead goes `/sign-in/mfa` → `hardware_key_required` → `/sign-in/hardware-key?reason=hardware_key_required` (`routes/sign-in.ts:117-119`) |

### 4.2 The marker

UX-128 (taken under the co-founder's ruling) counts the steps **after** the email-and-password screen: "Step 1 of
2: choose a password" and "Step 2 of 2: set up two-step verification". flows-other-18 had "Step 2 of 3", counting
that screen. Take UX-128's form and report it as the recommended option. The first screen cannot carry a marker
anyway: it cannot know which path follows, and saying so would tell which addresses are invited.

| Path | new-password | enroll | register-key | mfa / hardware-key |
|---|---|---|---|---|
| Customer, invited | Step 1 of 2: choose a password | Step 2 of 2: set up two-step verification | n/a | n/a |
| Staff, invited | Step 1 of 3: choose a password | Step 2 of 3: set up two-step verification | Step 3 of 3: register your hardware key | none (the `key_registered` notice already says "Sign in with it now") |
| Restart after the new password was saved, customer | n/a | none (one step left) | n/a | n/a |
| Restart after the new password was saved, staff | n/a | Step 1 of 2: set up two-step verification | Step 2 of 2: register your hardware key | none |
| Staff, TOTP enrolled, no key | n/a | n/a | none (one step) | none |
| Everyday sign-in (code or key) | n/a | n/a | n/a | none |

Notes on the marker:

- **Who decides the count: the server, never the URL.**
  - The provider's answer tells what comes next: `new_password_required` means a new password and then
    enrolment; `mfa_setup_required` means enrolment.
  - The account row tells whether a key registration follows: `sign_in_account(...)` returns
    `hardware_key_required`, already read in `start` (`sign-in.ts:163`) and `newPassword` (`:189`). An invited
    staff member has no key yet, by construction.
  - Carry the plan in the sealed `Pending` (for example `setup?: { at: number; of: number }`), set when the first
    setup step is written and advanced by each `pending` result. The pages render the marker only when `of >= 2`.
  - Nothing in the URL. The plan says only what the person, who has proven the password, will do next.
- **The staff path reaches `register-key/page.tsx`, which is not on the queue's file list** (prs.json order 6). It
  is not a #42 file. Without it, an invited staff member reads "Step 2 of 2" on enrolment and then meets a third
  step. Under the founder's rule (only the best option), add it to this PR's files. The alternative is to have the
  marker say "of 3" there and leave that page unmarked, which is worse.
- Words: the step names above are the pages' own `h1`s, cased as a running sentence ("Choose a password", "Set up
  two-step verification", "Register a hardware key"). The words reviewer checks them against
  `.claude/rules/brand.md`, BRAND.md and CO-11. BRAND.md:122 ("Sign-in: stacked lockup, Paper ground, nothing else
  decorative"): a one-line text marker is content, not decoration.

## 5. What a server-rendered deadline needs

- **Today no stamp exists.**
  - `Pending` has no time (`lib/auth/sign-in.ts:44-50`).
  - The seal's `e` is the cookie's expiry, not the challenge's (`seal.ts:84`, `pending.ts:25`). It is also
    **reset** when `invalid_password` rewrites the cookie (`lib/routes/sign-in.ts:106-108`), while Cognito's clock
    is not.
  - Cognito's `Session` is opaque. The dev challenge's expiry is sealed under the provider's derived key
    (`dev-provider.ts:88-90`; `services.ts:115`).
  - So nothing the app holds today says when the challenge dies.
- **Needed:** `startedAt` (milliseconds, `services.now()`) in `Pending`, set where the provider issued the step's
  challenge or grant:
  - **Where to stamp:** in `settle`'s `pending` branch, after `beginTotpSetup`, because enrolment's window starts
    there (`lib/routes/sign-in.ts:91-101`). Every `pending` result is a fresh challenge: `start`, a successful
    `newPassword`, `beginTotpSetup`, or `register_key` after the TOTP success.
  - **Where not to stamp:** do not re-stamp on `invalid_password` (the same challenge), or in
    `hardwareKeyRegistrationOptions` (`:346`, which spreads `{ ...pending }`, so the stamp stays, and the grant's
    15 minutes count from the TOTP success, as they should).
  - Store the start, not a deadline. The length belongs to the constant, which UX PR 66 changes per step (15 for
    enrolment, new password and key registration; 5 app-side for the code).
  - **A pending step sealed before the deploy** has no stamp. Render it without a timer and let the provider
    decide, rather than bounce it.
- **Server enforcement (recommended, and the safer option).**
  - `pendingOf` refuses a step once `now >= startedAt + stepSeconds(step)`, and returns `RESTART` with the email
    kept by its own cookie.
  - This closes the 3-to-5-minute gap in which a dead step renders as live (1.1). It makes dev and production
    behave alike. It is the hook UX PR 66 needs to keep the code step at 5 minutes app-side once Cognito allows 15.
  - It only ever tightens, to what Cognito enforces already.
  - The provider's own `expired` stays the backstop, for clock skew between the app and Cognito.
- **The browser.**
  - The server renders the static sentence. With the limit from the constant: "This step stays open for 3
    minutes." That needs no script.
  - The server passes `remainingMs = startedAt + limit − now()` to `StepTimer` as a number.
  - The client measures only the time elapsed since it received that figure: `Date.now()` deltas from mount. Wall
    clock deltas stay right across sleep and back-forward cache restores; the absolute time is never compared, so
    a browser clock minutes off does no harm.
  - The client shows the polite warning when `remainingMs − elapsed <= 60 s`. It schedules a `setTimeout` for that
    moment and checks again on `visibilitychange`, because background tabs throttle timers.
  - The live region is in the DOM from the first render, empty, as `PendingStatus` is
    (`components/form-issues.tsx:170-181`) and `CeremonyButton`'s status line is
    (`components/hardware-key.tsx:62-64`). It is filled at one minute left with today's `Alert`
    (`packages/ui` `Alert` takes `role`, default `alert`; use `role="status"`).
  - At zero, do not navigate by itself: that pulls the page from under a screen-reader user. Change the warning to
    say the step has closed, and keep the "Start again" link.
- **Testability, with no wait in e2e.**
  - The browser side: Playwright's `page.clock` can move the client's elapsed time, to show the warning for axe on
    `/sign-in/enroll` and `/sign-in/mfa`.
  - The server side: delete the `tp_sign_in` cookie (`context.clearCookies({ name: 'tp_sign_in' })`;
    Playwright 1.64.1 is installed) and reload. That gives the `RESTART` path, and `/sign-in` must show the email
    filled from the new cookie, with no `@` in `page.url()`.
  - The deadline itself is a unit or db test with an injected `now` (`createServices({ now })`, `services.ts:183`;
    the flow tests already move a clock, `sign-in.db.test.ts:150`).
  - The e2e server has no injectable clock (`services.ts:113-118`, `:183`), and the pending step has no database
    row to move, so an e2e test cannot fast-forward the server.

## 6. Recorded for the design (not asked, found on the way)

- **The restart words** can name the password when the email cookie also records the step it was written for, as a
  code: "Use the temporary password from your invitation email" after an expired new-password step, "Use the
  password you just chose" after an expired enrolment. That leaks nothing, because the password was proven. The
  words are the words reviewer's.
- **The orphaned authenticator entry** after an expired enrolment (1.1). A restart issues a new secret under the
  same label, so the enrolment page could say "If your app already has an entry for this account from an earlier
  try, replace it with this one". The words reviewer decides.
- **The issuer is "Therapy Platform"**, not the product's name (`lib/auth/totp.ts:9`; WebAuthn `rpName` at
  `lib/server/services.ts:116`). The authenticator shows it. This is brand, outside PR 6; for the words reviewer or
  a later PR.
- **A stale `key` step** sends a staff member to the password page (1.1). The redirect should be
  `/sign-in/hardware-key?reason=step_expired`. Outside PR 6's files (`components/hardware-key.tsx`,
  `lib/routes/sign-in.ts` `RESTART` for `key`); flows-other-19's PR, or PR 7 if it touches the same code.
- **Stale comment for Lane A:** `infra/lib/constructs/identity.ts:41-42` says temporary passwords "expire after
  three days", while `:82` sets `Duration.days(INVITATION_DAYS)`, which is 7. It is a #42 file, so Lane A's.
- **For the orchestrator:** `docs/product/test-matrix.md` is on #42's list (`pr42-files.txt:86`), yet #74 and #79
  appended sections to it (FRM at `:320`, TBL at `:338`). The SGN rows would follow that precedent, but that is the
  orchestrator's ruling.
- **For Lane A (no change here):** UX PR 66 moves `authSession` to 15 minutes and the pending cookie with it, and
  must move `PROVIDER_CHALLENGE_SECONDS` in the same PR; the web text-pin test then fails until it does. Whether a
  failed `VerifySoftwareToken` or a CodeMismatchException consumes Cognito's session was not checked: no AWS
  account is reachable (`cognito-provider.ts:42-43`).
