# sgn-author progress (design author, UX PR 6 co-001/ux-sign-in-time)
Started 2026-10-28. Output: /home/user/ops/designs/lane-b-ux-sign-in-time.md
## Status
- [ ] read inputs (style ref, review entries, prs.json, scouts)
- [ ] verify code facts
- [ ] s1 defect  - [ ] s2 decision - [ ] s2.x alts - [ ] s2.y security
- [ ] s3 files   - [ ] s4 tests    - [ ] s5 docs    - [ ] s6 strings/shots
- [ ] s7 no migration/proposals - [ ] s8 risks
## Notes
- read: ux-forms style (s1-2.7, s7-11), review queue entry 6/7/66, UX-012, UX-128, prs.json, raw a11y-other-23/06, flows-other-18, scout-flow.md
- review wording (6.1 l.1308): "This step stays open for 3 minutes." / "This step closes in 1 minute. Start it again to get more time." with 'Start again' button
- read: scout-timer.md, scout-security.md (all three scouts done)
- scout diffs to rule: stamp in Pending (A) vs on sealed obj in pending.ts (B,C); path / (C) vs /sign-in (A); write in settle (C) not writePending (B); lifetime from startedAt (C); prefill only on step_expired (B,C)
- verified code: pending.ts (1-41), routes/sign-in.ts (settle 86-132, pendingOf 135-138, RESTART 140, signInPage 145-152, pages/actions), auth/sign-in.ts (Pending 44-50, after 119-134, authenticated 136-159 register_key :148, start 162-179, newPassword invalid_password :186-188 returns same pending, beginTotpSetup :205 rebuilds, beginKeyRegistration :251 spreads), pages (mfa/enroll/new-password/register-key/hardware-key/page.tsx, notice.tsx REASONS :6-18 step_expired :14, SignInNotice :20-31 Alert role=status; used by hardware-key page too), next.ts (COOKIE_OPTIONS :23, adapter :25-36, loadPublicPage :139-148, runSignInStep :249-263), handler.ts setCookieHeader, seal.ts seal :39-46 open :49-67, dev-provider CHALLENGE_MS :47 GRANT_MS :48 seal :89,:102
- DECISIONS so far:
  * leaf module lib/auth/step-limits.ts (no imports): PROVIDER_CHALLENGE_SECONDS=180, PENDING 300/900, stepSeconds(step), warningSeconds(limit) (>=600 -> 120 else 60), KEPT_EMAIL_EXTRA=900; pending.ts pendingSeconds reads it; dev-provider CHALLENGE_MS reads it
  * startedAt + plan as added props on sealed obj (SealedPending = Pending & StepMeta) in pending.ts; taken by handler before flow call (services.now()); enrol: before beginTotpSetup; kept on invalid_password & register options rewrite explicitly from read value
  * plan: flow (auth/sign-in.ts) adds only keyRequired?:true on start's pending result (2 hunks); route layer computes plan {at,of} from previous plan + next step
  * kept email cookie tp_sign_in_email sealed purpose sign-in-email, path /, Lax; {email, password hint}; written in settle pending branch for new_password/mfa_setup/mfa/register_key; life startedAt+limit+900 absolute; cleared writeSession, locked, hwk_required, key_registered, first-step non-pending; read by signInPage only on step_expired|restart
  * e2e: one REAL 3-min wait test (wait on data-phase, not sleep) + page.clock/cookie-delete tests
- #42 OPEN (REST 2026-10-28: merged=false, head 6f23c42b, updated 2026-10-27T21:05Z). REST file list (208) != pr42-files.txt (143, Oct 27 01:41): REST adds apps/web/e2e/helpers.ts, e2e/hardware-key.spec.ts (+ db functions etc). Union saved scratchpad/sgn-pr42-union.txt. => do NOT edit e2e/helpers.ts.
- MORE DECISIONS (before writing):
  * StepMeta on sealed pending: startedAt, setup{at,of}, passwordSaved; flow adds FlowResult pending keyRequired?:true from start (sign-in.ts 2 hunks); route computes setup in settle via `advance(context, from, run, opts)` capturing at=services.now() before flow call
  * kept cookie {email, use?: temporary|chosen}; cleared by clearSignIn (writeSession, locked, hwk_required, key_registered, every non-pending first step, hardwareKeyOptions always); expired keeps it
  * new reason 'restarted' (Start again link href); step_expired words "That sign-in step closed."; notice focus via new components/arrival-focus.tsx only for step_expired/restarted
  * marker: new app/sign-in/step-heading.tsx: h1 with caption "Step 1 of 2" + sr-only ": " (SR name "Step 1 of 2: Choose a password")
  * words: limit "This step stays open for 3 minutes." (taken); warning title "This step closes within a minute" (departure from "in 1 minute"), text "If you need more time, start again: your email is kept, and you type your password again." enrol + "Starting again gives you a new setup key: replace this one in your authenticator app."; closed title "This step has closed", text "Start again: your email is kept, and you type your password again." enrol + "This setup key no longer works: starting again gives you a new one."; link "Start again"
  * register-key added (15 min, warn 120 s, Step 3 of 3); constants in new leaf lib/auth/step-limits.ts (UX PR 66 file list moves there)
  * e2e new file e2e/sign-in-time.spec.ts (not sign-in.spec.ts: PR 7 adds there); personas time-mfa, time-real, time-invited, time-staff (internal support invited); real 3-min test waits on data-phase
  * tour: new states warning/closed etc; Cap gains `clock` option installing before go
- [x] WRITTEN: header, contents, s1, s2.1-2.11 (03:58-04:20Z). Next: s3 files/slices.
- [x] WRITTEN: s3 (slices A-D, 3.5 left for, 3.6 open PRs: #78 shares personas+types.ts; others only shared docs). Next: s4 tests.
- [x] WRITTEN: s4 tests (4.1 unit, 4.2 db, 4.3 harness, 4.4 e2e 4 tests incl real 3-min, 4.5 SGN rows+registry verbatim, 4.6 existing). Next: s5 docs.
