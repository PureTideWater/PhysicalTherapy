# dlr-verify (stage 6 fresh-clone verification), PR #78 head e36a68bc

Started 2026-10-27 ~22:40 UTC. No earlier run found.
Clone: scratchpad/verify-clone at e36a68bc… (fetched origin/claude/build-platform = ecebdc90).
Background: CI poll scratchpad/verify-ci/poll.sh (runs.tsv, poll.log); fast checks scratchpad/verify-logs/fast.sh (summary.txt).

## Checks
- [x] clone: ok, HEAD e36a68bc
- [x] 1 tree: 62 files (verify-diff-files.txt), 8 commits. All named by design §6/§7 or ADR 0079, or justified by builders
  (dlr-build-integrate.md: synthetic-personas.ts, receipt-labels.ts R05, brand-copy scan.ts(+test), letter.tsx extracted;
  fix-suite: share.tsx Figure comment UX-DLR-09, reports.spec.ts part 2). #42 overlap: test-matrix.md (+14/-0),
  matrix.ts (+24/-0), registry.ts (+22/-0), watched-paths.txt (+3/-0): additions only. No migration, nothing under
  packages/pricing. Model identifiers: none in + lines; commit messages only attribution lines (and the branch name
  claude/build-platform). Fixtures DLR-0N/expected.json: no PHI shape (files: [], synthetic: true). PASS
- [x] 2 claims: checked against head code. isNavigation (mode navigate + Dest document/absent; Accept ranking; no Accept
  = script) holds. 15 downloadHandler routes, 15 returnTo (compliance 1, coverage 1, monitoring 1, packets 4,
  report-documents 2, reports 3, roi 2, uploads 1); table and from= (reports list/review, documents list, uploads
  uploads) match; kept payer/contract/codes/month/version. Closed codes (7), fields <=8, retry 1..1440, no fragment,
  cookies, private no-store, signInFor moved. Words in download-refusal-words.ts match the description byte for byte
  (title "Not downloaded", every body, console sentence). Letter: messages, "Choose a payer", no placeholder, Figure
  per code, pattern, setCustomValidity, LetterMarks. download attribute: 5 at base, 0 at head. DownloadLink on
  receipts (Uploads, zip list), export review (refresh), reviewer checklist (below), packet history, console export.
  Forbidden branches: packet and reviewer checklist words; all return pages ForgetRefusal. Tests named exist (e2e
  steps, unit describe blocks; 20,000-string property; urlPhiFindings on Locations). Findings: SEC-01..03,
  UX-DLR-01..11, 14, 15 fixed as the verdicts say (DLR-04 hides the message rather than removing it: React owns it;
  acceptable); UX-DLR-12 no change; UX-DLR-13 ADR row + Revisit when. Counts vs records: fix-suite table all match
  (db shards sum 9,222; e2e 28+27=55); part 2 6,477 and 15 (1+5+1+2+3+3) match; merge check: typecheck 22, lint 1,637,
  e2e 18 passed match merge-check logs; unit log shows 388 files, 6,562 passed, 4 skipped, 2 FAILED (workflows.test.ts,
  local orphan playwright-core@1.56.1). Description says "6,562 passed, 4 skipped; workflows.test.ts 114 of 114 once a
  local orphan was pruned"; no log of the 114/114 re-run in merge-check/. Nit: the 2 failures are implied, not stated.
  Fresh-clone run of workflows.test.ts below settles it.
- [x] 3 fast checks PASS: install rc=0 (7s), typecheck rc=0 (69s, 22 projects), lint rc=0 (1,637 files, 0 errors, 0 warnings).
  Run interrupted at ~22:51 during lint:copy (log shows only ELIFECYCLE, no summary line: killed with the session).
  Resumed 2026-10-28 00:17 UTC from lint:copy (verify-logs/fast2.sh): lint:copy rc=0 (530 files); vitest unit rc=0
  (56 files, 987 passed); synth --all rc=0 (243 cases, 0 written, 635 unchanged; 8 EMR formats, 16 unchanged), git diff
  clean, 0 untracked; watched.ts --write rc=0 (536 lines), git diff clean. workflows.test.ts alone: 114 of 114 passed
  (verify-logs/workflows.json), so the description's 114/114 holds in a fresh clone.
- PR #78 live: head e36a68bc, draft, body == pr-body-2.md (cmp SAME)
- [x] 4 CI PASS: 22 check runs on e36a68bc, all completed (verify-ci/runs-final.tsv); 5 workflow runs (ci, mutation,
  screening-capacity, approval-of-record x2) all success. Required: all green success (8 needed jobs succeeded), mutation
  success (any=false, no money path changed; affected.ts run locally agrees: money/pricing/ledger/packets not affected),
  screening-capacity gate success (MEASURE=true, capacity success, no warnings), approval-of-record success x2 (no
  approval-line change; APPROVAL_REVIEW_REQUIRED unset, notice). Others success: static, lint, unit, db 1-4, domain model,
  build, images, e2e 1/2 and 2/2, capacity, changes x2. Skips legitimate: stryker matrix (needs any==true), notify
  (failure() && not pull_request). Base ruleset: strict required checks; base has moved to 0dd1ba7e since.
- Resume 00:16 UTC: PR head still e36a68bc, draft, body == pr-body-2.md (SAME). Base claude/build-platform has since moved to 0dd1ba7e.
- Resume re-check of 1 (cheap): 62 files, same list as verify-diff-files.txt; no migration or packages/pricing path; 8
  commits, model-identifier lines only the 8 Co-Authored-By + 8 Claude-Session attribution lines; #42 overlap 4 files,
  63 insertions, 0 deletions. PR body: only the "Generated with Claude Code" attribution line.
- Probe (informational, own clone): base moved to 0dd1ba7e (PR #80, model-gateway redaction; touches test-matrix.md,
  matrix.ts, registry.ts too). merge-tree clean; probe merge c9d85b29: synth --all 245 cases 0 written, watched.ts no
  diff, vitest packages/synth + tools/screening-capacity 21 files 387 passed. Ruleset is strict, so the branch needs
  updating and CI re-run before merge. Clone returned to e36a68bc, clean.
- VERDICT: 1-4 hold, CI green on e36a68bc -> passed=true.
