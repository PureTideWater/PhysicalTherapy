# Scout B: the step timer, its accessibility and its tests

UX PR 6, `co-001/ux-sign-in-time` (UX-012 (C-007) now-part; UX-128 (C-042) step marker). Read at `165c599` in
`/home/user/ux-sign-in-time` on 2026-10-28. #42 is open (REST: `state: open`, head `co-001/pr-06b-mail-streams`). No
product code edited.

## 0. The recommendations in brief

1. **No ticking clock.** The step states its limit once, in a static sentence, before the person starts. It then
   changes only twice: the warning at one minute left and the "closed" notice at zero. A per-second countdown would
   be auto-updating content under WCAG 2.2.2 (Level A), which would then need its own pause or hide control. It would
   also add time pressure while the person copies a 32-character key.
2. **One live region, present from the first render.** It is a `<div role="status" aria-atomic="true">` that the
   server renders empty. After mount it speaks once at one minute left and once at zero. It takes the Alert's look
   (`alertVariants()`, default variant, never the destructive one) and has no nested `role="alert"`. It never takes
   the focus, and it never scrolls the page.
3. **Below the form, never above it or inside it.** `StepTimer` wraps the step's card content. It renders the limit
   sentence first, then the children (key, link, ActionForm), then the region. This placement inserts the warning
   below the submit button, so nothing the person is typing in moves. Tab reaches Start again right after the
   submit button. The timer stays outside the `<form>`, away from ActionForm's summary and secret-emptying logic.
4. **Count from a deadline on two clocks.** On first mount, anchor `closesIn` (milliseconds left when the server
   rendered) to both `Date.now()` and `performance.now()`. Time left is the smaller of the two answers:
   - a machine that slept still counts, because the wall clock ran on;
   - a wall clock set back still counts, because the monotonic clock ran on.

   Keep the anchors in a module `Map` keyed by the server's `closesAt`. A remount from Next's history cache then
   keeps its first deadline.
5. **At zero: no disabling and no automatic navigation.**
   - The region says the step has closed, with Start again.
   - The form stays usable. Its next press goes to the server, which redirects to `/sign-in?reason=step_expired`
     with the email filled.
   - The server enforces the stated limit itself (`closesAt`, checked in the page and action handlers before the
     provider is called), so the limit the page states is the limit that applies.
6. **Start again is a link to `/sign-in`, not a form.** The email cookie is written with each pending step, so
   this needs no new route, works without JavaScript and has no side effect on GET (prefetch-safe).
7. **Tests use no production knob.**
   - The unit test pins the constant to the infra text, as `primitives.test.ts:66-77` already does for the password
     policy.
   - The browser harness drives the component with Playwright's `page.clock`.
   - The db route test drives the provider's 3-minute expiry with its injected clock.
   - The e2e test uses `page.clock` for the client side. For the server side it uses
     `context.clearCookies({ name: 'tp_sign_in' })`, which is exactly what the browser does at the pending cookie's
     Max-Age.
