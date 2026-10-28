# co-001/ux-sign-in-time: each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept

The UX baseline review's sixth pull request. Branch `co-001/ux-sign-in-time`, cut from `claude/build-platform` at
`165c599` (which holds #74, UX PR 1: ActionForm, the shared fields, `PasswordField`, ADR 0077); worktree
`/home/user/ux-sign-in-time`. Every file:line below was read at `165c599`. The requirements are the review's queue entry
for order 6 (`designs/lane-b-ux-review.md:242-254`), its findings UX-012 (C-007, `:1800-1818`, the now part) and
UX-128 (C-042, `:3928-3946`, the step marker), their sources `a11y-other-23`, `a11y-other-06` and `flows-other-18`
(`designs/lane-b-ux-review/raw-findings.md:251-258`, `:64-71`, `:1231-1238`), and `synthesis/prs.json` order 6. The
three scouts' reports sit beside this file (`designs/lane-b-ux-sign-in-time/scout-{flow,timer,security}.md`). Where a
scout and the code disagree, this design follows the code and says so; where the scouts disagree with each other,
section 2.11 says which way it goes and why.

Reserved for this PR: ADR 0081 (shared with UX PR 7, which adds to it), test-matrix rows SGN-01 to SGN-04 (SGN-05 to
SGN-08 stay with PR 7), `packages/synth` module 19 (SGN), for four no-file registry entries. **No migration**, and
nothing in infra or Cognito (section 7). **Lands on nothing**: it depends on no open pull request (section 3.6).

**#42 is open** (REST `pulls/42`, read 2026-10-28 03:50 UTC: `state: open`, `merged: false`, head `6f23c42b`, updated
2026-10-27 21:05 UTC; `gh pr view` is refused here with a GraphQL 403). Its file list was taken again from the REST files
API (three pages, 208 files, saved as `scratchpad/sgn-pr42-rest-clean.txt`), because
`designs/lane-b-release-content-checks/pr42-files.txt` (2026-10-27 01:41, 143 files) is stale: #42 has since added
`apps/web/e2e/helpers.ts` and `apps/web/e2e/hardware-key.spec.ts`, among others. The union of both lists
(`scratchpad/sgn-pr42-union.txt`) was intersected with section 3's files by script: the only #42 files this PR touches
are the three shared documents LANES.md rule 6 lets both lanes change (`docs/product/test-matrix.md`,
`packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`). `e2e/helpers.ts` is read, never edited.

## Contents

1. The defect and its cause
2. The decision (2.1 to 2.9), the alternatives (2.10) and the security analysis (2.11)
3. Files, in build slices, and what is left for Lane A and for UX PRs 66, 14 and 7
4. Tests
5. Docs: ADR 0081, and its relation to ADRs 0016 and 0077
6. Every string a person sees, and the screenshots
7. No migration; proposals outside the PR
8. Risks, and what holds each

What each part answers: 2.1 to 2.6 and 2.8 answer UX-012's now part (the limit that binds today, stated from one
constant, the warning, Start again and the email kept, with no Cognito change); 2.7 answers UX-128's step marker; 2.9
records what WCAG 2.2.1 still leaves unmet, for audit #103, as UX-012's Rule line asks. UX-128's QR code (UX PR 86) and
copy button (UX PR 20), and UX-012's 15 minutes (UX PR 66), are not this PR's.

---

## 1. The defect and its cause

**What a person sees.** No sign-in step says it has a time limit, and none warns before it ends. The scout reproduced
every case in the dev stack (production build, local identity provider, three synthetic personas, real time, 3 of 3
passed in 7.3 minutes; `scout-flow.md` 1.2, `scratchpad/sgn-repro/observations.txt`):

- **Code step, past 3 minutes.** A reload still renders "Verification code" as if live. A **correct** code, pressed,
  lands on `/sign-in?reason=step_expired`: "Start again / That sign-in step expired. Start again from your email and
  password." The Email field is empty (`scratchpad/sgn-repro/A-after-expiry.png`). Past 5 minutes even a reload lands
  there.
- **New password, past 3 minutes.** A valid new password, pressed, lands on the same page; it was **not** saved, and
  the temporary password still works (`C1-new-password-expired.png`).
- **Enrolment, past 3 minutes.** A correct code for the key shown lands on the same page. The new password **was**
  saved before enrolment, so the temporary password is now refused ("That did not match", and each try counts toward
  the ten-failure lock), the chosen one goes straight to enrolment with a **new** setup key, and the first key is left
  behind in the authenticator app. Nothing on the page says which password to use.
- **The invited person** is never told how many steps remain (UX-128).

**Where.** A step after the password has two clocks, and the page shows neither:

| Clock | Length | Set at | When it runs out |
| --- | --- | --- | --- |
| The provider's challenge: Cognito's sign-in session, or the dev provider's sealed challenge | 3 min | `infra/lib/constructs/identity.ts:14` (`authSession: Duration.minutes(3)`, "Cognito's minimum", `:7-8`), applied at `:108`, pinned by `infra/test/identity.test.ts:109`; dev: `lib/auth/dev-provider.ts:47` (`CHALLENGE_MS = 3 * 60_000`), sealed at `:88-90` | The next provider call answers `expired` (`lib/auth/sign-in.ts:127-128`); `settle` clears the pending cookie and redirects to `/sign-in?reason=step_expired` (`lib/routes/sign-in.ts:114-116`) |
| The pending cookie `tp_sign_in` | 5 min; 15 for key registration | `lib/auth/pending.ts:15-17`, `:23-26` (seal expiry and Max-Age both `now + seconds`) | `pendingOf` finds nothing (`lib/routes/sign-in.ts:135-138`) and every step page and action returns `RESTART` (`:140`; pages `:174`, `:203`, `:230`, `:321`) |

Paths are under `apps/web/src/` unless they start with `apps/`, `infra/`, `packages/` or `docs/`.

**Why.**

1. **Nothing states a limit.** The step pages render their card and form only (`app/sign-in/mfa/page.tsx:15-28`,
   `enroll/page.tsx:17-38`, `new-password/page.tsx:16-38`, `register-key/page.tsx:14-27`).
2. **Nothing knows when the step started.** `Pending` holds no time (`lib/auth/sign-in.ts:44-50`); the seal's `e` is the
   cookie's expiry (`lib/auth/seal.ts:43`), and a refused new password **rewrites** the cookie with a fresh 5 minutes
   (`lib/routes/sign-in.ts:106-108`) while Cognito's 3 keep running. So the server cannot say how long is left, and a
   dead step renders as live from minute 3 to minute 5.
3. **The email is dropped.** It lives only in the pending step (`lib/auth/sign-in.ts:44-50`), which `settle` clears at
   expiry (`lib/routes/sign-in.ts:115`); `signInPage` returns only `{ reason }` (`:145-152`), and the Email field has no
   value (`app/sign-in/page.tsx:28`).
4. **The restart words are one-size.** `step_expired` reads the same after every step (`app/sign-in/notice.tsx:14`),
   though the password that works depends on whether a new one was saved.
5. **No step is numbered.** The flow knows the path only as it goes (`lib/auth/sign-in.ts:119-134`, `:146-149`), and no
   page carries a count.

**Why no test saw it.** `sign-in-routes.db.test.ts:217-224` moves its clock 6 minutes, past both clocks at once, and
checks only the redirect; no test reads the email after a restart, and the e2e journeys pass each step in seconds.

---

## 2. The decision

### 2.1 One limit, from one constant (UX-012: "the limit that binds today, from one constant")

**Which limit binds.** For the new-password, enrolment and code steps, the provider's 3 minutes, shorter than the
cookie's 5. For key registration, the access token's 15 minutes (`identity.ts:11`; dev `GRANT_MS`,
`dev-provider.ts:48`), the same as its cookie's 15 (`pending.ts:16`). The hardware-key sign-in step (`key`) is one
ceremony of seconds and gets no timer (it is enforced like the rest, 2.2).

**Where the constant lives: a new leaf module, `lib/auth/step-limits.ts`, with no imports.** The queue says "beside
`pendingSeconds`"; `pendingSeconds` moves into it, so the constant still sits beside it. A leaf, because three kinds of
reader need it and `pending.ts` imports `sessions.ts` and through it `@tp/db/runtime` (`pending.ts:3`): the dev
provider, the route layer, and the unit tests. The client `StepTimer` imports nothing from it; it gets plain numbers
(2.4).

```ts
/** Cognito's sign-in session (authSession, infra/lib/constructs/identity.ts:14), pinned by step-limits.test.ts. */
export const PROVIDER_CHALLENGE_SECONDS = 3 * 60;
/** Cognito's access token (accessToken, identity.ts:11): key registration's grant. Pinned the same way. */
export const PROVIDER_GRANT_SECONDS = 15 * 60;
/** The pending cookie's own life (docs/adr/0016): five minutes, fifteen for key registration. */
const PENDING_COOKIE_SECONDS = 5 * 60;
const REGISTRATION_COOKIE_SECONDS = 15 * 60;
/** How long the kept email outlives its step (UX-012's figure; 2.6). */
export const KEPT_EMAIL_EXTRA_SECONDS = 15 * 60;

export type StepName = 'new_password' | 'mfa_setup' | 'mfa' | 'key' | 'register_key';

/** The pending cookie's life for a step. */
export function pendingSeconds(step: StepName): number;          // register_key 900, every other 300
/** The limit a step states, warns of and is closed at: the shorter of the provider's and the cookie's. */
export function stepSeconds(step: StepName): number;             // register_key min(900, 900); others min(180, 300) = 180
/** How long before the limit the warning comes: two minutes on a step of ten minutes or more, one otherwise. */
export function warningSeconds(limitSeconds: number): number;    // 180 -> 60; 900 -> 120
```

- `StepName` is `Pending['step']` written out, so the module imports nothing; `pending.ts` asserts the two agree at
  compile time (`const _same: StepName = '' as Pending['step']` and the reverse), so a step PR 7 adds must be added
  here too.
