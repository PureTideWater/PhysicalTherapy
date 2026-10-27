# build-commit-sites progress (commit slices B1, B2, C, D of co-001/ux-table-scroll)

Worktree /home/user/ux-table-scroll. Base HEAD 40314fb3 (slice A committed).
Slice file lists: scratchpad/commit/{b1,b2,c,d}.txt (13+11+19+15 = 58 = git status, no #42 overlap, no untracked).

## Steps
- [x] 1. git status: 58 modified files, each in exactly one slice; none on #42's list; nothing untracked.
- [x] 2. Handovers between site slices: D->C (note.tsx box `Release notes of release ${n}`, same as console/rule-releases) already applied by C (note.tsx:100 vs rule-releases:224). A->C (content-due.test.tsx focus-visible:ring-2 count) done by C. Every other handover targets slice E (e2e) or F: passed on, not applied (not a site slice's file).
  Cross-check (scratchpad/commit/check.mjs): 78 tables + 6 boxes in the 58 files, each table ScrollTable's only child, label == aria-label (or labelledby), every min-w in {32,36,40,48,54}rem, no style=, no hex. Whole apps/web/src: 87 tables, bare only in #42's 3 exempt files (1, 2, 1); style only in global-error.tsx (pre-existing, ADR's Not covered).
- [x] 3. typecheck passed (22 projects); pnpm lint passed (1,615 files, 0 errors, 0 warnings); vitest --project unit apps/web tools/brand-colors tools/brand-copy tools/brand-fonts: 71 files, 884 tests passed; lint:copy passed (516 files). Nothing to fix. Logs: scratchpad/commit/{typecheck,lint,vitest}.log. Messages drafted: scratchpad/commit/msg-{b1,b2,c,d}.txt
- [x] 4. Commits B1, B2, C, D (below); working tree clean, 4 ahead of origin, not pushed.

## Commits
- B1 1508bb93 (13 files)
- B2 fe203077 (11 files)
- C 2a25282f (19 files)
- D 47b97c81 (15 files)

ALL DONE. Handovers to slice E (e2e exact: true at models.spec.ts:83,148,194 ('Version'), :133,:181 and layout-1280.spec.ts:167 ('Rate record 1'), pricing.spec.ts:238 ('Release 900001'); DR-16 names; tables-phone persona notes) passed on unapplied: not a site slice's file.