8. **An ADR is warranted (0081).** The design binds UX PRs 7, 14, 66 and 86. It carries a security reasoning
   (Extend is impossible without keeping the password, which is refused) and a conformance statement (2.2.1
   partly met, recorded for audit #103).

## 1. WCAG on time limits (question 1)

I quote the normative text with confidence. I give the understanding documents from memory and mark my confidence
on each point.

### 1.1 2.2.1 Timing Adjustable (A, WCAG 2.0 to 2.2)

Normative text (confident): "For each time limit that is set by the content, at least one of the following is
true:"
- **Turn off:** the user can turn the limit off before meeting it.
- **Adjust:** the user can adjust it before meeting it "over a wide range that is at least ten times the length of
  the default setting".
- **Extend:** "The user is warned before time expires and given at least 20 seconds to extend the time limit with a
  simple action (for example, 'press the space bar'), and the user is allowed to extend the time limit at least ten
  times".
- **Real-time exception:** for example, an auction.
- **Essential exception:** "the time limit is essential and extending it would invalidate the activity".
- **20 hour exception:** the limit is longer than 20 hours.

The criterion's note says it ensures people can complete tasks "without unexpected changes in content or context
that are a result of a time limit", and points to 3.2.1.

Understanding 2.2.1, from memory:
- **Preference order (confident).** The options are listed in order of preference: turning off, then adjusting,
  then extending.
- **Security limits count (fairly confident of the substance, not the exact words).** A limit included for security
  reasons "would be considered to have been set by the content", and "time limits set by Web servers should be under
  the author's control and are covered". Limits set externally, by the user agent or "factors intrinsic to the
  Internet", are not covered. So Cognito's `authSessionValidity`, which our CDK sets, is in scope.
- **20 seconds and ten times (fairly confident).** Both figures are described as based on clinical experience.
- **Third-party control (unsure of the wording).** Where giving users control would invalidate the outcome, a third
  party may control the limit, as with extra time on a test.
- **Sufficient techniques (names confident, situation letters unsure).** G133 (a checkbox on a multipart form's
  first page asking for a longer or no session limit), G198 (turn the limit off), G180 (set it to ten times the
  default), SCR16 (a script that warns a limit is about to expire) and SCR1 (let the user extend the default limit).
- **Authentication challenges (unsure).** I do not recall the document addressing them specifically. The Essential
  exception is narrow: extending must invalidate the activity. Cognito allows up to 15 minutes, so 3 minutes is a
  policy choice, not an essential property. The conservative reading, which the review takes, is that the exception
  does not apply.

### 1.2 2.2.6 Timeouts (AAA, new in 2.1) and 2.2.5 Re-authenticating (AAA)

**2.2.6 (confident).** "Users are warned of the duration of any user inactivity that could cause data loss, unless
the data is preserved for more than 20 hours when the user does not take any actions."
- Its note says privacy rules may require consent before data is kept, and advises consulting privacy and legal
  professionals.
- Understanding 2.2.6, from memory (fairly confident): the warning belongs at the start of the process, before the
  person begins, and states the duration. The example is a message such as "you will be logged out after 20 minutes
  of inactivity". The sufficient techniques include warning of the duration at the start of a process and keeping
  the data for more than 20 hours. I do not recall their numbers.
- What this means here: the sentence must name the length ("3 minutes", never "a limited time") and must come before
  the work. On enrolment, that means above the setup key, not after the form. Our limit runs from when the challenge
  is issued, not from inactivity, but the data loss is the same: the enrolment key, the typed code, the step.

**2.2.5 (confident).** "When an authenticated session expires, the user can continue the activity without loss of
data after re-authenticating."
- Strictly, these steps come before the session. The criterion's idea, keeping what can be kept across a restart, is
  what Start again does with the email.
- Secrets (the password and the code) are never kept. 3.3.7's security exception covers that.

### 1.3 4.1.3 Status Messages (AA, 2.1)

Normative text (confident): status messages "can be programmatically determined through role or properties such
that they can be presented to the user by assistive technologies without receiving focus". A status message is a
change in content that is not a change of context and tells "the success or results of an action, ... the waiting
state of an application, ... the progress of a process, or ... the existence of errors".

- The warning and the "closed" notice are such messages: the state of the process, shown without focus.
- `role="status"` meets the criterion (technique ARIA22). It is implicitly `aria-live="polite"` and `aria-atomic="true"`.
- `role="alert"`, which is assertive (ARIA19), would interrupt the person's typing for a message that is not an error.
- ARIA's `role="timer"` has `aria-live="off"` by default. It is the semantics for a ticking counter, which we do not
  render.

**Live-region practice (confident from implementation experience, not from a WCAG document).** Screen readers
announce changes to a region that already exists. A region inserted with its content already in it is announced
unreliably, especially `role="status"` in NVDA and JAWS. Hence the empty region from the server render.

### 1.4 Related criteria that shape the design

- **2.2.2 Pause, Stop, Hide (A, confident).** It covers "auto-updating information that (1) starts automatically and
  (2) is presented in parallel with other content". Such content needs a way to pause, stop or hide it, or to control
  the update frequency. A ticking countdown is auto-updating, so ticking would add a control. Two one-off status
  messages in three minutes are status messages, not auto-updating presentation.
- **3.2.5 Change on Request (AAA, confident).** "Changes of context are initiated only by user request or a mechanism
  is available to turn off such changes." An automatic redirect at zero would fail it, and it would also go against
  2.2.1's note. The HMRC timeout dialog does redirect at zero, but that is a signed-in session whose page holds data.
  A sign-in step holds nothing to protect once it is dead, so no privacy reason outweighs the rule.
- **3.3.7 Redundant Entry (A, 2.2, confident).** Information already entered "is either auto-populated, or available
  for the user to select". The exceptions are where re-entry is essential, required for security, or the earlier
  information is no longer valid. So the email is filled in after a restart. The password is not: it falls under the
  security exception.
- **3.3.8 Accessible Authentication (Minimum) (AA, 2.2).** Transcribing the key is the cognitive test. The QR code
  (UX PR 86) and the copy button (UX PR 20) are the fixes. The timer must not get in their way: keep paste and
  `autocomplete="one-time-code"`.

### 1.5 A security limit that nobody can extend: what is met and the best design

| 2.2.1 option | Met? | Why |
|---|---|---|
| Turn off | No | Cognito's sign-in session cannot be turned off. |
| Adjust | No | Cognito's maximum is 15 minutes. Ten times 3 minutes is 30, and even at 15 minutes (UX PR 66) the person cannot set it. |
| Extend | No | A Cognito auth session cannot be refreshed. Starting again needs the password and a new code, which is not a "simple action". The only way to make it simple is to keep the password between steps, which we refuse: never keep a credential. |
| Exceptions | No | Not real-time. Not essential under the conservative reading in 1.1. Not over 20 hours. |

So the step fails 2.2.1 in full now, and still after PR 66. The review records this as a known limit for audit #103's
manual checks (UX-012, Rule line). The ADR should say so too.

**The best accessible design within that limit, in order of effect:**
1. **Make the work fit.**
   - QR code (UX PR 86) and copy button (UX PR 20).
   - Paste and `autocomplete="one-time-code"` kept.
   - The invited path's step marker, so the person knows what is coming.
2. **Lengthen the limit as far as the security reviewer allows.** UX PR 66 sets 15 minutes for enrolment and the new
   password; the code step keeps 5 minutes app-side.
3. **State the limit before the work starts**, in the same words on every timed step, from the one constant that is
   actually enforced (2.2.6 practice).
4. **Warn early enough to act**, at one minute now and two minutes after PR 66. 2.2.1's floor is 20 seconds. The
   warning is polite, said once, never focused and never moves the page.
5. **Offer the nearest thing to Extend.** Start again lands on the password with the email kept (3.3.7). On
   enrolment, it must say that starting again issues a new setup key (§2.7).
6. **At the limit, do not move the person.** Say that the step closed. The next press, or Start again, restarts with
   the email kept.
7. **Make the server close the step exactly when the page said** (§2.6), so the person is never surprised early.

## 2. The component (question 2)

### 2.1 API and placement

`apps/web/src/components/step-timer.tsx` is a `'use client'` file. Next server-renders it, so its first paint has no
JavaScript dependency.

```tsx
<StepTimer limitSeconds={STEP_SECONDS} warningSeconds={STEP_WARNING_SECONDS}
           closesAt={step.closesAt} closesIn={step.closesIn} restartHref="/sign-in?reason=…" restartNote={…}>
  {/* the card's content: the setup key and link on enrolment, then the ActionForm */}
</StepTimer>
```

It renders, in order:
1. **The limit sentence:** `<p data-slot="step-limit">This step stays open for 3 minutes.</p>`. It uses
   `counted(minutes, 'minute')` from `lib/copy/words.ts`, so "1 minute" and "15 minutes" follow from the constant.
2. **`children`.**
3. **The region:** `<div role="status" aria-atomic="true" data-slot="step-timer" data-phase=…>`.

Why a wrapper:
- The sentence must come before the work (2.2.6). The region must come after the submit, so that inserting it moves
  nothing being used, and Tab reaches Start again right after the submit.
- Two separate components would let a page put them in the wrong order.
- The wrapper keeps the region outside `<form>`, away from ActionForm's `:scope > [data-slot="refusal-summary"]`,
  `emptySecrets(form)` and the grid and flex slot rules.
- UX PR 7's forgot-password code step (Cognito's reset code) can wrap its own form the same way.

