# Review of merge 8f7d18d4 (f47437eb + 165c5993 #74) and UX-DLR-11 036989af

Started 2026-10-28. Worktree /home/user/ux-download-refusals clean at 036989af; no earlier review run.
Scratch: scratchpad/m74r (review), scratchpad/m74s (suite).

## Steps
- [x] read records (DLR design §6 R10 §7, ADR 0079, ADR 0077, UX-DLR-11 + its verify, merge agent's dlr-merge74.md)
- [x] side check vs both parents (merge base a6e754fc)
- [x] UX-DLR-11 review (code) as UX/brand reviewer
- [x] fixes (follow-up commit 4136bd3d on 036989af; hooks ran, not pushed)
- [ ] full suite on final head
- [ ] Part 5 in fix-suite summary

## Files checked
- side check (m79r/sidecheck.py; lists m74r/ours.txt 62, theirs.txt 113, both.txt 16, all2.txt 159+UX-DLR-11's 8):
  merge 8f7d18d4 and final 036989af. Every ours-only file == f47437eb, every theirs-only file == 165c5993, and the
  both-changed next.ts, uploader.tsx, packet page, packet review, report review, Reports, console compliance,
  lib/routes/compliance.ts, test-matrix.md, matrix.ts, registry.ts, watched-paths.txt are exact line unions. Differences
  only where planned: personas doc-comment reflow (rows 61 + 5 forms + 2 refusals = 68); CASE_MODULES/MODULE_NUMBER
  FRM 16, TBL 17, DLR 18; coverage/page.tsx (#74's letter SelectField/showChosen/grid-cols-1/Field hint moved into
  letter.tsx; #74's evidence CheckboxGroup/CheckboxField/FormKeys kept; #74's placeholder dropped per UX-DLR-07);
  letter*, refusal-notice, download-refusal(+test), e2e spec, ADR 0079 = UX-DLR-11.
- test-matrix: ## Forms (FRM) 320, ## Tables (TBL) 338, ## Download refusals (DLR) 352; registry/matrix 16 rows each.
- #74's packets.spec.ts FRM-08 Coverage step (chosen-text under the contract at 390 px): met by SelectField showChosen.
- letter.tsx / letter-marks.tsx / letter-contract-check.tsx / letter.test.tsx / e2e spec / ADR 0079 read in full:
  behaviour kept (kept entries, marks from the URL, autoFocus first mark, clearing on edit/pair/submit, contract held
  by owners map with Object.hasOwn, pattern, hint after the message). FieldError line hidden by [hidden] (Tailwind 4.3.3
  preflight: display:none !important beats the div's flex).
- refusal-notice.tsx RefusalAlert: no scroll-mt-18; html scroll-padding-top calc(3.5rem+1rem) (#74 styles.css);
  header h-14 sticky in the document scroller (shell.tsx:330), so the html rule applies.
- 2 px mark: unlayered :is(input,select,textarea)[aria-invalid='true'] rule reaches SelectField and Input; Input lost
  aria-invalid:border-destructive in #74 (rule replaces it).

## Findings
- F1 (D9, consistency): the codes control is hand-written (Label+Input+FieldError+<p> hint) where ADR 0077 D9 says a
  hint uses the shared Hint; its hint is a string-only prop, so the letter wrote its own <p>. Same DOM today, but it
  drifts from Field (and ADR 0079's own Revisit when, a shared field clearing its own mark, would not reach it).
  Fix: Hint (and FieldProps.hint) take words in runs, as an option's label already does (ADR 0077 D6: {text, mono});
  the codes become a Field with hint runs; describedBy keeps getting the hint's words as a string (labelText).
- F2 (record accuracy): ADR 0079's Revisit-when parenthesis says scroll-mt-18 with scroll-padding-top made "144 px
  where 72 px was meant"; the UX-DLR-11 verification measured that only for a top-aligned scroll (none in this PR);
  focus() stopped 36 px lower in Chromium. Reword.
- F3 (tidy): doc comments the UX-DLR-11 edit left past the 120-column wrap (letter.tsx:24, download-refusal.tsx:10,
  letter.test.tsx:14, refusal-notice.tsx:36).
- F4 (test gap): the e2e asserts aria-invalid on the letter's controls but not the 2 px danger border that now comes
  from the unlayered rule (the SELECT class's own border is gone), nor that a focused control / the notice stops
  below the sticky header once scroll-mt-18 is gone.
- Considered, not changed: (a) several marks focus the first marked control with no summary (ADR 0077 D4 says the
  summary for several issues): the letter is a GET download form, no ActionForm/RefusalSummary; R02 decided it; two
  marks need both browser checks bypassed. (b) billing page's scroll-mt-20 (PR #56) now stacks with #74's
  scroll-padding-top on a #pay-<invoice> fragment: base since #74, not this PR's file. (c) SelectField's intrinsic
  width (no w-full) in the letter: #74's own letter and all 62 SelectFields do the same.

## Fixes
- F1: field.tsx: `FieldWords = string | readonly ChoiceText[]` (exported); FieldProps.hint, controlMarks' hint, Choice
  label, Hint take it; Hint and ChosenWords share setWords (mono run = span font-mono tabular-nums, same as Figure);
  controlMarks hands describedBy the hint's words joined (labelText), so describedBy is unchanged. letter.tsx: the
  codes are a Field (hint CODES_HINT runs, error, autoFocus, pattern, maxLength, autoCapitalize, spellCheck, mono
  class); Input/Label/FieldError/describedBy/Figure imports gone. Same DOM as before (letter.test.tsx unchanged
  assertions pass, incl. the mono spans). fields.test.tsx: new "a hint in runs" case.
- F2: ADR 0079 D5 letter paragraph (three shared fields, hint in runs, adds to 0077), Status (adds to 0077), Revisit
  when parenthesis (144 px only for a top-aligned scroll; 36 px for Chromium's centring focus).
- F3: comments reflowed in letter.tsx, letter.test.tsx (header + scroll comment), download-refusal.tsx,
  refusal-notice.tsx ("would add to that padding"), letter-contract-check.tsx.
- F4: e2e download-refusals.spec.ts: expectDangerMark (2 px, --destructive) on the refused codes input and the
  refused contract select. Header-offset e2e not added: Chromium's focus() centres an element it scrolls to, so it
  could not tell the padding from none; the stylesheet rule is unit-held (download-refusal.test.tsx) and its effect is
  #74's FRM-05 (forms-keep-input.spec.ts:365, action-form.browser.test.tsx:683).
- checks: tsc apps/web 0 (twice); vitest 9 files 297 passed, then 7 files 135 passed; eslint 8 files 0; lint:copy 535
  files 0; prettier --check fails on these files at 036989af too (not a gate; left). No #42 file, no model id, no
  migration, nothing under packages/pricing.

## Commands
- container had restarted (uptime 37 min): PG18 on 5433 down with a stale pid (359, not running); started per HANDOFF:
  runuser -u postgres -- /opt/pg18/bin/pg_ctl -D /root/pgdata18 -o "-p 5433 -k /tmp" -l /tmp/pg18.log -w start ->
  "server started", pg_isready accepting. No tp_* databases left.
- suite (bg, scratchpad/m74s/suite.sh; results m74s/results.txt) on 4136bd3d: typecheck, lint, lint:copy, lint:logs,
  test, synth --all + git diff, watched --write + git diff, affected --base 165c5993 + gate, test:db 1..6 (5433), build,
  stamp, e2e 1/2 2/2 (tp_e2e_pr78f, 3186, --workers=2), drop db. STARTED.
- read-only while the suite runs: next.ts guardMessage = #74's words through this PR's minutesWords ("N minute(s)",
  identical text); signInFor from ./sign-in-for. #42 files vs 165c5993: test-matrix.md +14/-0, matrix.ts +24/-0,
  registry.ts +22/-0, watched-paths.txt +3/-0 (rows/generator only); shell.tsx untouched.
- suite so far (4136bd3d): typecheck 0 (22 projects 39 s); lint 0 (1,656 files 0/0 78 s); lint:copy 0 (535); lint:logs
  0 (1,074); test 0 (398 files 6,786 passed 4 skipped 187 s); synth 0 (257 cases 0 written 649 unchanged; EMR 16
  unchanged) git diff clean; watched 0 (538 lines) git diff clean; affected (base 165c5993) any=false shards=[];
  gate passed (no money path); db 1..6 all 0: 22/2432, 21/824+1s, 21/2510, 21/1836, 21/1398, 21/222 = 127 files
  9,222 passed 1 skipped; build 0 (62 s) tree clean; stamp 0. e2e running.

## Run 2 (resumed 05:15 UTC; container restarted again, uptime 2 min, the bg suite was killed during e2e-2)
- worktree clean at 4136bd3d, no merge in progress.
- suite run 1 (4136bd3d): e2e-1 exit 1 (5 failed, 27 passed, 585 s); e2e-2 cut off by the restart (no result); drop
  not reached.
- e2e-1's 5 failures share ONE root cause (not a flake): every Coverage render throws on the server
  "Attempted to call contractOwners() from the server but contractOwners is on the client" (digest 766848993).
  letter.tsx (a server component) calls contractOwners(listed), exported from letter-contract-check.tsx ('use client').
  Introduced by the merge commit 8f7d18d4 (the merge agent's owners lookup); unit tests and tsc cannot see the RSC
  boundary. Failed: download-refusals DLR-04, era-exports CO-03 (Coverage), layout-1280 tour (Coverage table, timed out
  8 min), mapping MAP-01, models milestone 10 (all on /coverage).
- F5 (correctness, blocker): fix = move contractOwners (and its type) to a module without 'use client' that both the
  server letter and the client check import.
- boundary scan (m74r/rsc-boundary.mjs, server graph from app entries): head 4136bd3d flags exactly
  letter.tsx:164 contractOwners (CallExpression); both parents f47437eb and 165c5993 clean. Function-prop scan
  (m74r/fn-props.mjs): no inline/local function handed to a client tag on head or either parent.
- F5 fix (working tree): contractOwners + ContractOwners moved to components/coverage/letter-contract-owners.ts (no
  directive); letter-contract-check.tsx imports the type; letter.tsx and letter.test.tsx import contractOwners from it.
  Guard: apps/web/src/client-boundary.test.ts (TS compiler; entries = src/app server-file names + proxy.ts +
  'use server' modules; graph through ts.resolveModuleName with apps/web's options, stopping at 'use client';
  client exports followed through barrels; a client binding may be only a JSX tag, a JSX attribute value, an export
  or a type). Proven: on 4136bd3d's letter files it fails with "letter.tsx: contractOwners at line 164
  (CallExpression), from .../letter-contract-check.tsx"; on the fix it passes (3 tests). No matrix row (test-matrix,
  synth matrix/registry are #42 files).
- checks on the fix: tsc apps/web 0; vitest client-boundary + coverage/letter + form-hints 3 files 30 passed; eslint 5
  files 0; prettier --check warns (as on field.tsx/form-hints.test.ts at head; not a gate); watched --write 538 lines,
  no diff.
- committed a0099fab (fix F5 + guard; hooks ran; not pushed).
- dropped run 1's leftover tp_e2e_pr78f (+7 /tmp dirs) on 5433 (PG18 was up, pid 353 started 05:13).
- targeted check (m74t/quick.sh) on a0099fab: build 0, stamp 0, e2e (tp_e2e_pr78g, 3187, --workers=2) of
  download-refusals, era-exports, mapping, models, packets: 8 passed (1.9 min), 0 server errors in the log; db dropped.
  DLR-04 now reaches and passes the F4 2 px marks, focus and kept entries; packets.spec FRM-08 passes.
- suite run 2 on a0099fab: scratchpad/m74s2 (same script, new dir). STARTED.
- side check re-run on the final head a0099fab (m79r/sidecheck.py, mb a6e754fc, f47437eb, 165c5993; list m74r/all3.txt
  = both sides' files + this run's 2 new): 17 files differ from a plain union (m74r/side-a0099fab.txt), each a planned
  change: personas (doc reflow), coverage page, synth common/types (FRM 16/TBL 17/DLR 18), letter*.tsx, letter.test,
  download-refusal(+test), refusal-notice, e2e spec, ADR 0079 (UX-DLR-11/F2/F3/F4), field.tsx + fields.test.tsx (F1: the
  13 #74 lines it replaced are each generalised in place, string hint still works), letter-contract-owners.ts +
  client-boundary.test.ts (F5). #42 files vs 165c5993: test-matrix +14/-0, matrix.ts +24/-0, registry.ts +22/-0,
  watched-paths +3/-0. No migration, nothing in packages/pricing, no model id added since 8f7d18d4.
- suite run 2 so far (a0099fab): typecheck 0 (22 projects 16.9 s); lint 0 (1,658 files 0/0 79 s); lint:copy 0;
  lint:logs 0 (1,075); test 0 (399 files 6,789 passed 4 skipped 186 s); synth 0 (257, 0 written, 649 unchanged; EMR 16
  unchanged) diff clean; watched 0 (538) diff clean; affected any=false shards=[]; gate passed; db-1..4 0.
- suite run 2 (a0099fab) DONE, all 0: db-5 0 (21/1398, 163 s), db-6 0 (21/222, 60 s); db total 127 files 9,222
  passed 1 skipped; build 0 (11 s, Turbopack's cache of the quick check's build of the same tree) tree clean; stamp
  a0099fab; e2e-1 32 passed (4.7 min), e2e-2 31 passed (4.5 min) = 63/63 (playwright --list: 63 in 29 files), both
  servers "the build is a0099fab…'s", 0 server errors; tp_e2e_pr78f dropped, 0 /tmp dirs, nothing LISTENs on 3186
  (11 TIME_WAIT; the script's count of 88 matched any :0C72 field); tree clean. No flake, no re-run.
- [x] full suite on final head.  Next: Part 5 in the fix-suite summary.
- [x] Part 5 appended to /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md (not committed;
  ops shows it modified only). prettier on field.tsx/form-hints.test.ts at 165c5993 also exit 1 (checked).
- DONE. Final head a0099fab… (not pushed; 17 commits ahead of origin).
