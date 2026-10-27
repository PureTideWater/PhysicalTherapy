# fix-F3 progress (U-UX-5, U-UX-9 items 1,2,4, U-UX-10, U-A11Y-2 split form)
Worktree /home/user/ux-forms (shared; never git add/commit/stash/checkout/reset).
Files: app/support/page.tsx, lib/routes/support.ts (+tests), lib/routes/console-onboarding.ts (+tests),
components/hardware-key.tsx (+tests), components/screening/split-form.tsx, components/screening/forms.test.tsx.
## Status
- started: reading code
## Plan (decided after reading code, 16:3x)
- UX-5 support/page.tsx card: add "Your mail takes no patient information either: no names, dates of birth, member IDs
  or claim numbers. Name the screen and the record’s ID." (hints kept).
- UX-9 item 1: NO_PATIENT_INFORMATION curly ’. item 2: support.ts:247 drop "opaque". item 4: F2 already set the terms
  Version hint to the error's words ("Letters, digits, dots, underscores and hyphens, such as 2026-11."); my error at
  console-onboarding.ts:316 already says the same -> no change to it. Improve-as-I-go: documentRef message (:320)
  "the document’s reference (letters, digits and : / . _ -)" -> instruction in words, same style as version.
- Tests: onboarding-routes.db.test.ts: support refusal asserts field+words (no "opaque"); terms refusal asserts both words.
- UX-10 hardware-key.tsx: Problem first in HardwareKeySignIn form. No unit test possible (state-only); browser harness
  form needed in forms-harness.tsx (not mine) -> proposal + temp verification; e2e step proposal.
- A11Y-2 split-form.tsx: visible #split-problems loses role; sr-only <p role=status data-slot=split-status> from first
  render; said={text,seq} (seq 0 = what the page opened with, never rendered); 1 s after last change (0 ms to empty);
  blur says now; press says (forced only when focus does not move). CodesField hint -> shared Hint (text-sm).
- forms.test.tsx static asserts; browser test: NEW file screening/split-form.browser.test.tsx? (decide: see below)
## Done (code, 16:4x)
- support/page.tsx: NO_PATIENT_INFORMATION curly + doc; card adds "Your mail takes no patient information either: no
  names, dates of birth, member IDs or claim numbers. Name the screen and the record’s ID."
- support.ts: screened({subject,message}) names EVERY field at once (improve-as-I-go); message drops "opaque".
- console-onboarding.ts:320 documentRef -> 'use only letters, digits, colons, slashes, dots, underscores and hyphens,
  such as terms/2026-11'. version (:316) unchanged (matches F2's hint).
- onboarding-routes.db.test.ts: terms refusal toEqual both issues; support refusal toEqual (message), both fields case.
- hardware-key.tsx: Problem first in HardwareKeySignIn form (+comment).
- split-form.tsx: PROBLEMS_ID div no role; Said/saying(); SETTLE_MS 1000; effect timer (0 ms when nothing wrong);
  settle on blur; press: flushSync(setPressed, setSaid(saying(problems, true))); sr-only p role=status
  data-slot=split-status, span keyed by seq (seq 0 never rendered); CodesField hint -> shared Hint (text-sm).
- eslint on the 6 files: clean.
## Next: forms.test.tsx static asserts; browser test (decision pending); typecheck; tests; lint:copy
- backup of split-form.tsx at /tmp/claude-0/-home-user-PhysicalTherapy/d75bf211-7cd4-58d6-b13d-568cbdc1db2a/scratchpad/f3/split-form.tsx.good (mutation runs; restore if interrupted)
## Tests (16:4x)
- NEW apps/web/src/components/screening/split-form.browser.test.tsx (3 tests; harness 'screening' form; own harness).
- forms.test.tsx: visible list not live + empty status line from first render (also with server-rendered problems);
  hints text-sm via shared Hint.
- vitest unit forms.test.tsx + split-form.browser.test.tsx: 14/14 pass (Chromium 1194, not skipped).
- Mutations (restored, cmp ok): no pause -> test1 fails; no blur -> tests 2,3 fail; press not anew -> test3 fails.
## Next: hardware-key temp verification (temp files apps/web/src/components/test-support/f3-tmp-* : DELETE if found),
   typecheck, eslint, lint:copy, action-form.browser.test (split test there), db test onboarding-routes
- hardware-key temp verification DONE: new order passes, HEAD order fails ([INPUT, alert, BUTTON]); temp files removed (copies in scratchpad/f3/)
- checks so far: typecheck pass (22); eslint 8 files clean; lint:copy pass (517); unit 12 files 175 tests pass (screening/*, action-form.browser, action-form, form-hints, fields, next.test, watched.test, brand-copy)
- db: onboarding-routes.db.test.ts 18/18 pass (mutation 'opaque' back -> ticket test fails; restored); route-tests 5 & 10 filtered to support.create_ticket|console.publish_terms: 64 pass
- 16:5x: added usePersonChange reset in split-form.tsx (SEC-2 gap: lists held outside ActionForm's keyed Fragment). temp files f3-tmp-split-person.* in test-support: DELETE if found
- person-change temp verification DONE: with reset passes; without reset fails (lists kept). temp files removed (copies in scratchpad/f3/)
## FINAL checks (17:0x) -- DONE
- pnpm typecheck: pass (22 projects). eslint 8 files: clean. pnpm lint:copy: pass (517 files).
- vitest unit (Chromium 1194, none skipped): screening/* (incl. new split-form.browser.test.tsx), action-form.browser,
  action-form, form-hints, fields, lib/http/next.test, tools/screening-capacity/watched.test, tools/brand-copy: 12 files 175 pass.
- vitest db: onboarding-routes.db.test.ts 18/18; route-tests 5 & 10 (-t support.create_ticket|console.publish_terms) 64 pass.
- No temp files left in the worktree (only new: screening/split-form.browser.test.tsx).
## STATUS: COMPLETE (result returned to orchestrator)