**The region element never changes identity.** While open it is empty and unstyled. When it speaks it takes
`alertVariants({ variant: 'default' })` and holds an AlertTitle-like line, the sentence and the link.
- Do not nest `<Alert>`. Its default role is `alert` (`packages/ui/src/components/alert.tsx:18`), which would make an
  assertive region inside the polite one. If an `<Alert>` is used, pass `role="none"`.
- Set `data-slot="step-timer"`. The e2e helper `refusal(page)` (`e2e/helpers.ts:63-65`) matches every
  `[data-slot="alert"]`, so a bare Alert would be counted as a refusal in sign-in journeys.
- The default variant, never destructive: UX-018 (C-104) is about danger red on states that are not failures. Use
  UX PR 14's notice when it lands.

**`data-phase`** is absent in the server render and set to `open`, `warning` or `closed` after mount. Tests wait for
it before moving the clock (§3).

### 2.2 The visible remaining time: no ticking clock

What other design systems do, from memory:
- **GOV.UK.** The GOV.UK Design System has no core timeout component. Its long-running community backlog item
  "Timeout warning" collects departmental versions. HMRC's `hmrc-timeout-dialog` (hmrc-frontend) is the most widely
  used: a modal some minutes before sign-out (2 minutes by default, as I recall) saying "For your security, we will
  sign you out in 2 minutes.", with "Stay signed in" and "Sign out". It redirects at zero. As I recall, its
  screen-reader text is updated far less often than its visible text. I do not remember the interval.
- **GOV.UK One Login.** As I recall, the security-code screens state the code's expiry statically, with no countdown.
  An expired code gets an error and a link to get a new one. That is the non-extendable case, and it is our case.
- **Login.gov.** As I recall, its session-timeout modal (USWDS-based) shows a live "X minutes and Y seconds" countdown
  and a Continue button. I am unsure how it treats screen readers.
- **The pattern across them:** an extendable session gets a warning with an extend button, often modal, sometimes
  with a visible countdown. A step that cannot be extended gets a static statement of its life and a way to restart.
- **W3C COGA.** "Making Content Usable for People with Cognitive and Learning Disabilities" (W3C Group Note) advises
  avoiding time limits, and warning and letting people extend or keep their work where one is unavoidable. I do not
  recall the pattern names.

**Recommendation.** Show the remaining time in coarse, static words that change only at the two phase changes. The
limit comes first ("3 minutes"), then the warning, then "closed".

Rejected:
- **A ticking clock:** it falls under 2.2.2 and adds pressure. If one were ever added, it would be `role="timer"`
  outside the live region, with a hide control.
- **A per-minute "About 2 minutes left":** borderline auto-updating, and little use in three minutes.
- **A local clock time ("open until 10:42 a.m.").** The server cannot render it without the person's time zone, so
  the sentence would change after hydration. It also adds a second time format beside UX-027's open question on
  dates and times.

**Words, flagged for the words owner.** The review's warning "This step closes in 1 minute." is true when it is said,
then stale for the next 59 seconds while it stays on screen. I recommend "This step closes within a minute. Start it
again to get more time." It is always true without ticking, and reads as "within 2 minutes" after PR 66. If the
review's words are kept, that is acceptable: they are announced once, at exactly one minute.

### 2.3 Phases and announcements

- **The phase function:** `stepPhase(remainingMs, warningMs)` returns `closed` at or below 0, `warning` at or below
  `warningMs`, and `open` otherwise.
- **Monotonic.** The phase never goes back: time left never increases (§2.4).
- **Announced exactly twice over the step's life:**
  - "warning": the warning sentence and the Start again link;
  - "closed": the closed sentence and the Start again link.

  Nothing else in the region changes. React writes no DOM when the phase is unchanged, so a re-render (for example a
  `router.refresh()`) announces nothing.
