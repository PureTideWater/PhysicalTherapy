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
## RESUME 2026-11-01 (base 83d71fd6, #42 head be63bdc2)
- [x] s5 docs NOT yet written (s4 was last). Corrections pass started.
- verified: base delta 165c599..83d71fd6 touches NO file under lib/auth, app/sign-in, lib/routes/sign-in.ts, infra, e2e/helpers -> those cites hold as written (still re-grep each)
- CASE_MODULES is in packages/synth/src/expected/types.ts:9 (task text said cases/types.ts: wrong; draft right). common.ts:18 MODULE_NUMBER needs SGN: 19 -> slice D
- next.ts: COOKIE_OPTIONS :25, cookies adapter :27-38, loadPublicPage :120, runSignInStep :230; signInFor in lib/http/sign-in-for.ts:9-17 (redirects reason codes); handler.ts setCookieHeader :47-49; minutesWords download-refusal-words.ts:69
- open PRs 2026-11-01 (REST; lists regenerated in scratchpad prN-files.tsv via manual ?per_page=100&page=N, --paginate fails: next link is repositories/{id}, 403): #42 be63bdc2 219 files; #75 871faff9; #82 9db52a2b; #83 f4a97668; #84 e3299ea2; #85 29dded52; #86 83167b8f; #87 20c180a0; #88 f69063f0; #89 83f04cbd. Intersections: 42,75,82,83,84 = 3 shared docs; 85 = 3 shared docs + forms-harness.tsx(+121/-2); 86-89 none.
- #75 head does NOT touch 0077; co-001/wip-contract-phi-check-5 (7f77cb19, merge base 165c599) edits 0077 :142-150 only (+3/-3) -> separate hunks from ours (:47, :246)
- #85 harness hunks: React import :2, import after :13, HarnessControl :46-63, control :61, forms entry before `two` (~:307), router.refresh :328-338. Ours: PageKeys :29-32 gains closesIn?/closesAt?, import after :16, `stepTimer` entry after hardwareKey :272; reuse control.render (no HarnessControl change).
- field.tsx: Field :82, props passed :92 (draft said :75 -> fix). refusal-notice.tsx: RefusalAlert destructive role=alert tabIndex -1 autoFocus (download refusals, ADR 0079) -> 2.6/2.8 note
- words: keep counted() (lib/copy/words.ts:9-11, house C1); minutesWords (download-refusal-words.ts:69) gives same words; proposal: make it delegate to counted.
- [x] CORRECTIONS APPLIED (all 5 + extras): header base 83d71fd6 + delta note; #42 be63bdc2 219 files, regen cmd (manual paging); s1 repro -> scout-flow 1.2 cases A/C, no PNG; 2.1 pin still :11/:14 on be63bdc2; 2.4 & 4.6 helpers :63-65 (:66-68 on be63bdc2); 2.6 flags next.ts:25,:27-38 handler :47-49; field.tsx :82,:92; ArrivalFocus vs RefusalAlert para (effect focus, client redirect); 2.8 re-read para (FieldWords :20-25, Hint :68-75, refusal-notice, sign-in-for, minutesWords next.ts:60); 2.11 rate limit applied routes/sign-in.ts:158-159, sign-in-for.ts:9-17, next.ts:20-22; s3 intro comm -12; slice D personas :146-155 / #78 :142-145 / header :31-32, common.ts row; 3.5 identity :41-42(:45-46), :82(:89), :23; 3.6 rewritten (open PRs, #85 harness plan, wip-5 0077 :142-150); 4.5 after DLR test-matrix :353-365, matrix :502-507, registry :731-737, MODULE_NUMBER.
- NEXT: s5 docs (read 0016, 0077 :40-50, :240-250), s6, s7, s8, Contents.
- s5 facts: 0016 status :3 "accepted; amended by [0019](...)"; :30-31 "...expiring) into a five-minute HttpOnly cookie." 0077: D1 bullet :42-67 (":47 nothing typed is echoed back"), D2 :68; Not covered :240, bullet ends :246 "typed text is never kept in browser storage". Note style: italic "*Amended by [00xx](...) (...): ...*" (0056:57,:60). ADR form: 0079 (Status/Date/Deciders/PRD sections; Context, Decision, Alternatives considered, Consequences, Not verified here, Revisit when).
- s6 tour facts: Cap :707-719, cap() :730-752 (open, go, ready, act, snap); idOf :428 variantOf :429; reason loop :1106 ['idle','step_expired'] -> ids sign-in.reason-*; mfaShots :1270 (billing-manager), invitedShots :1307, registerKeyShots :1397 (reviewer registers; support-expiry bare ctx for error :1443). UX-012 screens: sign-in-enroll/mfa/new-password.default.1280, sign-in.reason-step-expired.1280; UX-128: sign-in-enroll.default/error, new-password.default.
- s6 plan: Cap.clock?:boolean -> page.clock.install() before go; toStepPhase(page, phase) fastForward 10s steps till data-phase; skip on base ("no timer before co-001/ux-sign-in-time"). New ids: sign-in-mfa.warning/closed (cap clock, billing-manager), sign-in.reason-restarted (loop), sign-in.restarted-kept, sign-in.step-expired-kept (clear tp_sign_in+reload), sign-in.step-expired-temporary (invitedShots copy ctx before save), sign-in-enroll.warning/closed + sign-in.step-expired-chosen (invitedShots), sign-in-new-password.invited-staff (time-staff), sign-in-register-key.warning (support-expiry copied ctx). route-map: "within 5 minutes" -> 3.
- notice words: step_expired kept: title "Sign-in step closed", "That sign-in step closed. Your email is filled in: type your password to start again." no kept: "That sign-in step closed. Start again from your email and password." restarted: title "Start again", "Your email is filled in: type your password to start again." / none: "Start again from your email and password." + use lines.
- NEXT: write s5..s8 into draft (append after s4), then Contents.
- [x] slice D 0016/0077 rows updated (D1 :42-67, :246; status :3)
- [x] WRITTEN s5 (5.1 ADR 0081 outline, 5.2 0016, 5.3 0077 notes, 5.4 docs/product)
- [x] WRITTEN s6 (6.1 strings+SR+departures, 6.2 shots 26 states/78 ids + TOUR_ONLY, 6.3 tour additions a-h)
- [x] WRITTEN s7 (7.1, 7.2 nine proposals), s8 risks table. NEXT: contents update, final checks
- [x] Contents updated; slice B harness row aligned with 3.6. DONE except return summary.
