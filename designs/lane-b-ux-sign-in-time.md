# co-001/ux-sign-in-time: each sign-in step says how long it stays open, warns before it closes, and starts again with the email kept

The UX baseline review's sixth pull request. Branch `co-001/ux-sign-in-time`, fast-forwarded to `claude/build-platform`
at `83d71fd6` (which holds #74, UX PR 1: ActionForm, the shared fields, `PasswordField`, ADR 0077; #81, SUITE-CAP-1a;
and #78, UX PR 5: a refused download comes back to its page, ADR 0079, module 18 DLR); worktree
`/home/user/ux-sign-in-time`. Every file:line below was read, or read again, at `83d71fd6` (2026-11-01). The delta from
the draft's first base, `165c599`, touches no file under `lib/auth/`, `app/sign-in/`, `lib/routes/sign-in.ts`, `infra/`
or `e2e/helpers.ts`; it moves lines in `lib/http/next.ts` and `handler.ts`, adds `lib/http/sign-in-for.ts`,
`components/refusal-notice.tsx` and hint runs in `components/field.tsx`, and adds #78's personas and DLR entries, and
each cite below follows it. Since then `claude/build-platform` has moved to `bce57f16` (#82, CI follow-up P1), whose delta touches
only CI tools, workflows, docs and the shared documents' CI rows: every cite outside those documents holds there, and 4.5
gives the SGN anchors on both (critic C-05). The requirements are the review's queue entry
for order 6 (`designs/lane-b-ux-review.md:242-254`), its findings UX-012 (C-007, `:1800-1818`, the now part) and
UX-128 (C-042, `:3928-3946`, the step marker), their sources `a11y-other-23`, `a11y-other-06` and `flows-other-18`
(`designs/lane-b-ux-review/raw-findings.md:251-258`, `:64-71`, `:1231-1238`), and `synthesis/prs.json` order 6. The
three scouts' reports sit beside this file (`designs/lane-b-ux-sign-in-time/scout-{flow,timer,security}.md`). Where a
scout and the code disagree, this design follows the code and says so; where the scouts disagree with each other,
section 2.11 says which way it goes and why.

Reserved for this PR: ADR 0081 (shared with UX PR 7, which adds to it), test-matrix rows SGN-01 to SGN-04 (SGN-05 to
SGN-08 stay with PR 7), `packages/synth` module 19 (SGN), for four no-file registry entries. **No migration**, and
nothing in infra or Cognito (section 7). **Lands on nothing**: it depends on no open pull request (section 3.6).

**#42 is open** (REST `pulls/42`, read 2026-11-01: `state: open`, `merged: false`, draft, head `be63bdc2`, updated
2026-10-28 08:04 UTC, 219 files; `gh pr view` is refused here with a GraphQL 403). Its file list is the REST files API's,
which is the only authority (`designs/lane-b-release-content-checks/pr42-files.txt`, 143 files of 2026-10-27, is stale).
To regenerate it: `for p in 1 2 3; do gh api "repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=$p"
--jq '.[].filename'; done` (`gh api --paginate` is refused through this session's proxy, since GitHub's next-page link
is a numeric `repositories/{id}` path; compare the count with `pulls/42`'s `changed_files`). Intersected with section 3's
paths (`comm -12` of the two sorted lists), the only #42 files this PR touches are the three shared documents LANES.md
rule 6 lets both lanes change (`docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`,
`packages/synth/src/cases/registry.ts`), and one generated file, `tools/screening-capacity/watched-paths.txt`, which rule 6
has each pull request commit as `watched.ts --write` writes it, never by hand (3.1; critic C-02). `apps/web/e2e/helpers.ts`, `apps/web/e2e/hardware-key.spec.ts` and
`infra/lib/constructs/identity.ts` are #42's and are read, never edited. Where #42 moves a line this design cites, both
places are given ("on `be63bdc2`").

## Contents

1. The defect and its cause
2. The decision (2.1 to 2.9), the alternatives (2.10) and the security analysis (2.11)
3. Files, in build slices (3.1 to 3.4), what is left for Lane A and for UX PRs 66, 14 and 7 (3.5), and the open pull
   requests and the landing order (3.6)
4. Tests: unit (4.1), server (4.2), browser harness (4.3), end to end (4.4), the SGN rows and registry entries (4.5),
   existing tests (4.6)
5. Docs: ADR 0081 in outline (5.1), ADR 0016 (5.2), ADR 0077's Status line and two notes (5.3), docs/product (5.4)
6. Every string a person sees, with what a screen reader hears and the departures (6.1); the before and after
   screenshots (6.2); the screen tour's additions (6.3)
7. No migration, no infrastructure, no Cognito setting (7.1); proposals outside the PR (7.2)
8. Risks, and what holds each
9. Review and dispositions (one row per finding of the design review)

What each part answers: 2.1 to 2.6 and 2.8 answer UX-012's now part (the limit that binds today, stated from one
constant, the warning, Start again and the email kept, with no Cognito change); 2.7 answers UX-128's step marker; 2.9
records what WCAG 2.2.1 still leaves unmet, for audit #103, as UX-012's Rule line asks. UX-128's QR code (UX PR 86) and
copy button (UX PR 20), and UX-012's 15 minutes (UX PR 66), are not this PR's.

---

## 1. The defect and its cause

**What a person sees.** No sign-in step says it has a time limit, and none warns before it ends. The scout reproduced
every case in the dev stack (production build, local identity provider, three synthetic personas, real time, 3 of 3
passed in 7.3 minutes; `scout-flow.md` 1.2, which records each observation; its screenshots were working files and go
on no branch):

- **Code step, past 3 minutes.** A reload still renders "Verification code" as if live. A **correct** code, pressed,
  lands on `/sign-in?reason=step_expired`: "Start again / That sign-in step expired. Start again from your email and
  password." The Email field is empty (`scout-flow.md` 1.2, case A). Past 5 minutes even a reload lands there.
- **New password, past 3 minutes.** A valid new password, pressed, lands on the same page; it was **not** saved, and
  the temporary password still works (case C).
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

**Where the constant lives: a new leaf module, `lib/auth/step-limits.ts`, with no runtime imports.** The queue says
"beside `pendingSeconds`"; `pendingSeconds` moves into it, so the constant still sits beside it. A leaf, because three
kinds of reader need it and `pending.ts` imports `sessions.ts` and through it `@tp/db/runtime` (`pending.ts:3`): the dev
provider, the route layer, and the unit tests. Its one import is `import type { Pending } from './sign-in'`, which the
compiler erases (review R-11). The client `StepTimer` imports nothing from it; it gets plain numbers (2.4).

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

export type StepName = Pending['step'];

/** Every step named, so a step added to Pending fails the typecheck here until it has its lengths (as STEP_PAGES does). */
const PROVIDER_SECONDS: Readonly<Record<StepName, number>> = {
  new_password: PROVIDER_CHALLENGE_SECONDS, mfa_setup: PROVIDER_CHALLENGE_SECONDS, mfa: PROVIDER_CHALLENGE_SECONDS,
  key: PROVIDER_CHALLENGE_SECONDS, register_key: PROVIDER_GRANT_SECONDS,
};
const COOKIE_SECONDS: Readonly<Record<StepName, number>> = {
  new_password: PENDING_COOKIE_SECONDS, mfa_setup: PENDING_COOKIE_SECONDS, mfa: PENDING_COOKIE_SECONDS,
  key: PENDING_COOKIE_SECONDS, register_key: REGISTRATION_COOKIE_SECONDS,
};

/** The pending cookie's life for a step. */
export function pendingSeconds(step: StepName): number;          // COOKIE_SECONDS[step]: register_key 900, every other 300
/** The limit a step states, warns of and is closed at: the shorter of the provider's and the cookie's. */
export function stepSeconds(step: StepName): number;             // register_key min(900, 900); others min(180, 300) = 180
/** How long before the limit the warning comes: two minutes on a step of ten minutes or more, one otherwise. */
export function warningSeconds(limitSeconds: number): number;    // 180 -> 60; 900 -> 120
```

- `StepName` is `Pending['step']` through a type-only import, and the lengths are two `Record<StepName, number>`
  tables, the pattern `STEP_PAGES` already uses (`lib/routes/sign-in.ts:58-64`). So a step PR 7 adds to `Pending` fails
  the typecheck in this module until it is given its provider's and its cookie's lengths: it can never fall into a
  default, which today's ternary (`pending.ts:15-17`) would let it do. No written-out union and no `_same` check (review
  R-11; the skeptic's point, that a derived type over a ternary would default silently, is met by the tables).
- The dev provider reads it: `CHALLENGE_MS = PROVIDER_CHALLENGE_SECONDS * 1000` and `GRANT_MS =
  PROVIDER_GRANT_SECONDS * 1000` (`dev-provider.ts:47-48`), so the local provider stays the user pool's twin from one
  value.
- `warningSeconds` is UX-012's own rule written once: one minute on today's 3-minute steps, and after UX PR 66 "two
  minutes left (one on the code step)" with no change here. Key registration's 15 minutes takes two today.
- **Pinned to infra without touching it.** `lib/auth/step-limits.test.ts` reads `infra/lib/constructs/identity.ts` as
  text and expects `authSession: Duration.minutes(${PROVIDER_CHALLENGE_SECONDS / 60}),` and `accessToken:
  Duration.minutes(${PROVIDER_GRANT_SECONDS / 60}),`, the way `lib/auth/primitives.test.ts:65-77` pins the password
  policy and `INVITATION_DAYS`. Reading a #42 file is not changing it, and #42's diff of `identity.ts` leaves both lines
  alone (scout-timer 3.1, scout-security 5; read again on its head `be63bdc2`: still `:11` and `:14`), so the pin
  survives #42's merge. UX PR 66, which moves Cognito to 15, then
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
  const at = context.services.now().getTime(); // services.now() is a Date (lib/server/services.ts:57); startedAt is epoch ms
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

`closesAt = startedAt + limitSeconds * 1000` (the server's clock) and `closesIn = closesAt - services.now().getTime()`, computed
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

A page rendered after its step began (a reload, a return, a phone that discarded the tab) states the time left by the
server's count for that request instead, once `closesIn` is more than five seconds below the limit: "This step closes
within 2 minutes.", the minutes rounded up after "within", true for as long as it stands (PR #92's review UXS-03,
section 9). Within the warning the first render shows the warning's phrase; the status stays empty until the browser
counts.

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

1. the limit sentence, `<p data-slot="step-limit">`, which also carries the short visible cue (below, review R-03);
2. its `children`: the card's content (on enrolment the setup key, its link and the form; elsewhere the form);
3. the region: `<div role="status" aria-atomic="true" data-slot="step-timer" data-phase={…}>`, **empty** in the server
   render and until the warning.

**Its boxes** (review R-05). `StepTimer` renders one wrapper `<div data-slot="step-timer-frame">` with no flex and no
gap of its own, holding an inner `<div className="flex flex-col gap-4">` with 1 and 2, and then 3 as a plain block. The
enrolment page drops its `CardContent`'s `flex flex-col gap-4` (`enroll/page.tsx:24`), which moves into the inner div,
so the setup key, its link and the form keep their 16 px; the other three pages gain the same 16 px between the
sentence and the form. The region is outside that flex column, so while it is empty it takes no gap, and it carries
**no box classes and no margin** until `data-phase` is `warning` or `closed`; only then does it take
`alertVariants({ variant: 'default' })` (whose `border px-4 py-3`, `alert.tsx:6`, would otherwise draw an empty box)
and `mt-4`. Its height is 0 while open (harness test 3). It is never hidden by `hidden`, `empty:hidden`,
`display: none` or `visibility: hidden`, which would take it out of the accessibility tree and lose the
present-from-the-start rule below (scout-timer 1.3).

**The visible cue where the person is looking** (review R-03). On a phone with the on-screen keyboard up the visual
viewport is about 390 by 400 to 460 px. On the code step the field sits at about 390 to 435 px from the top of the page
at 390 px wide, and the region would start near 515 px (the lockup, the heading, the card's header, the sentence, the
label, the field, its hint and the button above it): below the keyboard for the whole last minute. The polite
announcement reaches a screen-reader user wherever the region is; a sighted phone user would not be warned. Moving the
region above the form would push the field down while the person types; scrolling to it or moving the focus is refused
(2.5). So the limit sentence, which sits just above the work and is in view whenever the field is, also changes with the
phase, with no change of size: its `<p>` is a one-cell grid holding three phrases stacked in the same cell, "This step
stays open for 3 minutes.", "This step closes within a minute." and "This step has closed.", the current one visible
and the other two `invisible` and `aria-hidden="true"`. The cell is as tall as the tallest phrase from the first render,
at any width and zoom, so the change moves nothing (harness test 3). The classes, exactly (critic C-01): the `<p>` is
`grid`, each phrase a `<span className="col-start-1 row-start-1">`, and the two inactive phrases add `invisible`
(`visibility: hidden`, which also takes them out of the accessibility tree, beside `aria-hidden`); the speaking region
is `cn(alertVariants({ variant: 'default' }), 'mt-4')`. It is not a live region: the announcement stays the
region's alone, said once; a person reading the page line by line hears the sentence in its current state. The full
words and Start again stay in the region below the form, right after the button in the tab order. Without JavaScript the
first phrase stays. Harness test 10 and e2e tests 1 and 3 assert at 390 by 500 px, with the code field focused, that the
visible phrase is inside the viewport when the warning comes; what is left (Start again may sit under the keyboard
until the person closes it) is recorded in 2.9 for audit #103.

- `role="status"` is polite and atomic (WCAG 4.1.3; ARIA22); never `role="alert"` (assertive, it would cut into the
  person's typing for news that is not an error) and never `role="timer"` (for a ticking count, which this is not).
- An empty region present from the start is what screen readers announce reliably; a region inserted with its words
  already in it is not (scout-timer 1.3). The same pattern as `PendingStatus` (`components/form-issues.tsx:175-181`)
  and `CeremonyButton`'s status line (`components/hardware-key.tsx:62-64`).
- **Below the form**, so inserting the warning moves nothing the person is typing in, and Tab reaches Start again right
  after the submit button. The empty region takes no space (its boxes, above); when it speaks it takes today's Alert look,
  `alertVariants({ variant: 'default' })` (`packages/ui/src/components/alert.tsx:6-14`), with `AlertTitle` and
  `AlertDescription` inside and `mt-4` above, never the destructive variant (UX-018: no danger colour on a state
  that is not a failure). It is **not** an `<Alert>`: that component defaults to `role="alert"` and writes
  `data-slot="alert"` (`alert.tsx:18-19`), which would nest an assertive region in the polite one and make
  `refusal(page)` (`e2e/helpers.ts:63-65`, `:66-68` on `be63bdc2`, a #42 file) count the warning as a refusal. UX PR 14 later swaps the look
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
reload renders a fresh `closesIn`.

**Render-to-mount latency** (review R-09). On a slow phone network the time from the server's render to hydration can
be several seconds, which would shorten the warning's lead by as much. So on a full page load the anchor subtracts it:
when no anchor exists yet for this `closesAt` and the document's navigation entry
(`performance.getEntriesByType('navigation')[0]`) names the current URL (`entry.name === location.href`, so the props
came in this document's HTML, not in a later client navigation's payload), `closesIn` is reduced by
`max(0, performance.now() - entry.responseStart)`. `responseStart` is when the first byte arrived, a little after the
render, so the correction can only err early, the safe side. On a client navigation the payload's latency is not
measured and stays uncorrected, a few hundred milliseconds on the same connection the press just used. Either way the
server closes the step itself.

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

**Start again is a POST that ends the step** (PR #92's security review, SEC-01, section 9; this replaces the link this
section first chose). `<form action={restart}><button type="submit" className={buttonVariants({ variant: 'outline' })}>`,
inside the region, where `restart` is the server action `restartStep` (`app/sign-in/actions.ts`) the four pages pass.
It runs the public route `sign_in.restart` (`lib/routes/sign-in.ts`, `kind: 'action'`, `input: z.object({})`) through
`runSignInStep`, as every sign-in step does: the origin check, the `mfa` bucket counted by the pending step it names
(`pendingAccount`, never an account), no request key and no audit event, as a step closing at its limit writes none.
Its handler reads the pending step, deletes `tp_sign_in` (`clearPending`, never `clearKeptEmail`), gives key
registration's grant back to the provider (`SignInFlow.abandon`, which calls `provider.release` as every other way out
of that step does), and answers `/sign-in?reason=restarted`; a refusal (its rate limit) still goes there, where the
first step ends what this could not. So the setup key, the code's challenge and the key-registration grant open
nothing for whoever presses Back or opens the step's address next at a shared computer; Next's router cache is
dropped by the action's cookie write, so Back asks the server, which sends it to `?reason=step_expired`. The link
first chosen left them usable to the limit, and the premise "the first step overwrites or clears it" held only if
someone submitted one. A GET that ends the step was refused: Next prefetches a link in view, which would end a live
step during its warning, and another site's top-level link (SameSite=Lax) could end someone's step. A route handler was
refused: the steps are server actions through their routes (the registry test holds it), and a handler adds a path and
a redirect for one button. It is the same element in the warning and the closed phase (review R-02): one JSX position,
after the words, with no `key` and no branch around it, so React keeps the form and its button and only the text nodes
before them change. A keyboard or screen-reader user who tabbed to it during the warning still holds it at zero (WCAG
2.4.3). Harness test 2b holds it. Without JavaScript no warning comes, so no Start again either (the next press after
the limit starts again).

**A new reason, `restarted`,** appended to `SIGN_IN_REASONS` (`lib/routes/sign-in.ts:23-35`) and to `REASONS`
(`app/sign-in/notice.tsx:6-18`), because a person who starts again during the warning has not had a step close, and
`step_expired`'s words would say it had. PR 7 appends its own reasons the same way; nothing is reshaped.

**The email is kept in a separate sealed cookie**, `tp_sign_in_email` (scouts A and C; `scout-security.md` 1.2):

| Property | Value | Why |
| --- | --- | --- |
| Name | `tp_sign_in_email`, exported as `KEPT_EMAIL_COOKIE` beside `SIGN_IN_COOKIE` (`lib/auth/sessions.ts:20`) | The house prefix; no `__Host-`, which no house cookie uses (proposal in 7.2) |
| Content | `{ email, use? }`: the email as the flow holds it (already `emailAddress`-normalized), and `use`, `'temporary'` or `'chosen'`, which password a restart takes (below) | Nothing else |
| Protection | **Sealed**: `sealer.seal('sign-in-email', …)` (`lib/auth/seal.ts:39-46`), a purpose of its own (in use: `sign-in-pending`, `dev-challenge`, `dev-grant`, `csrf`, `local-upload`, and the HMAC purposes `rate-limit`, `form-actor`) | Confidential, not just signed: a signed value shows the address in base64 to anyone who opens the cookie viewer or a saved HAR on a shared computer. Its own purpose: a pending value never opens as a kept email, nor the reverse |
| Flags | `HttpOnly; Secure; SameSite=Lax; Path=/`, through the adapters unchanged (`lib/http/next.ts:25`, `:27-38`; `lib/http/handler.ts:47-49`) | 2.11 |
| Lifetime | Seal expiry and Max-Age at `startedAt + stepSeconds(step) + KEPT_EMAIL_EXTRA_SECONDS`, absolute: 1,080 s on the three challenge steps, 1,800 s on key registration | Counted from the step's start, so no rewrite extends it. Fifteen minutes past the step: shorter fails the person who left to find their phone or the invitation email, the case the feature is for; longer is a new visit, not a restart |
| Written | Only in `settle`'s `pending` branch, for the steps it can produce after the password: `new_password`, `mfa_setup`, `mfa`, `register_key` | Each exists only after the provider accepted the password. **Never in `writePending`**, which also writes the hardware-key step for any typed address (`:276`; `lib/auth/sign-in.ts:230-237`) |
| Cleared | By a new helper `clearSignIn` (both cookies): in `writeSession` (`pending.ts:33-37`); in `settle`'s `locked`, `hardware_key_required`, `key_registered` and `no_account` branches (`:109-122`; `no_account` added for SEC-02: an account disabled or removed after the password); by every first-step result that is not `pending`; and by `hardwareKeyOptions` in every case | Wherever the attempt ends, except at expiry and Start again, which are what the cookie is for: `settle`'s `expired` branch and `sign_in.restart` call `clearPending` (the pending cookie only) |
| Read | Only by `signInPage`, and only when `reason` is `step_expired` or `restarted`: it returns `{ reason, email, use }` when the cookie opens **and** its email passes `emailAddress` (`lib/routes/schemas.ts:22`) and `use`, when present, is one of the two (absent after an everyday code step, or an active staff member's key registration, where no password changed in this attempt; critic C-07) | Plain `/sign-in` and every other reason fill nothing, which narrows what a passer-by sees |
| Shown | Once, as the Email field's `defaultValue` (`app/sign-in/page.tsx:28`; `Field` passes it through with its other props, `components/field.tsx:82`, `:92`). The notice says the email is filled in and never prints the address, so it is never in a live region (review R-15) | Never in a URL, an `ActionState`, a step timer prop, a `data-` attribute, the notice, a log or an error |

Helpers in `pending.ts`, named for what they hold: `writeKeptEmail`, `readKeptEmail` (returns `undefined`, never
throws), `clearKeptEmail`, and `clearSignIn`. `lib/routes/sign-in.ts` gains only calls. Their signatures, and the two
shapes slices A and C meet at, fixed here so the slices build in parallel (critic C-07; the existing helpers take
`(cookies, sealer, …, now: Date)`, `pending.ts:19-26`):

```ts
// lib/auth/pending.ts
export type PasswordToUse = 'temporary' | 'chosen';
export interface KeptEmail { readonly email: string; readonly use?: PasswordToUse }
export function readPending(cookies: CookieJar, sealer: Sealer, now: Date): SealedPending | undefined;
export function writePending(cookies: CookieJar, sealer: Sealer, pending: Pending, meta: StepMeta, now: Date): void;
export function stepClosesAt(pending: SealedPending): number | undefined;          // startedAt + stepSeconds(step) * 1000
export function writeKeptEmail(cookies: CookieJar, sealer: Sealer, kept: KeptEmail, step: StepName, startedAt: number, now: Date): void;
export function readKeptEmail(cookies: CookieJar, sealer: Sealer, now: Date): KeptEmail | undefined;
export function clearKeptEmail(cookies: CookieJar): void;
export function clearSignIn(cookies: CookieJar): void;                            // clearPending + clearKeptEmail

// lib/routes/sign-in.ts: signInPage's data (hardwareKeyPage's stays { reason })
{ readonly reason: SignInReason | null; readonly email: string | null; readonly use: PasswordToUse | null }

// app/sign-in/notice.tsx
export function SignInNotice(props: {
  readonly reason: SignInReason | null;
  readonly kept?: { readonly use: PasswordToUse | null };  // given only when signInPage returned an email
  readonly surface?: 'password' | 'key';                   // 'password' by default
}): ReactNode;
```

`app/sign-in/page.tsx` passes `kept={email === null ? undefined : { use }}` and `defaultValue={email ?? undefined}`.

**Every first-step submission ends the attempt before it** (scout C 1.5). `signInWithPassword` clears both cookies on
every result that is not `pending` (`credentials`, `no_account`, `locked`, `invitation_expired`); a `pending` result
overwrites both. So the moment anyone else uses the form, the first person's kept address and live step are gone; an
unknown address and a wrong password write the same two deletions (2.11); and an abandoned code step can no longer be
used by a passer-by to type wrong codes into another person's account for its remaining minutes.

**Which password, said on arrival.** `use` is `'temporary'` when the kept step is `new_password` (an expired or
abandoned new-password step saved nothing: the temporary password still works), and `'chosen'` when the step was
written after a new password was saved in this attempt (`passwordSaved`, set by `settle` when `from.step` is
`new_password` and carried forward). **The kept email is written first in `settle`'s pending branch, before
`beginTotpSetup`** (review R-01): `newPassword` returns the `mfa_setup` step only after `setNewPassword` saved the
password (`lib/auth/sign-in.ts:185-193`), and `settle` then asks the provider for the setup key (`lib/routes/sign-in.ts:93-98`).
If that call answers `expired` (a press at `startedAt + 179 s` passes `pendingOf`, the password is saved, and
`AssociateSoftwareToken` can fall past Cognito's 3 minutes), `settle` recurses into its `expired` branch, which keeps the
kept email. Written before the call, the kept email already says `use: 'chosen'`; written after it, as the draft had it,
it would still say `'temporary'` from the new-password step, and the person would retry a password that no longer works,
each try counting toward the lock. So the branch's order is: compute `StepMeta` (with `passwordSaved` when `from.step`
is `new_password` or `from.passwordSaved`), write the kept email, then `beginTotpSetup` if needed, then write the step.
The notice then says "Use the temporary password from your invitation." or "Use
the password you chose: the temporary one no longer works." This is the scout's repro case: without it, an invited
person whose enrolment closed retries the temporary password, is refused, and each try counts toward the lock. It
leaks nothing: the cookie exists only after the password was proven, and only this browser sees it.

**On arrival, the notice takes the focus once** (scout-timer 2.7). Next 16 leaves focus where it was on navigation, and
a `role="status"` notice already present at load is not reliably read. For `step_expired` and `restarted` only, the
notice is `ArrivalNotice` (`components/arrival-focus.tsx`, new, client; PR #92's review UXS-02, section 9): the Alert
itself, `role="note"` (never also a live region: a status inserted already filled and then focused can be read twice,
VoiceOver with Safari), `tabIndex={-1}`, `data-slot="arrival-focus"`, focused once on mount, with the focus ring classes `RefusalTakeover` uses
(`components/action-form.tsx:163`), and with its guard (review R-13): it focuses only when nothing holds the focus
(`document.activeElement` is `null` or `body`, as `RefusalTakeover` checks at `:158`). After Next's client redirect the
pressed button is gone and the focus is on `body`, and after a full load it is too, so the notice takes it; a person who
had already tabbed into the form before hydration keeps their place. The guard is written in `ArrivalFocus` rather than
shared: `RefusalTakeover`'s check is one expression inside `takesFocus`, which is tied to the refusal registry, so
sharing it would mean changing `action-form.tsx`, a #74 file this PR otherwise leaves alone, for one line. A screen reader reads why the person is back and which password to use; Tab then
reaches the filled Email and the empty Password. The base now holds a second notice that takes focus on arrival,
#78's `RefusalAlert` (`components/refusal-notice.tsx:38-55`: `tabIndex={-1}` and `autoFocus` on a destructive
`role="alert"`). It is not reused: it is a refusal's look and role (UX-018: no danger colour on a state that is not a
failure), and its `autoFocus` serves a page reached by a full navigation, the 303 of a download, where the browser
honours the HTML attribute; `/sign-in?reason=…` is mostly reached by Next's client-side redirect from a server action,
where only an effect that calls `focus()` is sure to run, so `ArrivalFocus` focuses in `useEffect`, once. The other reasons keep today's behaviour (proposal in 7.2: UX PR 64
decides it for all).

**The hardware-key page renders the same notice** (review R-04): `app/sign-in/hardware-key/page.tsx:8`, `:13`, `:17`
renders `SignInNotice reason={reason}` from the same `reasonParams` (`lib/routes/sign-in.ts:38`, `:254`). So
`SignInNotice` takes `({ reason, kept, surface })`: `kept` optional (none on the key page, where no kept email is ever
written), and `surface`, `'password'` (the default, `/sign-in`) or `'key'`. On the key surface the two restart reasons
read in the key's terms, never "your email and password": `step_expired` is "Sign-in step closed" / "That sign-in step
closed. Start again with your hardware key.", and `restarted` is "Start again" / "Start again with your hardware key."
(section 6). The same `ArrivalFocus` rule applies there. Today nothing sends a person to the key page with either
reason (the stale `key` step restarts on `/sign-in`, 3.5); this is the starting point UX PR 7 needs, since its fix
sends the stale key step to `/sign-in/hardware-key?reason=step_expired`.

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
password. A page shows it only when `of >= 2`. `mfa_setup` with `keyRequired` is numbered for any account, invited or
active, because an active staff member with neither factor really has two steps left; the one account it would
miscount, an active staff member with a key whose authenticator an operator cleared in the user pool by hand, cannot
arise through the app and is accepted in section 8 (review R-14).

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

No ActionForm, field or `next.ts` file changes. Read again at `83d71fd6`, after #78: `Field`'s hint may now be
`FieldWords`, plain text or runs set in mono (`components/field.tsx:20-25`, `:68-75`); the step pages pass plain-string
hints or none, so nothing of theirs changes, and the timer's sentence is page text outside any field, not a hint.
`components/refusal-notice.tsx` (84 lines, new) is a refused download's Alert and is rendered on no sign-in page; like
every `Alert` it writes `data-slot="alert"` (`packages/ui/src/components/alert.tsx:18-19`), one more reason the region
is not one (2.4). `next.ts` lost `signInFor` to `lib/http/sign-in-for.ts:9-17` and gained `minutesWords` for its rate
limit's words (`next.ts:60`); this PR calls neither.

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

One more remainder, for audit #103's manual checks on a phone (review R-03): with the on-screen keyboard up, the
warning's full words and Start again sit below the form and can be under the keyboard. The visible cue in the limit
sentence's place (2.4) is in view, and asserted at 390 by 500 px; Start again is reached by closing the keyboard or
by Tab after the button. Whether a real iOS and Android keyboard leave the cue in view is checked by hand there.

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
| The region above the form, so a phone keeps it in view (review R-03) | Insert the warning between the sentence and the form | Inserting it pushes the field down while the person types, and a browser may then leave the field under the keyboard; reserving its space from the first render leaves an empty box over the work |
| Scroll the warning into view, or pin it to the bottom of the screen | `scrollIntoView`, or `position: sticky; bottom: 0` | Scrolling moves the page under a typing person (and is refused, 2.5); on iOS, and on Chrome since it resizes only the visual viewport, a bottom-pinned box sits behind the keyboard anyway |
| A same-page refusal at zero (`{ error, final: true }`) | The press after zero refused in place | Two presses where one does (refused, then Start again), and the closed words said twice, once assertively; the redirect leaves ActionForm untouched |
| Start again as a link to `/sign-in?reason=restarted` (this design's first choice) | A GET with no side effect | Leaves the step the person chose to leave usable to its limit: at a shared computer Back reopens the setup key, the code's challenge or key registration's grant (PR #92's review SEC-01; 2.6 takes a POST that ends it) |
| A GET route handler that ends the step | A link that clears the cookie | A GET that changes state: Next prefetches a link in view, which would end a live step during its warning, and another site's top-level link (SameSite=Lax) could end someone's step |
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
  `lib/http/rate-limit.ts:39`; applied at `lib/routes/sign-in.ts:158-159`); the prefill does not change the email it is counted under. An expiry is not
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
- **Disclosure** (review R-10, answered). The new cookie adds no category of data or purpose: `tp_sign_in` already
  holds the same address, sealed, for 5 to 15 minutes (every `Pending` variant carries `email`,
  `lib/auth/sign-in.ts:45-50`), and like it, `tp_session` and `csrf`, it is strictly necessary to sign in.
  `docs/product/legal-surfaces.md` (a #42 file) lists counsel-owned wording and the one non-essential cookie,
  `pw_first_touch` (`:25`), not the strictly necessary ones. So no legal-surfaces row and no proposal here; if the
  privacy notice (#51, counsel's) lists strictly necessary cookies, it lists this one beside `tp_sign_in`, which is that
  notice's own review across every auth cookie.
- **Never in a URL, a log, an error or a job payload.** Every redirect stays a reason code (`:22`, `:116`, `:140`;
  `lib/http/sign-in-for.ts:9-17`, which `next.ts` and `handler.ts` share), `reasonParams` stays `{ reason }`, so `?email=` fills nothing (tested); Start again takes no
  `next` or `returnTo` parameter, so no open redirect. No log line is added (`pnpm lint:logs`); `Sealer.open` swallows
  its own errors (`seal.ts:64-66`); no job is enqueued; no audit event is needed (Start again is not a mutation).
- **Lengths: nothing in a request or configuration changes them.** They are constants; the step is read from a
  sealed, server-made value; production builds its services with the real clock (`lib/server/services.ts:183`); the
  dev provider runs in a production build only under `TP_ALLOW_LOCAL_PROVIDERS=e2e`, which only `playwright.config.ts`
  sets (`playwright.config.ts:126`). No test knob is added (4.1).
- **Headers and CSP unchanged.** No `style` attribute (CSP `style-src` is `'self'` plus a nonce); the region's look is
  classes. `/sign-in` cannot be framed (`lib/http/security-headers.ts:69`, `:83`), and pages are `private, no-store`
  (`next.ts:20-22`), so a page that renders the kept email is never cached by a shared cache.
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
unless they start with `apps/`, `docs/`, `packages/`, `fixtures/` or `tools/`. **None of these files is #42's** except the three
shared documents in slice D, which LANES.md rule 6 lets both lanes change, and the generated `watched-paths.txt` in slice A,
which rule 6 has every pull request regenerate (critic C-02); checked by script, `comm -12` of this
section's sorted paths with #42's REST file list (regenerated as the header says). 3.6 does the same for every other open
pull request.

### 3.1 Slice A: the limit, the deadline and the kept email (the server)

| File | Change |
| --- | --- |
| `lib/auth/step-limits.ts` (new) | 2.1: `PROVIDER_CHALLENGE_SECONDS`, `PROVIDER_GRANT_SECONDS`, `KEPT_EMAIL_EXTRA_SECONDS`, `StepName` (`Pending['step']`, type-only import), the two `Record<StepName, number>` tables, `pendingSeconds`, `stepSeconds`, `warningSeconds`; no runtime imports |
| `lib/auth/pending.ts` | `pendingSeconds` (`:15-17`) moves to `step-limits.ts`; `StepMeta` and `SealedPending` (2.2); `readPending` returns `SealedPending`; `writePending(cookies, sealer, pending, meta, now)` seals `{ ...pending, ...meta }` and counts expiry and Max-Age from `meta.startedAt` (2.2); `stepClosesAt(pending)`; `writeKeptEmail`, `readKeptEmail`, `clearKeptEmail`, `clearSignIn` (2.6); `writeSession` calls `clearSignIn` (`:33-37`); the header comment (`:6-11`) names the deadline, the second cookie and ADR 0081 |
| `lib/auth/sessions.ts` | `export const KEPT_EMAIL_COOKIE = 'tp_sign_in_email';` beside `SIGN_IN_COOKIE` (`:20`) |
| `lib/auth/sign-in.ts` | `FlowResult`'s pending kind gains `keyRequired?: true`; `start` attaches it (`:178`) (2.7). Nothing else: `Pending` and every other method unchanged |
| `lib/auth/dev-provider.ts` | `CHALLENGE_MS` and `GRANT_MS` (`:47-48`) from `PROVIDER_CHALLENGE_SECONDS` and `PROVIDER_GRANT_SECONDS`; its header (`:25-26`) says so |
| `lib/auth/dev-provider.test.ts` | its existing expiry test (`:83-90`, "expires a challenge after three minutes", which moves the clock 181 s) moves it by `PROVIDER_CHALLENGE_SECONDS - 1` and then by 1 second, and is titled with **SGN-01** (4.1; review R-12) |
| `lib/routes/sign-in.ts` | `restarted` appended to `SIGN_IN_REASONS` (`:23-35`); `advance` (2.2), through which every step action and handler calls the flow; `settle`'s options `{ credentials?, at, from? }` (`:86`); its pending branch computes `StepMeta` (`startedAt: at`, `setup`, `passwordSaved`), writes the kept email **before** `beginTotpSetup`, then the step (`:91-102`; 2.6, review R-01); `invalid_password` re-seals with `from`'s meta (`:106-108`); `key_registered`, `hardware_key_required` and `locked` call `clearSignIn` (`:109-122`); `expired` keeps `clearPending` (`:114-116`); `pendingOf` enforces the limit and returns `SealedPending` (`:135-138`); `signInPage` reads the kept email for `step_expired` and `restarted` (`:145-152`); `signInWithPassword` clears both cookies on a non-pending result (`:163`); the four step pages return `time` and `setup` (`:172-175`, `:201-204`, `:228-231`, `:319-322`); `hardwareKeyOptions` stamps the key step and clears the kept email (`:270-278`); `hardwareKeyRegistrationOptions` re-seals with the read meta (`:346`); the module comment (`:13-20`) names the deadline |
| `lib/auth/step-limits.test.ts` (new) | 4.1 |
| `lib/auth/pending.test.ts` (new) | 4.1 |
| `lib/auth/sign-in.db.test.ts` | one case: an internal account's first step reports `keyRequired`, a customer's does not (4.2) |
| `lib/routes/sign-in-routes.db.test.ts` | 4.2, and the existing page-data assertions that gain `time` and `setup` (4.6) |
| `tools/screening-capacity/watched-paths.txt` (generated) | (critic C-02) one line, `apps/web/src/lib/auth/step-limits.ts`, written by `pnpm exec tsx tools/screening-capacity/watched.ts --write`, never by hand: `pending.ts` and `dev-provider.ts` are on the screening's import closure (the list's `:61` and `:64`), so the new module they import joins it, and `watched.test.ts` fails until the committed list matches. #78 did the same for its new modules (`53c7224f`, `f4b01073`). The file is #42's (and #75's, #83's and #84's), but it is a generated file, which LANES.md rule 6 has each pull request commit as its generator writes and the one merged second regenerate on the merged tree, never hand-merge; this PR adds no other line. Because pending.ts, sign-in.ts and dev-provider.ts are watched files, the screening-capacity gate measures this pull request, as it measured #78 |

### 3.2 Slice B: the timer and the browser harness

| File | Change |
| --- | --- |
| `components/step-timer.tsx` (new, client) | 2.4, 2.5: `StepTimer`; `stepPhase`, `timeLeft` (the two-clock rule) and the words of section 6 as exported functions for the tests. No server module calls or reads them (critic C-03): `apps/web/src/client-boundary.test.ts` (#78's fix round, `a0099fab`) fails any page, layout or other server module that uses a `'use client'` export as anything but a JSX tag or prop, so the step pages only render `<StepTimer …>` with plain numbers and a string, and the notice's words stay in `notice.tsx` |
| `components/arrival-focus.tsx` (new, client) | 2.6: `ArrivalFocus`, a `tabIndex={-1}` wrapper focused once on mount, only when the focus is on `body` (`RefusalTakeover`'s guard) |
| `components/step-timer.test.tsx` (new) | 4.1 |
| `components/step-timer.browser.test.tsx` (new) | 4.3 |
| `components/test-support/browser.ts` | `open(form, { width, clock })`: with `clock`, `page.clock.install({ time: clock })` before `goto` (`:75-80`), and the `Harness` interface's `open` options (`:38`) gain `readonly clock?: number` (critic C-04); the existing callers pass none and are unchanged |
| `components/test-support/forms-harness.html` | (critic C-01) the utilities the harness tests measure, which the app gets from Tailwind and the harness page does not: its `<style>` defines only `sr-only`, `flex`, `flex-col`, `flex-wrap`, `grid`, `grid-cols-2`, `col-span-full`, `basis-full`, `w-full`, `gap-2`, `gap-4` and `text-sm`, in `@layer utilities`. Added in the same layer, as Tailwind 4 writes them: `.invisible { visibility: hidden; }`, `.col-start-1 { grid-column-start: 1; }`, `.row-start-1 { grid-row-start: 1; }`, `.mt-4 { margin-top: 1rem; }`, `.border { border-style: solid; border-width: 1px; }`, `.px-4 { padding-inline: 1rem; }` and `.py-3 { padding-block: 0.75rem; }`. Without them harness tests 3, 9 and 10 would measure three phrases in three rows and a speaking region with no border or padding, not the app's page. No open pull request touches the file (3.6) |
| `components/test-support/forms-harness.tsx` | a `stepTimer` form: `StepTimer` around an `ActionForm` with a six-digit code `Field`, its `closesIn` and `closesAt` from the page keys (`PageKeys`, `:29-32`, gains both, optional; critic C-04: absent, the entry renders `closesIn` 180,000 and a fixed synthetic `closesAt` of 1,800,000,000,000, with `limitSeconds` 180, `warningSeconds` 60 and `restartHref="/sign-in?reason=restarted"`, so `open('stepTimer')` is a code step three minutes from closing); the harness's existing `control.render(next)` (`:48`) renders it again with a smaller `closesIn` and the same `closesAt`, or a new `closesAt` (4.3); the entry goes after `hardwareKey` (`:272`) and the import after `split-form`'s (`:16`), apart from every hunk of #85's (3.6) |

### 3.3 Slice C: the pages

| File | Change |
| --- | --- |
| `app/sign-in/step-heading.tsx` (new, server) | 2.7: `StepHeading` |
| `app/sign-in/page.tsx` | the Email field's `defaultValue={email}` (`:28`); `SignInNotice` gets `kept` (`:20`). Nothing else on the page |
| `app/sign-in/notice.tsx` | `restarted` in `REASONS`; `step_expired`'s words; `SignInNotice({ reason, kept, surface })`, `kept` and `surface` optional (`surface` `'password'` by default, or `'key'`), composes the kept-email words and the password line, or on the key surface the key's words (section 6; 2.6, review R-04); `ArrivalFocus` around the notice for the two restart reasons (`:20-31`) |
| `app/sign-in/hardware-key/page.tsx` | `SignInNotice reason={reason} surface="key"` (`:17`), no `kept`. Nothing else (review R-04) |
| `app/sign-in/notice.test.tsx` (new) | 4.1: the two surfaces' words and the arrival focus (review R-04) |
| `app/sign-in/mfa/page.tsx` | its `<h1>` through `StepHeading` (no marker); `StepTimer` around the `ActionForm` (`:23-25`), `restartHref="/sign-in?reason=restarted"` |
| `app/sign-in/enroll/page.tsx` | `StepHeading` with `setup`; `StepTimer` around the setup key, its link and the form (`:24-36`), with enrolment's `notes`; `CardContent` drops its `flex flex-col gap-4` (`:24`), which `StepTimer`'s inner column now carries (2.4, review R-05) |
| `app/sign-in/new-password/page.tsx` | `StepHeading` with `setup`; `StepTimer` around the form (`:24-35`) |
| `app/sign-in/register-key/page.tsx` | `StepHeading` with `setup`; `StepTimer` around `HardwareKeyRegistration` (`:23-25`); 15 minutes, warning at two |

`components/hardware-key.tsx` is **not** changed: its registration already follows a `redirect` answer
(`:144-152`), which is how an expired registration reaches `/sign-in?reason=step_expired` with the email kept.

### 3.4 Slice D: the end-to-end spec, personas and documents

| File | Change |
| --- | --- |
| `apps/web/e2e/sign-in-time.spec.ts` (new) | 4.4. A file of its own, not `sign-in.spec.ts`: PR 7 adds its journeys there, and the real-time test runs in its own file's worker |
| `apps/web/scripts/synthetic-personas.ts` | four personas appended after the forms journey's, the list's last (`:146-155`; #78's two refusal personas, now on the base, sit at `:142-145`), and a clause at the end of its header comment (`:31-32`, which #78 extended) (4.4); `scripts/seed.ts` seeds them from the list and `scripts/seed.db.test.ts:37` follows it |
| `docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md` (new) | section 5 |
| `docs/adr/0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md` | its Status line (`:3`): "accepted; amended by [0019](…) and [0081](…)"; after `:30-31` ("…into a five-minute HttpOnly cookie."), an italic note (section 5) |
| `docs/adr/0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md` | its Status line (`:3-5`) names 0081 as an amender (5.3, review R-07); two italic notes naming 0081's kept email as the one exception (section 5): one at the end of D1 (`:42-67`, whose `:47` says nothing typed is echoed back), one after `:246` ("typed text is never kept in browser storage"); both hunks apart from `co-001/wip-contract-phi-check-5`'s `:142-150` (3.6) |
| `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` (#42's shared documents, LANES.md rule 6) | SGN-01 to SGN-04 (4.5) |
| `packages/synth/src/expected/types.ts` | `'SGN'` appended to `CASE_MODULES` after `'DLR'` (`:9`) |
| `packages/synth/src/cases/common.ts` | `SGN: 19` appended to `MODULE_NUMBER` after `DLR: 18` (`:18`): the record is typed `Record<CaseModule | 'VAR', number>`, so without it `pnpm typecheck` fails once `'SGN'` is a module, and `controlNumber` (`:27`) numbers the module's fixtures from it |
| `fixtures/synthetic/SGN-01/expected.json` to `SGN-04/expected.json` (new) | written by `pnpm synth`, never by hand |

### 3.5 What is left, and for whom

- **Lane A: nothing this PR needs.** No migration, no infrastructure, no Cognito setting (section 7). One stale comment
  is recorded for Lane A, since its file is #42's: `infra/lib/constructs/identity.ts:41-42` (`:45-46` on `be63bdc2`)
  says temporary passwords "expire after three days", while `:82` (`:89`) sets `Duration.days(INVITATION_DAYS)`, which
  is 7 (`:23`) (7.2).
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
    its new page; `advance` for its actions; a new `Pending` step given its lengths in `step-limits.ts`'s two tables
    (the typecheck says so);
  - `SignInNotice`'s `surface: 'key'` on the hardware-key page (2.6, review R-04), its starting point for the stale
    `key` step's restart;
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
  re-runs the 390 by 500 px assertion (the sentence's cue in view with the field focused) when the QR code makes
  enrolment taller (2.4, 8).

### 3.6 Open pull requests that touch these files, and the landing order

Read 2026-11-01 from the REST API (`gh api "repos/PureTideWater/PhysicalTherapy/pulls?state=open&per_page=100"` for the
heads; each list as the header says, `pulls/<n>/files?per_page=100&page=<p>` page by page until `changed_files` is
reached) and intersected with this section's paths by `comm -12`. #78 and #81 have merged into the base (`83d71fd6`), and
#33 is closed. Read again by the completeness critic (2026-11-01, critic C-05): #82 has since merged too, and the base is
`bce57f16`; its delta from `83d71fd6` is CI tools, workflows, docs and the three shared documents' CI-21 to CI-23 rows,
and touches no file under `apps/web/`, `infra/`, `docs/adr/0016…` or `0077…`, nor synth's `types.ts` or `common.ts`; it moves
only the SGN anchors in the shared documents (4.5 gives both). #85's head is now `90ec40ab` (it merged `83d71fd6` in) and
#86's `83167b8f`; #42, #75 (and its wip-5), #83 and #84 are unchanged.

| PR | Branch, head | Files shared with this design | What it means here |
| --- | --- | --- | --- |
| #42 | `co-001/pr-06b-mail-streams` (draft), `be63bdc2` | the three shared documents; the generated `tools/screening-capacity/watched-paths.txt` (+8) | LANES.md rule 6: the PR merged second keeps both, and regenerates the watched list with `watched.ts --write` on the merged tree. Its `e2e/helpers.ts`, `e2e/hardware-key.spec.ts` and `identity.ts` are read only |
| #75 | `co-001/contract-phi-check` (draft), `871faff9` | the three shared documents; `watched-paths.txt` (+2, generated) | LANES.md rule 6. Its continuation `co-001/wip-contract-phi-check-5` (`7f77cb19`) also edits ADR 0077 at `:142-150` (D9's hint rule, +3/-3), a hunk apart from this PR's two notes (after `:47` and `:246`): both merge cleanly |
| #82 | `co-001/ci-pin-age`, merged as `bce57f16` | (merged) the three shared documents' CI-21 to CI-23 | The base now; SGN's anchors move (4.5) |
| #83, #84 | `co-001/ux-screening-result-tables` `f4a97668`, `co-001/packet-day-counts` `e3299ea2` (drafts) | the three shared documents; `watched-paths.txt` (+2 each, generated) | LANES.md rule 6 |
| #85 | `co-001/ux-payer-response` (draft), `90ec40ab` | the three shared documents; `components/test-support/forms-harness.tsx` (+123 lines changed) | Below |
| #86 to #89 | `co-001/ci-images-digest` (draft, `83167b8f`) and three Dependabot bumps | none | |

**#85 and the harness.** #85 adds a `response-letter` form to `forms-harness.tsx`. At `90ec40ab`, against `83d71fd6`
(critic C-05; the draft read `29dded52`), its hunks are the React import (`:2`), after the `export-status` import (`:13`),
after `HarnessControl`'s `render` (`:48`, +14), the `control` object (`:61`, one line to 34), after
`Object.assign(window, …)` (`:63`, +8), after `RUNS`'s end (`:125`, +40), before the `two` entry (after `:305`, +2) and
in `router.refresh` (after `:336`, +21). Slice B keeps away from every one of them, and `forms-harness.html` is not #85's:

- the `StepTimer` import goes after the `split-form` import (`:16`), three unchanged lines below #85's;
- `PageKeys` (`:29-32`) gains `readonly closesIn?: number; readonly closesAt?: number;`, which #85 does not touch, so the
  test re-renders the timer with the harness's existing `control.render(next)` (`:48`, `renderKeys` `:54`) and
  `HarnessControl` is not changed;
- the `stepTimer` entry goes right after `hardwareKey` (`:272`), the other sign-in form, 33 lines above #85's entry;
- `router.refresh` is not changed.

Git merges hunks that are separated by unchanged lines, so the two should merge without a conflict; if #85 lands first,
this PR, merged second, takes `claude/build-platform` in (a merge, never a rebase) and keeps both forms, both imports and
both sets of keys, and runs the browser project before pushing.

No open pull request touches a sign-in file, the auth library or the ADR 0016 this PR edits. So it **lands on nothing**:
build from `83d71fd6`, merge `claude/build-platform` into the branch before opening it (LANES.md rule 6: merge, never
rebase), and resolve the shared documents by keeping both sides, SGN's entries after whichever module merged last, and
`watched-paths.txt` by running `watched.ts --write` on the merged tree (never a hand merge). The build starts from the
branch fast-forwarded to `83d71fd6`; merging `bce57f16` (#82) in before opening the pull request changes only the shared
documents' anchors (critic C-05).

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

`lib/auth/dev-provider.test.ts` (review R-12): the dev provider reads the same constant. Its existing test "expires a
challenge after three minutes" (`:83-90`), which moves the clock a hard-coded 181 s, becomes **SGN-01**'s: a code is
answered `PROVIDER_CHALLENGE_SECONDS - 1` seconds after the challenge, and `expired` one second later. No new test
duplicates it.

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
   one `role="status"` with `aria-atomic="true"`, empty, with no link, no `data-phase` and no class of `alertVariants`
   (no `border`, no padding, no margin); no `role="alert"`, no `aria-live="assertive"` and no `data-slot="alert"`
   anywhere in it; the sentence's cell holds the warning and closed phrases `invisible` and `aria-hidden="true"`; with
   `limitSeconds` 900 it reads "15 minutes", with 60 "1 minute"; with no `closesIn`, the same sentence and an empty
   region.
4. **SGN-02** The words of section 6, from the exported functions: "within a minute" at 60 s, "within 2 minutes" at
   120; the closed words; the notes appended when given; Start again's `href` is the prop, with no `@`.

`app/sign-in/notice.test.tsx` (new; `renderToString`; review R-04): **SGN-03** on the password surface,
`step_expired` and `restarted` with and without `kept`, and with each `use`, give section 6's words and never the
address; on the key surface they say "Start again with your hardware key." and nothing about a password or an email;
both are wrapped in `[data-slot="arrival-focus"]`, and every other reason is not.

### 4.2 The server: `lib/routes/sign-in-routes.db.test.ts` and `lib/auth/sign-in.db.test.ts`

The test's `Browser` (`:86-110`) records each write's Max-Age and the names written per response.

1. **SGN-01** A step closes at its limit, counted from the challenge, whatever the cookie says. Sign in at `t0`;
   `mfaPage` returns `time: { limitSeconds: 180, warningSeconds: 60, closesAt: t0 + 180,000, closesIn: 180,000 }` and
   `setup: null`; at `t0 + 170 s`, `closesIn` is 10,000; at `t0 + 180 s` the page and `answerMfa` (with a code valid
   then) both answer `RESTART` while `tp_sign_in` is still in the browser (its 5 minutes run to `t0 + 300 s`), and neither
   response deletes it: the dev provider also answers `expired` at 180 s, but through `settle`'s `expired` branch, which
   deletes `tp_sign_in`, so the cookie left in place is what shows the provider was never asked (critic C-06); no
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
   5b. (review R-01) The provider saves the new password and then answers `expired` to `beginTotpSetup` (the file
   builds its services once with `createServices` and the dev provider, `:57-72`; this test builds a second services
   object on the same store and clock whose provider delegates every method to a `DevAuthProvider` but answers
   `beginTotpSetup` with `{ kind: 'expired' }`, since the dev provider's fresh challenge after a saved password never
   expires on that call by itself):
   `newPasswordStep` redirects to `/sign-in?reason=step_expired`, `tp_sign_in` is deleted, and `signInPage` returns
   `use: 'chosen'`; the chosen password then leads to enrolment.
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
   2b. (review R-02) **Start again keeps the focus at zero.** Tab to Start again during the warning; `runFor` past zero:
   the same link is still `document.activeElement` (the node itself, compared by a handle taken before), and its
   `href` is unchanged.
3. **Nothing above the region moves.** The bounding boxes of the sentence, the field and the button are equal before
   and after the warning and after zero, at 1280 and 390 px. While open, the region's height is 0 and it has no border
   (review R-05); it is in the accessibility tree all the while (`getByRole('status')` finds it empty).
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
10. **Phone width.** At 390 px the warning fits and the page does not scroll sideways. At 390 by 500 px (the visual
    viewport with an on-screen keyboard up), with the code field focused, the sentence's visible phrase is inside the
    viewport when the warning comes and when the step closes, and `scrollY` did not change (review R-03).

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
     region; the sentence reads "This step closes within a minute.". `expectAccessible(page, 'Code step, warning
     shown')`, then `atPhoneWidth` with the warning shown, then at 390 by 500 px with the field focused the sentence's
     visible phrase is inside the viewport (review R-03).
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
     authenticator app." `expectAccessible(page, 'Enrolment, warning shown')` and `atPhoneWidth`; at 390 by 500 px with
     the code field focused, the sentence's visible phrase is inside the viewport (review R-03; if the setup key above
     pushes it out, the build reports the measure and 2.9's remainder names enrolment).
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

Added to `docs/product/test-matrix.md` after "Download refusals (DLR)" (`:353-365`, the file's last section since #78
merged; `:357-369` on `bce57f16`, after #82's CI-21 to CI-23), and to `packages/synth/src/cases/matrix.ts` after DLR-04's
entry (`:502-507`, before the closing `];` at `:508`; `:505-510` and `:511` on `bce57f16`),
word for word (`packages/synth/src/fixtures.test.ts:33-44` holds the two
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
| SGN-02 | The warning before a step closes | At one minute left (two on a step of ten minutes or more) one polite status, never an alert and never focused, says the step closes within a minute, what Start again costs and keeps, and on enrolment that it gives a new setup key; it is said once and never each second, the limit sentence above the work shows the same state in place and stays in view on a phone with its keyboard up, nothing above it moves, and the focus and what was typed stay, Start again's too; a tab that slept, was hidden, or had its clock set back or forward shows the right state when it is visible again, and says it then; a re-render keeps the count; at the limit the same status says once that the step has closed, nothing redirects and the form stays usable; nothing animates |
| SGN-03 | Starting again keeps the email | Start again, a press after the limit and a step page loaded after it land on the sign-in page with the email filled and the password empty, from a sealed, HttpOnly, SameSite=Lax cookie written only after the password was proven, never for the hardware-key step, and lasting 15 minutes past the step; the notice takes the focus once and says to use the temporary password after a new-password step, or the chosen one once it was saved; the email is in no URL and is filled only on those two reasons; an unknown address and a wrong password write the same cookies; the kept email ends when a session opens, an account locks, a key is required or registered, or a first step opens no step, and outlives an expiry |
| SGN-04 | The invited paths are numbered, and the timed steps pass axe | An invited customer's headings read "Step 1 of 2: Choose a password" and "Step 2 of 2: Set up two-step verification", the number shown over the step's name, and an invited staff member's run from "Step 1 of 3" to "Step 3 of 3: Register a hardware key", counted by the server from the provider's answer and the account; an everyday sign-in, and a restart with one step left, show no number; the code and enrolment steps pass axe (WCAG 2.1 A and AA) with the warning shown, at 1280 and 390 px, and when closed, as do key registration with its warning and the sign-in page with the email kept |
```

`packages/synth/src/cases/registry.ts`, after DLR-04's entry (`:731-737`, before the closing `};` at `:738`; `:735-741` and
`:742` on `bce57f16`), each `none(1, …)`
(milestone 1: the web app and its sign-in, as FRM-07):

```ts
  // The sign-in steps of the UX baseline review's sixth pull request (docs/adr/0081).
  'SGN-01': none(1, 'Synthetic personas sign in through the local identity provider on an injected clock and in the browser, and the limit is read from infra’s source text; no file.', [
    'apps/web/src/lib/auth/step-limits.test.ts',
    'apps/web/src/lib/auth/dev-provider.test.ts',
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
    'apps/web/src/app/sign-in/notice.test.tsx',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
  'SGN-04': none(1, 'Synthetic invited personas, a customer and a staff member, choose a password and enrol through the local identity provider; no file.', [
    'apps/web/src/lib/auth/sign-in.db.test.ts',
    'apps/web/src/lib/routes/sign-in-routes.db.test.ts',
    'apps/web/e2e/sign-in-time.spec.ts',
  ]),
```

`'SGN'` is appended to `CASE_MODULES` after `'DLR'` (`packages/synth/src/expected/types.ts:9`), and `SGN: 19` to
`MODULE_NUMBER` after `DLR: 18` (`packages/synth/src/cases/common.ts:18`), module 19 as reserved. `pnpm synth`
then writes `fixtures/synthetic/SGN-01/expected.json` to `SGN-04/expected.json`, as it wrote FRM's and TBL's.

### 4.6 Existing tests that change, and those that do not

| Test | Change |
| --- | --- |
| `lib/routes/sign-in-routes.db.test.ts:150`, `:172`, `:234` | `toEqual({ status: 'ok', data: { email } })` gains `time` and `setup`; `:182-186`'s `toMatchObject` is unchanged |
| `lib/routes/sign-in-routes.db.test.ts:217-224` | unchanged and still passing: 6 minutes is past every limit |
| `e2e/sign-in.spec.ts:49` | unchanged: `getByRole('heading', { name: 'Set up two-step verification' })` matches by substring, so "Step 2 of 2: Set up two-step verification" passes |
| `e2e/sign-in.spec.ts:37-52`, `:54-64` | unchanged: a second first step overwrites the live step; the lockout's refusals clear cookies that are not there |
| `e2e/forms-keep-input.spec.ts` (FRM-07's sign-in steps) | unchanged: the timer is outside the form; nothing selects a bare `getByRole('status')` on a sign-in page (checked by grep) |
| `e2e/helpers.ts:63-65` (`:66-68` on `be63bdc2`) `refusal(page)` (#42) | not touched: the region's `data-slot` is `step-timer`, never `alert` |
| `e2e/hardware-key.spec.ts` (#42) | not touched: a staff member enrolled without a key gets no marker; the register-key page gains only the sentence and the empty region |
| `lib/auth/primitives.test.ts` | unchanged; `step-limits.test.ts` reads the same infra file the same way |
| `lib/auth/dev-provider.test.ts:83-90` | moves its clock by `PROVIDER_CHALLENGE_SECONDS - 1` and then 1 s instead of a hard-coded 181 s, and is titled SGN-01 (4.1; review R-12) |

The screen tour (`tools/lane-b-screen-tour`, on claude/build-ops) keeps working: each of its step sequences already
finishes inside the provider's 3 minutes, which the app now enforces at the same moment; section 6.3 adds its new
states.

---

## 5. Docs: ADR 0081, and its relation to ADRs 0016 and 0077

### 5.1 ADR 0081 (needed)

`docs/adr/0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md`.
It is needed: it changes when a sign-in step ends (ADR 0016 sealed it for "five minutes"), adds a cookie that holds an
identifier, and makes the one exception to ADR 0077's "nothing typed is echoed back"; and UX PR 7 amends it. In the form
of 0079 (Status, Date, Deciders, PRD sections; Context, Decision, Alternatives considered, Consequences, Not covered, Not
verified here, Revisit when):

- **Status:** accepted (`co-001/ux-sign-in-time`, the UX baseline review's sixth pull request; UX-012's now part,
  C-007, and UX-128's step marker, C-042). Amends
  [0016](0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md) (a step now closes at the
  limit that binds, counted from its challenge, and a second sealed cookie keeps the email); adds to
  [0077](0077-submit-forms-from-the-browser-keep-what-was-typed-name-each-refused-field-by-its-label-and-size-controls-for-phones.md)
  (its one exception: the sign-in email, rendered back after a step closes); reverses none of their rulings. UX PR 7
  (`co-001/ux-sign-in-recovery`) adds an amendment section of its own, with SGN-05 to SGN-08.
- **Date:** the merge date.
- **Deciders:** the founder, under the standing rule of 2026-10-18; the co-founder, under the founder's delegation of
  2026-10-25, whose rulings have the build take each recommended option and wording without asking (UX-128's marker
  form and every wording of section 6, with its departures); the build (Lane B). Each reversible by the founder.
- **PRD sections:** 6 (Identity and sessions; Cross-cutting: accessibility, every error with a next step), 7 (Sign-in
  and MFA); `docs/product/sessions.md`; test matrix SGN-01 to SGN-04; ADRs 0012, 0016, 0077.
- **Context** (section 1): two clocks run on each step after the password, the provider's 3 minutes
  (`infra/lib/constructs/identity.ts:14`, Cognito's minimum; the dev provider's `CHALLENGE_MS`) and the pending
  cookie's 5 (`lib/auth/pending.ts:15-17`); no page states either or warns; a refused new password renews the cookie
  while the provider's runs on, so a dead step renders as live from minute 3 to 5; the email is dropped at expiry, and
  after enrolment closes the person is not told which password works. WCAG 2.2.1 (A), 2.2.6 (AAA, as practice), 3.3.7
  and 4.1.3 apply; UX-128 asks that the invited paths be numbered.
- **Decision:**
  - D1. **One limit, from one constant.** `apps/web/src/lib/auth/step-limits.ts`, a leaf module, holds the provider's
    challenge (180 s) and grant (900 s), the pending cookie's lives, `stepSeconds` (the shorter of the provider's and
    the cookie's: 3 minutes on new password, enrolment and code, 15 on key registration) and `warningSeconds` (two
    minutes on a step of ten or more, one otherwise). The dev provider reads it; a test reads infra's source text and
    fails when the two differ.
  - D2. **The server closes the step at that limit**, counted from a start taken before the provider was asked
    (`startedAt`, sealed beside the flow's step as an added property, so a release before and after read each other's
    values); no rewrite renews it; a page or a press after it starts again before any provider call and counts no
    failure. A step sealed before the deploy has no start and is left to the provider.
  - D3. **Each step states its limit before the work**, as a sentence rendered by the server ("This step stays open for
    3 minutes."). No ticking count.
  - D4. **One polite warning** at `warningSeconds` left, in a `role="status"` region present and empty from the first
    render, below the form and outside it: said once, never while the page is hidden, never by moving the focus, with
    nothing animated; it says what Start again costs and keeps, and on enrolment that the setup key will change. The
    limit sentence above the work shows the same state in a few words, in a cell sized from the first render, so a
    phone with its keyboard up shows the warning beside the field without anything moving. The
    browser counts on the smaller of its wall and monotonic clocks; the server decides.
  - D5. **At zero** the same region says once that the step has closed, with Start again; nothing redirects, the form
    stays usable, and the next press or reload lands on `/sign-in?reason=step_expired`.
  - D6. **Start again keeps the email.** Start again is a link to `/sign-in?reason=restarted`. The email is kept in
    `tp_sign_in_email`: sealed under its own purpose (`sign-in-email`), HttpOnly, Secure, SameSite=Lax, Path=/; written
    only after the provider accepted the password (never for the hardware-key step), until 15 minutes past the step's
    limit, counted from its start; read only by the sign-in page on `step_expired` and `restarted`; ended by a session,
    a lock, a key required or registered, and any first step that opens none. It also says which password works
    (`use`: the temporary one, or the one chosen in this attempt), and the notice on arrival takes the focus once. This
    is the one value the server renders back into a form, an exception to ADR 0077 D1, and the one value kept between
    pages outside the server, an exception to 0077's "typed text is never kept in browser storage"; it is the person's
    own sign-in address, never patient information, and is never in a URL, a log, an error or a job payload.
  - D7. **The invited paths are numbered by the server**, from the provider's answer and the account row the flow
    already reads, sealed with the step: "Step 1 of 2" and "Step 2 of 2" for an invited customer, "Step 1 of 3" to
    "Step 3 of 3" for an invited staff member, as the caption of the step's heading (a screen reader reads "Step 1 of
    2: Choose a password"). The first screen and an everyday sign-in carry none.
  - D8. **What WCAG 2.2.1 still leaves unmet** (2.9's table): no way to turn off, adjust or extend a Cognito sign-in
    session; recorded for combined audit #103's manual checks, now and after UX PR 66.
- **Alternatives considered** (2.10): a ticking count; a local clock time; Extend; the email in the pending cookie, in
  browser storage, in the URL or in a signed cookie; a cookie path of `/sign-in`; SameSite=Strict; writing the kept
  email in `writePending`; a deadline from the cookie's own life or a sealed deadline; `startedAt` in the flow's
  `Pending`; disabling the form or redirecting at zero; a same-page refusal at zero; Start again as a POST; a test knob
  for time; the marker as its own line; a count from the URL.
- **Consequences:** the 3-to-5-minute window in which a dead step looked live is gone; the five-minute cookie of 0016
  stays, as the outer bound, and a step closes at 3 (15 for key registration); UX PR 66 changes constants only, and the
  pin test makes infra and the constant move together; UX PR 7 reuses `StepTimer`, `StepHeading`, `advance` and the
  kept-email helpers, under D6's rule (written only after a secret is proven); a new `Pending` step must be given its
  lengths in `step-limits.ts` (the typecheck fails until it is). Two cookies are now cleared together wherever an attempt ends (`clearSignIn`).
- **Not covered:** without JavaScript the limit is stated and the email kept, but no warning comes; the hardware-key
  sign-in step (one ceremony of seconds) is enforced, not stated; a lock reached during the warning leaves the timer
  counting (its words stay true); WCAG 2.2.1 in full (D8); the 15-minute session (UX PR 66); the copy button and the QR
  code that make enrolment fit (UX PRs 20 and 86).
- **Not verified here:** whether Cognito restarts its 3 minutes on `AssociateSoftwareToken`'s session (no user pool in
  this lane; the start is taken before the first call, which is right either way); Cognito's own expiry (the dev
  provider is its twin); screen readers by hand (NVDA and JAWS with Chrome, VoiceOver with Safari on macOS and iOS: the
  announcements follow the ARIA the tests assert, and are listed for audit #103); iOS Safari's timers in a background
  tab (the visibility rule covers the return).
- **Revisit when:** UX PR 66 lands (the constants, and the code step kept at 5 minutes app-side); Cognito offers a way
  to refresh a sign-in session (then Extend, and 2.2.1 in full); UX PR 7 amends it; audit #103's manual checks report;
  UX PR 14's Notice replaces the region's look.

### 5.2 ADR 0016

- `docs/adr/0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md:3`: the status becomes
  "accepted; amended by [0019](0019-close-the-standing-access-paths-and-run-platform-jobs-as-an-operator-role.md) and
  [0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)".
- After the paragraph that ends at `:31` ("…expiring) into a five-minute HttpOnly cookie."), an italic note in 0056's
  style (`0056-…md:57`), the sentence itself not rewritten:
  *"Amended by [0081](0081-…md) (decisions D1, D2 and D6): the cookie still lives five minutes (fifteen for key
  registration), but a step closes at the limit that binds, the provider's three minutes (fifteen for key
  registration), counted from before the provider issued its challenge, and no rewrite extends it; a second sealed
  cookie, `tp_sign_in_email`, keeps the email until 15 minutes past the step, so that starting again does not ask for
  it."*

### 5.3 ADR 0077

Its Status line (`:3-5`) gains its amender, in the house's form (0056's Status names 0058, 0077 and 0078; review R-07):
"accepted (`co-001/ux-forms`, the UX baseline review's first pull request); amends [0056](…) (the type scale's phone
exception, decision D6); amended by
[0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)".
A hunk at the top of the file, apart from `co-001/wip-contract-phi-check-5`'s `:142-150`.

And two italic notes, each indented under the bullet it qualifies, neither rewriting it. Both hunks are apart from the one
edit another branch makes to 0077 (`co-001/wip-contract-phi-check-5`, #75's continuation, at `:142-150`; 3.6):

- At the end of D1 (after `:67`; D1's `:47` says "nothing typed is echoed back: `ActionState` carries no value"):
  *"Amended by [0081](0081-…md) (decision D6): the one value the server renders back into a form is the sign-in email,
  as the Email field's `defaultValue` on `/sign-in?reason=step_expired` and `?reason=restarted`, from a sealed HttpOnly
  cookie written only after the password was proven; `ActionState` still carries no value."*
- After `:246` ("typed text is never kept in browser storage, because it may hold patient information"):
  *"Amended by [0081](0081-…md) (decision D6): the sign-in email is kept for 15 minutes past a closed step in a sealed,
  HttpOnly cookie, which no script can read, and never in browser storage; it is the person's own sign-in address, never
  patient information."*

### 5.4 docs/product

- `docs/product/test-matrix.md`: the SGN section (4.5).
- `docs/product/sessions.md` is not edited: its cookie attributes (`:17`, HttpOnly, Secure, SameSite=Lax) hold for the
  new cookie, and it names no step lengths. The reconciliation document is not edited; of its "What must not change"
  checks this PR touches the security program (`pnpm test:db`, the generated route tests over the changed sign-in
  routes, whose inputs are unchanged) and the response headers (unchanged, no `style` attribute; 2.11).

---

## 6. Every string a person sees, and the screenshots

### 6.1 New and changed strings (exact)

Every one is checked against `.claude/rules/brand.md`, `docs/brand/BRAND.md` (tone: serious, exact, warm, `:23`) and
CO-11 (`docs/product/change-order-001.md:95`): no "AI", no "owed", "underpaid" or "recovered", no ProofPack, no
exclamation, no "please", no blame; sentence case; a count of two or more, and every stated limit, as digits with its
noun through `counted()` (`lib/copy/words.ts:9-11`), which gives the same words as #78's `minutesWords`
(`lib/http/download-refusal-words.ts:69`) from the house's general words module, while the warning's one minute reads
"within a minute", the house's own phrase (`lib/screening/sent.ts:28`, "usually within a minute"; brand.md and BRAND.md
set no rule of digits in prose, their `:36` and `:123` being about figures in mono), listed below as a departure (review
R-06); `pnpm lint:copy` runs on them. None holds an apostrophe, so none needs ’.

| Where | Before | After |
| --- | --- | --- |
| The limit, before the work: `/sign-in/new-password`, `/sign-in/enroll` (above the setup key), `/sign-in/mfa` | (none) | "This step stays open for 3 minutes." |
| The same sentence on a page rendered later in the step (a reload, a return), more than five seconds below the limit by the server's count (UXS-03) | (none) | "This step closes within 2 minutes." (the minutes left, rounded up: "within 3 minutes" to "within 2 minutes"; "within 11 minutes" on key registration), or within the warning its phrase |
| The same sentence's place during the warning (the visible cue, not announced; 2.4) | (none) | "This step closes within a minute." ("within 2 minutes" on key registration) |
| The same sentence's place once closed | (none) | "This step has closed." |
| The same, `/sign-in/register-key` | (none) | "This step stays open for 15 minutes." |
| The warning's title (`AlertTitle`), at `warningSeconds` left | (none) | "This step closes within a minute" (the three 3-minute steps); "This step closes within 2 minutes" (key registration) |
| The warning's words (`AlertDescription`) | (none) | "If you need more time, start again: your email is kept, and you type your password again." |
| The same, enrolment's note after it (`notes.warning`) | (none) | "Starting again gives you a new setup key: replace this one in your authenticator app." |
| The same, key registration's note after it (`notes.warning`, UXS-04) | (none) | "Starting again also asks for a code from your authenticator app." |
| The closed title, at zero | (none) | "This step has closed" |
| The closed words | (none) | "Start again: your email is kept, and you type your password again." |
| The same, enrolment's note after it (`notes.closed`) | (none) | "This setup key no longer works: starting again gives you a new one." |
| The same, key registration's note after it (`notes.closed`, UXS-04) | (none) | "Starting again also asks for a code from your authenticator app." |
| The button in the warning and the closed state (`buttonVariants({ variant: 'outline' })`, a form's submit; SEC-01) | (none) | "Start again" (ends the step, then `/sign-in?reason=restarted`) |
| Step marker, the caption over each heading (2.7) | (none) | "Step 1 of 2", "Step 2 of 2" (invited customer: new password, enrolment); "Step 1 of 3", "Step 2 of 3", "Step 3 of 3" (invited staff member: new password, enrolment, key registration); none elsewhere |
| `/sign-in?reason=step_expired`, title | "Start again" | "Sign-in step closed" |
| The same, words, with the email kept | "That sign-in step expired. Start again from your email and password." | "That sign-in step closed. Your email is filled in: type your password to start again." |
| The same, words, with no email kept (a link, a bookmark, more than 15 minutes later) | as above | "That sign-in step closed. Start again from your email and password." |
| `/sign-in?reason=restarted` (new reason), title | (none: a 404) | "Start again" |
| The same, words, with the email kept | (none) | "Your email is filled in: type your password to start again." |
| The same, words, with no email kept | (none) | "Start again from your email and password." |
| The password line after either, when the kept step was a new password (`use: 'temporary'`) | (none) | "Use the temporary password from your invitation." |
| The same, once a new password was saved in this attempt (`use: 'chosen'`) | (none) | "Use the password you chose: the temporary one no longer works." |
| The Email field on those two notices | empty | the kept address, as its value (nothing else on the page changes) |
| `/sign-in/hardware-key?reason=step_expired`, title and words (the key surface, 2.6) | "Start again" / "That sign-in step expired. Start again from your email and password." | "Sign-in step closed" / "That sign-in step closed. Start again with your hardware key." |
| `/sign-in/hardware-key?reason=restarted`, title and words | (none: a 404) | "Start again" / "Start again with your hardware key." |

**What a screen reader hears** (from the ARIA the tests assert; read by hand for audit #103, 5.1):

| Moment | Heard |
| --- | --- |
| A step page loads | its heading, "Step 1 of 2: Choose a password" on a numbered step (the `sr-only` ": " joins caption and name; `getByRole('heading', { name })` asserts it), then in reading order "This step stays open for 3 minutes.", the form; the empty status region says nothing and takes no space |
| The warning (polite, atomic, said once, never while hidden) | "This step closes within a minute. If you need more time, start again: your email is kept, and you type your password again. Start again, button" (and enrolment's or key registration's note before the button) |
| Zero | "This step has closed. Start again: your email is kept, and you type your password again. Start again, button" |
| Arrival on `/sign-in` after either | the focus on the notice: "Sign-in step closed. That sign-in step closed. Your email is filled in: type your password to start again. Use the password you chose: the temporary one no longer works."; Tab then reaches Email (filled) and Password (empty) |
| Arrival on `/sign-in/hardware-key` with either reason | the focus on the notice: "Sign-in step closed. That sign-in step closed. Start again with your hardware key." |
| The sentence's cue changing at the warning or at zero | nothing: it is not a live region; the region says it, once. Read line by line, the sentence says the current state |
| Documents' titles (`metadata`) | unchanged: the step's name only |

**Departures from the review's recommended words**, reported to the co-founder in one list as his ruling of
2026-10-25 asks (the ux-forms design's 9.3 form):

| Recommended (UX-012's Fix) | Taken instead | Why |
| --- | --- | --- |
| "This step closes in 1 minute." | "This step closes within a minute" (title) | The warning stays on screen for the whole minute; "in 1 minute" is false a second later, and changing it each second is the ticking count 2.4 rejects. "within" stays true until zero. "a minute", not "1 minute": the house's phrase (`lib/screening/sent.ts:28`), and it reads as speech where "within 1 minute" reads as a readout; counts of two or more stay digits ("within 2 minutes"). A title, so no full stop (the Alert's titles carry none); the sentence's cue (2.4) is a sentence, so it carries one |
| "Start it again to get more time." | "If you need more time, start again: your email is kept, and you type your password again." | Starting again does not add time to this step: it costs the password (and a new code) and keeps the email. Saying both is what lets a person decide; the house's clause form ("{instruction}: {what follows}") as in ADR 0077's words |
| A "Start again" button | A button, in a form whose action ends the step, styled as an outline button, with the same words | First taken as a link (no side effect); PR #92's review (SEC-01) showed the step must end when the person leaves it, so it is a POST, and a button is the element for one (2.6) |
| (none: UXS-03) | "This step closes within 2 minutes." on a page rendered after the step began | The open sentence would claim the full limit with less left; "within" with the minutes rounded up stays true while it is on screen, as the warning's title does; rounded down ("stays open for 2 more minutes") it would turn false while it stood, and changing it is the ticking count 2.4 rejects |
| "That sign-in step expired. Start again from your email and password." (today's, kept by the review) | "That sign-in step closed. …" and the kept-email and password lines | One verb for one event across the warning, the closed state and the notice; the person's email is now filled in, so "from your email" would be false |
| UX-128: "Step 1 of 2: choose a password" as a line | The caption "Step 1 of 2" over the heading, read with it as "Step 1 of 2: Choose a password" | The step's name said once (2.7); the screen reader hears the review's words |

### 6.2 Before and after screenshots

With `tools/lane-b-screen-tour` (on `claude/build-ops`), two runs, each on a fresh prepare with the populate project:
before `TOUR_REF=83d71fd6` (or the base the pull request is opened on), after `TOUR_REF` the pull request's head. Each
id at 1280 px light, 1280 px dark (tokens only) and 390 px light: the sample the README's "A pull request's shots"
asks for (every changed screen and state, the shared sign-in layout once, and UX-012's and UX-128's "Screens":
`sign-in-enroll.default`, `sign-in-mfa.default`, `sign-in-new-password.default`, `sign-in.reason-step-expired`,
`sign-in-enroll.error`).

| Id (`<key>.<variant>`) | Exists in the tour | What changes |
| --- | --- | --- |
| `sign-in.default` | yes (`tour.spec.ts:1105`) | nothing: the shared layout's control shot |
| `sign-in.reason-step-expired` | yes (`:1106-1116`) | "Sign-in step closed" and its words with no email kept (opened by its URL) |
| `sign-in-mfa.default`, `.error`, `.loading` | yes (`mfaShots`, `:1270-1305`) | the limit sentence before the form; the empty region takes no space |
| `sign-in-new-password.default`, `.error-mismatch`, `.error-policy`, `.loading` | yes (`invitedShots`, `:1307-1395`) | "Step 1 of 2" over the heading; the limit sentence |
| `sign-in-enroll.default`, `.error`, `.loading` | yes (`invitedShots`) | "Step 2 of 2"; the limit sentence above the setup key |
| `sign-in-register-key.default`, `.error`, `.loading` | yes (`registerKeyShots`, `:1397-1476`) | "This step stays open for 15 minutes." (the reviewer and support-expiry are enrolled staff with no key: no marker) |
| `sign-in.reason-restarted` | added (6.3 b) | the new reason's notice with no email kept (on the base: a 404, recorded as skipped) |
| `sign-in-hardware-key.reason-step-expired` | added (6.3 b) | "That sign-in step closed. Start again with your hardware key.", focused (review R-04); on the base, today's password words |
| `sign-in-mfa.warning`, `sign-in-mfa.closed` | added (6.3 c) | the warning and the closed state, with Start again |
| `sign-in.restarted-kept` | added (6.3 c) | Start again pressed during the warning: the notice focused, the email filled |
| `sign-in.step-expired-kept` | added (6.3 c) | a closed code step reloaded: the email filled, no password line |
| `sign-in.step-expired-temporary` | added (6.3 d) | a closed new-password step: "Use the temporary password from your invitation." |
| `sign-in-enroll.warning`, `sign-in-enroll.closed` | added (6.3 d) | with enrolment's notes about the setup key |
| `sign-in.step-expired-chosen` | added (6.3 d) | a closed enrolment: "Use the password you chose: the temporary one no longer works." |
| `sign-in-new-password.invited-staff` | added (6.3 e) | "Step 1 of 3" for an invited staff member |
| `sign-in-register-key.warning` | added (6.3 f) | "This step closes within 2 minutes" |

27 states, 81 ids. A dark id is taken for a state that is not a default only when `TOUR_ONLY` names it in full (the
README's "Dark for any state"), so `TOUR_ONLY` lists every id:

```bash
S='sign-in.default sign-in.reason-step-expired sign-in.reason-restarted sign-in-hardware-key.reason-step-expired sign-in.restarted-kept sign-in.step-expired-kept
sign-in.step-expired-temporary sign-in.step-expired-chosen sign-in-mfa.default sign-in-mfa.error sign-in-mfa.loading
sign-in-mfa.warning sign-in-mfa.closed sign-in-new-password.default sign-in-new-password.error-mismatch
sign-in-new-password.error-policy sign-in-new-password.loading sign-in-new-password.invited-staff sign-in-enroll.default
sign-in-enroll.error sign-in-enroll.loading sign-in-enroll.warning sign-in-enroll.closed sign-in-register-key.default
sign-in-register-key.error sign-in-register-key.loading sign-in-register-key.warning'
export TOUR_ONLY=$(for s in $S; do printf '%s.1280,%s.1280-dark,%s.390,' "$s" "$s" "$s"; done | sed 's/,$//')
```

The new states have no "before": on the base each is recorded in `skipped` with the reason the step gives (no timer, a
404, an email not kept, a persona not seeded), which is the before. Tiles with `tile.py`, a private gallery per run and
width (`tools/lane-b-screen-gallery`); PNGs and tiles never go on a branch. Of `sign-in-hardware-key.*` only the
step-expired notice is in the sample: nothing else on it changes (its `key` step is enforced, not stated, 2.1).

### 6.3 The tour's additions (committed later on `claude/build-ops`, not by this pull request)

All in `tools/lane-b-screen-tour/capture/tour.spec.ts`, as it stands at `/home/user/ops` today, plus the route map.
Synthetic personas only; no step consumes a code, saves a password or registers a key that the tour did not already.

**(a) A `clock` option on `cap()`, and `toStepPhase`.** In `interface Cap` (`:707-719`), after `act`:

```ts
  /**
   * Installs Playwright's fake clock in the page (page.clock.install()) before its first navigation, so `act` can move
   * the page's own timers forward (a sign-in step's warning and closed state, UX PR 6; ADR 0081). Installed, it runs on
   * from real time until moved; the server's clock and the cookies stay real.
   */
  readonly clock?: boolean;
```

In `cap()` (`:730-752`), inside the `try`, before `go(...)`:

```ts
        if (c.clock === true) await page.clock.install();
```

After `refused()` (`:590-592`):

```ts
/**
 * Moves a sign-in step's page clock (installed before its navigation) forward ten seconds at a time until the step's
 * timer shows the phase, for at most 1,000 seconds (key registration's 15 minutes). Before co-001/ux-sign-in-time a step
 * has no timer, so the shot is skipped with that reason.
 */
async function toStepPhase(page: Page, phase: 'warning' | 'closed'): Promise<void> {
  const timer = page.locator('[data-slot="step-timer"]');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  if ((await timer.count()) === 0) throw new Error(`${shown(page)} states no time limit (before co-001/ux-sign-in-time, ADR 0081)`);
  await expect(timer).toHaveAttribute('data-phase', /^(open|warning|closed)$/);
  for (let moved = 0; moved < 1_000 && (await timer.getAttribute('data-phase')) !== phase; moved += 10) {
    await page.clock.fastForward(10_000);
  }
  await expect(timer).toHaveAttribute('data-phase', phase);
}

/** The sign-in page's Email field holds the persona's address, kept from a step that closed or was started again. */
async function emailKept(page: Page, persona: string): Promise<void> {
  await expect(page.getByLabel('Email')).toHaveValue(personaEmail(persona));
}
```

`fastForward` fires each due timer at most once, so the step's one-second check runs once per jump and sets the phase
from the time left; ten-second jumps overshoot the warning by at most ten seconds, still inside it.

**(b) The new reason by its URL.** The loop at `:1106` becomes `for (const reason of ['idle', 'step_expired',
'restarted'])` (id `sign-in.reason-restarted`; `replace('_', '-')` leaves it as it is). The hardware-key page's loop
(`:1156`) becomes `for (const reason of ['key_registered', 'hardware_key_required', 'step_expired'])`, giving
`sign-in-hardware-key.reason-step-expired`, the key surface's words (2.6, review R-04); on the base it shows today's
password words, which is its before.

**(c) The code step's states and the sign-in page after them**, in `test('public pages and sign-in')` right after
`await mfaShots(browser);` (`:1149`). The persona is `time-mfa`, added by this pull request (4.4): on the tour's
database no spec signs it in (the populate project runs the seven specs the README names, never
`sign-in-time.spec.ts`), so its eight sign-ins here stay far inside the `sign_in` account limit (20 per 15 minutes,
`lib/http/rate-limit.ts:39`), which `billing-manager`, signed in by the populate specs and `mfaShots`, might not. On the
base it does not exist, and the shots are skipped as the step fails:

```ts
  // UX PR 6 (co-001/ux-sign-in-time; ADR 0081): the code step's warning and closed state on the page's own clock, and the
  // sign-in page after Start again and after a step closed, the email kept. time-mfa is this PR's persona: no code is
  // consumed, and nothing else signs it in on the tour's database.
  for (const phase of ['warning', 'closed'] as const) {
    await cap(browser, {
      key: 'sign-in-mfa',
      route: R.mfa,
      persona: null,
      path: R.signIn,
      clock: true,
      state: `interaction:${phase}`,
      note: phase === 'warning' ? 'A minute before the code step closes; the page’s clock moved forward, the server’s real.' : 'The code step closed; the page’s clock moved forward, the server’s real.',
      act: async (page) => {
        await enterPassword(page, 'time-mfa');
        await expect(page).toHaveURL(/\/sign-in\/mfa$/);
        await toStepPhase(page, phase);
      },
    });
  }
  await cap(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: R.signIn,
    clock: true,
    state: 'interaction:restarted-kept',
    note: 'Start again pressed during the code step’s warning: the notice focused, the email kept, the password empty.',
    act: async (page) => {
      await enterPassword(page, 'time-mfa');
      await expect(page).toHaveURL(/\/sign-in\/mfa$/);
      await toStepPhase(page, 'warning');
      await page.locator('[data-slot="step-timer"]').getByRole('link', { name: 'Start again' }).click();
      await expect(page).toHaveURL(/\/sign-in\?reason=restarted$/);
      await emailKept(page, 'time-mfa');
    },
  });
  await cap(browser, {
    key: 'sign-in',
    route: R.signIn,
    persona: null,
    path: R.signIn,
    state: 'interaction:step-expired-kept',
    note: 'A code step past its limit, reloaded once its step cookie is gone (deleted here, as the browser does at its Max-Age): the email kept.',
    act: async (page) => {
      await enterPassword(page, 'time-mfa');
      await expect(page).toHaveURL(/\/sign-in\/mfa$/);
      await page.context().clearCookies({ name: 'tp_sign_in' });
      await page.reload();
      await expect(page).toHaveURL(/\/sign-in\?reason=step_expired$/);
      await emailKept(page, 'time-mfa');
    },
  });
```

**(d) The invited persona's states**, in `invitedShots` (`:1307-1395`). Its id list `all` (`:1310-1315`) gains
`...['step-expired-temporary', 'step-expired-chosen'].flatMap((variant) => WIDTHS.map((width) => `sign-in.${variant}.${String(width)}`))`
and `...['warning', 'closed'].flatMap((variant) => WIDTHS.map((width) => `sign-in-enroll.${variant}.${String(width)}`))`,
and a `const signInMeta = (variant: string, note: string): Meta => ({ key: 'sign-in', variant, state: `interaction:${variant}`, route: '/sign-in', role: 'invited', note });`
beside `npMeta`. Then:

- After the new-password refusals' loop (`:1337-1354`), before the pending shots, from copies of the browser, so the
  live step stays for the shots after it:

```ts
      for (const width of WIDTHS) {
        await attempt([`sign-in.step-expired-temporary.${String(width)}`], '/sign-in', async () => {
          const copy = await browser.newContext({ ...(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT), storageState: await context.storageState() });
          phonesOpen.push(copy);
          await copy.clearCookies({ name: 'tp_sign_in' });
          const view = await copy.newPage();
          await view.goto(np);
          await expect(view).toHaveURL(/\/sign-in\?reason=step_expired$/);
          await emailKept(view, 'invited');
          await snap(view, signInMeta('step-expired-temporary', 'A new-password step that closed (a copy of the browser with its step cookie gone): the email kept, and the temporary password named.'));
        });
      }
```

- Right after the two enrolment default shots (`:1371-1375`), before its pending and refusal shots, so both run well
  inside the step's 3 minutes, which count from the saved password:

```ts
      for (const view of [page, enrollPhone]) {
        const width = String(view.viewportSize()?.width);
        await attempt([`sign-in-enroll.warning.${width}`, `sign-in-enroll.closed.${width}`], en, async () => {
          await view.clock.install();
          await view.goto(en);
          await toStepPhase(view, 'warning');
          await snap(view, enMeta('warning', 'interaction:warning', 'A minute before enrolment closes; the page’s clock moved forward, the server’s real.'));
          await toStepPhase(view, 'closed');
          await snap(view, enMeta('closed', 'interaction:closed', 'Enrolment closed: the setup key no longer works.'));
          await view.goto(en);
        });
      }
```

- After the enrolment refusals' loop (`:1376-1389`), last in the function:

```ts
      for (const view of [page, enrollPhone]) {
        const width = String(view.viewportSize()?.width);
        await attempt([`sign-in.step-expired-chosen.${width}`], '/sign-in', async () => {
          await view.context().clearCookies({ name: 'tp_sign_in' });
          await view.goto(en);
          await expect(view).toHaveURL(/\/sign-in\?reason=step_expired$/);
          await emailKept(view, 'invited');
          await snap(view, signInMeta('step-expired-chosen', 'Enrolment closed after the new password was saved: the email kept, and the chosen password named.'));
        });
      }
```

**(e) An invited staff member's first step**, after `invitedShots(browser)` in the same test, with `time-staff` (this
pull request's internal, invited persona), which reaches the new-password step and never saves, so it repeats on any
database:

```ts
  await cap(browser, {
    key: 'sign-in-new-password',
    route: R.newPassword,
    persona: null,
    path: R.signIn,
    state: 'interaction:invited-staff',
    note: 'An invited staff member’s first setup step of three (the password is not saved).',
    act: async (page) => {
      await enterPassword(page, 'time-staff');
      await expect(page).toHaveURL(/\/sign-in\/new-password$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Step 1 of 3: Choose a password' })).toBeVisible();
    },
  });
```

**(f) Key registration's warning**, in `registerKeyShots`, from support-expiry, who never registers: `errorIds`
(`:1443`) is joined by `const warnIds = ['sign-in-register-key.warning.1280', 'sign-in-register-key.warning.390'];` and
the early return reads `if (![...errorIds, ...warnIds].some(wanted)) return;`; the outer `attempt` takes
`[...errorIds, ...warnIds]`; and right after its `if (!/\/sign-in\/register-key$/ …) throw` line (`:1451`):

```ts
      for (const width of WIDTHS) {
        await attempt([`sign-in-register-key.warning.${String(width)}`], route, async () => {
          const copy = await browser.newContext({ ...(width === 1280 ? DESKTOP_CONTEXT : PHONE_CONTEXT), storageState: await bare.storageState() });
          try {
            const view = await copy.newPage();
            await view.clock.install();
            await view.goto(route);
            await toStepPhase(view, 'warning');
            await snap(view, meta('warning', 'interaction:warning', 'support-expiry', 'Two minutes before key registration’s 15 minutes end; the page’s clock moved forward, the server’s real. The copy registers nothing.'));
          } finally {
            await copy.close();
          }
        });
      }
```

**(g) The route map** (`designs/lane-b-ux-review/route-map.json`), each change marked "[co-001/ux-sign-in-time, PR
sample]" as the forms PR marked its own: in `/sign-in/mfa`'s and `/sign-in/enroll`'s states, "within 5 minutes" and
"wait out the 5 minutes" become "within the step's 3 minutes (ADR 0081)"; interactions added: `/sign-in` "reason
restarted by URL; Start again during a code step's warning (restarted-kept); a closed code step, new-password step and
enrolment with the email kept (step-expired-kept, -temporary, -chosen)"; `/sign-in/mfa` and `/sign-in/enroll` "warning
and closed on the page's own clock: `cap`'s `clock`, `toStepPhase`"; `/sign-in/new-password` "an invited staff member's
Step 1 of 3 (time-staff)"; `/sign-in/register-key` "the warning two minutes before 15, from a copy of support-expiry's
browser". Its `personas` lists gain `time-mfa` (`/sign-in`, `/sign-in/mfa`) and `time-staff` (`/sign-in/new-password`).

**(h) The README**, under "A pull request's shots", one bullet: "A sign-in step's time limit (UX PR 6,
co-001/ux-sign-in-time): the warning and closed states move the page's own clock (`cap`'s `clock`, `toStepPhase`); on a
ref before it they are recorded as skipped ('states no time limit'). The kept-email states delete the step cookie as the
browser does at its Max-Age."

---

## 7. No migration; proposals outside the PR

### 7.1 No migration, no infrastructure, no Cognito setting

Nothing here touches `packages/db`: no table, column, function, policy, grant or seed function changes. What is new is
state the browser holds (two sealed cookies, one of them new) and a module of constants; the lock count
(`failed_sign_ins`), the audit events and the session tables are unchanged, and an expiry writes nothing. The four
personas are rows `pnpm db:seed` already knows how to make (`apps/web/scripts/synthetic-personas.ts`, through
`packages/db/src/seed.ts`'s existing code). `docs/product/domain-model.md` is not regenerated and needs no approval
line; no file of `packages/db/migrations` or `content/releases` is touched. Nothing in `infra/` changes: the 3 and 15
minutes are read from `infra/lib/constructs/identity.ts:11` and `:14` as text by a test (2.1), never set. So this is not
a schema pull request, Lane B may build it, and nothing is left for Lane A that this pull request needs.

### 7.2 Proposals (outside this PR's files; improve as you go)

1. **For Lane A: the stale "three days" comment.** `infra/lib/constructs/identity.ts:41-42` (`:45-46` on #42's head
   `be63bdc2`) says temporary passwords "expire after three days"; `:82` (`:89`) sets
   `tempPasswordValidity: Duration.days(INVITATION_DAYS)`, and `INVITATION_DAYS` is 7 (`:23`, mirrored by
   `packages/db/src/schema/onboarding.ts:119` and pinned by `lib/auth/primitives.test.ts:75`). A one-word fix ("seven
   days", or "the invitation's `INVITATION_DAYS`") in #42's file, so #42's next push or Lane A takes it; this PR does not.
2. **UX PR 66 (`co-001/ux-sign-in-session`, after #42): the 15-minute Cognito session, a security trade-off for the
   founder.** It sets `authSession: Duration.minutes(15)` (`identity.ts:14`) and its pin
   (`infra/test/identity.test.ts:109`, `:116` on `be63bdc2`), and moves this PR's constants: `PROVIDER_CHALLENGE_SECONDS`
   to 900 and the pending cookie to 15 minutes on new password, enrolment and key registration, 5 on the code step
   (its file list should name `lib/auth/step-limits.ts`, not `pending.ts`; 3.5). For it: enrolment fits a person who
   types a 32-character key on a phone (UX-012's case), and 2.2.1's gap narrows. Against it: Cognito's session is the
   window in which a password already proven can be followed by a code, and a longer window gives whoever holds a
   stolen password more time per challenge; the ten-failure lock and the `mfa` bucket (10 per 5 minutes) bound the
   guesses, not the time. **Recommended, the safer of the two settings that still fixes enrolment:** 15 minutes at
   Cognito, with the app closing the code step at 5 minutes through `stepSeconds` (this PR's hook, 2.2), so only the
   setup steps, which exist only for an account with no second factor yet, get the longer time. The review's 6.1 calls
   15 the less strict setting; the founder rules on it with that PR's security review.
3. **For combined audit #103: WCAG 2.2.1's residue** (2.9; ADR 0081 D8). Add to its manual checks: 2.2.1 met in part on
   the four timed steps (no turn off, no adjust, no extend, by Cognito), before and after UX PR 66; the warning heard
   once and politely, never cutting into typing, with NVDA and JAWS on Chrome and VoiceOver on Safari (macOS and iOS);
   the arrival notice read on `/sign-in` after both reasons; 3.3.7 on a restart (the email filled); and 3.3.8 on
   enrolment's transcription, until UX PRs 20 and 86. SGN-02 and SGN-03 are its first cases for 2.2.1 and 3.3.7, as
   FRM-01 and FRM-07 were for 3.3.7.
4. **The account-enumeration leaks that exist today** (2.11): `SignInFlow.start` answers `locked` and
   `invitation_expired` before the password is checked (`lib/auth/sign-in.ts:164-177`), which tells anyone who types
   an address that it is locked or invited. Checking the password first changes the lock's semantics (a locked account
   would then reach the provider) and the generated route tests, so it is its own change with the security reviewer,
   not this PR's.
5. **`__Host-` for every house cookie.** Each already meets its rules (Secure, `Path=/`, no `Domain`; `next.ts:25`,
   `handler.ts:47-49`), and the prefix stops a sibling subdomain from setting one. Renaming them all signs everyone
   out once and touches `docs/product/sessions.md` and #42's `http.test.ts`, so one change for all of them, after #42;
   this PR's new cookie follows the house (2.6).
6. **UX PR 64 (`co-001/ux-sign-in-words`): arrival focus for every sign-in reason.** This PR focuses the notice for
   `step_expired` and `restarted` only (2.6); `signed_out`, `idle`, `ended`, `device_revoked` and the rest have the
   same need. `ArrivalFocus` is the hook.
7. **A check in Lane A's staging of Cognito's session on enrolment** (2.2; ADR 0081 "Not verified here"): whether
   `AssociateSoftwareToken`'s new session restarts the 3 minutes. If it does, enrolment could state a little more than
   it does; the app's start, taken before the first call, stays right either way.
8. **One minutes helper.** `minutesWords` (`lib/http/download-refusal-words.ts:69`) and `counted(n, 'minute')`
   (`lib/copy/words.ts:9-11`) give the same words; `minutesWords` could return `counted(minutes, 'minute')`. Both
   modules import nothing, so it stays client-safe; a one-line change in #78's file, for whichever PR next edits it.
9. **The stale `key` step's restart** sends a staff member to the password page (`components/hardware-key.tsx:91-95`;
   `lib/routes/sign-in.ts:306-308`): UX PR 7 lists `hardware-key.tsx` and takes it (3.5).
10. **UX PR 64: the two bare "Start again." refusals** (critic C-09). `runSignInStep`'s own final refusal, "Sign-in could
   not continue. Start again." (`lib/http/next.ts:238`), and the hardware-key ceremony's "The sign-in step was refused.
   Start again." (`components/hardware-key.tsx:23`) tell a person to start again with no link and no word on the email;
   on a timed step the region's Start again link sits below them. Making both say where to go (and link to
   `/sign-in?reason=restarted`, which keeps the email) is UX PR 64's wording; this PR leaves both files alone (`next.ts`
   is #74's and unchanged here, 2.8; `hardware-key.tsx` is PR 7's).

---

## 8. Risks, and what holds each

| Risk | Hold |
| --- | --- |
| The browser's count runs early or late (a sleeping laptop, a clock set back or forward, a throttled background tab) | The server decides: `pendingOf` refuses at the limit whatever the page shows (2.2); the browser takes the smaller of two clocks and re-checks on `visibilitychange`, `pageshow` and `focus` (2.4); harness tests 4 to 6 (4.3) and `timeLeft`'s unit test |
| The app closes a step the provider would still take | Only by the length of the provider call, since `at` is taken before it (2.2), on the safe side; SGN-01's server test presses at `t0 + 179 s` and reaches the provider |
| UX PR 66 moves Cognito and not the constant, or the reverse | `step-limits.test.ts` reads `identity.ts`'s text and fails until both move (2.1) |
| #42 reformats the two lines the pin reads | Re-read on its head `be63bdc2`: unchanged at `:11` and `:14`; if a later push changes them the pin fails loudly in whichever PR merges second, which updates the expected text |
| A rolling deploy mixes releases: an old one reads a new step, or a new one reads an old step | The added properties ride on the same seal purpose and shape (2.2); a step with no stamp is left to the provider; `pending.test.ts` test 2 and `sign-in-routes.db.test.ts` test 3 |
| The kept email is seen at a shared computer | Filled only on `step_expired` and `restarted`; ended by any first step, a session, a lock or the hardware-key page; at most 18 minutes (30 on key registration); never for the hardware-key step; the residual is accepted with reasons (2.11) |
| A change makes the first step's answers differ by address (enumeration) | Both cookies cleared alike for an unknown address and a wrong password; the kept email written only after the password; SGN-03's enumeration test compares the written names and the data (4.2 test 6) |
| A polite region is not announced by a screen reader | The region exists, empty, from the first render, and only its text changes (scout-timer 1.3, the pattern `PendingStatus` uses); the e2e asserts the ARIA; the manual check is audit #103's (7.2 item 3) |
| The warning interrupts typing or moves the page | Below the form and outside it; no focus call; harness tests 2 and 3 compare the active element, its value and the boxes before and after |
| A lock reached during the warning leaves the timer counting | Accepted (2.8): its words stay true, and Start again leads to "Account locked" on the first step |
| The real 3-minute e2e test is slow or flaky | One test in its own file and worker, waiting on `data-phase` events with bounds (never a sleep), with a 300 s timeout beside suite tests of 300 to 480 s (`layout-1280.spec.ts:132`); every other time test uses `page.clock` or deletes the step cookie |
| `page.clock` disturbs TOTP or the server | Codes are computed by the test from Node's real clock; the server's clock and the cookie store are real (4.4) |
| At 390 px with the on-screen keyboard up, the warning below the form is out of view, today on every step and more so once UX PR 86's QR code makes enrolment taller (review R-03) | The sentence's cue above the work changes with the phase in a cell sized from the first render (2.4); harness test 10 and e2e tests 1 and 3 assert it in view at 390 by 500 px with the field focused; the polite status is announced wherever it is; Start again under the keyboard is recorded in 2.9 for audit #103; PR 86 re-runs the same assertions (3.5) |
| A rolling deploy: a Start again link served by a new task is answered by an old one (review R-08) | The old task's `reasonParams` refuses `restarted` (`lib/routes/sign-in.ts:38`) and shows a 404; and an old task's `settle` does not clear `tp_sign_in_email` when a session opens. Both are bounded by one deploy window, and the cookie by its own life (18 minutes, 30 on key registration); the person reaches `/sign-in` from the 404's link and types the email. Accepted: no code change |
| An active staff member who has a key but whose authenticator was reset outside the app is shown "Step 1 of 2" on enrolment and then sent to the key sign-in (review R-14) | No code in the app resets a factor (checked by grep at `83d71fd6`), and TOTP enrolment always comes before key registration (`lib/auth/sign-in.ts:136-151`), so the state needs an operator to clear the authenticator in the user pool by hand. Accepted: the key page's notice ("Your role signs in with a hardware key", `notice.tsx:15`) says what follows. Numbering only invited accounts would drop the true "Step 1 of 2" for an active staff member with neither factor |
| #85 and this PR both edit the forms harness | Hunks kept apart (3.6); the PR merged second takes the base in by a merge and keeps both, then runs the browser project |
| The shared documents (test matrix, `matrix.ts`, `registry.ts`) conflict with #42, #75, #82, #83, #84 and #85 | LANES.md rule 6: the PR merged second keeps both; SGN goes after whichever module merged last, and `fixtures.test.ts` holds the matrix and `matrix.ts` identical |
| UX PR 7 and this PR edit the same sign-in files | 3.5's hooks and hunks; PR 7 is built on this PR's merged branch, and amends ADR 0081 rather than writing its own |
| A step added to `Pending` later gets no limit | `StepName` is `Pending['step']` and the lengths are `Record<StepName, number>` tables (2.1), so the typecheck fails until the step has its lengths |
| The tour's invited enrolment shots outlast the step's 3 minutes | The warning and closed shots are taken first after the defaults (6.3 d); a late step is recorded as skipped with its reason, and a fresh prepare retakes it |
| A test knob for time leaks into production | None is added (2.10); production builds its services with the real clock (`lib/server/services.ts:183`), and the dev provider runs in a production build only under the e2e flag (`playwright.config.ts:126`) |
| The screening-capacity gate runs on this PR (it changes watched files, and adds `step-limits.ts` to the list; critic C-02) | The change on the screening's path is a module of constants and two cookie helpers per sign-in, no query and no job; the gate measures as it did for #78, and a red gate is read before the merge, never waived |
| Building in four slices against interfaces written here | Section 2's types are the contract; the branch typechecks and tests once all four are in, before review |

---

## 9. Review and dispositions

The design review (`designs/lane-b-ux-sign-in-time/review.md`, 2026-11-01, two lenses: security and UX/brand) found no
blocking finding; five should-fix and ten nits. Two skeptics then checked each finding against the code. Each was
decided on the code at `83d71fd6` (read again for this revision; #42 re-read from the REST API: open, head `be63bdc2`,
219 files, and none of the files this revision adds is #42's). The scouts' facts stand: the code contradicted none of
them.

| Id | Severity | Skeptics | Disposition | Where in the design |
| --- | --- | --- | --- | --- |
| R-01 | should-fix | upheld by both | **Applied.** Confirmed in the code: `newPassword` saves the password before returning `mfa_setup` (`lib/auth/sign-in.ts:185-193`), and `settle`'s `beginTotpSetup` call (`lib/routes/sign-in.ts:93-98`) can answer `expired` into the branch that keeps the kept email. The pending branch now writes the kept email, with `use: 'chosen'` once `passwordSaved`, before `beginTotpSetup` | 2.6 "Which password"; 3.1 `lib/routes/sign-in.ts`; 4.2 test 5b |
| R-02 | should-fix | upheld by both | **Applied.** Start again is one JSX position in both phases, no `key`, no branch; harness test 2b holds the node as `document.activeElement` across zero | 2.6 "Start again is a link"; 4.3 test 2b |
| R-03 | should-fix | upheld by both | **Applied, and improved.** The estimate confirms it: on the code step at 390 px the region starts near 515 px, under the keyboard. Reserving space below the form would not bring it into view, so the limit sentence above the work, in view whenever the field is, shows the phase in a cell sized from the first render (no move, not announced); asserted at 390 by 500 px with the field focused; the region above the form, scrolling and a bottom-pinned box are recorded as rejected; Start again under the keyboard is recorded for audit #103 | 2.4 "The visible cue"; 2.9; 2.10; 4.3 tests 3 and 10; 4.4 tests 1 and 3; 5.1 D4; 6.1; 8; 3.5 (PR 86) |
| R-04 | should-fix | upheld by both | **Applied.** `hardware-key/page.tsx` is named in slice C; `SignInNotice({ reason, kept, surface })` with `kept` and `surface` optional; the key surface says "That sign-in step closed. Start again with your hardware key."; recorded as UX PR 7's starting point; a notice unit test and a tour state (`sign-in-hardware-key.reason-step-expired`, a change on the reviewer's "no new id": the words change, so the sample shows them) | 2.6 "The hardware-key page"; 3.3; 3.5; 4.1 `notice.test.tsx`; 4.5 SGN-03; 6.1; 6.2; 6.3 (b) |
| R-05 | should-fix | upheld by both | **Applied.** Confirmed: `enroll/page.tsx:24`'s `flex flex-col gap-4` and `alertVariants`' `border px-4 py-3` (`alert.tsx:6`). `StepTimer` renders a frame, an inner `flex flex-col gap-4` column (the sentence and the children) and then the region as a plain block with no box classes and no margin until `warning` or `closed`; never `hidden`, `display: none` or `visibility: hidden`; height 0 while open, asserted | 2.4 "Its boxes"; 3.3 enrolment; 4.1 test 3; 4.3 test 3 |
| R-06 | nit | contested by 1 | **Answered: wording kept.** The skeptic holds on the code: brand.md and BRAND.md set no rule of digits in prose (`brand.md:36` and `BRAND.md:123` are about figures in mono), and the house already writes "usually within a minute" (`lib/screening/sent.ts:28`). What the reviewer found was a misstatement of the rule in 6.1; that is corrected (counts of two or more and stated limits as digits through `counted()`; "a minute" in the warning, listed as a departure with its reason) | 6.1 intro and departures |
| R-07 | nit | upheld by both | **Applied.** ADR 0077's Status (`:3-5`) adds "amended by [0081](…)", as 0056's names 0058, 0077 and 0078; a hunk apart from `:142-150` | 3.4; 5.3 |
| R-08 | nit | upheld by both | **Applied.** A risk row: an old task 404s `?reason=restarted` and does not clear the kept email at a session; bounded by one deploy window and the cookie's 18 (30) minutes; no code change | 8 |
| R-09 | nit | upheld by both | **Applied.** On a full page load (no anchor yet for this `closesAt`, and the navigation entry names the current URL) the anchor subtracts `performance.now() - responseStart`, which can only err early; a client navigation stays uncorrected, with its bound stated | 2.4 "Render-to-mount latency" |
| R-10 | nit | contested by 2 | **Answered: no proposal.** Both skeptics hold on the code: `tp_sign_in` already seals the same address (`lib/auth/sign-in.ts:45-50`); `legal-surfaces.md` lists counsel-owned wording and the non-essential `pw_first_touch` (`:25`), and no strictly necessary cookie (`tp_sign_in`, `tp_session`, `csrf`). The new cookie adds no category of data or purpose; any list of strictly necessary cookies is the privacy notice's (#51) across all of them. Recorded in the security analysis | 2.11 "Disclosure" |
| R-11 | nit | contested by 1 | **Applied, with the skeptic's point met.** The skeptic is right that a derived type over today's ternary (`pending.ts:15-17`) would let a new step fall into a default; but so would a written-out union over a ternary. The exhaustive hold is a `Record<StepName, number>` for each length, as `STEP_PAGES` does (`lib/routes/sign-in.ts:58-64`). So `StepName` is `Pending['step']` through an erased `import type`, the lengths are two such tables, and the `_same` check is gone; a step PR 7 adds fails the typecheck until it has its lengths | 2.1; 3.1; 3.5; 5.1 Consequences; 8 |
| R-12 | nit | upheld by both | **Applied.** `dev-provider.test.ts:83-90` moves its clock by `PROVIDER_CHALLENGE_SECONDS - 1` and then 1 s and is titled SGN-01; `step-limits.test.ts`'s duplicate test 4 is dropped; the file is in SGN-01's `assertedBy` | 3.1; 4.1; 4.5 registry; 4.6 |
| R-13 | nit | upheld by both | **Applied (the guard), not shared.** `ArrivalFocus` focuses only when the focus is on `body` or `null`, `RefusalTakeover`'s own guard (`components/action-form.tsx:158`). Sharing one primitive would mean changing `action-form.tsx` for one expression that lives inside `takesFocus` and the refusal registry | 2.6 "On arrival"; 3.2 |
| R-14 | nit | contested by 1 | **Answered: accepted, recorded.** The skeptic holds on the code: no code resets a factor (grep at `83d71fd6`), and TOTP enrolment always precedes key registration (`lib/auth/sign-in.ts:136-151`), so the state needs an operator to clear the authenticator in the user pool by hand. The proposed fix, numbering only invited accounts, would drop the true "Step 1 of 2" for an active staff member with neither factor | 2.7; 8 |
| R-15 | nit | upheld by both | **Applied.** The "Shown" row: the address appears once, as the Email field's value; the notice says it is filled in and never prints it, so it is never in a live region | 2.6 cookie table |

**The completeness critic** (2026-11-01, after the revision) checked the design against the queue entry, UX-012, UX-128,
`prs.json` order 6 and the item prompt (every requirement is covered; the queue's `sign-in.spec.ts` e2e is
`sign-in-time.spec.ts`, with its reason in 3.4), against the code at `83d71fd6` and the live REST state, and against what a
builder needs. Sections 1 to 9 are present, each of the 27 shot states has its capture (the tour's own, or 6.3 a to f),
every SGN row has its tests, and no file is in two slices. Fixed in place:

| Id | Gap | Fix | Where |
| --- | --- | --- | --- |
| C-01 | The harness page defines only a dozen utilities (`forms-harness.html`'s `<style>`), so harness tests 3, 9 and 10 would measure three phrases in three rows and a borderless region, not the app; and 2.4 named no classes for the cue | 2.4 names the classes (`grid`, `col-start-1 row-start-1`, `invisible`; the region `alertVariants` + `mt-4`); slice B gains `forms-harness.html` with exactly those utilities, in its `@layer utilities` | 2.4; 3.2 |
| C-02 | `step-limits.ts` joins the screening-capacity import closure (`pending.ts` and `dev-provider.ts` are watched, `watched-paths.txt:61`, `:64`), so `watched.test.ts` fails unless the generated list is regenerated; no slice named it | Slice A regenerates it with `watched.ts --write` (as #78 did, `53c7224f`, `f4b01073`); it is #42's, #75's, #83's and #84's, a generated file under LANES.md rule 6; the screening-capacity gate measures this PR | header; 3 intro; 3.1; 3.6 |
| C-03 | `client-boundary.test.ts` (`a0099fab`, #78's fix round) fails a server module that calls a `'use client'` export; the design exports `stepPhase`, `timeLeft` and the words from `step-timer.tsx` | Stated in slice B: only tests call them; pages render `<StepTimer>` with plain props | 3.2 |
| C-04 | The harness's `stepTimer` entry had no values when the page keys carry none, and `Harness.open`'s option type (`browser.ts:38`) was not named | Defaults (180,000 ms, a fixed synthetic `closesAt`, 180/60 s, the restart path); the interface gains `clock` | 3.2 |
| C-05 | Stale heads and lines: #82 merged (base `bce57f16`), #85 at `90ec40ab` with new harness hunks, #86 at `83167b8f`; the SGN anchors moved by #82's CI rows | Header note; 3.6 table and #85 hunk list; 4.5 anchors on both bases. Nothing outside the shared documents moved | header; 3.6; 4.5 |
| C-06 | SGN-01's server test said the dead step answers without asking the provider, but the dev provider also expires at 180 s, so the outcome alone could not show it | The test asserts `tp_sign_in` is not deleted: the provider's `expired` would have cleared it through `settle` | 4.2 test 1 |
| C-07 | The interfaces slices A and C meet at were loose: the kept-email helpers' signatures, `signInPage`'s data, `SignInNotice`'s `kept`, and whether `use` may be absent | Signatures written out in 2.6; `use` optional, absent where no password changed | 2.6 |
| C-08 | `advance` stamped `context.services.now()`, a `Date` (`lib/server/services.ts:57`), into the epoch-ms `startedAt`; `closesIn` subtracted a `Date` | `.getTime()` in both | 2.2 |
| C-09 | Two existing refusals say a bare "Start again." with no link (`next.ts:238`, `hardware-key.tsx:23`) | Outside this PR's files: proposal for UX PR 64 | 7.2 item 10 |

Not fixable here, for the orchestrator: C-02 edits a #42 file the task's list of permitted #42 files does not name; it is
a generated file that LANES.md rule 6 has every pull request regenerate (never a hand edit), and without it `pnpm test`
fails, so the design takes it and flags it.

**Improvements adopted beyond the findings' fixes, inside this design's scope:** the sentence's cue (R-03), in place of
reserving space below the form, which would not have brought the warning into view; the exhaustive length tables
(R-11), which hold what both the reviewer's and the skeptic's forms left open; the key surface's tour state (R-04).

**Nothing in this revision needs a migration, infrastructure, a Cognito setting or legal text.** The open questions
that are the founder's are unchanged from section 7.2: UX PR 66's 15-minute Cognito session (item 2, a security
trade-off, with its recommendation), the stale "three days" comment in `identity.ts` (item 1, for Lane A or #42), and
Lane A's staging check of `AssociateSoftwareToken`'s session (item 7). The privacy notice's treatment of strictly
necessary cookies stays with #51 and counsel (R-10).

**PR #92's review** (2026-11-01, on `e4e05a0d`: a security lens and a UX lens, then a skeptic on each finding, reading
the code). Three security findings and five UX findings; each skeptic's verdict and fix decided the disposition, its fix
taken where it was better. Applied in the worktree before the suite; no migration, no new dependency, no infrastructure
or Cognito change, and no #42 file.

| Id | Severity (reviewer → skeptic) | Disposition | Where |
| --- | --- | --- | --- |
| SEC-01 | blocking → should-fix | **Applied, the safer option.** Start again was a GET link that cleared nothing, so the step the person chose to leave (enrolment's setup key, the code's challenge, key registration's grant) stayed usable to its limit; at a shared computer a passer-by pressing Back during the warning's remaining minute or two could register their own key on a staff account. The skeptic narrowed the window (Start again appears only in the warning or once closed) but upheld it. Start again is now a POST: a form whose action, `restartStep`, runs the public route `sign_in.restart` (origin-checked, the `mfa` bucket by the pending step, no audit event), deletes `tp_sign_in`, keeps `tp_sign_in_email`, gives key registration's grant back (`SignInFlow.abandon`, the skeptic's "if cheap": one `release`, as every other exit of that step makes) and goes to `?reason=restarted`. Mechanism: a server action, not a route handler (the steps' own adapter, the registry test's rule, and the button works from the browser's form) and never a GET (prefetch, and a cross-site top-level GET under SameSite=Lax, would end someone's step). One JSX position in both phases (R-02 holds). Tests: the routes' database test (each step's page and press, and both key ceremonies, start again after it; the grant given back; the email kept), the harness (a button, no link, its action run once; the focused button kept across zero), the e2e (Start again during the warning, then Back and the step's address on new password and enrolment land on `step_expired` with no setup key) | 2.6; 2.10; 6.1; ADR 0081 D6, alternatives, consequences |
| SEC-02 | should-fix → nit | **Applied.** `settle`'s `no_account` (an account disabled or removed after a proven step) now calls `clearSignIn`; `key_not_registered` keeps the step. A database test primes a code step, disables the account, answers a valid code and finds both cookies gone and no email filled | 2.6 cookie table; ADR 0081 D6 |
| SEC-03 | nit → not a defect | **Not applied.** The skeptic holds on the code: only `newPassword` returns `invalid_password`, and its one caller (`chooseNewPassword`) always passes `from`; the two settle paths without `from` (the first step, `hardwareKeyOptions`) cannot receive it. A hypothetical later caller is UX PR 7's to type: the skeptic's narrower form (make `from` required for that action) is noted for it | 3.5 (UX PR 7) |
| UXS-01 | should-fix → not a defect | **Not applied.** The skeptic holds: the stale key step's redirect to `/sign-in?reason=step_expired` is the base's (the words then said "expired"), this PR adds no wrong instruction, and design 2.6 and 3.5 give the key surface's redirects to UX PR 7 by ruling. Its one residual nit is taken: the fix lives in `lib/routes/sign-in.ts` (`verifyHardwareKey`'s `RESTART` and `settle`'s `expired` when `from?.step === 'key'`), not `components/hardware-key.tsx`, for UX PR 7 with the finding's `KEY_RESTART`, a database test and the tour state reached by the flow | 3.5 (UX PR 7) |
| UXS-02 | should-fix → should-fix | **Applied, with the skeptic's correction.** The restart notice was a `role="status"` inside a focused wrapper, so a client navigation could read it twice. It is now `ArrivalNotice`: the Alert itself focused (`tabIndex={-1}`, the focus ring), with an explicit `role="note"` (the Alert's default would be `alert`), and no live region; every other reason stays a polite status with no focus. Tests: the notice's unit test (one role, a note, no status or `aria-live`, `tabindex="-1"` on the restart reasons only), the harness's arrival test, and the e2e's focused-notice checks. For audit #103's manual list: heard once after Start again and after a closed step's press, with VoiceOver and Safari and with NVDA and Chrome | 2.6 "On arrival"; ADR 0081 D6, Not verified here |
| UXS-03 | should-fix → should-fix | **Applied.** The first render now takes its phase from the server's `closesIn` for that request (the same props on server and browser, so no hydration change), and the open sentence states the limit only while `closesIn` is within five seconds of it (the time from challenge to page). Otherwise it says "This step closes within N minutes.", the minutes rounded up. The brief suggested rounding down; that would say "stays open for 2 more minutes" and turn false within the minute while the sentence stood still, so "within" and rounding up, the warning's own form, is the one that never claims more time than is left while it is on screen. The status stays empty until the browser's first count: no ticking clock and nothing said at load. Tests: the timer's unit test (fresh, five seconds in, 174.999 s, 120 s, 90 s, 60.001 s, 45 s in the warning, 630 s on key registration) and the harness (a mount 90 s from closing says "within 2 minutes", flips nothing and says nothing until the warning) | 2.3; 6.1; ADR 0081 D3 |
| UXS-04 | nit → nit | **Applied.** Key registration passes `notes`: "Starting again also asks for a code from your authenticator app." after the warning's and the closed words; the shared sentence is unchanged (on enrolment, code and new password no extra code is asked). The e2e asserts it at the warning | 6.1 |
| UXS-05 | nit → nit | **Applied, with the skeptic's riskier state.** The invited viewer's e2e asserts at 390 by 500 px, "New password again" focused, that the sentence's phrase stays in view during the warning, and again after two passwords that differ were refused (the summary between the sentence and the fields) | 4.4; ADR 0081 tests |