- The dev provider reads it: `CHALLENGE_MS = PROVIDER_CHALLENGE_SECONDS * 1000` and `GRANT_MS =
  PROVIDER_GRANT_SECONDS * 1000` (`dev-provider.ts:47-48`), so the local provider stays the user pool's twin from one
  value.
- `warningSeconds` is UX-012's own rule written once: one minute on today's 3-minute steps, and after UX PR 66 "two
  minutes left (one on the code step)" with no change here. Key registration's 15 minutes takes two today.
- **Pinned to infra without touching it.** `lib/auth/step-limits.test.ts` reads `infra/lib/constructs/identity.ts` as
  text and expects `authSession: Duration.minutes(${PROVIDER_CHALLENGE_SECONDS / 60}),` and `accessToken:
  Duration.minutes(${PROVIDER_GRANT_SECONDS / 60}),`, the way `lib/auth/primitives.test.ts:65-77` pins the password
  policy and `INVITATION_DAYS`. Reading a #42 file is not changing it, and #42's diff of `identity.ts` leaves both lines
  alone (scout-timer 3.1, scout-security 5), so the pin survives #42's merge. UX PR 66, which moves Cognito to 15, then
  fails until the constant moves with it: exactly the coupling the review asks for.

### 2.2 The server closes the step at that limit, counted from the challenge

The page must never promise more time than the step has, and must never be closed early by surprise. So the server
keeps the start, and enforces the limit itself.

**What is sealed.** The pending value gains three **added properties**, written and read by `pending.ts` only:

```ts
/** What the web layer seals beside the flow's Pending: added properties, so a value sealed by the release before reads as a Pending with none. */
export interface StepMeta {
  /** When the provider issued this step's challenge (the server's clock, epoch ms): the limit counts from here. */
  readonly startedAt?: number;
  /** An invited person's setup steps: this one's number and how many (absent: no marker, 2.7). */
  readonly setup?: { readonly at: number; readonly of: number };
  /** A new password was saved earlier in this attempt: a restart uses it, never the temporary one (2.6). */
  readonly passwordSaved?: true;
}
export type SealedPending = Pending & StepMeta;
```

- **Added properties, not a wrapper and not a new seal purpose** (scout-security 3). A rolling deploy runs both releases
  at once: the release before ignores an unknown property, and its own `writePending` re-seals the object it was given
  with the properties still on it; a wrapper or a new purpose would bounce every sign-in that crosses task versions.
- **`lib/auth/sign-in.ts`'s `Pending` union is untouched** (PR 7 extends it), and so is every flow method that takes
  a pending step: the extra properties ride on the object the route passes in.

**When `startedAt` is taken.** By the action, from `context.services.now()`, **before** the flow call that issues the
challenge, through one helper in `lib/routes/sign-in.ts`:

```ts
/** Runs a flow call and settles it, stamping a new step with the time taken before the provider was asked. */
async function advance(context, from: SealedPending | undefined, run: () => Promise<FlowResult>, options = {}) {
  const at = context.services.now();
  return settle(context, await run(), { ...options, at, from });
}
```

So the app's deadline can only fall before the provider's, never after it, by the length of the provider call (scout
C 3). For enrolment, the challenge Cognito answers with is `AssociateSoftwareToken`'s new session, issued inside
`settle` (`lib/routes/sign-in.ts:93-99`; `cognito-provider.ts:222-224`); `at` precedes it too. Whether Cognito restarts
its 3 minutes on that session was not checked (no AWS account here, `scout-flow.md` 6): taking `at` before the first
call is right either way.

**When it is kept, never renewed.** A refused new password rewrites the same challenge (`:106-108`): `settle` re-seals
it with the `StepMeta` of the value it read (`from`), so the deadline and the kept email's life stay where they were.
Key registration's options rewrite (`:346`) does the same. `writePending(cookies, sealer, pending, meta, now)` now
counts the cookie's own seal expiry and Max-Age from `meta.startedAt` too (`startedAt + pendingSeconds(step)`,
Max-Age the whole seconds left, at least 1), so no rewrite extends anything; only a value with no stamp (2.2's last
point) keeps today's `now + seconds`.

**Where it is enforced.** `pendingOf` (`:135-138`) returns nothing once `now >= startedAt + stepSeconds(step) * 1000`,
exactly as for a missing cookie, so every step page and action answers `RESTART` before any provider call. This:

- closes the 3-to-5-minute window in which a dead step renders as live (section 1);
- makes the limit the page states, the limit the warning counts to and the limit that applies one number;
- only ever tightens, to what Cognito already enforces; the provider's own `expired` stays the backstop for skew
  (`sign-in.ts:127-128`);
- is the hook UX PR 66 needs to keep the code step at 5 minutes app-side once Cognito allows 15;
- counts no failure: no `sign_in_failed`, no audit event, no change to the lock (2.11).

**A step sealed before the deploy** has no `startedAt`: it renders its limit sentence with no countdown, writes no kept
email, and is left to the provider and the seal's 5 minutes, which is today's behaviour, for at most one deploy window.

**What the page is given.** Each timed step's page route returns, beside what it returns today:

```ts
time: { readonly limitSeconds: number; readonly warningSeconds: number; readonly closesAt?: number; readonly closesIn?: number };
setup: { readonly at: number; readonly of: number } | null;
```

