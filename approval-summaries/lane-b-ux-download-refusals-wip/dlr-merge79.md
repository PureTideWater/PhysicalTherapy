# dlr-merge79 (PR #78 co-001/ux-download-refusals: merge claude/build-platform a6e754fc (#79, ADR 0078))
Started 2026-10-28. Worktree /home/user/ux-download-refusals, head b459ba73 before merge. Do NOT push.

## Status
- [x] 1. read designs (DLR §6 §7, ADR 0079; TBL design, ADR 0078, #79 diff)
- [x] 2. fetch + merge --no-ff --no-commit
- [ ] 3. resolve 10 conflicts
- [ ] 4. check auto-merged both-touched files
- [ ] 5. regenerate (install, watched.ts, synth)
- [ ] 6. typecheck, eslint, unit tests
- [ ] 7. commit merge

## Commands and results
- CMD: git status (worktree) -> clean, on co-001/ux-download-refusals at b459ba73, no merge in progress
- CMD: git fetch origin claude/build-platform -> a6e754fc (new since 0dd1ba7e: #79, 18 commits faa7bf15..a6e754fc)
- both-touched files (git diff 0dd1ba7e a6e754fc --name-only ∩ git diff 0dd1ba7e HEAD --name-only): 18 files
  (reports.spec.ts, synthetic-personas.ts, console/compliance, packet, coverage, reports/[reportId], review, documents/[documentId], reports/page, roi/[statementId], uploads/[documentId], receipts.tsx, uploader.tsx, test-matrix.md, synth common/matrix/registry, expected/types.ts)
- read: DLR design §6 §7, ADR 0079 (decisions 1-5), ADR 0078 (a6e754fc), TBL design headings
- CMD: git merge --no-ff --no-commit origin/claude/build-platform -> exit 1, CONFLICT in 10 files (synthetic-personas.ts, packet/page.tsx, coverage/page.tsx, reports/page.tsx, receipts.tsx, test-matrix.md, synth common/matrix/registry, expected/types.ts); auto-merged reports.spec.ts, console/compliance, reports/[reportId], review, documents/[documentId], roi/[statementId], uploads/[documentId], uploader.tsx
  MERGE IN PROGRESS in worktree (MERGE_HEAD a6e754fc). A resumed run: check `git diff --name-only --diff-filter=U` for what is left.
## Conflicts
- packages/synth/src/expected/types.ts: CASE_MODULES = [..., 'RCC', 'TBL', 'DLR'] (both; TBL first: merged first and module 17 < 18; the list is append order)
- packages/synth/src/cases/common.ts: MODULE_NUMBER {..., BIL: 15, TBL: 17, DLR: 18} (both)
- docs/product/test-matrix.md: "## Tables (TBL)" section (TBL-01..04) then "## Download refusals (DLR)" (DLR-01..04), each section whole, blank line between; file order is CASE_MODULES' (append) order
- packages/synth/src/cases/matrix.ts: TBL-01..04 rows then DLR-01..04 rows (same order as test-matrix.md)
- packages/synth/src/cases/registry.ts: TBL-01..04 entries (module 1) then DLR-01..04 entries (module 11), both comments kept
- apps/web/scripts/synthetic-personas.ts: doc comment has both sentences (tables personas, then the refused-downloads pair), reflowed <=117 cols; persona list keeps #79's seven tables-* personas then this PR's refusals-manager, refusals-viewer (no key collides; seed.db.test compares key sets, order-free)
- apps/web/src/components/uploads/receipts.tsx: built from ours (stage 2) + #79's two hunks: imports keep ReportFrom/reportHref, DownloadLink/DownloadLinks and add ScrollTable; the section keeps this PR's DownloadLinks around the failed line, the table and the page nav; the table sits in <ScrollTable label={props.title}> as its only child with #79's min-w-[48rem] and aria-label={props.title}; the Report link stays this PR's DownloadLink href=reportHref(..., props.reportFrom) (no download attribute; #79's side had brought back <a ... download>)
- apps/web/src/app/p/[practiceId]/cases/[caseId]/packet/page.tsx: imports both (UtcTime; DownloadLink/DownloadLinks, DownloadRefusal, ForgetRefusal); the Versions card keeps this PR's CardContent "flex flex-col gap-4" + DownloadLinks arrived={DownloadRefusal}, inside it #79's ScrollTable label="Versions" (table its only child, min-w-[54rem], UtcTime cells, min-w floors); PDF/CSV stay this PR's DownloadLink with ${shownVersion} (#79's side had plain <a> without ?version=). git diff HEAD --stat == git diff 0dd1ba7e a6e754fc --stat for the file (31+/8-): ours plus exactly #79's change
- apps/web/src/app/p/[practiceId]/coverage/page.tsx: the one conflict (the letter card) takes this PR's CardContent "flex flex-col gap-3" + <PayerLetter .../> (the form lives in components/coverage/letter.tsx since this PR); #79's ScrollTable wrapping of the page's tables auto-merged and is kept. #79's letter change (af13cc06: each select "w-full min-w-0" in a "min-w-0" column so a long contract title never widens the page at 390 px) is ported into letter.tsx: its columns were already "flex min-w-0 flex-col"; SELECT's "max-w-full" -> "w-full min-w-0" (#79's classes, which subsume max-w-full), comment says why
- apps/web/src/app/p/[practiceId]/reports/page.tsx: imports both (UtcTime, ScrollTable; DownloadRefusal, ForgetRefusal, downloadRefusal); the Generated reports table takes #79's ScrollTable label="Generated reports" (min-w-[36rem], UtcTime, min-w-40 floor) with this PR's ?from=list on the document PDF and CSV links (#79's side had them without); 5 from=list links as on ours; the rest (DownloadRefusal per list, ForgetRefusal on Forbidden, #79's Exports and audit-report ScrollTables) auto-merged
- check: no conflict marker left in the 10 files; no <a ... download> left in apps/web/src *.tsx
- [x] 3. resolve 10 conflicts
## Auto-merged files both PRs touched (step 4)
- numstat check: for each of the 8 (reports.spec.ts, console/compliance, reports/[reportId], review, documents/[documentId], roi/[statementId], uploads/[documentId], uploader.tsx) git diff HEAD == git diff 0dd1ba7e a6e754fc and git diff a6e754fc == git diff 0dd1ba7e HEAD (line counts): each side's change whole
- read: compliance keeps DownloadLinks/DownloadLink (console) + ForgetRefusal and #79's Policies/Evidence records ScrollTables; reports/[reportId], review, documents, roi: #79's wrap-anywhere on the SHA-256 spans beside this PR's ?from= links / DownloadLinks; uploads/[documentId]: #79's four ScrollTables + this PR's DownloadRefusal, ForgetRefusal and reportHref link (no download attribute); uploader: #79's max-w-full select + this PR's DownloadLinks around ReceiptList (reportFrom) and beforeunload; reports.spec.ts: this PR's in-place line CSV step, then expectAccessible, then #79's atPhoneWidth(reviewer, { tables: ['Cases'] })
- ADR 0078 Consequences: a spec finding a region by a name a table's name extends uses exact: true ("Receipts"; #79 changed uploads.spec.ts so). This PR's download-refusals.spec.ts had region 'Generated reports' (Reports) and 'Receipts' (Uploads) by substring, which also match the ScrollTable regions "Generated reports, scrolls sideways" / "Receipts, scrolls sideways" (before hydration, or while overflowing): both now exact: true (the notice and the rows are inside the section). Other region locators there ('This batch', 'Generate an audit report') name no table.
- [x] 4. auto-merged files checked
- staged the 10 resolved files + letter.tsx + download-refusals.spec.ts
## Regenerate (step 5)
- CMD (flock): pnpm install --frozen-lockfile --config.modules-cache-max-age=0 -> 0 ("Lockfile is up to date", "Already up to date"); tree unchanged
- CMD (flock): pnpm exec tsx tools/screening-capacity/watched.ts --write -> 0 (536 lines, no change)
- CMD (flock, bg): pnpm synth --all -> 0 (249 cases, 0 written, 641 unchanged, 0 removed; 8 EMR formats, 16 unchanged); TBL-01..04 and DLR-01..04 fixtures both present; nothing to stage
- [x] 5. regenerate
## Checks (step 6, merged tree, uncommitted)
- CMD (flock): apps/web tsc --noEmit -p . (src, e2e, scripts) -> 0
- CMD (flock): packages/synth tsc --noEmit -> 0
- CMD (flock): eslint --max-warnings 0 on 19 files (10 conflicted, 8 auto-merged both-touched, letter.tsx, download-refusals.spec.ts) -> 0, no output
- CMD (flock): apps/web vitest run tables.test.ts scroll-table.test.tsx stacked-rows.test.tsx download-link.test.tsx download-refusal.test.tsx coverage/letter.test.tsx uploads/uploader.test.tsx lib/http/download-refusal.test.ts download-refusal-words.test.ts pricing/display.test.tsx pricing/diff.test.tsx -> 0 (11 files, 292 passed)
- CMD (flock): packages/synth vitest run fixtures.test.ts fixture-guard.test.ts index.test.ts audit.test.ts -> 0 (4 files, 75 passed)
- CMD (flock): pnpm lint:copy -> 0 (532 files)
- scope: merged tree vs ours differs only in #79's 101 files + letter.tsx + download-refusals.spec.ts; vs theirs only in ours' 62 files; #42 files edited by the resolution: test-matrix.md, matrix.ts, registry.ts (both sides' rows only); no packages/pricing, no migration, no model identifier in any added line
- not run: e2e (download-refusals, tables-phone, reports, uploads, packets), seed.db.test (needs DB)
- [x] 6. checks
## Commit (step 7)
- CMD: git commit -F scratchpad/m79-commit-msg.txt -> 646f060a… (646f060a), parents b459ba73 a6e754fc; tree clean after
- [x] 7. commit merge
- STATUS: complete. Not pushed.
