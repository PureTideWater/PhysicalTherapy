# UX PR 7 (`co-001/ux-sign-in-recovery`): copy scout

Worktree read at df4daff7 (`/home/user/ux-sign-in-recovery`). Sources: `/home/user/ops/designs/lane-b-ux-review.md`
(UX PR 7 :254-265; UX-006 :1686-1708; UX-066 :2750-2767; section 6 wordings :1283, :1304, :1349), the sign-in-time
design `/home/user/ops/designs/lane-b-ux-sign-in-time.md` (2.6, 3.5, 6.1, 6.2, section 9 row UXS-01 :1837), #92's
body `/home/user/ops/approval-summaries/lane-b-ux-sign-in-time-pr92-body.md` (:103, :200),
`/home/user/ops/approval-summaries/lane-b-ux-sign-in-time-wip/sgn-verify-ux-UXS-01.md`, `.claude/rules/brand.md`,
`docs/brand/BRAND.md`, `docs/product/change-order-001.md:95` (CO-11), `apps/web/src/lib/copy/words.ts`,
`tools/brand-copy/scan.ts`, ADRs 0077 and 0081, `docs/product/test-matrix.md:395-407`,
`/home/user/ops/tools/lane-b-screen-tour/README.md`, its `capture/tour.spec.ts`, and the route map.

Path correction for the writer: the rate limiter is `apps/web/src/lib/http/rate-limit.ts` (the `sign_in` bucket at
`:39`: 30 per address per 5 min, 20 per account per 15 min), not `apps/web/src/lib/rate-limit.ts`.

---

## 1. The findings, whole

### UX-006 (C-005), quoted whole (review :1686-1708)