- **Loaded with under a minute left.** The phase is set after mount into the region the server rendered empty. That
  is a change, so it is announced.
- **Loaded after zero.** This should not happen: the page handler redirects (§2.6). If it races, the region says
  "closed" once.
- **Hidden tab.** Never set the text while `document.visibilityState !== 'visible'`. On `visibilitychange` to
  visible, compute and set it. A person who switched to the authenticator app on a phone hears the warning when they
  come back. A person back after zero hears only "closed", because the warning is skipped.
  - Gate on visibility, not on `document.hasFocus()`. A person reading the key from a visible browser window while
    typing it into a desktop authenticator must still see the warning.

### 2.4 The deadline: where it comes from, sleep, clock jumps and remounts

- **The server is the source.** The pending step carries `closesAt`, an epoch in milliseconds.
  - Set it when the provider issues the challenge, taking the time before the provider call, so the app's deadline
    never outlasts Cognito's.
  - Keep it across a rewrite with the same challenge. `settle()` rewrites the pending step on `invalid_password` with
    the same challenge (`routes/sign-in.ts:106-108`), and Cognito's session does not restart there, so the cookie's
    fresh 5 minutes must not move the deadline.
  - Store it beside the `Pending`, sealed in the same cookie by `pending.ts`. Putting it inside the flow's `Pending`
    type would mean editing `lib/auth/sign-in.ts`, which is not in this PR's files (it is in PR 7's).
- **The page handler returns `{ closesAt, closesIn }`.** `closesIn = closesAt - services.now()` is computed at render,
  so the client never compares its own clock with the server's.
- **Client anchor, on first mount:** `wall = Date.now() + closesIn` and `mono = performance.now() + closesIn`. Time
  left is `min(wall - Date.now(), mono - performance.now())`.
  - **A machine that slept:** `Date.now()` ran on. `performance.now()` may not, depending on the platform's monotonic
    clock in suspend. The min takes the wall answer.
  - **A wall clock set back** (manually or by NTP): `performance.now()` ran on, and the min takes it.
  - **A wall clock set forward:** the step closes early by the jump. That errs on the safe side, and the server still
    decides; a real forward jump is usually a sleep.
  - **Latency.** Render-to-mount latency (network and hydration, typically under a second) makes the client deadline
    that much late. That is immaterial beside a 60-second lead, and the server decides.
- **Remounts.** Keep anchors in a module-level `Map<closesAt, anchor>`. Next 16's history traversal restores from its
  segment cache (`router-reducer/reducers/restore-reducer.js`, `FreshnessPolicy.HistoryTraversal`). I did not
  establish whether it refetches these dynamic pages before rendering. If it does not, a remount after Back then
  Forward receives a stale `closesIn`; keyed by `closesAt`, the first anchor wins either way. The module survives
  client-side navigation. A full reload re-renders from the server with a fresh `closesIn`. The bfcache keeps the
  whole page.
- **Re-checks.** Check once a second (`setInterval(check, 1000)`, setting state only when the phase changes), and at
  once on `visibilitychange`, `pageshow` and window `focus`. The interval makes jumps and late timers self-correcting
  within a second. A timer aimed at the next boundary would be precise, but the interval is simpler and as robust;
  either is acceptable.

### 2.5 Reduced motion, forced colours, without JavaScript

- **Motion.** Nothing animates: no transition, no fade, no `scrollIntoView`, no blinking. `prefers-reduced-motion`
  therefore changes nothing. The test asserts no animation or transition either way, so a later style cannot add one
  silently.
- **Forced colours.** The Alert look keeps its border, so the notice stays distinguishable. Optionally check it in the
  harness with `emulateMedia({ forcedColors: 'active' })`, as `action-form.browser.test.tsx:774` does.
- **Without JavaScript.** The limit sentence is in the server HTML. There is no warning. Expiry is handled by the
  server (redirect, email kept). Record that the warning needs JavaScript; the stated limit does not.

### 2.6 What happens at zero

Recommended:
- The region says the step has closed and offers Start again.
- The form stays enabled. ActionForm already uses `aria-disabled`, never `disabled` (`action-form.tsx:89`).
- A press goes to the server, which redirects to `/sign-in?reason=step_expired` with the email filled.
- The server enforces the stated limit itself. The page handlers and actions check `closesAt` before calling the
  provider, and treat it like a missing pending cookie (`RESTART`). So:
  - the limit stated, the limit the warning counts to and the limit that applies are one number;
  - Cognito's own 3 minutes, from a few hundred milliseconds earlier, can only shave off the last moment, and takes
    the same path (`settle` → `refused: expired`).

Rejected:
- **Disabling the form.** A wrong client clock would lock out a live step. A disabled button leaves the tab order.
  It breaks ActionForm's rule.
- **Automatic redirect at zero.** See 3.2.5 and 2.2.1's note in §1.4. It also interrupts a screen reader
  mid-sentence and discards the person's place.
- **A refusal on the same page** (`{ error, final: true }`). It needs two actions where one will do (Start again
  after the refusal), and it duplicates the region's "closed" words in an assertive alert, which is announcing twice.
  The redirect answer keeps ActionForm untouched.
- **Hiding the setup key at zero.** That is a content change on a timer. The closed words on enrolment say the key no
  longer works instead (§2.7).

### 2.7 Start again, and arriving on /sign-in