`closesAt = startedAt + limitSeconds * 1000` (the server's clock) and `closesIn = closesAt - services.now()`, computed
at render. The browser never compares `closesAt` with its own clock: it is only a key (2.4). Both are absent with no
stamp. `closesIn` is always positive, since `pendingOf` refused a step at or past its limit.

### 2.3 The limit is stated on each step, before the work

Every timed step states its limit once, as a plain sentence, before anything the person does on the page (WCAG 2.2.6's
practice: the duration, at the start of the process; scout-timer 1.2):

> This step stays open for 3 minutes.

(15 on key registration.) The minutes come from `limitSeconds` through `counted()` (`lib/copy/words.ts:9-11`), so "1
minute" and "15 minutes" follow from the constant. It is server-rendered and needs no script. On enrolment it sits
above the setup key, so the person reads it before they start copying. The steps: `/sign-in/new-password`,
`/sign-in/enroll`, `/sign-in/mfa` and `/sign-in/register-key`. Not `/sign-in` (no step is open yet) and not
`/sign-in/hardware-key` (one ceremony).

`register-key/page.tsx` is not in the queue's file list; it is added (the three scouts agree; not a #42 file, not in PR
7's list). Without it, key registration is a 15-minute limit with no statement and no warning, and an invited staff
member reads "Step 2 of 2" and then meets a third step (2.7).

### 2.4 The warning, and why there is no ticking clock

**No ticking countdown.** A per-second "2:13 left" is auto-updating content presented beside the work (WCAG 2.2.2,
level A), which would then need its own pause or hide control, and it adds pressure while the person copies a
32-character key (scout-timer 2.2, 1.4). The step states its limit once (2.3) and then changes only twice: the warning,
and the closed notice. That is the pattern of a limit nobody can extend (scout-timer 2.2: a static statement of the
step's life and a way to start again), and the review's own Fix.

**One live region, present from the first render.** `StepTimer` (`components/step-timer.tsx`, new, `'use client'`, so
Next server-renders it) renders, in order:

1. the limit sentence, `<p data-slot="step-limit">`;
2. its `children`: the card's content (on enrolment the setup key, its link and the form; elsewhere the form);
3. the region: `<div role="status" aria-atomic="true" data-slot="step-timer" data-phase={…}>`, **empty** in the server
   render and until the warning.

- `role="status"` is polite and atomic (WCAG 4.1.3; ARIA22); never `role="alert"` (assertive, it would cut into the
  person's typing for news that is not an error) and never `role="timer"` (for a ticking count, which this is not).
- An empty region present from the start is what screen readers announce reliably; a region inserted with its words
  already in it is not (scout-timer 1.3). The same pattern as `PendingStatus` (`components/form-issues.tsx:175-181`)
  and `CeremonyButton`'s status line (`components/hardware-key.tsx:62-64`).
- **Below the form**, so inserting the warning moves nothing the person is typing in, and Tab reaches Start again right
  after the submit button. The empty region takes no space; when it speaks it takes today's Alert look,
  `alertVariants({ variant: 'default' })` (`packages/ui/src/components/alert.tsx:6-14`), with `AlertTitle` and
  `AlertDescription` inside and a 16 px gap above, never the destructive variant (UX-018: no danger colour on a state
  that is not a failure). It is **not** an `<Alert>`: that component defaults to `role="alert"` and writes
  `data-slot="alert"` (`alert.tsx:18-19`), which would nest an assertive region in the polite one and make
  `refusal(page)` (`e2e/helpers.ts:63-65`, a #42 file) count the warning as a refusal. UX PR 14 later swaps the look
  for its Notice.
- **Outside the `<form>`**, so ActionForm's summary (`:scope > [data-slot="refusal-summary"]`), `emptySecrets(form)`
  and its grid and row rules never see it (2.8).
- `data-phase` is absent in the server render and becomes `open`, `warning` or `closed` after mount; tests wait on it.

**Props** (numbers and a fixed path, never an identifier):

```ts
export interface StepTimerProps {
  readonly limitSeconds: number;
  readonly warningSeconds: number;
  /** Milliseconds left when the server rendered the page; absent for a step sealed before the deploy (no countdown). */
  readonly closesIn?: number;
  /** The server's deadline, epoch ms on the server's clock: only a key tying a re-render to its first count. */
  readonly closesAt?: number;
  /** Where Start again goes: a fixed path with a reason code. */
  readonly restartHref: string;
  /** This step's own words, said with the warning and with the closed notice (enrolment's new key). */
  readonly notes?: { readonly warning?: string; readonly closed?: string };
  readonly children: ReactNode;
}
```

**Counting, on two clocks** (scout-timer 2.4). On first mount the component anchors `closesIn` to both `Date.now()` and
`performance.now()`; time left is the **smaller** of the two answers:

- a machine that slept: the wall clock ran on, the monotonic one may not have; the smaller is the wall's;
- a wall clock set back: the monotonic one ran on; the smaller is the monotonic's;
- a wall clock set forward: the step closes early by the jump, on the safe side; the server still decides.

Anchors are kept in a module-level `Map` keyed by `closesAt`, so a remount (Next's history cache, `router.refresh()`
after a refusal) with a staler `closesIn` keeps its first count, and a new step (a new `closesAt`) starts its own. A full
reload renders a fresh `closesIn`. Render-to-mount latency makes the browser's count late by that much (under a second);
immaterial beside a 60-second lead, and the server closes the step itself.

**Phases.** `stepPhase(leftMs, warningMs)` is `closed` at or below 0, `warning` at or below `warningMs`, `open`
otherwise; exported and unit-tested. The phase never goes back. The component checks once a second
(`setInterval(check, 1000)`, setting state only when the phase changes, so React writes nothing in between) and at
once on `visibilitychange`, `pageshow` and window `focus`.

**Said exactly twice over the step's life**, and never while the tab is hidden:

- The region's words are set only while `document.visibilityState === 'visible'`. A person who switched to the
  authenticator app on another window of the same machine, or locked the phone, hears the state when they come back;
  back after zero, they hear only "closed" (the warning is skipped). Visibility, not `document.hasFocus()`, so a person
  reading the key from a visible browser window while typing it into a desktop authenticator still gets the warning.
- Loaded with under a minute left, the phase is set after mount into the empty region: a change, so it is announced.
- Nothing animates (no transition, fade or `scrollIntoView`), so `prefers-reduced-motion` changes nothing; the test
  holds it. Forced colours keep the Alert look's border.
- **The focus never moves.** The component never calls `focus()`.

**The words** are in section 6. In short: the warning says the step closes **within** a minute (true for the whole
minute it stays on screen, where "in 1 minute" goes stale a second later), what Start again costs (the password) and
keeps (the email), and, on enrolment, that starting again gives a new setup key.

**Without JavaScript** the limit sentence is in the HTML and the region stays empty; at the limit the server's answer
(2.5) is the same. Recorded: the warning needs JavaScript; the stated limit and the kept email do not.

### 2.5 What happens at zero

- The region says, once, that the step has closed, with Start again (section 6).
- **The form stays usable.** ActionForm's button is `aria-disabled`, never `disabled` (`components/action-form.tsx:89`),
  and stays so. A disabled form would lock out a live step if the browser's count ran early, and drop the button from
  the tab order.
- **Nothing redirects by itself.** An automatic redirect is a change of context the person did not ask for (WCAG 3.2.5;
  2.2.1's note), cuts a screen reader off mid-sentence, and throws away their place. A sign-in step holds nothing worth
  protecting once it is dead, so no privacy reason outweighs that.
- The next press reaches the server, which refuses the dead step in `pendingOf` (2.2) before any provider call and
  answers `RESTART`; ActionForm's browser hook rethrows Next's redirect (`useGuardedSubmit`), and the person lands on
  `/sign-in?reason=step_expired` with the email filled (2.6). A reload does the same.
- **Hiding the setup key at zero** was rejected: that is a content change on a timer. The closed words say the key no
  longer works instead.

### 2.6 Start again, with the email kept

**Start again is a link**, `<Link href="/sign-in?reason=restarted">` styled with `buttonVariants({ variant: 'outline' })`,
inside the region. A link because it goes to another page; a GET with no side effect, so Next's prefetch is harmless; it
works without JavaScript; it needs no route, no audit event and no rate limit, and it re-issues nothing (2.11). The old
pending cookie it leaves is harmless: the first step overwrites or clears it (below), and it dies at its Max-Age.

**A new reason, `restarted`,** appended to `SIGN_IN_REASONS` (`lib/routes/sign-in.ts:23-35`) and to `REASONS`
(`app/sign-in/notice.tsx:6-18`), because a person who starts again during the warning has not had a step close, and
`step_expired`'s words would say it had. PR 7 appends its own reasons the same way; nothing is reshaped.

**The email is kept in a separate sealed cookie**, `tp_sign_in_email` (scouts A and C; `scout-security.md` 1.2):

| Property | Value | Why |
| --- | --- | --- |
| Name | `tp_sign_in_email`, exported as `KEPT_EMAIL_COOKIE` beside `SIGN_IN_COOKIE` (`lib/auth/sessions.ts:20`) | The house prefix; no `__Host-`, which no house cookie uses (proposal in 7.2) |
| Content | `{ email, use? }`: the email as the flow holds it (already `emailAddress`-normalized), and `use`, `'temporary'` or `'chosen'`, which password a restart takes (below) | Nothing else |
| Protection | **Sealed**: `sealer.seal('sign-in-email', …)` (`lib/auth/seal.ts:39-46`), a purpose of its own (in use: `sign-in-pending`, `dev-challenge`, `dev-grant`, `csrf`, `local-upload`, and the HMAC purposes `rate-limit`, `form-actor`) | Confidential, not just signed: a signed value shows the address in base64 to anyone who opens the cookie viewer or a saved HAR on a shared computer. Its own purpose: a pending value never opens as a kept email, nor the reverse |
| Flags | `HttpOnly; Secure; SameSite=Lax; Path=/`, through the adapters unchanged (`lib/http/next.ts:23`, `:25-36`; `lib/http/handler.ts:44-46`) | 2.11 |
| Lifetime | Seal expiry and Max-Age at `startedAt + stepSeconds(step) + KEPT_EMAIL_EXTRA_SECONDS`, absolute: 1,080 s on the three challenge steps, 1,800 s on key registration | Counted from the step's start, so no rewrite extends it. Fifteen minutes past the step: shorter fails the person who left to find their phone or the invitation email, the case the feature is for; longer is a new visit, not a restart |
| Written | Only in `settle`'s `pending` branch, for the steps it can produce after the password: `new_password`, `mfa_setup`, `mfa`, `register_key` | Each exists only after the provider accepted the password. **Never in `writePending`**, which also writes the hardware-key step for any typed address (`:276`; `lib/auth/sign-in.ts:230-237`) |
| Cleared | By a new helper `clearSignIn` (both cookies): in `writeSession` (`pending.ts:33-37`); in `settle`'s `locked`, `hardware_key_required` and `key_registered` branches (`:109-122`); by every first-step result that is not `pending`; and by `hardwareKeyOptions` in every case | Wherever the attempt ends, except at expiry, which is what the cookie is for: `settle`'s `expired` branch keeps calling `clearPending` (the pending cookie only) |
| Read | Only by `signInPage`, and only when `reason` is `step_expired` or `restarted`: it returns `{ reason, email, use }` when the cookie opens **and** its email passes `emailAddress` (`lib/routes/schemas.ts:22`) and `use` is one of the two | Plain `/sign-in` and every other reason fill nothing, which narrows what a passer-by sees |
| Shown | As the Email field's `defaultValue` (`app/sign-in/page.tsx:28`; `Field` passes it through, `components/field.tsx:75`), and as the notice's words | Never in a URL, an `ActionState`, a step timer prop, a `data-` attribute, a log or an error |

Helpers in `pending.ts`, named for what they hold: `writeKeptEmail`, `readKeptEmail` (returns `undefined`, never
throws), `clearKeptEmail`, and `clearSignIn`. `lib/routes/sign-in.ts` gains only calls.

**Every first-step submission ends the attempt before it** (scout C 1.5). `signInWithPassword` clears both cookies on
every result that is not `pending` (`credentials`, `no_account`, `locked`, `invitation_expired`); a `pending` result
overwrites both. So the moment anyone else uses the form, the first person's kept address and live step are gone; an
unknown address and a wrong password write the same two deletions (2.11); and an abandoned code step can no longer be
used by a passer-by to type wrong codes into another person's account for its remaining minutes.

**Which password, said on arrival.** `use` is `'temporary'` when the kept step is `new_password` (an expired or
abandoned new-password step saved nothing: the temporary password still works), and `'chosen'` when the step was
written after a new password was saved in this attempt (`passwordSaved`, set by `settle` when `from.step` is
`new_password` and carried forward). The notice then says "Use the temporary password from your invitation." or "Use
the password you chose: the temporary one no longer works." This is the scout's repro case: without it, an invited
person whose enrolment closed retries the temporary password, is refused, and each try counts toward the lock. It
leaks nothing: the cookie exists only after the password was proven, and only this browser sees it.

**On arrival, the notice takes the focus once** (scout-timer 2.7). Next 16 leaves focus where it was on navigation, and
a `role="status"` notice already present at load is not reliably read. For `step_expired` and `restarted` only, the
notice is wrapped in `ArrivalFocus` (`components/arrival-focus.tsx`, new, client): a `<div tabIndex={-1}
data-slot="arrival-focus">` focused once on mount, with the focus ring classes `RefusalTakeover` uses
(`components/action-form.tsx:163`). A screen reader reads why the person is back and which password to use; Tab then
reaches the filled Email and the empty Password. The other reasons keep today's behaviour (proposal in 7.2: UX PR 64
decides it for all).

### 2.7 The step marker, on both invited paths (UX-128)

UX-128 counts the steps **after** the email-and-password screen ("Step 1 of 2: choose a password", "Step 2 of 2: set
up two-step verification"); `flows-other-18`'s "Step 2 of 3" counted that screen. UX-128's form is taken (the
co-founder's ruling; it is the recommended one). The first screen cannot carry a marker anyway: it cannot know which
path follows, and saying so would tell which addresses are invited.

| Path | `/sign-in/new-password` | `/sign-in/enroll` | `/sign-in/register-key` |
| --- | --- | --- | --- |
| Invited customer | Step 1 of 2 | Step 2 of 2 | n/a |
| Invited staff member (`hardware_key_required`) | Step 1 of 3 | Step 2 of 3 | Step 3 of 3 |
| Restart after the new password was saved, customer | n/a | none (one step left) | n/a |
| Restart after the new password was saved, staff | n/a | Step 1 of 2 | Step 2 of 2 |
| Staff, authenticator enrolled, no key yet | n/a | n/a | none (one step) |
| Everyday sign-in, by code or by key | n/a | n/a | none |

After key registration the staff member signs in with the key on `/sign-in/hardware-key?reason=key_registered`, whose
notice already says "Sign in with it now" (`notice.tsx:16`): a sign-in, not a setup step, so not numbered.

**Who decides the count: the server, never the URL.** The provider's answer says what comes next (`new_password_required`
is a new password and then enrolment; `mfa_setup_required` is enrolment); the account row says whether key
registration follows. The flow already reads that row before the provider call (`lib/auth/sign-in.ts:163`), so the
one change to the flow is to report it on a pending result of the first step:

```ts
// FlowResult's pending kind gains: readonly keyRequired?: true
const result = await this.after(await this.deps.provider.signIn(email, password), email, context);
return result.kind === 'pending' && account?.hardware_key_required === true ? { ...result, keyRequired: true } : result;
```

Two hunks in `lib/auth/sign-in.ts` (the type, and `start`'s last line, `:178`), no query added and nothing that
depends on the address before the provider's answer (2.11). `settle` then computes `setup` from the step it writes,
the step it came from and that flag:

| Step written | `setup` |
| --- | --- |
| `new_password` | `{ at: 1, of: keyRequired ? 3 : 2 }` |
| `mfa_setup` | `from.setup` advanced by one; else, with `keyRequired`, `{ at: 1, of: 2 }`; else none |
| `register_key` | `from.setup` advanced by one; else none |
| `mfa`, `key` | none |

It is sealed (2.2), so a crafted link cannot show a wrong count, and it is shown only to the browser that proved the
password. A page shows it only when `of >= 2`.

**How it looks.** The marker is the heading's caption, in a new server component `app/sign-in/step-heading.tsx`:

```tsx
<h1 className="text-[2rem] font-bold leading-display tracking-display">
  {setup === null ? null : (
    <span data-slot="step-marker" className="block text-sm font-medium tracking-normal text-muted-foreground">
      Step {setup.at} of {setup.of}<span className="sr-only">: </span>
    </span>
  )}
  {children}
</h1>
```

A sighted person reads "Step 1 of 2" in small type over "Choose a password"; a screen reader, and a list of headings,
read "Step 1 of 2: Choose a password", UX-128's words, with the step's name said once, not twice. The four step pages
render their `<h1>` through it (with `setup = null` on the code step, which is never numbered); PR 7's forgot-password
page can too. One line (UX-128's "one-line step marker"); BRAND.md:122's "nothing else decorative" holds, since it is
content, not decoration. The documents' titles (`metadata`) stay the step's name.

### 2.8 How it composes with ActionForm (#74, ADR 0077)

| Concern | ActionForm | StepTimer | Result |
| --- | --- | --- | --- |
| Focus | The summary, or the one refused field, takes focus on each response (`form-issues.tsx:577`) | Never calls `focus()` | No contest. On `/sign-in`, `ArrivalFocus` runs once on arrival, before any press |
| Live regions | The summary is an Alert inserted per response (keyed by `seq`, `form-issues.tsx:591`); `PendingStatus` is `role="status"` | One `role="status"`, changed at two moments | Different nodes, no message said in both; an assertive refusal is read first, a polite warning after |
| DOM | Children inside `<form>`; `emptySecrets(form)`; `:scope > [data-slot="refusal-summary"]` | The sentence before, the region after, both outside the form | Nothing of ActionForm's sees the timer |
| A re-render | `RefreshAfterRefusal` → `router.refresh()` | A new `closesIn`, the same `closesAt`, the same anchor and phase: no DOM write | Nothing re-announced |
| A wrong code during the warning | The summary is announced and focused; the code is emptied | Unchanged | The warning stays shown, not repeated |
| A press after zero | The server redirects; `useGuardedSubmit` rethrows Next's redirect | Unmounts, clearing its interval and listeners | No second "closed" |
| Kept values | The browser keeps every field but the secrets after a refusal (ADR 0077 D1, D2) | n/a | The kept email after a restart is a server-rendered `defaultValue`, which ActionForm then keeps like any value the person typed |
| A lock (the tenth failure on a code step) | "Account locked"; `settle` clears both cookies | Keeps counting, and at its warning suggests Start again | Accepted and recorded (8): ActionForm's lock is not visible outside its form, the words stay true (the step does close), and Start again leads to "Account locked" on the first step |

No ActionForm, field or `next.ts` file changes.

### 2.9 What WCAG 2.2.1 still leaves unmet (for audit #103 and the ADR)

| 2.2.1's way out | Met? | Why |
| --- | --- | --- |
| Turn off | No | Cognito's sign-in session cannot be turned off |
| Adjust (ten times the default) | No | Cognito's maximum is 15 minutes; even after UX PR 66 the person cannot set it |
| Extend (warned, a simple action, ten times) | No | A Cognito sign-in session cannot be refreshed; Start again needs the password and a new code, which is not a simple action, and the only way to make it one is to keep the password between steps, which is refused |
| An exception | No | Not real-time, not over 20 hours, and (read conservatively, as the review does) not essential: 3 minutes is a setting, not a property of the step |

So the steps meet 2.2.1 in part, now and after UX PR 66, and that remainder is a known limit recorded for audit #103's
manual checks, as UX-012's Rule line asks. Within it, this PR does what can be done: the limit stated before the work
(2.2.6), warned of early, politely and once, with no focus moved (4.1.3), the email kept on Start again (3.3.7, whose
security exception covers the password and code), no change of context at zero (3.2.5), and the server closing the step
exactly when the page says. The rest is UX PR 66 (15 minutes) and UX PRs 20 and 86 (the copy button and the QR code,
which make enrolment fit; 3.3.8).

### 2.10 Alternatives considered, and why each is rejected

| Option | What it is | Why rejected |
| --- | --- | --- |
| A ticking countdown ("2:13 left") | A visible per-second or per-minute count | Auto-updating content beside the work (2.2.2, level A) needing its own hide control; pressure during a transcription task; a per-minute "about 2 minutes left" is borderline auto-updating and little use in three minutes |
| A local clock time ("open until 10:42") | The deadline as a time of day | The server cannot render it without the person's time zone, so it would change after hydration, and it adds a second time format beside UX-027's open question |
| "Extend" | A button that adds time | Impossible: Cognito cannot refresh a sign-in session; faking it means keeping the password, which is refused |
| Keep the email in the pending cookie, kept longer | One cookie | `settle` clears it at expiry (`:115`) and the browser drops it at its Max-Age; lengthening it lengthens what it carries (Cognito's session, the TOTP secret, the key grant) and makes a dead step look live |
| Keep the email in browser storage (`sessionStorage`) or React state | The step page stores it, `/sign-in` reads it | Needs script (a press before hydration or without JavaScript gets nothing); misses expiries the server finds (the redirect after a press, a reload); any script on the origin can read it, where an HttpOnly cookie keeps it from script; ADR 0077 keeps nothing typed in browser storage |
| Put the email in the URL (`?email=`) | The redirect carries it | PHI-adjacent identifier in a URL, the history, the logs and a shared link: the house rule forbids it, and `reasonParams` strips it (`:38`) |
| A signed (not sealed) email cookie | HMAC only | The address readable in base64 in the cookie viewer or a saved HAR on a shared computer |
| Path `/sign-in` on the kept cookie | Narrow the cookie's path (scout A's option) | Gains no confidentiality (sealed, HttpOnly, read only by `/sign-in`, nobody signed in while it lives); a delete whose `Path` differs from the set's silently fails, so the cookie would outlive the session open or lock that should end it; and it needs a `path` option in `CookieJar` and both adapters, whose header test is in `http.test.ts`, a #42 file |
| SameSite=Strict | Stricter than the house rule | Stops only a cross-site top-level GET to `/sign-in?reason=…`, which renders into the person's own page that cannot be framed, read across origins or cached; and breaks the house invariant (`docs/product/sessions.md:17`) and needs adapter changes |
| Write the kept email in `writePending` | Scout B's placement | `writePending` also writes the hardware-key step for any typed address, with no password: the cookie would be mintable for any address |
| A deadline from the cookie's own life | Count from the seal's expiry | It is reset by a refused new password (`:106-108`) while Cognito's clock runs, and it is the cookie's 5 minutes, not the provider's 3 |
| Store a deadline (`closesAt`) rather than the start | Scout B's form | The length belongs to the constant, which UX PR 66 changes per step; a sealed start takes the new length on deploy, a sealed deadline would not |
| `startedAt` inside the flow's `Pending` type | Scout A's form | Edits the union and every flow method PR 7 extends; the added property on the sealed object does the same with none of those hunks |
| Disable the form at zero, or redirect automatically | | 2.5 |
| A same-page refusal at zero (`{ error, final: true }`) | The press after zero refused in place | Two presses where one does (refused, then Start again), and the closed words said twice, once assertively; the redirect leaves ActionForm untouched |
| Start again as a form (POST) that clears the step | A server action | More surface for no gain: a mutation, a request key and an audit event to do what the next first step already does |
| A real-clock knob for tests (a configured offset, or a short-challenge persona in the dev store) | | A time override of a security limit in the production artifact (`services.ts`, `config.ts`, #42 files), or a test branch in `dev-provider.ts` and `dev-store.ts` (PR 7's); 4.1 tests the server with the injected clock it already has, and the browser with `page.clock` |
| The marker as its own line above the heading, in UX-128's words | "Step 1 of 2: choose a password" over "Choose a password" | Prints the step's name twice; the caption inside the heading says the same words to a screen reader and once to the eye |
| Number the steps by the URL or the page | | The page cannot know the path; a URL could be crafted to show a wrong count |

### 2.11 Security analysis

Against `.claude/agents/security-reviewer.md`'s list (scout-security throughout).

- **Account enumeration: unchanged, by four rules, each tested (4.2).** (1) The first step's words stay vague:
  `credentials` and `no_account` share one message (`:50-53`) and name no field (`:124`). (2) An unknown address and
  a wrong password write the same cookies: both reach `signInWithPassword`'s handler with a non-pending result and get
  the same two deletions; neither writes `tp_sign_in_email`. (3) The kept email exists only after the provider accepted
  the password (`settle`'s pending branch), never from `hardwareKeyOptions`, whose options are issued for any address.
  (4) The marker's flag comes from the account row the flow already read before the provider call (`sign-in.ts:163`) and
  is attached only to a pending result: no query added, nothing address-dependent added before the provider's answer.
  Two leaks that exist today are recorded, not touched (7.2): `start` answers `locked` and `invitation_expired` before
  the password is checked (`sign-in.ts:164-177`).
- **The deadline in the page leaks nothing.** Only a browser that holds the sealed step sees `closesIn` and `closesAt`,
  numbers about its own challenge. The length is Cognito's configured minimum, which anyone who signs in can measure;
  `closesAt` gives the server's clock to the millisecond, which the `Date` header gives to the second and TOTP's
  30-second steps make worthless.
- **The direction that matters is inward.** The server never takes a deadline, a remaining time or a start from the
  request: not a field, a query, a header, or any cookie but the sealed pending step, whose AES-GCM tag covers the
  whole value (`seal.ts:57-63`), so a client can neither move `startedAt` nor strip it. A missing stamp only ever means
  a value sealed by the release before, at most one cookie life old.
- **Rate limits and the lock: no way around them.** Start again is a GET that issues nothing. A new step costs the
  password again, through `sign_in` (30 per 5 minutes per address, 20 per 15 minutes per email,
  `lib/http/rate-limit.ts:39`; `:158-159`); the prefill does not change the email it is counted under. An expiry is not
  a failure, at the provider (`expired`) or at the app's limit (`pendingOf`, before any provider call): it neither adds
  to nor resets `failed_sign_ins`, which only an opened session resets (`lib/auth/sessions.ts:78`). Every wrong code
  still counts toward the ten-failure lock, whichever step it was typed in.
- **The kept email** is one field, the person's own sign-in address, schema-checked, kept only after the password
  proved it belongs to an account, sealed and HttpOnly (so not browser storage any script can read), at most 18 minutes
  (30 on key registration), and rendered on a page load, never carried in `ActionState`. That is a narrow, stated
  exception to ADR 0077 D1's "nothing typed is echoed back" (`docs/adr/0077-…:47`) and to its "typed text is never kept
  in browser storage" (`:246`); ADR 0081 says so in those words (section 5).
- **Residual risk, accepted (the safer of the options, with reasons).** At a shared computer, the next person who opens
  `/sign-in?reason=step_expired` or `?reason=restarted` within 18 minutes of an abandoned step sees the first person's
  address filled in; never a password, a code or a session. Mitigations, all taken: filled only on those two reasons;
  ended by any first-step submission, a session, a lock, or the hardware-key page; never written for the hardware-key
  step. An address is a semi-public identifier, the Email field's `autoComplete="username"` already lets the browser
  offer it, and the step pages already show it for the pending cookie's 5 minutes. The shorter lifetime was rejected
  (it fails the person the feature is for); a one-time read was rejected (the same browser holds it, and a reload
  would lose it).
- **Never in a URL, a log, an error or a job payload.** Every redirect stays a reason code (`:22`, `:116`, `:140`;
  `next.ts:55-58`), `reasonParams` stays `{ reason }`, so `?email=` fills nothing (tested); Start again takes no
  `next` or `returnTo` parameter, so no open redirect. No log line is added (`pnpm lint:logs`); `Sealer.open` swallows
  its own errors (`seal.ts:64-66`); no job is enqueued; no audit event is needed (Start again is not a mutation).
- **Lengths: nothing in a request or configuration changes them.** They are constants; the step is read from a
  sealed, server-made value; production builds its services with the real clock (`lib/server/services.ts:183`); the
  dev provider runs in a production build only under `TP_ALLOW_LOCAL_PROVIDERS=e2e`, which only `playwright.config.ts`
  sets (`playwright.config.ts:126`). No test knob is added (4.1).
- **Headers and CSP unchanged.** No `style` attribute (CSP `style-src` is `'self'` plus a nonce); the region's look is
  classes. `/sign-in` cannot be framed (`lib/http/security-headers.ts:69`, `:83`), and pages are `private, no-store`
  (`next.ts:18-20`), so a page that renders the kept email is never cached by a shared cache.
- **The lengths for the security reviewer at design.** This PR states and enforces the 3 minutes Cognito already
  enforces, so it is strictly tighter than today (the 3-to-5-minute window closes). The kept email's 15 minutes is the
  one new length. The 15-minute Cognito session is UX PR 66's, with its own review (the review's 6.1 names it the less
  strict setting).
- **No PHI, no model.** Synthetic personas only (`@synthetic.test`); nothing here calls a model.

---

## 3. Files, in build slices, and what is left for Lane A and for UX PRs 66, 14 and 7

Four slices, each with its own files: no file is in two slices, so builders can work in parallel. Slices B to D code
against the interfaces this design fixes (2.1's module, 2.2's `StepMeta` and page data, 2.4's `StepTimerProps`, 2.6's
helpers, 2.7's `setup`); the branch typechecks and its tests pass once all four are in. Paths are under `apps/web/src/`
unless they start with `apps/`, `docs/`, `packages/` or `fixtures/`. **None of these files is #42's** except the three
shared documents in slice D, which LANES.md rule 6 lets both lanes change; checked by script against the union of both
#42 lists (section 0), list in `scratchpad/sgn-files.txt`.

### 3.1 Slice A: the limit, the deadline and the kept email (the server)

| File | Change |
| --- | --- |
| `lib/auth/step-limits.ts` (new) | 2.1: `PROVIDER_CHALLENGE_SECONDS`, `PROVIDER_GRANT_SECONDS`, `KEPT_EMAIL_EXTRA_SECONDS`, `StepName`, `pendingSeconds`, `stepSeconds`, `warningSeconds`; no imports |
| `lib/auth/pending.ts` | `pendingSeconds` (`:15-17`) moves to `step-limits.ts`; `StepMeta`, `SealedPending` and the compile-time check that `StepName` and `Pending['step']` agree (2.1, 2.2); `readPending` returns `SealedPending`; `writePending(cookies, sealer, pending, meta, now)` seals `{ ...pending, ...meta }` and counts expiry and Max-Age from `meta.startedAt` (2.2); `stepClosesAt(pending)`; `writeKeptEmail`, `readKeptEmail`, `clearKeptEmail`, `clearSignIn` (2.6); `writeSession` calls `clearSignIn` (`:33-37`); the header comment (`:6-11`) names the deadline, the second cookie and ADR 0081 |
| `lib/auth/sessions.ts` | `export const KEPT_EMAIL_COOKIE = 'tp_sign_in_email';` beside `SIGN_IN_COOKIE` (`:20`) |
| `lib/auth/sign-in.ts` | `FlowResult`'s pending kind gains `keyRequired?: true`; `start` attaches it (`:178`) (2.7). Nothing else: `Pending` and every other method unchanged |
| `lib/auth/dev-provider.ts` | `CHALLENGE_MS` and `GRANT_MS` (`:47-48`) from `PROVIDER_CHALLENGE_SECONDS` and `PROVIDER_GRANT_SECONDS`; its header (`:25-26`) says so |
| `lib/routes/sign-in.ts` | `restarted` appended to `SIGN_IN_REASONS` (`:23-35`); `advance` (2.2), through which every step action and handler calls the flow; `settle`'s options `{ credentials?, at, from? }` (`:86`); its pending branch computes `StepMeta` (`startedAt: at`, `setup`, `passwordSaved`), writes the step and the kept email (`:91-102`); `invalid_password` re-seals with `from`'s meta (`:106-108`); `key_registered`, `hardware_key_required` and `locked` call `clearSignIn` (`:109-122`); `expired` keeps `clearPending` (`:114-116`); `pendingOf` enforces the limit and returns `SealedPending` (`:135-138`); `signInPage` reads the kept email for `step_expired` and `restarted` (`:145-152`); `signInWithPassword` clears both cookies on a non-pending result (`:163`); the four step pages return `time` and `setup` (`:172-175`, `:201-204`, `:228-231`, `:319-322`); `hardwareKeyOptions` stamps the key step and clears the kept email (`:270-278`); `hardwareKeyRegistrationOptions` re-seals with the read meta (`:346`); the module comment (`:13-20`) names the deadline |
| `lib/auth/step-limits.test.ts` (new) | 4.1 |
| `lib/auth/pending.test.ts` (new) | 4.1 |
| `lib/auth/sign-in.db.test.ts` | one case: an internal account's first step reports `keyRequired`, a customer's does not (4.2) |
| `lib/routes/sign-in-routes.db.test.ts` | 4.2, and the existing page-data assertions that gain `time` and `setup` (4.6) |

### 3.2 Slice B: the timer and the browser harness

| File | Change |
| --- | --- |
| `components/step-timer.tsx` (new, client) | 2.4, 2.5: `StepTimer`; `stepPhase`, `timeLeft` (the two-clock rule) and the words of section 6 as exported functions for the tests |
| `components/arrival-focus.tsx` (new, client) | 2.6: `ArrivalFocus`, a `tabIndex={-1}` wrapper focused once on mount |
| `components/step-timer.test.tsx` (new) | 4.1 |
| `components/step-timer.browser.test.tsx` (new) | 4.3 |
| `components/test-support/browser.ts` | `open(form, { width, clock })`: with `clock`, `page.clock.install({ time: clock })` before `goto` (`:75-80`); the existing callers pass none and are unchanged |
| `components/test-support/forms-harness.tsx` | a `stepTimer` form: `StepTimer` around an `ActionForm` with a six-digit code `Field`, its `closesIn` and `closesAt` from the page keys; a control that renders it again with a smaller `closesIn` and the same `closesAt`, or a new `closesAt` (4.3) |

### 3.3 Slice C: the pages

| File | Change |
| --- | --- |
| `app/sign-in/step-heading.tsx` (new, server) | 2.7: `StepHeading` |
| `app/sign-in/page.tsx` | the Email field's `defaultValue={email}` (`:28`); `SignInNotice` gets `kept` (`:20`). Nothing else on the page |
| `app/sign-in/notice.tsx` | `restarted` in `REASONS`; `step_expired`'s words; `SignInNotice({ reason, kept })` composes the kept-email words and the password line (section 6); `ArrivalFocus` around the notice for the two restart reasons (`:20-31`) |
| `app/sign-in/mfa/page.tsx` | its `<h1>` through `StepHeading` (no marker); `StepTimer` around the `ActionForm` (`:23-25`), `restartHref="/sign-in?reason=restarted"` |
| `app/sign-in/enroll/page.tsx` | `StepHeading` with `setup`; `StepTimer` around the setup key, its link and the form (`:24-36`), with enrolment's `notes` |
| `app/sign-in/new-password/page.tsx` | `StepHeading` with `setup`; `StepTimer` around the form (`:24-35`) |
| `app/sign-in/register-key/page.tsx` | `StepHeading` with `setup`; `StepTimer` around `HardwareKeyRegistration` (`:23-25`); 15 minutes, warning at two |

`components/hardware-key.tsx` is **not** changed: its registration already follows a `redirect` answer
(`:144-152`), which is how an expired registration reaches `/sign-in?reason=step_expired` with the email kept.

### 3.4 Slice D: the end-to-end spec, personas and documents

| File | Change |
| --- | --- |
| `apps/web/e2e/sign-in-time.spec.ts` (new) | 4.4. A file of its own, not `sign-in.spec.ts`: PR 7 adds its journeys there, and the real-time test runs in its own file's worker |
| `apps/web/scripts/synthetic-personas.ts` | four personas and a clause in its header comment (4.4); `scripts/seed.ts` seeds them from the list and `scripts/seed.db.test.ts:37` follows it |
| `docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md` (new) | section 5 |
| `docs/adr/0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md` | its Status line: "amended by 0081"; after `:30-31` ("…into a five-minute HttpOnly cookie."), an italic note (section 5) |
| `docs/adr/0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md` | an italic note after D1 (`:47`) and after `:246` naming 0081's kept email as the one exception (section 5) |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` (#42's shared documents, LANES.md rule 6) | SGN-01 to SGN-04 (4.5) |
| `packages/synth/src/expected/types.ts` | `'SGN'` appended to `CASE_MODULES` (`:9`) |
| `fixtures/synthetic/SGN-01/expected.json` to `SGN-04/expected.json` (new) | written by `pnpm synth`, never by hand |

### 3.5 What is left, and for whom

- **Lane A: nothing this PR needs.** No migration, no infrastructure, no Cognito setting (section 7). One stale comment
  is recorded for Lane A, since its file is #42's: `infra/lib/constructs/identity.ts:41-42` says temporary passwords
  "expire after three days", while `:82` sets `Duration.days(INVITATION_DAYS)`, which is 7.
- **UX PR 66** (`co-001/ux-sign-in-session`, after #42): moves Cognito's `authSession` to 15 minutes with
  `infra/test/identity.test.ts:109`, and **the constants in `lib/auth/step-limits.ts`** (not `pending.ts`, as its queue
  entry lists, since `pendingSeconds` moves there in this PR): `PROVIDER_CHALLENGE_SECONDS` to 900, the pending
  cookie to 15 minutes for enrolment, new password and key registration and 5 on the code step. `stepSeconds` then
  gives 15, 15 and 5, `warningSeconds` two minutes, two and one (UX-012's Fix) with no code change, the kept email 30
  and 20 minutes, and the pin test in `step-limits.test.ts` fails until infra and the constant move together. Its file
  list and its security review (the 15 minutes, the less strict setting) are the orchestrator's to update.
- **UX PR 14** (`co-001/ux-notice`): replaces the region's look (today's `alertVariants`, `AlertTitle`,
  `AlertDescription`) with its Notice's status kind, and the sign-in notice's Alert with the same. The region's
  element, role and `data-slot` stay.
- **UX PR 7** (`co-001/ux-sign-in-recovery`, next in this session), and what it builds on:
  - the kept-email helpers, under the rule it inherits: written only after a secret is proven, so after
    `ConfirmForgotPassword` succeeds, never when a reset is requested; `/sign-in` then opens with the email filled on
    PR 7's own reason, appended to `SIGN_IN_REASONS` and `REASONS` beside `restarted`;
  - `StepTimer` around its reset-code form, with its own `limitSeconds` (the code's life) and `notes`; `StepHeading` on
    its new page; `advance` for its actions; a new `Pending` step added to `StepName` too (the compile-time check
    says so);
  - ADR 0081, to which it adds its decisions as an amendment section, and SGN-05 to SGN-08;
  - the hunks it meets: `lib/routes/sign-in.ts` (calls and two branches), `app/sign-in/page.tsx` (the Email line only;
    its forgot-password link and help lines go below the card), `mfa/page.tsx` (the heading and the timer's wrap;
    its lost-factor line goes outside the card), `notice.tsx` (two entries and the `kept` prop), `dev-provider.ts`
    (two constants; its reset methods are elsewhere in the file), `lib/auth/sign-in.ts` (two hunks);
  - a stale `key` step that sends a staff member to the password page (`components/hardware-key.tsx:91-95` follows
    `RESTART`, `lib/routes/sign-in.ts:306-308`): PR 7 lists `hardware-key.tsx`, so it takes the fix
    (`/sign-in/hardware-key?reason=step_expired`); this PR does not touch it.
- **UX PR 64** (`co-001/ux-sign-in-words`), **UX PR 20** (copy button) and **UX PR 86** (QR code): their changes to the
  step pages go inside `StepTimer`'s children (the key, the copy button, the QR code) or into the words; PR 86
  re-checks at 390 px that the warning, below the form, is still in view when the QR code makes enrolment taller (8).

### 3.6 Open pull requests that touch these files, and the landing order

From the REST files API of every open pull request (2026-10-28 03:55 UTC; lists in `scratchpad/sgn-pr{n}-files.txt`):

| PR | Branch | Files shared with this design | What it means here |
| --- | --- | --- | --- |
| #42 | `co-001/pr-06b-mail-streams` (draft) | the three shared documents | LANES.md rule 6: the PR merged second keeps both |
| #78 | `co-001/ux-download-refusals` (draft) | the three shared documents; `apps/web/scripts/synthetic-personas.ts` (its personas); `packages/synth/src/expected/types.ts` (its `'DLR'`, module 18) | Both append: the PR merged second keeps both lists, `'SGN'` after `'DLR'` if #78 lands first |
| #75, #81, #82 | `contract-phi-check`, `suite-cap-1-bounded-reads`, `ci-pin-age` (drafts) | the three shared documents | LANES.md rule 6 |
| #33 | Dependabot base images | none | |

No open pull request touches a sign-in file, the auth library, the timer's harness or the ADRs this PR edits. So it
**lands on nothing**: build from `165c599`, merge `claude/build-platform` into the branch before opening it (LANES.md
rule 6: merge, never rebase), and resolve the shared documents by keeping both sides.

---

## 4. Tests

Every test that asserts a row names the row's id in its title, as the repository's tests do. Synthetic values only.
**No test knob** is added to production code (2.10, 2.11): the server's limit is tested with the injected clock the db
tests already use (`sign-in-routes.db.test.ts:49`, `:58-73`); the browser with Playwright 1.64.1's `page.clock`
(`fastForward` moves `Date` and `performance.now()` together, as a sleeping laptop; `setSystemTime` moves the wall clock
only; `runFor` fires every timer on the way; checked in `playwright-core/lib/coreBundle.js` by scout B); the e2e
server side by a real 3-minute wait in one test (4.4, test 2) and, elsewhere, by deleting `tp_sign_in`, which is what
the browser itself does at the cookie's Max-Age (its cookie store runs on real time, not on `page.clock`).

### 4.1 Unit tests (the node project)

`lib/auth/step-limits.test.ts` (new):

1. **SGN-01** The limit is the shorter of the provider's and the cookie's: `stepSeconds` for `new_password`, `mfa_setup`
   and `mfa` equals `Math.min(PROVIDER_CHALLENGE_SECONDS, pendingSeconds(step))`, which is 180; for `register_key`,
   `Math.min(PROVIDER_GRANT_SECONDS, pendingSeconds('register_key'))`, which is 900; every limit is a whole number of
   minutes.
2. **SGN-01** It mirrors infra: `infra/lib/constructs/identity.ts`, read as text (as `primitives.test.ts:65-77` does),
   contains `` `authSession: Duration.minutes(${PROVIDER_CHALLENGE_SECONDS / 60}),` `` and
   `` `accessToken: Duration.minutes(${PROVIDER_GRANT_SECONDS / 60}),` ``.
3. **SGN-02** `warningSeconds(180)` and `(300)` are 60; `(900)` is 120.
4. **SGN-01** The dev provider reads the same constant: a `DevAuthProvider` on a `MemoryDevStore` with an injected clock
   answers a code at `PROVIDER_CHALLENGE_SECONDS - 1` seconds after its challenge, and `expired` at
   `PROVIDER_CHALLENGE_SECONDS`.

`lib/auth/pending.test.ts` (new; an in-memory `CookieJar` that records each write's options):

1. **SGN-01** `writePending` with a `startedAt` counts the seal and Max-Age from it: written 100 s after the start of a
   code step, Max-Age is 200; `readPending` returns the step with its `startedAt` at 299 s and nothing at 300 s.
2. **SGN-01** A value sealed by the release before (`sealer.seal('sign-in-pending', { step: 'mfa', email, challenge },
   …)`, no `StepMeta`) reads as a step with no `startedAt`; `stepClosesAt` gives `startedAt + stepSeconds(step) *
   1000`, or nothing without a stamp.
3. **SGN-03** `writeKeptEmail` seals under `sign-in-email`: the cookie's value contains neither the address, nor its
   local part, nor its base64url; it does not open as `sign-in-pending`, and a pending value does not open as a kept
   email; its Max-Age is `startedAt + limit + 900 s - now`; `readKeptEmail` returns `{ email, use }`, and nothing for an
   expired, tampered or wrong-purpose value, or one whose email fails `emailAddress`; `clearSignIn` deletes both cookies
   and `clearPending` only the step.

`components/step-timer.test.tsx` (new; `renderToString`, as the repository's component tests do):

1. **SGN-02** `stepPhase`: 180,000 and 60,001 ms are `open`; 60,000 and 1 are `warning`; 0 and -5 are `closed`.
2. **SGN-02** `timeLeft` takes the smaller clock: a sleep (the wall clock 5 minutes on, the monotonic clock not) gives
   `closed`; a wall clock set back 10 minutes with the monotonic clock 2 minutes on gives 1 minute left; a wall clock
   set forward 2 minutes 30 closes early, on purpose.
3. **SGN-01, SGN-02** The server render: "This step stays open for 3 minutes." comes before the children, then exactly
   one `role="status"` with `aria-atomic="true"`, empty, with no link and no `data-phase`; no `role="alert"`, no
   `aria-live="assertive"` and no `data-slot="alert"` anywhere in it; with `limitSeconds` 900 it reads "15 minutes",
   with 60 "1 minute"; with no `closesIn`, the same sentence and an empty region.
4. **SGN-02** The words of section 6, from the exported functions: "within a minute" at 60 s, "within 2 minutes" at
   120; the closed words; the notes appended when given; Start again's `href` is the prop, with no `@`.

### 4.2 The server: `lib/routes/sign-in-routes.db.test.ts` and `lib/auth/sign-in.db.test.ts`

The test's `Browser` (`:86-110`) records each write's Max-Age and the names written per response.

1. **SGN-01** A step closes at its limit, counted from the challenge, whatever the cookie says. Sign in at `t0`;
   `mfaPage` returns `time: { limitSeconds: 180, warningSeconds: 60, closesAt: t0 + 180,000, closesIn: 180,000 }` and
   `setup: null`; at `t0 + 170 s`, `closesIn` is 10,000; at `t0 + 180 s` the page and `answerMfa` (with a code valid
   then) both answer `RESTART` while `tp_sign_in` is still in the browser (its 5 minutes run to `t0 + 300 s`); no
   `sign_in_failed` audit event is recorded and `failed_sign_ins` is unchanged. At `t0 + 179 s` the press reaches the
   provider.
2. **SGN-01** A refused new password keeps the start: an invited person signs in at `t0`, a weak password at
   `t0 + 60 s` rewrites the step with Max-Age 240 (not 300) and writes no kept email; `newPasswordPage`'s `closesIn` at
   `t0 + 60 s` is 120,000; at `t0 + 180 s` it answers `RESTART`.
3. **SGN-01** A step sealed before the deploy (written into the `Browser` with the sealer directly, no `StepMeta`):
   the page returns `time` with no `closesAt` or `closesIn`; at `t0 + 200 s`, the cookie alive, the provider's own
   `expired` sends it to `step_expired`; no kept email is written.
4. **SGN-03** The email is kept only after the password, and filled only on the restart reasons: a password accepted
   writes `tp_sign_in_email` with Max-Age 1,080, its value without the address; `signInPage` with `reason:
   'step_expired'` or `'restarted'` returns the email, and with no reason, with `signed_out`, with `{ email: … }` in
   its params (stripped), with a tampered value, or with a pending value copied under the kept name, returns none.
5. **SGN-03** Which password: for an invited person, `signInPage` after the new-password step returns `use:
   'temporary'`; after the password is chosen and enrolment written, `use: 'chosen'`; the temporary password is then
   refused and the chosen one leads to enrolment with `setup: null` and no `use`.
6. **SGN-03** (enumeration) Every first step that opens none ends the attempt, alike for any address: from a browser
   holding a live step and a kept email, an unknown address and a wrong password return equal `data` and write the
   same names (both cookies deleted, `tp_sign_in_email` never set); `hardwareKeyOptions` writes `tp_sign_in` and
   deletes `tp_sign_in_email`, for a known and an unknown address alike.
7. **SGN-03** The kept email ends at a session, a lock, `hardware_key_required` and `key_registered`, and outlives an
   expiry: each of the four leaves neither cookie; a provider expiry deletes `tp_sign_in` only.
8. **SGN-04** The paths are numbered by the server: an invited customer's new-password page returns `setup: { at: 1,
   of: 2 }` and enrolment `{ at: 2, of: 2 }`; an invited staff member's (`person({ temporary: true, totp: false,
   internal: true })`) `{ 1, 3 }`, `{ 2, 3 }`, and `registerKeyPage` `{ 3, 3 }` with `time: { limitSeconds: 900,
   warningSeconds: 120, … }`; a staff member enrolled without a key gets `registerKeyPage` with `setup: null`; an
   everyday sign-in's code step `setup: null`; a restart after the password was saved, enrolment with `setup: null`.

`lib/auth/sign-in.db.test.ts`: **SGN-04** an internal account's first step reports `keyRequired: true` on its pending
result, and a customer's has none.

### 4.3 The browser harness: `components/step-timer.browser.test.tsx` (new)

On #74's harness (`components/test-support/browser.ts`), with `open('stepTimer', { clock })` installing the clock before
the page loads (3.2). Each test waits for `[data-slot="step-timer"][data-phase="open"]` before it moves the clock, so the
anchor is taken first, and asserts times with a 2-second margin. Each title cites **SGN-02**.

1. **Said once, never each second.** A `MutationObserver` records each distinct `textContent` of the region:
   `runFor('01:58')`, nothing; `runFor('00:04')`, the warning with a Start again link; `runFor('00:56')`, nothing new;
   `runFor('00:04')`, closed. The sequence is exactly `['', warning, closed]`.
2. **The focus and what was typed stay.** The code field focused with three digits typed; past the warning and past
   zero, it is still the active element with its value, and `scrollY` is unchanged.
3. **Nothing above the region moves.** The bounding boxes of the field and the button are equal before and after the
   warning.
4. **Sleep.** From open, `fastForward('05:00')`: the region goes straight to closed, one change, no warning.
5. **A hidden tab.** With `document.visibilityState` overridden to `hidden` and `visibilitychange` dispatched,
   `runFor` past the warning: the region is still empty; back to `visible`: the warning, once. The same past zero:
   only closed.
6. **Clocks changed.** `setSystemTime(now - 10 min)`, then `runFor('02:02')`: the warning comes at two minutes,
   counted by the monotonic clock. `setSystemTime(now + 2:30)`: the warning shows at once (an early close, asserted so
   the rule stays deliberate).
7. **A re-render keeps the count.** Rendered again with the same `closesAt` and a `closesIn` 60 s larger: the phase and
   its timing are unchanged and no text changes. With a new `closesAt`: the count starts again.
8. **With ActionForm.** A wrong-code refusal during the warning: the summary is focused and announced, and the region's
   recorded texts gain nothing. A refusal before the warning: when the warning comes, the focus stays on the field the
   summary focused. A held press across zero: "Working…" and the closed words are in separate status nodes.
9. **Nothing animates.** With `emulateMedia({ reducedMotion: 'reduce' })` and without it, the region and its descendants
   have `animationName: none` and a `transitionDuration` of `0s`. With `forcedColors: 'active'`, the speaking region
   has a visible border.
10. **Phone width.** At 390 px the warning fits and the page does not scroll sideways.

### 4.4 The end-to-end spec: `apps/web/e2e/sign-in-time.spec.ts` (new)

It imports `e2e/helpers.ts` (`enterPassword`, `withDatabase`, `addVirtualKey`; #42's file now, read only) and
`e2e/a11y.ts` (`expectAccessible`, `atPhoneWidth`) unchanged. TOTP codes are computed by the test from Node's real clock
and checked by the server's, so the browser's fake clock never disturbs them.

**Personas**, added to `apps/web/scripts/synthetic-personas.ts` with a clause in its header comment ("and, for the
sign-in steps' time limits, a viewer whose code step is warned and closed, a viewer whose step closes in real time, an
invited viewer and an invited support engineer who choose a password and enrol, each alone"), because sign-ins count
toward the ten-failure lock, the `mfa` bucket is per step and the specs run in parallel (`playwright.config.ts:92`):

| Key | Organization, role | Used for |
| --- | --- | --- |
| `time-mfa` | group, viewer | test 1 |
| `time-real` | group, viewer | test 2 |
| `time-invited` | group, viewer, `invited: true` | test 3 |
| `time-staff` | internal, support, `invited: true` (so `hardware_key_required`, `packages/db/src/seed.ts:87`) | test 4 |

Each run starts from a fresh seed and dev store, so the invited personas choose their password once per run. Every
request URL is recorded (`page.on('request')`), and at the end of each test every one, and `page.url()`, passes
`assertNoPhi('url', url, { known: [email] })` (`@tp/observability`, as `e2e/unattested.spec.ts:95` does) and contains
neither the email, nor `encodeURIComponent(email)`, nor its local part.

1. **The code step states its limit, warns once, closes, and starts again with the email kept (SGN-01, SGN-02, SGN-03,
   SGN-04).** `time-mfa`; `page.clock.install()` before the first `goto`.
   - On `/sign-in/mfa`: "This step stays open for 3 minutes." comes before the form in the DOM; no `step-marker`; the
     region is `role="status"`, `aria-atomic="true"`, empty; wait for `data-phase="open"`.
   - Focus the code field, type "123". `fastForward('02:00')`: the region shows the warning (section 6) with a Start
     again link to `/sign-in?reason=restarted`; the field is still focused and holds "123"; no `role="alert"` in the
     region. `expectAccessible(page, 'Code step, warning shown')`, then `atPhoneWidth` with the warning shown.
   - `fastForward('01:00')`: the closed words. `expectAccessible(page, 'Code step, closed')`.
   - `context.clearCookies({ name: 'tp_sign_in' })`; type a valid code and press Sign in: `/sign-in?reason=step_expired`;
     Email holds the persona's address, Password is empty, `[data-slot="arrival-focus"]` is focused and its notice reads
     "Sign-in step closed" and "That sign-in step closed. Your email is filled in: type your password to start again.";
     `expectAccessible(page, 'Sign in, email kept')`.
   - From `context.cookies()`: `tp_sign_in_email` is `httpOnly`, `secure`, `sameSite: 'Lax'`, `path: '/'`, its value
     holds neither the address nor its local part, and it expires within 18 minutes.
   - Type the password, then a code: signed in, so a restart really works (the earlier code was never sent to the
     provider, which the dead step refused first). Neither `tp_sign_in` nor `tp_sign_in_email` remains.
2. **A real expiry: the server closes the step at 3 minutes by its own clock (SGN-01, SGN-03).** `time-real`;
   `test.setTimeout(300_000)` (the suite already runs tests of 300 to 480 s, `layout-1280.spec.ts:132`).
   - First, in a `browser.newContext({ javaScriptEnabled: false })`: the password posts without JavaScript and
     `/sign-in/mfa` shows the sentence and an empty region with no `data-phase`. That context is closed (its step is
     abandoned).
   - In the test's own page, no fake clock: `enterPassword`; on `/sign-in/mfa`, `arrived = Date.now()`. The region
     reaches `data-phase="warning"` (waited for with `toHaveAttribute`, a 140-second timeout: an event, not a sleep) no
     earlier than 115 s after `arrived`, and `closed` no earlier than 175 s.
   - `tp_sign_in` is still in `context.cookies()`: what closes the step is the server's limit, not the cookie.
   - A code valid now, pressed: `/sign-in?reason=step_expired`, the email filled, the password empty.
   - No `sign_in_failed` audit event for the persona since the test began, and `failed_sign_ins` is 0
     (`withDatabase`).
   - Then the password and a code sign in.
3. **The invited path is numbered, Start again during the warning keeps the email, and enrolment says its key is new
   (SGN-02, SGN-03, SGN-04).** `time-invited`; `page.clock.install()`.
   - The temporary password: `/sign-in/new-password`, whose heading is named "Step 1 of 2: Choose a password"
     (`getByRole('heading', { level: 1, name: …, exact: true })`) and whose marker reads "Step 1 of 2"; the sentence;
     `data-phase="open"`.
   - `fastForward('02:00')`: the warning; Start again: `/sign-in?reason=restarted`, the email filled, the notice
     focused and reading "Use the temporary password from your invitation."
   - The temporary password again: a fresh step, `open`, the region empty.
   - Choose a password: `/sign-in/enroll`, heading "Step 2 of 2: Set up two-step verification"; the sentence comes before
     `[data-slot="totp-secret"]` in the DOM.
   - `fastForward('02:00')`: the warning, with "Starting again gives you a new setup key: replace this one in your
     authenticator app." `expectAccessible(page, 'Enrolment, warning shown')` and `atPhoneWidth`.
   - `fastForward('01:00')`: the closed words, with "This setup key no longer works: starting again gives you a new
     one." `expectAccessible(page, 'Enrolment, closed')`.
   - `clearCookies({ name: 'tp_sign_in' })` and `reload()`: `/sign-in?reason=step_expired`, the email filled, "Use the
     password you chose: the temporary one no longer works."
   - The chosen password: `/sign-in/enroll` with no marker (one step left) and a setup key other than the first; the
     code for it signs in.
4. **An invited staff member's three steps, and key registration's 15 minutes (SGN-01, SGN-02, SGN-04).** `time-staff`;
   `addVirtualKey(page)`; `page.clock.install()`.
   - "Step 1 of 3: Choose a password", then "Step 2 of 3: Set up two-step verification" (the code for the key shown),
     then `/sign-in/register-key`: "Step 3 of 3: Register a hardware key" and "This step stays open for 15 minutes."
   - `fastForward('13:00')`: "This step closes within 2 minutes" and its words.
     `expectAccessible(page, 'Key registration, warning shown')`.
   - Register hardware key: `/sign-in/hardware-key?reason=key_registered`, with no marker.

### 4.5 Test matrix: a new section, "Sign-in steps (SGN)"

Added to `docs/product/test-matrix.md` after "Tables (TBL)" (`:338-350`; after "Downloads (DLR)" if #78 merges first),
and to `packages/synth/src/cases/matrix.ts` word for word (`packages/synth/src/fixtures.test.ts:33-44` holds the two
identical; each id fits its `[A-Z]{2,3}-\d{2}` pattern, and no row holds a `|`):

```
## Sign-in steps (SGN)

The sign-in steps of the UX baseline review's sixth pull request (docs/adr/0081): each step after the password states
the time limit that binds, the server closes it at that limit, a polite warning comes before it, and starting again
keeps the email; the invited paths are numbered. SGN-01 to SGN-04 are this pull request's; SGN-05 to SGN-08 are
reserved for the seventh (a forgotten password).

| ID | Case | Assertion |
| --- | --- | --- |
| SGN-01 | A sign-in step's time limit, stated and enforced | The new-password, enrolment and code steps say "This step stays open for 3 minutes." before their work, and key registration says 15 minutes, from one constant that infra's sign-in session and access token pin: the shorter of the provider's limit and the pending cookie's; the dev provider's challenge reads the same constant; the server closes a step at that limit, counted from before the provider issued its challenge, whatever the cookie's own life, and the rewrite after a refused new password extends nothing; a page or a press after the limit starts again without asking the provider and counts no failure; a step sealed before the deploy shows no countdown and is left to the provider |
| SGN-02 | The warning before a step closes | At one minute left (two on a step of ten minutes or more) one polite status, never an alert and never focused, says the step closes within a minute, what Start again costs and keeps, and on enrolment that it gives a new setup key; it is said once and never each second, nothing above it moves, and the focus and what was typed stay; a tab that slept, was hidden, or had its clock set back or forward shows the right state when it is visible again, and says it then; a re-render keeps the count; at the limit the same status says once that the step has closed, nothing redirects and the form stays usable; nothing animates |
| SGN-03 | Starting again keeps the email | Start again, a press after the limit and a step page loaded after it land on the sign-in page with the email filled and the password empty, from a sealed, HttpOnly, SameSite=Lax cookie written only after the password was proven, never for the hardware-key step, and lasting 15 minutes past the step; the notice takes the focus once and says to use the temporary password after a new-password step, or the chosen one once it was saved; the email is in no URL and is filled only on those two reasons; an unknown address and a wrong password write the same cookies; the kept email ends when a session opens, an account locks, a key is required or registered, or a first step opens no step, and outlives an expiry |
| SGN-04 | The invited paths are numbered, and the timed steps pass axe | An invited customer's headings read "Step 1 of 2: Choose a password" and "Step 2 of 2: Set up two-step verification", the number shown over the step's name, and an invited staff member's run from "Step 1 of 3" to "Step 3 of 3: Register a hardware key", counted by the server from the provider's answer and the account; an everyday sign-in, and a restart with one step left, show no number; the code and enrolment steps pass axe (WCAG 2.1 A and AA) with the warning shown, at 1280 and 390 px, and when closed, as do key registration with its warning and the sign-in page with the email kept |
```

`packages/synth/src/cases/registry.ts`, after the TBL entries (after DLR's if #78 merges first), each `none(1, …)`
(milestone 1: the web app and its sign-in, as FRM-07):

```ts
  // The sign-in steps of the UX baseline review's sixth pull request (docs/adr/0081).
  'SGN-01': none(1, 'Synthetic personas sign in through the local identity provider on an injected clock and in the browser, and the limit is read from infra’s source text; no file.', [
    'apps/web/src/lib/auth/step-limits.test.ts',
    'apps/web/src/lib/auth/pending.test.ts',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/src/components/step-timer.test.tsx',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
  'SGN-02': none(1, 'The step timer runs in the browser harness and on synthetic sign-ins, on a clock the test moves; no file.', [
    'apps/web/src/lib/auth/step-limits.test.ts',
    'apps/web/src/components/step-timer.test.tsx',
    'apps/web/src/components/step-timer.browser.test.tsx',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
  'SGN-03': none(1, 'Synthetic personas sign in through the local identity provider; no file.', [
    'apps/web/src/lib/auth/pending.test.ts',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
  'SGN-04': none(1, 'Synthetic invited personas, a customer and a staff member, choose a password and enrol through the local identity provider; no file.', [
    'apps/web/src/lib/auth/sign-in.db.test.ts',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
```

`'SGN'` is appended to `CASE_MODULES` (`packages/synth/src/expected/types.ts:9`), module 19 as reserved. `pnpm synth`
then writes `fixtures/synthetic/SGN-01/expected.json` to `SGN-04/expected.json`, as it wrote FRM's and TBL's.

### 4.6 Existing tests that change, and those that do not

| Test | Change |
| --- | --- |
| `lib/routes/sign-in-routes.db.test.ts:150`, `:172`, `:234` | `toEqual({ status: 'ok', data: { email } })` gains `time` and `setup`; `:182-186`'s `toMatchObject` is unchanged |
| `lib/routes/sign-in-routes.db.test.ts:217-224` | unchanged and still passing: 6 minutes is past every limit |
| `e2e/sign-in.spec.ts:49` | unchanged: `getByRole('heading', { name: 'Set up two-step verification' })` matches by substring, so "Step 2 of 2: Set up two-step verification" passes |
| `e2e/sign-in.spec.ts:37-52`, `:54-64` | unchanged: a second first step overwrites the live step; the lockout's refusals clear cookies that are not there |
| `e2e/forms-keep-input.spec.ts` (FRM-07's sign-in steps) | unchanged: the timer is outside the form; nothing selects a bare `getByRole('status')` on a sign-in page (checked by grep) |
| `e2e/helpers.ts:63-65` `refusal(page)` (#42) | not touched: the region's `data-slot` is `step-timer`, never `alert` |
| `e2e/hardware-key.spec.ts` (#42) | not touched: a staff member enrolled without a key gets no marker; the register-key page gains only the sentence and the empty region |
| `lib/auth/primitives.test.ts` | unchanged; `step-limits.test.ts` reads the same infra file the same way |

The screen tour (`tools/lane-b-screen-tour`, on claude/build-ops) keeps working: each of its step sequences already
finishes inside the provider's 3 minutes, which the app now enforces at the same moment; section 6.2 adds its new
states.

---
