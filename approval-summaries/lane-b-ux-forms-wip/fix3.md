# fix3 progress (UX re-check's three polish fixes, PR #74, /home/user/ux-forms, start head a57fbf5)

## Status
- [x] 1. /support rule said once
- [x] 2. chosen-text line mono for hashes
- [x] 3. duplicate state neutral Alert
- [x] checks
- [x] commit

## Notes
Plan (decided):
1. Card says the rule once for ticket and mail, standalone sentence in span#support-rule:
   "Neither a ticket nor a mail takes patient information: no names, dates of birth, member IDs or claim numbers. Name the screen and the record’s ID."
   mailto link aria-describedby=support-rule; Subject and Message `describedBy="support-rule"` (new FieldProps prop, after error/emptied/hint in describedBy()); hints dropped.
   form-hints.test.ts follows `describedBy` too. e2e forms-keep-input support test updated. ADR D9 + Consequences bullet; design 10.2 rows + new 12.4.
2. Choice.label: string | readonly {text, mono?}[]; option text = pieces joined; chosen line renders pieces, mono ones in `font-mono tabular-nums`; useCutChoice returns chosen value. submissions Document hash prefix piece mono. Tests: fields.test (option text joined), harness 'chosen' + browser test, packets.spec (line's hash font = page's [data-sha256] font).
3. SUMMARY_VARIANTS record in form-issues.tsx: duplicate -> 'default', others 'destructive'; used by Summary, export-status, RefusalFallback. Tests: action-form.test (record), fields.test (server markup), browser (summary, export, new harness 'fallback').
Design edits go to /home/user/ops/designs/lane-b-ux-forms.md (ops repo, already dirty from earlier rounds; NOT committed here).
- [code done] 1: form-issues.tsx describedBy(also), field.tsx describedBy prop, support/page.tsx, form-hints.test.ts follows describedBy, fields.test.tsx new describe, forms-keep-input.spec.ts support assertions. (docs pending)
- [code done] 2 (field.tsx part): ChoiceText runs, ChosenWords, CutChoice {value,text}. Pending: submissions page, tests.
- [code done] 2: submissions page runs; harness 'document'; browser test FRM-08 runs; fields.test runs. Pending: packets.spec assertion.
- [code done] 3: SUMMARY_VARIANTS (form-issues), export-status refusedKind, action-form RefusalFallback (+data-kind); tests: action-form.test, fields.test, browser (looks(), harness 'fallback').
- Next: packets.spec assertion, docs (ADR 0077 + design), then checks.
- [done] packets.spec assertion (response step, 390 px: chosen line = option text; span mono font == [data-sha256] font != line font)
- [done] ADR 0077 D1 (neutral look), D6 (runs), D9 (describedBy), Consequences; test-matrix FRM-01, FRM-08 words.
- Next: design doc (/home/user/ops) 3.5, 10.2 rows, new 12.4; then checks.
- [done] design doc: 3.5, 5.4, 10.2 rows (support x2, duplicate, showChosen), new 12.4 (ops repo, uncommitted by design).
- Next: checks under lock (typecheck, lint, lint:copy, unit fields/action-form/form-hints/browser, e2e forms-keep-input + packets).
- CHECKS so far: typecheck PASS (after typing fields.test failures array); lint:copy PASS; lint had 1 error (no-unsafe-return in browser test, fixed: typed evaluateAll; eslint on file clean) -> full lint to re-run at end; unit 4 files 85/85 PASS (fields, action-form, form-hints, action-form.browser).
- e2e runner: scratchpad/bin/e2e-fix3.sh (DB tp_e2e_fix3, port 4811). Cleanup after: drop DB tp_e2e_fix3, rm /tmp/tp-e2e-tp_e2e_fix3-*. (tp_e2e_uxforms pre-existed: leave alone)
- e2e-1 STARTED (background b06yj8akk): forms-keep-input + packets --workers=2; log scratchpad/fix3-logs/e2e-1.log
- edits during e2e-1: comment reflows in field.tsx; removed unused data-kind from RefusalFallback (action-form.tsx) + design 12.4 text. Behaviour-equivalent.
- comment-only reflows (forms-keep-input.spec, packets.spec, browser test, form-issues, submissions page) during e2e-1
- commit message drafted: scratchpad/fix3-commit-msg.txt
- e2e-1 interim: forms-keep-input 6/6 passed (support test included); packets running
- e2e-1 FINISHED: 8/8 passed (forms-keep-input 6, packets 2), exit 0, 22:49Z. (Run 2 resumed 00:17Z: re-verify diff, re-run checks after the during-run edits, cleanup, commit.)
- Run 2: diff re-read, matches notes (all 3 code + tests + ADR/test-matrix + design 12.4 done). Files changed after e2e-1's start (22:45:33Z: field.tsx, action-form.tsx, form-issues.tsx, submissions page, specs, browser test) -> re-running ALL checks on the final tree: typecheck, lint, lint:copy, unit 4 files, e2e-2.
- typecheck-2 PASS (22 projects)
- lint-2 PASS (1,624 files, 0 errors, 0 warnings)
- lint:copy-2 PASS (517 files)
- unit-2 PASS (fields, action-form, form-hints, action-form.browser: 4 files 85/85)
- e2e-2 STARTED 2026-10-28T00:23:44Z: forms-keep-input + packets --workers=2; log fix3-logs/e2e-2.log
- e2e-2 PASS 8/8 (forms-keep-input 6, packets 2), 00:23:44Z-00:27:59Z
- cleanup done (DB tp_e2e_fix3 dropped, /tmp/tp-e2e-tp_e2e_fix3-* removed, port 4811 free). #42 overlap check (REST file list): only docs/product/test-matrix.md, a shared doc under LANES rule 6, FRM rows are this branch's own. Committing.
- [x] COMMITTED 001cdbf8 'Forms: the UX re-check's three polish fixes' (15 files); git status clean. Not pushed. DONE.
