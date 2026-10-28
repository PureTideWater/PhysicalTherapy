# Review of merge 646f060a (b459ba73 + a6e754fc #79)

Started 2026-10-28. Worktree /home/user/ux-download-refusals clean at 646f060a; no earlier review run.
Read: DLR design §6 §7, ADR 0079, ADR 0078, TBL design §5.4 §7.2, merge agent's dlr-merge79.md.

## Files checked
- side check (scratchpad/m79r/sidecheck.py, -U0 +/- multisets): 44 ours-only files == b459ba73 except
  download-refusals.spec.ts and letter.tsx (the merge's two ports); 83 theirs-only files == a6e754fc;
  18 both-changed files: every difference is a planned resolution (CASE_MODULES/MODULE_NUMBER union, personas
  comment reflow, ?from=list on Generated reports, DownloadLink in receipts, letter selects moved to letter.tsx,
  packet re-indent pairs). matrix.ts, registry.ts, test-matrix.md: both sides' rows whole.
- receipts.tsx: OK (ScrollTable only child; DownloadLinks around failed line + ScrollTable + nav; notice place above the scroller)
- packet/page.tsx: OK (DownloadLinks arrived=DownloadRefusal above ScrollTable "Versions"; PDF/CSV DownloadLink with shownVersion; Forbidden + ForgetRefusal kept)
- coverage/page.tsx + letter.tsx: OK (#79 ScrollTables; PayerLetter; selects w-full min-w-0 in min-w-0 columns)
- reports/page.tsx: OK (DownloadRefusal per list above each table; 5 ?from=list; ForgetRefusal on Forbidden; #79 ScrollTables)
- personas: 7 tables-* + refusals-manager/viewer; MODULE_NUMBER TBL 17, DLR 18
- StackedRows: used by no page (ADR 0078 ships it unadopted) -> no download link in a stacked copy, no duplicate DownloadLinks
- DownloadLink inside a ScrollTable scroller: receipts' Report, packet Versions' PDF/CSV. <main> not focusable.

## Findings
- F1 (real, merge interaction): focusIsFree (download-link.tsx) frees focus only on body or a [data-download-link].
  #79's scroller (tabindex=0 while unmeasured/overflowing) is now the nearest focusable ancestor of the receipts'
  Report and packet Versions' links. Safari does not focus a clicked link; it focuses that ancestor. So at 390 px
  (tables overflow) a refused in-place download's notice would NOT take focus in Safari. Chromium (CI) focuses the
  link, so no test sees it.

## Fixes
- F1 fix (uncommitted -> commit next): download-link.tsx focusIsFree also frees an element that holds a download link
  (querySelector), doc comment says why (Safari, scroller, ADR 0078); download-link.test.tsx new case (scroller with
  the link -> free; another table's scroller -> not); download-refusals.spec.ts Uploads step: at 390 px focus the
  'Receipts, scrolls sideways' region, dispatchEvent('click') on Report (no focus move), expect the rate_limited notice
  focused and not inside the scroller, viewport restored; ADR 0079 D4 sentence + Not verified line.
- checks: tsc apps/web 0; vitest download-link.test.tsx 19 passed; eslint 3 files 0; lint:copy 532 files 0.
  prettier --check fails on the 3 files, but it fails on them at HEAD too (not a repo gate; never run in earlier rounds): left.

- committed f47437eb (4 files) on 646f060a; no #42 file; no model identifier; tree clean.
- more read-only checks while the suite runs: merged reports.spec.ts (this PR's in-place CSV refusal, then expectAccessible,
  then #79's atPhoneWidth Cases) OK; no <a ... download> in apps/web/src (multiline grep); ?from=/?version=/reportHref
  link counts equal to ours in all 7 files; compliance/uploads detail/uploader placements OK.

## Commands
- suite (bg, scratchpad/m79s/suite.sh; results in scratchpad/m79s/results.txt): typecheck, lint, lint:copy, lint:logs,
  test, synth --all + git diff, watched --write + git diff, affected --base a6e754fc, gate, test:db 1..6 (5433), build,
  build-stamp, e2e 1/2 2/2 (tp_e2e_pr78e, 3184, --workers=2), drop db. DONE 02:13-02:38 UTC on f47437eb, all exit 0:
  typecheck 22 projects 25 s; lint 1,644 files 0/0 81 s; lint:copy 532; lint:logs 1,069; test 392 files 6,679 passed
  4 skipped 175 s; synth 249 cases 0 written 641 unchanged, EMR 16 unchanged, git diff clean; watched 536 lines, clean;
  affected (base a6e754fc) any=false shards=[]; gate passed (no money path); db 1..6: 22/2432, 21/824+1s, 21/2510,
  21/1836, 21/1398, 21/222 = 127 files 9,222 passed 1 skipped; build 25 s, tree clean; stamp f47437eb, web server read
  it; e2e 1/2 29 passed 5.4 min (download-refusals incl. the new step), 2/2 28 passed 4.1 min (tables-phone 2,
  uploads 3, packets 2, reports 3, screening 2) = 57 of 57 (playwright --list: 57 tests in 28 files); no flake;
  tp_e2e_pr78e dropped, 0 tmp dirs, 3184 free, tree clean.
- mutation check (bg, m79s/mutation.sh): old focusIsFree line restored -> download-refusals e2e (tp_e2e_pr78m, 3185)
  expected to FAIL at the new step; then restore, drop, rebuild + restamp f47437eb. DONE: failed as intended at spec
  line 398 (toBeFocused, received inactive). The positional filter did not narrow the run (--list lists 57), so it was
  stopped with SIGINT: 31 passed, 1 interrupted (reconciliation), 24 not run. Restored (tree clean), tp_e2e_pr78m
  dropped, 0 tmp dirs, 3185 free, rebuild 0, restamp f47437eb.
- Part 4 appended to /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md (not committed).
- STATUS: complete. Final head f47437eb (on 646f060a). Not pushed.