- **Make it a link, `<a>` or Next `<Link>`, styled with `buttonVariants()`.** Link semantics are right because it
  goes to another page. Because the email cookie is written with every `writePending` (Scout A's area), the link
  needs no POST, no new route and no audit event. It works without JavaScript, and Next's prefetch of `/sign-in`
  has no side effect.
  - The stale pending cookie is harmless: the next sign-in overwrites it, and it dies at Max-Age.
  - A POST action that clears the pending cookie was rejected: more surface for no gain.
- **Name the reason in the href, never the email.** The href is `/sign-in?reason=…`. A new reason code (for example
  `restarted`) would edit `notice.tsx`, which is not in this PR's list but is in PR 7's; the design decides. The
  existing `step_expired` words ("Start again from your email and password.") are wrong once the email is kept and
  need changing either way.
- **Focus after arrival.** Next 16 leaves focus alone on navigation ("This handler intentionally leaves focus
  untouched", `next/dist/client/components/layout-router.js`). A `role="status"` notice present at load is not
  reliably announced. Recommend: on `/sign-in` with `reason=step_expired`, the notice takes focus once
  (`tabIndex={-1}`, focused on mount, as #50's `RefusalTakeover` does), so it is read. Tab then reaches the filled
  email and the empty password.
- **Enrolment caveat.** Starting again issues a new setup key (`beginTotpSetup` → `AssociateSoftwareToken` each
  time). A person who has added the old key would keep a dead entry in their app and later read codes from it ("That
  did not match"). So the enrolment page passes a `restartNote`:
  - in the warning: "Starting again gives you a new setup key.";
  - in the closed notice: "This setup key no longer works. Start again for a new one."

  These words are flagged for the words owner. Recommended: include them.

### 2.8 Composition with #74's ActionForm

| Concern | ActionForm (#74) | StepTimer | Result |
|---|---|---|---|
| Focus | The summary or the one refused field takes focus on each response (`form-issues.tsx:577`) | Never calls `focus()` | No contest |
| Live regions | Summary `role="alert"`, inserted per response (keyed by `seq`); `PendingStatus` `role="status"` | One `role="status"`, changed at two phase boundaries | Distinct nodes and events; no message duplicated across them; assertive first, polite queued |
| DOM | Children inside `<form>`; `emptySecrets(form)`; summary `:scope > …` | Sibling after the `<form>` | No interference |
| Re-render | `RefreshAfterRefusal` → `router.refresh()` | New `closesIn`, same `closesAt` → same anchor → same phase → no DOM write | Nothing re-announced |
| A refusal during the warning | Summary announced; code field emptied and focused | Region unchanged | Warning stays visible, not repeated |
| The press after zero | Server redirects; `useGuardedSubmit` rethrows Next's redirect | Unmounts and clears its interval and listeners | No duplicate "closed" messages |
| Locked (tenth failure) | Summary "Account locked"; pending cleared | Keeps counting and later suggests Start again | Minor inaccuracy; accept, since ActionForm's lock state is not visible outside the form; recorded |

### 2.9 What the server side must give the timer (for Scout A and the design)

1. **The constants**, in `pending.ts` beside `pendingSeconds`:
   - `PROVIDER_SESSION_SECONDS = 3 * 60` (Cognito's `authSession`, `infra/lib/constructs/identity.ts:14`);
   - `STEP_SECONDS = Math.min(PROVIDER_SESSION_SECONDS, pending cookie seconds)`, which is 180;
   - `STEP_WARNING_SECONDS = 60`.

   Export `pendingSeconds`, or the 5-minute value, for the test.
2. **`closesAt` sealed with the pending step**, kept across same-challenge rewrites, and checked in every page and
   action handler of the timed steps.
3. **Page data** of `{ closesAt, closesIn }` (with `limitSeconds` if not imported by the page) for new-password,
   enrolment and the code step. Plus an "invited path" flag for the step marker, which the `Pending` does not carry
   today.
4. **The email cookie** (sealed, HttpOnly, never in a URL), written with each pending step, read by `/sign-in`, and
   cleared by `writeSession` and sign-out. Its lifetime and the shared-computer prefill are for the security reviewer.

## 3. Tests (question 3)

### 3.1 Unit: `apps/web/src/components/step-timer.test.tsx` (node project, `renderToString`)

- **One constant.** `STEP_SECONDS === Math.min(PROVIDER_SESSION_SECONDS, pendingSeconds(step))` for `new_password`,
  `mfa_setup` and `mfa`, and equals 180. `STEP_SECONDS % 60 === 0`.
- **Pinned to the infra text.** The test reads `infra/lib/constructs/identity.ts` and expects it to contain
  `authSession: Duration.minutes(${PROVIDER_SESSION_SECONDS / 60}),`, following `primitives.test.ts:66-77`.
  - Reading a #42 file is not touching it. #42's diff of `identity.ts` does not change that line (checked through
    the REST files API), so the pin survives #42's merge.
  - UX PR 66 then has to move the constant together with Cognito, which is what the review asks.
- **The dev provider mirrors it.** `CHALLENGE_MS === PROVIDER_SESSION_SECONDS * 1000`. Either export `CHALLENGE_MS`
  (one line in `dev-provider.ts`, which is in PR 7's list and not #42's) or read its text as above. Recommended:
  export it.
- **The phase table.** 180 000 and 60 001 are `open`; 60 000 and 1 are `warning`; 0 and -5 are `closed`.
- **`remaining()` takes the smaller clock.** A sleep (wall ahead) gives less time. A wall clock set back gives the
  monotonic answer. A forward jump closes early.
- **The polite warning.** `renderToString(<StepTimer …>children</StepTimer>)`:
  - contains the sentence, then the children, then exactly one `role="status"` with `aria-atomic="true"`;
  - the region is empty, with no link and no `data-phase`, so the warning, when it comes, is a change;
  - there is no `role="alert"` and no `aria-live="assertive"` anywhere in the component;
  - with 15 minutes (PR 66's value, passed in) the sentence reads "15 minutes", and with 60 seconds it reads
    "1 minute" (`counted`).

### 3.2 Browser: `apps/web/src/components/step-timer.browser.test.tsx` (the #74 harness, real Chromium)

Harness changes, both test-support files from #74 and not #42:
- `test-support/browser.ts`: `open(form, { width, clock })`. When `clock` is given, call
  `await page.clock.install({ time: clock })` before `goto`. The harness's `open` currently goes to the page
  straight away (`browser.ts:76-79`), and Playwright wants the clock installed before navigation.
- `test-support/forms-harness.tsx`:
  - a `stepTimer` form, `<StepTimer …><ActionForm action={action} submit="Sign in"><Field label="Six-digit code"
    name="code" …/></ActionForm></StepTimer>`, with `closesAt` and `closesIn` from the page keys;
  - a control to render the page again with a smaller `closesIn` and the same `closesAt` (a stale or cached payload,
    and `router.refresh`), extending `PageKeys` or adding a small store beside it.

Playwright 1.64.1's clock, checked in `playwright-core/lib/coreBundle.js`:
- `fastForward` advances `Date` and `performance.now()` together and fires due timers once. Its documentation calls
  this "closing the laptop lid".
- `setSystemTime` moves only the wall time (`_innerSetTime` sets `_now.time`, not `ticks`).
- `runFor` fires every timer on the way.

Tests:
- **Wait for mount before moving the clock.** Wait for `[data-slot="step-timer"][data-phase="open"]` first, or the
  anchor is taken after the jump. Assert with ±2 s margins: time flows between mount and the first `runFor`.
- **Said once, never each second.**
  - Install a MutationObserver on the region that records each distinct `textContent`.
  - `runFor('01:58')`: still empty. `runFor('00:04')`: the warning, with a "Start again" link whose href holds no
    email. `runFor('00:56')`: nothing new. `runFor('00:04')`: "closed".
  - The recorded sequence is exactly `['', warning, closed]`.
- **The focus never moves.** Focus the code field and type three digits. Run past the warning and past zero. The
  active element is still the code field, its value is intact, and `scrollY` is unchanged.
- **Nothing above the region moves.** The bounding boxes of the field and the submit are equal before and after the
  warning.
- **Sleep.** From open, `fastForward('05:00')`. The region goes straight to "closed", with one change and no warning.
- **Hidden tab.**
  - Override `document.visibilityState` to `hidden` and dispatch `visibilitychange`, then `runFor` past the warning
    boundary: the region is still empty.
  - Set it back to `visible` and dispatch again: the warning appears, once.
  - Repeat past zero: only "closed" appears.
- **A wall clock set back.** `setSystemTime(now - 10 min)`, then `runFor('02:02')`: the warning still comes at two
  minutes, counted by `performance.now()`.
- **A wall clock set forward.** `setSystemTime(now + 2:30)`: the warning shows at once, an early close on the safe
  side. Asserted, so the rule stays deliberate.
- **Remount and refresh.** Render again with the same `closesAt` and a `closesIn` 60 s larger (a stale cached
  payload). The phase and its timing are unchanged and no text changes. With a new `closesAt` (a new step), the
  timer re-anchors.
- **With ActionForm.**
  - Script a wrong-code refusal during the warning: the summary (`role="alert"`) is focused and announced, and the
    region's recorded texts gain nothing.
  - Script a refusal before the warning: when the warning comes, the focus stays on the field the summary focused.
  - Hold a press (`hold`) across zero: "Working…" and "closed" are in separate status nodes.
- **Motion.** With `emulateMedia({ reducedMotion: 'reduce' })` and without it, the region and its descendants have
  `animationName: none` and a `transitionDuration` of `0s`.
- **Width.** At 390 px the warning fits and the page does not scroll sideways.

### 3.3 Server path: `apps/web/src/lib/routes/sign-in-routes.db.test.ts` (Scout A's tests; listed for completeness)

The file already injects one clock into the services and the `DevAuthProvider` (`:58-73`). Add:
- a press at `closesAt - 1 s` is answered;
- a press and a page load at `closesAt + 1 s` redirect to `step_expired`, both with the cookie alive (2 minutes
  under its 5) and with the provider's challenge alive;
- an `invalid_password` rewrite keeps `closesAt`;
- the page data's `closesIn` equals `closesAt - now`;
- the email cookie is written with the step, outlives it, and is sealed and HttpOnly.

This is the real test of the provider path (Cognito's 3 minutes) and of the app-side check. No production knob is
needed.

### 3.4 e2e: `apps/web/e2e/sign-in.spec.ts`

**Making a step expire for real without any production code path.**
- **The client** is moved with `page.clock`: `page.clock.install()` before the first `goto`. Playwright's clock is
  context-wide and persists across navigations. TOTP codes are computed by the test from Node's real clock and
  checked by the server's real clock, so faking the browser's clock does not disturb them.
- **The server** is moved with `context.clearCookies({ name: 'tp_sign_in' })` (`SIGN_IN_COOKIE`, `sessions.ts:20`).
  This is what the browser itself does when the pending cookie reaches its Max-Age. The cookie store runs on real
  time, not on `page.clock`, so this is the faithful simulation, not a shortcut. The server then takes its real
  no-pending path (`RESTART`), and the email cookie, which outlives the step, fills the email.

Rejected:
- **A real 3-minute wait.** It costs about 3 minutes of a worker per run, and the db test in §3.3 proves the same
  server logic deterministically.
- **A test-only short challenge for one synthetic persona** in the dev store. It adds a test branch to
  `dev-provider.ts` and `dev-store.ts` for no browser-side difference: the browser half is the same redirect either
  way.
- **A server clock offset through configuration.** `services.ts` and `config.ts` are #42 files, and a time knob in a
  build that runs in production is what the brief forbids.

The production build that e2e runs refuses local providers outside e2e (`TP_ALLOW_LOCAL_PROVIDERS`), but the
recommended route does not lean even on that.

**Test A: the code step expires and starts again with the email kept.** Persona `time-mfa`, a group viewer.
1. Record every request URL (`page.on('request')`).
2. `enterPassword` → `/sign-in/mfa`. Check "This step stays open for 3 minutes." Wait for `data-phase="open"`.
3. `fastForward('02:00')`. The region shows the warning (`role="status"`, polite) with a Start again link.
4. Run axe with the warning shown (§3.5).
5. `fastForward('01:00')`. The region shows "closed". Run axe again.
6. Clear `tp_sign_in`, type a code and press Sign in.
7. The URL is `/sign-in?reason=step_expired`. Email has `toHaveValue(personaEmail)` and Password is empty. The notice
   is focused, if the design takes §2.7.
8. Type the password and a fresh code. The person is signed in, so a restart really works.
9. Check that no recorded URL, and not `page.url()`, contains the email, `encodeURIComponent(email)` or its local
   part. Check that the email cookie is HttpOnly and its value does not contain the email.

**Test B: the invited path, Start again before expiry, enrolment.** Persona `time-invited`, `invited: true`.
1. Start on `/sign-in/new-password`: "Step 1 of 2: choose a password" and the limit sentence.
2. `fastForward('02:00')`: the warning appears. Click Start again. Arrive on `/sign-in` with the email filled and no
   email in the URL.
3. Use the temporary password again: a fresh step, with "open" and no warning.
4. Choose a password → `/sign-in/enroll`: "Step 2 of 2: set up two-step verification". The limit sentence sits above
   the setup key.
5. `fastForward('02:00')`: the warning, with the new-key note. Run axe at 1280, and at 390 with `atPhoneWidth`.
6. `fastForward('01:00')`: "closed".
7. Clear `tp_sign_in` and `page.reload()`. The page handler's `RESTART` lands on `/sign-in?reason=step_expired` with
   the email filled. This covers a person who comes back and refreshes.

Notes for both tests:
- Each run starts from a fresh dev store (`e2e/prepare.ts:51-62`), so `time-invited` can complete its new password
  once per run.
- Neither test touches `e2e/prepare.ts` or `env.ts` (#42 files).
- The existing journeys pass through `/sign-in/mfa` in seconds, so they never see a warning. The timer's
  `data-slot="step-timer"` keeps it out of `refusal(page)`.

### 3.5 axe

- Use `expectAccessible(page, …)` (`e2e/a11y.ts:11`, WCAG 2.1 A and AA) on `/sign-in/mfa` and `/sign-in/enroll`:
  - with the warning shown (the brief's case);
  - and in the "closed" state, which costs one more line and has the same structure.
- Also use `atPhoneWidth` on enrolment with the warning (no sideways scroll at 390 px, plus axe).
- What axe cannot see is asserted directly:
  - politeness: `role="status"`, no `role="alert"` and no `aria-live="assertive"` in the region;
  - said once: the MutationObserver sequence;
  - no focus theft.
- For audit #103's manual checks: listen once with NVDA and with VoiceOver to confirm that the warning is read after
  typing pauses and that "closed" is read once.

### 3.6 Personas

Add `{ key: 'time-mfa', organization: 'group', role: 'viewer' }` and
`{ key: 'time-invited', organization: 'group', role: 'viewer', invited: true }` to
`apps/web/scripts/synthetic-personas.ts`, and extend its long header comment as each earlier journey did. They must
be separate personas: the specs run in parallel, sign-ins count toward the ten-failure lock, and the `mfa` rate
bucket is per account.

### 3.7 Test-matrix rows SGN-01 to SGN-04 and the synth registry

A proposed split. The titles and assertions are for the design to settle, word for word in `test-matrix.md`,
`matrix.ts` and `registry.ts`.

- **SGN-01 A sign-in step states its time limit.** The new-password, enrolment and code steps say "This step stays
  open for 3 minutes." above their work, from one constant: the shorter of the provider's sign-in session, as infra
  sets it, and the pending cookie. The server closes the step at that limit, however long the cookie lasts.
  Asserted by `step-timer.test.tsx`, `sign-in-routes.db.test.ts` and `sign-in.spec.ts`.
- **SGN-02 The warning before a step closes.** At one minute left a polite status, never an alert and never focused,
  says the step is closing and offers Start again.
  - It is said once and never each second, and nothing above it moves.
  - A tab that slept, was hidden or had its clock changed shows the right state when it is back, and says it then.
  - At the limit the same status says once that the step has closed. The form stays usable and the server answers
    the press.

  Asserted by `step-timer.test.tsx`, `step-timer.browser.test.tsx` and `sign-in.spec.ts`.
- **SGN-03 Starting again keeps the email.** Start again, a press after the limit, or a step page loaded after it,
  lands on `/sign-in` with the email filled from a sealed HttpOnly cookie and the password empty. The email is in no
  URL. Asserted by `sign-in-routes.db.test.ts` and `sign-in.spec.ts`.
- **SGN-04 The invited path is numbered and the steps pass axe.** "Step 1 of 2: choose a password" and "Step 2 of 2:
  set up two-step verification" appear on the invited path only. The code and enrolment steps pass axe with the
  warning shown and when closed, at 1280 and 390 px. Asserted by `sign-in.spec.ts`.

Registry and fixtures:
- Add `'SGN'` to `CASE_MODULES` in `packages/synth/src/expected/types.ts:9`. That is module 19 (reserved); the file
  is not #42's.
- Add a comment line "// The sign-in steps of the UX baseline review's sixth pull request (docs/adr/0081)."
- Add four `none(1, 'Synthetic personas sign in through the local identity provider, and the step timer runs in the
  browser harness on a controlled clock; no file.', [...tests])` entries, as FRM-07 does (`registry.ts:676`).
- `pnpm synth` then writes `fixtures/synthetic/SGN-0{1..4}/expected.json`.
- `fixtures.test.ts` checks that every row is in the registry word for word and that every `assertedBy` file exists.
- `test-matrix.md`, `matrix.ts` and `registry.ts` are #42 files, but they are the shared documents LANES rule 6
  allows: the PR that merges second resolves them. FRM and TBL set the precedent.

## 4. Constraint check

- **Migration:** none. Nothing here needs one.
- **#42:** no #42 file is edited.
  - The unit pin only reads `infra/lib/constructs/identity.ts`, and #42's change to that file leaves the
    `authSession` line alone.
  - The e2e avoids `e2e/prepare.ts` and `env.ts`. No knob goes in `services.ts` or `config.ts`.
  - The matrix and registry files are covered by rule 6, as above.
- **Files this scout's recommendations add or change:**
  - new: `components/step-timer.tsx`, `step-timer.test.tsx` and `step-timer.browser.test.tsx`;
  - `components/test-support/browser.ts` (the clock option) and `forms-harness.tsx` (the timer form);
  - `lib/auth/pending.ts` (the constants);
  - `lib/auth/dev-provider.ts`, to export `CHALLENGE_MS`; also in PR 7's list;
  - `scripts/synthetic-personas.ts`;
  - `e2e/sign-in.spec.ts`;
  - `packages/synth/src/expected/types.ts`;
  - the three matrix and registry files, and the generated SGN fixtures.

  The pages and routes are already in the queue's list. `app/sign-in/notice.tsx` (the step_expired words, and the
  notice taking focus) is not in PR 6's list. The design decides; it is in PR 7's list, so this PR changes it first
  and PR 7 builds on it.
- **ADR 0081:** recommended (see §0, item 8). If PR 7 needs one too, it adds its decisions to the same ADR rather
  than taking a second number.
- **No PHI.** Only synthetic personas (`@synthetic.test`) are used. The component logs nothing, and nothing in it
  names a model.

## 5. Open points for the design (each with a recommendation)

1. **The warning's words:** "within a minute" over "in 1 minute" (§2.2). Recommended: "within a minute".
2. **Enrolment's new-key note** in the warning and the closed words (§2.7). Recommended: include it.
3. **The closed words.** The review gives none. Recommended: "This step has closed. Start again from your password:
   your email is kept." For the words owner.
4. **Register-key (staff, 15 minutes)** is a time limit under 2.2.1 too: the access token and the cookie, both 15
   minutes. It has no statement and no warning, and it is not in the queue's file list. The component applies
   unchanged. Recommended: add `register-key/page.tsx` to this PR. Otherwise record it as a gap for audit #103.
   Hardware-key sign-in finishes in one ceremony and needs no timer.
5. **The locked state leaves the timer running** (§2.8). Recommended: accept and record it. Stopping it would need
   ActionForm's state outside the form.
6. **The notice takes focus on `/sign-in?reason=step_expired`** (§2.7). Recommended. It touches `notice.tsx` or
   `page.tsx`.
7. **For the security reviewer (Scout A's area):** the email cookie's 15 minutes past the step, and the prefill it
   gives on a shared computer. Possibly prefill only when `reason` is `step_expired` or the restart reason.
   Recommended: prefill only then. It is cheap, and it narrows what a passer-by sees.

## 6. Building on this in UX PR 7 (forgot your password)

- PR 7's reset-code step (Cognito's `ConfirmForgotPassword` code) can wrap its form in the same `StepTimer` with its
  own `limitSeconds`. The component takes the limit, the warning lead and the restart target as props, and imports
  no sign-in constants.
- The email cookie and the prefill on `/sign-in` serve PR 7's forgot-password form unchanged.
- `notice.tsx`'s reason words and the notice's focus behaviour, if taken here, are what PR 7's new reasons extend.
- Keep the constants in `pending.ts`. Keep `closesAt` out of `lib/auth/sign-in.ts`'s `Pending`, which PR 7 edits
  heavily, so the two PRs meet in as few hunks as possible.