> ### UX-006 (C-005). No way back in for a person who forgets a password or loses an authenticator or hardware key: sign-in is a dead end
>
> - **Severity:** blocking. Harm area: task flow. Reach: 6 routes, 3 roles.
> - **Roles:** anyone signing in, organization administrator, operator.
> - **Screens:** `sign-in.default.1280`, `sign-in-mfa.default.1280`, `sign-in-hardware-key.default.1280`, `sign-in.error-locked.1280`, `account.devices.default.1280`, `settings.users.default.1280`.
> - **Routes:** `/sign-in`, `/sign-in/mfa`, `/sign-in/hardware-key`, `/account/devices`, `/settings/organizations/[organizationId]/users`, `/console/organizations/[organizationId]`.
> - **Evidence:** The sign-in page offers Continue, a hardware-key link, 'New here? Request an audit' and 'Trouble signing in? Check the service status' (`apps/web/src/app/sign-in/page.tsx:26-48`): no 'Forgot your password?'. The code step says nothing about a lost phone (`sign-in/mfa/page.tsx:20-25`). No password or second-factor reset exists anywhere in `apps` or `packages`. The locked notice says 'A platform administrator can unlock it.' (`sign-in/notice.tsx:17`) but no sign-in page names how to reach one: the support address is on `/status` and `/maintenance` only, and `/support` needs a session. The organization's administrator sees only active, invited or 'no MFA' (`settings/organizations/[organizationId]/users/page.tsx:69`); only the console has Unlock (`console/organizations/[organizationId]/page.tsx:155`), and nothing resets a second factor. The account area holds Devices, Notification preferences, Billing and Help (`apps/web/src/components/shell.tsx:281-294`), with no page to change a password, move the authenticator or add a second key. 'New here? Request an audit' sends an invited user, who is also new, to the prospect form. The user pool already allows email recovery (`infra/lib/constructs/identity.ts:84`), so a reset needs no infrastructure change.
> - **Rule:** `docs/product/PRD.md:256` (every error shown with a next step); `PRD.md:266` (Sign-in and MFA: a lockout implies an unlock path the person can reach)
> - **Fix:** Give every sign-in step a way forward, with the safer security choice at each point. (1) `/sign-in`: 'Forgot your password?' starts the identity provider's reset by email (Cognito ForgotPassword and ConfirmForgotPassword; the local store's equivalent), answers the same whether or not the address exists, is rate limited through the existing `sign_in` bucket (`apps/web/src/lib/http/rate-limit.ts:39`; a new bucket would edit that #42 file), records the security events `password_reset_requested` and `password_reset_completed` through `record_security_event()` (migration `20261015180000_tenancy_hardening.sql:90`; the purpose CHECK is a pattern, `20261015140500_audit_and_operations.sql:15`, so no DDL; the design confirms the function admits a request with no signed-in actor, or that event goes to Lane A), and still asks for the second factor afterwards. It is a new provider call (Cognito's public `ForgotPassword` and `ConfirmForgotPassword`, so no IAM change) through `AuthProvider` and its two implementations (`apps/web/src/lib/auth/provider.ts`, `cognito-provider.ts`, `dev-provider.ts`) and the sign-in service (`sign-in.ts`). (2) `/sign-in/mfa` and `/sign-in/hardware-key`: 'Lost your authenticator app? Write to <support address> from the address you sign in with. A platform administrator checks with your organization's administrator, resets your two-step verification, and you set it up again at your next sign-in.' The reset is the console's, beside Unlock (`unlockUser`, `apps/web/src/lib/routes/console.ts:579`): 'Reset two-step verification', platform administrator only, hardware-key session, audited, ending the person's sessions and emailing them. The authenticator lives in Cognito (`cognito-provider.ts:221,239`; the pool requires MFA, `infra/lib/constructs/identity.ts:71`), so the reset is Cognito's `AdminSetUserMFAPreference` plus `user.mfa_enrolled` set false (already granted to the app and admitted for a platform administrator: `packages/db/migrations/20261015140000_tenancy.sql:599`, policy at :509). The web role may make three Cognito admin calls only (`infra/lib/constructs/application-role.ts:14`, pinned by `infra/test/application-role.test.ts:20`), so the call needs a new grant, put on the narrowest role that can hold it: the security reviewer chooses at design between the web task's role and a worker job's (recommended: the worker's, so the internet-facing task cannot strip a factor by itself). `console.ts`, both infra files and the mail it sends are #42's, so this part lands after #42 merges. A lost hardware key has no administrator path: keys are Cognito passkeys, listed and registered with the person's own token (`cognito-provider.ts:284-299`), and Cognito offers an administrator no call to delete one. So a second registered key (part 4) is the recovery for staff, and otherwise a re-invitation; the help line never promises a key reset. (3) Users and roles shows 'Locked' to the organization's administrator, with 'Ask PaidWhole support to unlock'. (4) An account page 'Sign-in and security': change password, replace the authenticator (current code first), add a second hardware key for staff. Each of these Cognito calls needs the person's own access token, which sign-in revokes once the app's session opens (`apps/web/src/lib/auth/sign-in.ts:139-153` calls `provider.release`, `cognito-provider.ts:309-313`), so the page starts with a re-authentication step: the password and a code again, through the provider, for a fresh token used only for that change. (5) Replace the sign-in help line (taken under the co-founder's ruling): 'Invited by your organization? Use the email and temporary password from your invitation. Forgot your password? Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign in with your second key. New to PaidWhole? Request an audit. Service status.' Land the sign-in pages and words first; the account menu link waits for #42 (`shell.tsx`).
> - **Size:** L.
> - **Files:** `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/app/sign-in/mfa/page.tsx`, `apps/web/src/app/sign-in/hardware-key/page.tsx`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/app/sign-in/forgot-password/page.tsx` (new), `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/lib/auth/provider.ts`, `apps/web/src/lib/auth/cognito-provider.ts`, `apps/web/src/lib/auth/dev-provider.ts`, `apps/web/src/lib/auth/sign-in.ts`, `apps/web/src/lib/auth/dev-store.ts`, `apps/web/src/app/account/security/page.tsx` (new), `apps/web/src/lib/routes/account.ts`, `apps/web/src/app/console/organizations/[organizationId]/page.tsx`, `apps/web/src/lib/routes/console.ts`, `infra/lib/constructs/application-role.ts`, `infra/test/application-role.test.ts`, `apps/web/src/components/shell.tsx`.
> - **Migration:** no.
> - **#42:** yes: `apps/web/src/lib/routes/console.ts`, `infra/lib/constructs/application-role.ts`, `infra/test/application-role.test.ts`, `apps/web/src/components/shell.tsx` (that part after #42 merges)
> - **In flight:** no.
> - **Proposed PR:** UX PR 7 `co-001/ux-sign-in-recovery` (parts (1), (5) and (2)'s line: the password reset, the help line, and the lost-factor line on the code and key steps); UX PR 8 `co-001/ux-account-security` (part (4): the Sign-in and security page, with its re-authentication step); UX PR 65 `co-001/ux-second-factor-reset` (part (2)'s console reset, its IAM grant and its email); UX PR 67 `co-001/ux-header-menus` (the account menu's Sign-in and security link); UX PR 75 `co-001/ux-users-page` (part (3): the Locked badge with 'Ask PaidWhole support to unlock').
> - **Sources:** `flows-other-02`, `words-other-06`.
> - **Verification:** confirmed
> - **Notes:** Chosen: flows-other-02's full recovery, with words-other-06's words as the first part (they must not promise a reset before it exists). Security choice (the co-founder's ruling: the safer): the second-factor reset stays with a platform administrator, not the organization's administrator, so one compromised customer account cannot strip a colleague's second factor. That also keeps it migration-free: `unlock_user` (`packages/db/functions/unlock_user.sql`) and the user table's update policy already admit a platform administrator only; letting an organization's administrator unlock or reset would need a new SECURITY DEFINER function, a migration for Lane A, and is not recommended. No database table holds hardware keys (they are Cognito passkeys), so nothing here goes to Lane A. Widening a role's IAM so it can strip any user's second factor is a security trade-off named for the security reviewer (section 6.1), not taken silently. Needs the security reviewer and an ADR at design. The #42 files are `shell.tsx`, `lib/routes/console.ts`, `infra/lib/constructs/application-role.ts` and `infra/test/application-role.test.ts`: the account menu link and the console reset land after #42 merges; the password reset, the help lines and `/account/security` land now. Corrected on review: the earlier text named only `shell.tsx` and a credential table that does not exist.

**Which parts this PR closes** (review :257, :1706):

| Part | What | This PR |
| --- | --- | --- |
| (1) | 'Forgot your password?' on `/sign-in`: the reset by email, same answer known/unknown, `sign_in` bucket, `password_reset_requested` / `password_reset_completed`, second factor still asked | **Closes** |
| (2), the line | The lost-factor line on `/sign-in/mfa` and `/sign-in/hardware-key` | **Closes the line only** (see 2.3: its reset sentence is held back) |
| (2), the reset | Console 'Reset two-step verification', `AdminSetUserMFAPreference` grant, its email | No: UX PR 65 (after #42) |
| (3) | 'Locked' badge on Users and roles, 'Ask PaidWhole support to unlock' | No: UX PR 75 (after #42) |
| (4) | 'Sign-in and security' account page with re-authentication | No: UX PR 8 (builds on this PR's provider calls) |
| (4), menu link | Account menu's Sign-in and security link | No: UX PR 67 (after #42) |
| (5) | The sign-in help line | **Closes** |

Wording record (review :1304, section 6 "every wording"): **'UX-006 (C-005)**: The help line: 'Forgot your password?
Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign in with your
second key.' Promises no reset before one exists, and never a key reset (Cognito has no administrator path for a
passkey).' Security trade-off record (:1283): the password reset 'answers alike for known and unknown addresses, is rate
limited through the `sign_in` bucket and records its security events.'

### UX-066 (C-075), quoted whole (review :2750-2767)

> ### UX-066 (C-075). A locked customer is told 'A platform administrator can unlock it', a role they cannot reach
>
> - **Severity:** should fix. Harm area: task flow. Reach: 2 routes, 1 roles.
> - **Roles:** anyone signing in.
> - **Screens:** `sign-in.error-locked.1280`, `sign-in-hardware-key.error-locked.1280`.
> - **Routes:** `/sign-in`, `/sign-in/hardware-key`.
> - **Evidence:** 'Account locked / This account is locked after ten failed attempts. A platform administrator can unlock it.' (`apps/web/src/lib/routes/sign-in.ts:45`; the same words as the `?reason=locked` notice, `apps/web/src/app/sign-in/notice.tsx:17`). A practice's staff do not know who PaidWhole's platform administrators are, and only they unlock (`apps/web/src/lib/routes/console.ts:579`). No sign-in page shows a support address; the only lead is 'Trouble signing in? Check the service status.' The tense reads as a rule, not as what happened. Confirmed at 4d99df8.
> - **Rule:** `docs/product/PRD.md:256` (every error with a next step); `PRD.md:266` (Sign-in and MFA: lockout after ten failures)
> - **Fix:** Name the way out with the support address the status page already shows (`supportEmail`, `apps/web/src/lib/server/config.ts:269`), passed to the sign-in page and the hardware-key options result. Words (taken under the co-founder's ruling): 'This account was locked after ten failed attempts. Write to <support address> from this address to have it unlocked.'
> - **Size:** S.
> - **Files:** `apps/web/src/lib/routes/sign-in.ts`, `apps/web/src/app/sign-in/notice.tsx`, `apps/web/src/app/sign-in/page.tsx`, `apps/web/src/components/hardware-key.tsx`.
> - **Migration:** no.
> - **#42:** no.
> - **In flight:** no.
> - **Proposed PR:** UX PR 7 `co-001/ux-sign-in-recovery`.
> - **Sources:** `words-other-05`.
> - **Verification:** confirmed
> - **Notes:** Lands with UX-006 (C-005) (the sign-in recovery and its help line), which passes the same address to the sign-in pages; `config.ts` is only read here, not changed (it is #42's).

Line drift at df4daff7: the locked words are now `lib/routes/sign-in.ts:73` (`MESSAGES.locked`) and
`app/sign-in/notice.tsx:17` (`REASONS.locked`); `supportEmail` is `lib/server/config.ts:318` and reaches routes through
`services.supportEmail` (`lib/server/services.ts:81`, `:236`; tests default `support@synthetic.test`, `:200`). The
house shows it as `<a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>`
(`app/status/page.tsx:82`, `app/maintenance/page.tsx:30`).

### UXS-01 (#92's review, left to this PR), quoted whole

Design section 9 (`/home/user/ops/designs/lane-b-ux-sign-in-time.md:1837`):

> | UXS-01 | should-fix → not a defect | **Not applied.** The skeptic holds: the stale key step's redirect to `/sign-in?reason=step_expired` is the base's (the words then said "expired"), this PR adds no wrong instruction, and design 2.6 and 3.5 give the key surface's redirects to UX PR 7 by ruling. Its one residual nit is taken: the fix lives in `lib/routes/sign-in.ts` (`verifyHardwareKey`'s `RESTART` and `settle`'s `expired` when `from?.step === 'key'`), not `components/hardware-key.tsx`, for UX PR 7 with the finding's `KEY_RESTART`, a database test and the tour state reached by the flow | 3.5 (UX PR 7) |

#92's body, the review row (`pr92-body.md:200`): "**UXS-01** (should-fix; skeptic: not a defect): a stale key step
lands on the password page | Not a defect of this PR: the redirect and its words are the base's (then "expired");
design 2.6 and 3.5 give the key surface's redirects to UX PR 7, with the fix's place corrected to
`lib/routes/sign-in.ts` (above)". And the hand-off (`:103`): "takes the stale key step's restart (UXS-01: the fix
lives in `lib/routes/sign-in.ts`, `verifyHardwareKey`'s `RESTART` and `settle`'s `expired` when `from?.step ===
'key'`, with a `KEY_RESTART`, a database test and a tour state reached by the flow, through `SignInNotice`'s key
surface)".

The verify note (`sgn-verify-ux-UXS-01.md`): the redirect is pre-existing; a misdirected staff member who types
password + code is sent on to `/sign-in/hardware-key?reason=hardware_key_required` (a detour, not a dead end).

At df4daff7: `RESTART` is `lib/routes/sign-in.ts:249` (`/sign-in?reason=step_expired`); `verifyHardwareKey` returns it
at `:478-479` when `pendingOf(context, 'key')` is undefined; `settle`'s `expired` branch is `:185-188`. The browser
follows any `redirect` (`components/hardware-key.tsx:91-94`). The key surface's words already exist
(`notice.tsx:31-35`, `RESTARTS.step_expired.key`: "That sign-in step closed. Start again with your hardware key.").
So the copy work is nil: route `KEY_RESTART = { redirect: '/sign-in/hardware-key?reason=step_expired' }` for the key
step's two exits and the page already says the right thing, focused (ArrivalNotice). One copy check: the key page has
no kept email (never written for `key`, design 2.6), so nothing else on the page changes.

---

## 2. The words asked for

House voice checked: public sign-in pages use "we" (maintenance, status, screening "We have your file"), sentence
case, no exclamation, no "please", the clause form "{instruction}: {what follows}" (ADR 0077), a title with no full
stop, counts through `counted()`.

### 2.1 The help line on `/sign-in` (part 5)

Ruling text: 'Invited by your organization? Use the email and temporary password from your invitation. Forgot your
password? Use the link above. Lost your authenticator app? Write to <support address>. Lost a hardware key? Sign in with
your second key. New to PaidWhole? Request an audit. Service status.'

Recommended rendering (replacing `page.tsx:42-51`'s paragraph; the review's words, with two departures to report):

- Under the card, first: a link **"Forgot your password?"** → `/sign-in/forgot-password` (the "link above").
- Then the help, as a list (`<ul>`, `text-sm text-muted-foreground`), one question per item, so each is read and
  scanned on its own (a seven-sentence paragraph at 390 px is a wall):
  1. "Invited by your organization? Use the email and temporary password from your invitation."
  2. "Forgot your password? Use **Forgot your password?** above." — see departure D-1.
  3. "Lost your authenticator app? Write to **<support address>**." (mailto link)
  4. "Lost a hardware key? Sign in with your second key." — see departure D-2.
  5. "New to PaidWhole? **Request an audit**." (link `/request-audit`)
  6. "**Service status**" (link `/status`; the ruling's bare "Service status." as a link, with a full stop dropped
     since it is a link label, not a sentence; or "Trouble signing in? Check the **service status**." kept).

Departures to report in one list to the co-founder (as the ux-forms design's 9.3 form, the ruling of 2026-10-25):

| ID | Ruling's words | Recommended | Why |
| --- | --- | --- | --- |
| D-1 | "Forgot your password? Use the link above." | "Forgot your password? Use **Forgot your password?** above." or make item 2 itself the link: "Forgot your password? **Reset it by email**." | WCAG 1.3.3 (sensory characteristics): an instruction must not rely on position alone. "the link above" names no link; a screen-reader user in a links list or by Tab hears no "above". Naming the link, or the item being the link, keeps the ruling's meaning. Recommended: the item is the link ("Reset it by email"), and the separate link under the card stays (the conventional place people look) |
| D-2 | "Lost a hardware key? Sign in with your second key." | "Lost a hardware key? Sign in with your second key, or write to **<support address>** if you have none." | Nobody can add a second key until UX PR 8 (`/account/security`); today key registration registers one key at enrolment. The ruling's own rule (:1304) is "Promises no reset before one exists": the line must not leave a staff member with one key and no next step (PRD :256). It promises no key reset: support's way is a re-invitation (UX-006 (2)) |
| D-3 (optional) | "Lost your authenticator app? Write to <support address>." | add "from the address you sign in with" | Part (2)'s own words carry it and the support inbox opens a ticket only from an account's own address (`app/console/tickets/page.tsx:34`: "Mail to {supportEmail} from an account's own address opens a ticket here"). Without it a person writes from a personal address and is not matched |

Placement with UX-170 (UX PR 64, not this PR): PR 64 replaces the `HardwareKeyRequirement` card with one line under
the form. This PR keeps the card where it is (`page.tsx:36`) and puts the forgot link and help list below it; record
the order so PR 64 only swaps the card.

### 2.2 UX-066's locked words

| Where | Before | After |
| --- | --- | --- |
| Refusal summary on `/sign-in` and the key page's `Problem` (title "Account locked"), from `MESSAGES.locked` (`routes/sign-in.ts:73`) | "This account is locked after ten failed attempts. A platform administrator can unlock it." | "This account was locked after ten failed attempts. Write to <support address> from this address to have it unlocked." |
| `?reason=locked` notice (`notice.tsx:17`), title "Account locked" | same | "This account was locked after ten failed attempts. Write to <support address> from the address you sign in with to have it unlocked." (D-4) |
| `/sign-in` card description (`page.tsx:24`) | "Then the six-digit code from your authenticator app. Ten failed attempts lock the account." | unchanged (a rule stated before the fact; "lock" is right there) |

- D-4: on the notice no address is on screen, so "from this address" has no referent; "the address you sign in with"
  is part (2)'s phrase. In the refusal the address was just typed, so the ruling's words stand.
- Mechanics the copy depends on: `MESSAGES.locked` becomes a function of `services.supportEmail` (routes) and the key
  options result carries it (the finding: "passed to the sign-in page and the hardware-key options result"). A
  refusal summary is a string (ux-forms `ActionState.error`), so there the address is plain text (selectable, not a
  link); the help list on the same page carries the `mailto:` link. If the design makes the summary's address a link,
  that is an `ActionForm` change (a #74 file): not recommended for one string.
- The support address is PaidWhole's, not PHI, so it may sit in an error string; the person's own address must not
  (CLAUDE.md never-list): never interpolate the typed email into any of these.
- Do not point a locked person at the reset ("Forgot your password?") as an unlock: the ten-failure lock is the app's
  (`identity.ts` comment: "Lockout after ten failures ... are application rules"); a reset does not lift it unless the
  design decides so (security scout). Copy follows that decision (2.4, done state).

### 2.3 The lost-factor lines (part 2's line)

Part (2)'s text: 'Lost your authenticator app? Write to <support address> from the address you sign in with. A
platform administrator checks with your organization's administrator, resets your two-step verification, and you set
it up again at your next sign-in.'

The second sentence describes UX PR 65's console reset, which does not exist until after #42 (the review: "Promises no
reset before one exists"). Today nothing in `apps` resets a second factor. Recommended for this PR:

| Page | Line (outside the card, below it, `text-sm text-muted-foreground`; design 3.5: "its lost-factor line goes outside the card") |
| --- | --- |
| `/sign-in/mfa` | "Lost your authenticator app? Write to **<support address>** from the address you sign in with." |
| `/sign-in/hardware-key` | "Lost your hardware key? Sign in with your second key, or write to **<support address>** from the address you sign in with if you have none." (D-2's honesty), above or beside today's "No key registered yet? …" (`hardware-key/page.tsx:28-34`, which UX PR 64 adjusts) |
| `/sign-in/enroll`, `/sign-in/register-key` | none (not in the finding; no factor to lose yet) |

UX PR 65 then appends part (2)'s second sentence to the mfa line when the console reset lands; record that in the PR
body's "left for others" and ADR 0081's amendment. The mfa line must sit outside `StepTimer`'s children so the timer's
warning does not reflow it (SGN-02: "nothing above it moves"; the line is below, so it is safe either way).

### 2.4 The forgotten-password screens: every string, by state

Route: `/sign-in/forgot-password` (one new page, per the file list), two phases by the server's pending step: the
request (no reset step pending) and the code (a `reset` step pending, a new `Pending` step with lengths in
`step-limits.ts`, design 3.5). Metadata title "Reset your password" (a page title is never the bare brand name, UX-182).
Layout: the sign-in layout (Paper ground, stacked lockup, nothing else decorative; BRAND.md :122), `<main>` as the
other steps, `StepHeading setup={null}`.

**Phase 1, the request**

| State | Strings |
| --- | --- |
| Empty | H1 "Reset your password". Card title "Email". Description: "Enter the email you sign in with. If it has an account, we send a code to it to choose a new password." Field "Email" (`type="email"`, `autoComplete="username"`, required). Submit "Send code". Below: link "Back to sign in". |
| Pending | ux-forms D5: the button keeps "Send code", `aria-disabled`, status line "Working…" |
| Refused: a malformed email | ux-forms summary "Check the fields marked below." with "Email: enter an email address" (the house Zod map, UX-064), email kept (depends on UX PR 1, #74, merged) |
| Refused: rate limit (`sign_in` bucket, by the typed address and the client address) | "Too many attempts in a short time. Wait {minutes} and try again." (the house words, `lib/http/next.ts:60`, `minutesWords`). The same for a known and an unknown address, since the account limit counts the typed address whether or not it names anyone |
| Refused: page out of date / CSRF / dropped connection | ux-forms D10's words, unchanged |
| Sent (the same for a known, an unknown, a disabled, a locked or an invited address) | Moves to phase 2 with a notice (ArrivalNotice, focused once, `role="note"`): title "Check your email", text "If an account uses this address, we sent it a six-digit code. It can take a few minutes: check your spam folder too." Never "we sent you a code" (asserts the account exists); never the address in the notice (it is a live/focused region; design 2.6 R-15) |

**Phase 2, the code and the new password**

| State | Strings |
| --- | --- |
| Default | H1 "Choose a new password". Card title: the typed address (as `/sign-in/mfa` shows `pending.email`, `mfa/page.tsx:22`; it is what this browser typed, so it leaks nothing). Description: "Enter the code from the email, then choose a new password." Limit sentence from `StepTimer` (see "closed" below). Fields: "Six-digit code" (`inputMode="numeric"`, `autoComplete="one-time-code"`, hint "Six digits from the email. Spaces are fine."), "New password" (`PasswordField`, Show, `autoComplete="new-password"`, `minLength={PASSWORD_MIN_LENGTH}`, hint as `new-password/page.tsx:35`: "At least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol." from the constant), "New password again". Submit "Save password". Below the form: "No email? **Send a new code**" (a POST through the same request route, same answer, same bucket) and "Wrong address? **Start again**" (ends the step; `/sign-in/forgot-password`) |
| Pending | "Working…" (D5) |
| Code wrong (Cognito `CodeMismatchException`; with `preventUserExistenceErrors: true`, `identity.ts:115`, an unknown address gets the same) | Summary "That did not match." with the code issue "Six-digit code: the code does not match the one in the email: check it, or send a new code" (the house pattern of `WRONG_CODE`, `routes/sign-in.ts:109`). Code and both passwords emptied (D2; WCAG 3.3.7's security exception), the note saying so |
| Code expired (`ExpiredCodeException`) | "This code has expired: send a new code." with the "Send a new code" control focused or adjacent; passwords emptied |
| Too many tries (Cognito `LimitExceededException`, or the `sign_in` bucket) | "Too many attempts in a short time. Wait {minutes} and try again." (Cognito gives no minutes: "Wait a few minutes and try again." is the honest fallback; check `minutesWords` supports a no-number form or add the phrase) |
| Password rules (`invalid_password`) | "Choose a stronger password." with the issue on New password "it still needs {listed(problems)}" (`passwordIssue`, `routes/sign-in.ts:112-114`, reused) |
| Passwords differ | issue on "New password again": "the two passwords do not match: type the same password in both fields" (`routes/sign-in.ts:354`, reused) |
| Warning / closed (`StepTimer`) | **Not the default words.** StepTimer's defaults say "your email is kept, and you type your password again", which is false here: the kept email is written only after a secret is proven (design 2.6, 3.5), so a restarted reset keeps nothing. Pass reset-specific words: warning "If you need more time, start again: you type your email again for a new code."; closed "Start again: you type your email again for a new code."; the limit sentence "This step stays open for {counted(n, 'minute')}." from the step's limit (shorter of the pending cookie and the code's life: Cognito's reset code lasts one hour). Start again → `/sign-in/forgot-password?reason=restarted` or the plain page (the writer decides; the plain page with no notice is enough) |
| Done (`ConfirmForgotPassword` succeeded) | Redirect to `/sign-in?reason=password_reset` (a new reason appended to `SIGN_IN_REASONS` and `REASONS`, beside `restarted`), email kept (now proven), ArrivalNotice focused once: title "Password changed", text "Your password is changed. Your email is filled in: sign in with your new password, then the code from your authenticator app." (states that the second factor is still asked; for staff the key page follows on its own via `hardware_key_required`). Not "Password reset" as a title (a verb or a noun; "changed" says what happened) |
| Done, the account is locked (only if the design keeps the lock through a reset) | After the code is proven the person owns the mailbox, so telling them is no enumeration: "Your password is changed. This account is still locked after ten failed attempts: write to <support address> from this address to have it unlocked." |
| Done, sessions ended (only if the design ends the account's open sessions, the safer choice for the security scout) | append "Any other sessions of this account have ended." |

Strings never shown: "Password reset email sent to …", "No account with that email", "This account is locked" on
phase 1, any wording that differs by whether the address has an account, anything about an invitation on phase 1.

An invited person (Cognito `FORCE_CHANGE_PASSWORD`) cannot reset by `ForgotPassword`; phase 1 still answers alike, so
the help line item 1 ("Use the email and temporary password from your invitation") and the existing
`invitation_expired` words ("This invitation has expired. Ask your organization's administrator to send it again.")
carry them. The provider scout confirms what the dev twin answers for that case.

The reset email itself is Cognito's default template (no `userVerification` / custom message in
`infra/lib/constructs/identity.ts`; phase 1 uses Cognito's own capped sender). Its words are not this PR's (an infra,
#42 file): a proposal for Lane A to brand it ("Your PaidWhole code to choose a new password is {####}. It works for one
hour. If you did not ask for it, ignore this email: your password is unchanged."), and a "your password was changed"
notification email (mail is #42's). The dev twin's outbox message should read as the proposed words.

---

## 3. Brand and copy rules that apply

- `.claude/rules/brand.md`: tokens only (no hex; `bg-paper`, `text-muted-foreground`); focus visible with
  `--pw-focus`; text at least 4.5:1 (muted help text on Paper: confirm the token pair passes; axe checks it); the
  lockup only via `<PaidWholeLockup stacked/>` in the shared layout (already there); no animation on the mark; a plain
  progress cue only, never the mark as a spinner.
- `docs/brand/BRAND.md`: tone "serious, exact, warm" (:23); Sign-in "stacked lockup, Paper ground, nothing else
  decorative" (:122): no illustration, no icon flourish on the new page; the new notices use today's `Alert` (UX PR
  14's Notice replaces it later; the brand choice "no warning hue: a ruled neutral notice", review :1281).
- CO-11 (`docs/product/change-order-001.md:95`) as enforced by `pnpm lint:copy` (`tools/brand-copy/scan.ts:123-133`):
  no "AI", "intelligence", "ProofPack"/"proof pack"; "recovered" never unlabelled by posted or deposited, anywhere.
  **Risk in this PR:** the natural words "account recovery", "recover your account", "recovered" — `recovery` passes
  the `\brecovered\b` rule, "recovered" fails it. Use "reset" and "a way back in" in copy; keep "recovery" to code
  names and the branch. The `screening-*` rules (owed, underpaid) do not apply here (not screening files) but none of
  these words belong in sign-in copy anyway.
- `lib/copy/words.ts`: `counted(n, 'minute')` for every stated limit ("15 minutes", "1 minute"); `listed()` for the
  password problems ("a digit and a symbol"); the warning's one minute reads "within a minute" (design 6.1 departure).
- ADR 0077 (ux-forms): summary first in the form; issues named by the visible label ("Six-digit code: …"); secrets and
  one-time codes emptied after a refusal with a note; email kept; D7 code accepts spaces and hyphens; D8 Show on every
  password field ("Show password", "Show new password", "Show new password again" via `showName`); D9 every
  `pattern`-checked field states its format in its hint (`components/form-hints.test.ts`).
- ADR 0081: reasons appended to `SIGN_IN_REASONS` and `REASONS`, nothing reshaped; restart reasons use
  `ArrivalNotice` (`role="note"`, focus once, guard); kept email only after a secret is proven; the key surface words.
  This PR amends 0081 with its forgotten-password decisions (its "Revisit when": "UX PR 7 amends this decision with its
  forgotten-password steps").
- Apostrophes: use ’ (U+2019) in copy, as `MESSAGES.invitation_expired` does ("organization’s"); none of the
  recommended strings needs one except "organization’s".
- No PHI and no person's email in a URL, log, notice, error or job payload: the reset page is POST-only; the typed
  address lives in the sealed pending cookie; no `?email=` anywhere, including `mailto:` (no `?subject=` or `?body=`
  carrying the person's address).

---

## 4. Screens to add or change

| Screen | Change | States the tests and the tour need |
| --- | --- | --- |
| `/sign-in` (`app/sign-in/page.tsx`) | Forgot link under the card; the help list (2.1); locked words via the summary (2.2); new `password_reset` reason notice | default; `reason-locked` notice; `error-locked` (summary); `reason-password-reset` (done, email kept, focused); `error-wrong-password` (unchanged, control) |
| `/sign-in/forgot-password` (new) | Phase 1 and 2 (2.4) | request: empty, loading, error (malformed email), rate-limited; code: default (after sent, notice focused), loading, code wrong, code expired, password rules, passwords differ, warning, closed |
| `/sign-in/mfa` | The lost-authenticator line (2.3) outside the card | default, error, warning (PR 6's), to see the line holds its place |
| `/sign-in/hardware-key` | The lost-key line; locked words via `Problem`; UXS-01's `step_expired` notice now reached by the flow | default; `error-locked`; `reason-step-expired` reached from a stale key step (UXS-01) |
| `app/sign-in/notice.tsx` | `locked` text; `password_reset` reason (title, text, kept handling); the support address passed in | unit: `notice.test.tsx` rows for both |
| `components/hardware-key.tsx` | Nothing visible beyond the server's locked string; follows `KEY_RESTART` | — |

---

## 5. Accessibility needs

- **axe** (WCAG 2.1 A and AA, at 1280 and 390, as SGN-04 runs it): `/sign-in/forgot-password` in phase 1 empty and
  refused, phase 2 default, refused and with the warning shown; `/sign-in` with the help list and with the
  `password_reset` notice; `/sign-in/mfa` and `/sign-in/hardware-key` with their new lines (the review's PR 7 test list
  names `/sign-in/forgot-password` and `/sign-in`; the other two change too).
- **Headings**: one H1 per page via `StepHeading`; the help list may take an `h2` "Help signing in" (sr navigation),
  visually small, or none, but not a bold paragraph pretending to be one.
- **Labels and autocomplete**: Email `autoComplete="username"`; code `one-time-code` + `inputMode="numeric"`; new
  passwords `new-password`; phase 2 includes a hidden or read-only `autoComplete="username"` input holding the typed
  address so password managers save the new password against the right account (the address is already on the page as
  the card title; it is not a URL or a log). Every field has a visible label and a hint tied by `aria-describedby`
  (`Field`).
- **Focus**: ux-forms D4 after a refusal (one field issue focuses the field; else the summary); on arrival at phase 2
  and at `/sign-in?reason=password_reset`, `ArrivalNotice` focuses once with its guard; on the key page's
  `step_expired` (UXS-01) the same; never a focused live region.
- **Error summary** via ux-forms: first in the form, names the visible label, secrets and codes emptied with the note,
  the email kept on phase 1 (the review's dependency on UX PR 1).
- **WCAG 1.3.3**: no "the link above" (D-1).
- **WCAG 3.3.7 (redundant entry)**: the address is not retyped between phase 1 and 2 (it is carried in the sealed step);
  after the reset the sign-in email is filled.
- **WCAG 3.3.8 (accessible authentication)**: paste allowed in the code and password fields; Show on passwords; no
  cognitive test.
- **WCAG 2.2.1**: phase 2 is timed, so `StepTimer` states the limit, warns, and offers Start again (SGN-02's rules);
  its words are the reset's own (2.4).
- **Links**: "Send a new code" and "Start again" are buttons in forms (POSTs, as PR 6's Start again, SEC-01), never
  GET links; "Back to sign in", "Forgot your password?", the `mailto:` and the help list links are links with
  underline (colour not alone).
- **Contrast**: `text-muted-foreground` help text on `bg-paper`: at least 4.5:1, axe and the dark set (tokens only).
- Screen-reader rows to add to ADR 0081's "Not verified here" list for audit #103: the sent notice heard once, the done
  notice heard once, the help list read as a list.

---

## 6. The before-shots the UX review needs

From `/home/user/ops/tools/lane-b-screen-tour/README.md` ("A pull request's shots", :76-99): two runs, each on a fresh
prepare with the populate project; before `TOUR_REF=df4daff7` (this PR's base), after the PR's head; each id at 1280
light, 1280 dark (tokens only) and 390 light; `TOUR_ONLY` names every id in full (dark for a non-default state only when
named); tiles with `/usr/bin/python3 -I tools/lane-b-screen-tour/tile.py`; private galleries; PNGs never on a branch.
The sample: every changed screen and state, one shot per layout for a shared component (the sign-in layout once), and
the screens of every finding the PR says it fixes.

| Id | In the tour now | Before (df4daff7) shows |
| --- | --- | --- |
| `sign-in.default` | yes (`tour.spec.ts:1215`) | the old help paragraph, no forgot link (UX-006 screen) |
| `sign-in.error-locked` | yes (`:3949-3963`, the lockout persona, taken last) | "A platform administrator can unlock it." (UX-006, UX-066 screen) |
| `sign-in.reason-locked` | yes (the `?reason=${reason}` loop) | the locked notice's old words |
| `sign-in-hardware-key.default` | yes (`:1331`) | no lost-key line (UX-006 screen) |
| `sign-in-hardware-key.error-locked` | yes (`:3970-3980`) | old locked words in `Problem` (UX-066 screen) |
| `sign-in-mfa.default` (and `.error`) | yes (`mfaShots`) | no lost-authenticator line (UX-006 screen) |
| `sign-in-hardware-key.reason-step-expired` | yes (PR 6, by URL) | the key surface words, by URL only |
| `sign-in-hardware-key.key-step-closed` (new: a stale key step pressed, reached by the flow; UXS-01) | add | lands on `/sign-in?reason=step_expired`, the password surface: the before is that page, recorded with a note |
| `sign-in-forgot-password.default`, `.error`, `.loading`, `.code`, `.code-wrong`, `.code-expired`, `.error-policy`, `.error-mismatch`, `.warning`, `.closed` | add | a 404 on this ref: recorded as skipped "a 404 on this ref" (the README's PR 6 convention) |
| `sign-in.reason-password-reset` (done, email kept) | add | a 404 (an unknown reason fails the params parse) |
| `account.devices.default`, `settings.users.default` | yes | unchanged controls: UX-006's other screens, which the README's sample rule includes; parts (3) and (4) are left to UX PRs 75 and 8 (say so in the reviewer table) |

The new states need tour steps on `claude/build-ops` (not this PR): a persona for the reset (seeded on the PR's head
only, so "not seeded on this ref" before), the dev provider's outbox read for the code (synthetic only), the clock moved
for the warning and closed states (`toStepPhase`), and an expired code by moving the dev provider's clock. Do the reset
persona separately from `lockout` (its locked shots are taken last and cannot be undone on screen).
