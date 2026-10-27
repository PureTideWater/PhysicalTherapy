# dlr-build-integrate progress (integration check)
Started 2026-10-27.
## 1. status / diff --stat
- 37 modified + 8 new paths (+4 fixture dirs). #42 overlap: only test-matrix.md, synth matrix.ts, registry.ts (allowed shared docs).
- outside design's list but justified by builders: scripts/synthetic-personas.ts (e2e personas), uploads/page.tsx + uploader.tsx + receipt-labels.ts (R05 from=), components/coverage/letter.tsx(+test) (letter form extracted), tools/brand-copy/scan.ts(+test) (coverage dirs were skipped).
- ignored only: .next, next-env.d.ts, test-results/, tsbuildinfo, PAR-29/generated. No stray files.
- typecheck (pnpm typecheck, 22 projects): passed, exit 0 (15:41-15:42)
- lint (pnpm lint, 3 groups, 1,620 files): passed, 0 errors 0 warnings (15:43-15:45)
- running: vitest --project unit apps/web packages/synth tools/brand-copy (log scratchpad/dlr-int-unit.log)
## 3. design checks (reading)
- 15 downloadHandler routes, 15 with returnTo (packets x4, uploadReport, payerLetter, roi x2, reviewCsv, reportPdf/Csv, monthly csv, documents x2, exportEvidence)
- D4: no <a download> left in apps/web/src
- autoFocus: only letter.tsx controls + DownloadRefusal; one notice rendered per page (reports page: one of two, by ?list=)
- unit (vitest --project unit apps/web packages/synth tools/brand-copy): 83 files, 1166 passed, exit 0
- named files (json reporter): download-refusal.test.ts 135/135 (R01 scan 16/16), http.test.ts 46/46 (unchanged), letter.test.ts 9/9, registry.test.ts 227/227, partition 9/9, download-refusal.test.tsx 12/12, coverage/letter.test.tsx 9/9, synth fixtures.test.ts 23/23, brand-copy scan.test.ts 44/44
- lint:copy pass (524 files); lint:logs pass (1058 files); pnpm synth --all: 0 written, 632+16 unchanged; git status identical before/after
- FIX 1 (improvement): components/download-refusal.tsx dropped unused props `invalid` and `autoFocus` (no page passes them: the letter renders no notice when it marks a field; doc comment said the letter passes autoFocus={false}, which was false). Test case for them removed from download-refusal.test.tsx. tsc apps/web exit 0, eslint exit 0, 2 component test files 20/20.
- e2e run 1 (pnpm test:e2e e2e/download-refusals.spec.ts --workers=1, E2E_DATABASE=tp_e2e_dlri E2E_PORT=3198, build included, after FIX 1): 1 passed (1.3m; test 25.6s), exit 0, 15:50-15:52
- no manifest/lockfile change; no migration; nothing under packages/pricing; no model identifier in changed files
- page param collisions: none (reports page has no `list`; coverage page has no payer/contract/codes; packet `version` is its own param)
- e2e run 2 started ~15:53: reports, packets, uploads, mapping specs --workers=2 (log progress/dlr-int-e2e-run2.log)
- e2e run 2 (reports, packets, uploads, mapping --workers=2): 9 passed (3.4m), exit 0, 15:52-15:56 (reports 3/3, packets 2/2, uploads 3/3, mapping 1/1)
- e2e run 3 (onboarding, layout-1280, era-exports, monitoring, viewer-phi --workers=2): 11 passed (3.8m), exit 0, 15:56-16:00
- cleanup: dropped tp_e2e_dlri, removed /tmp/tp-e2e-tp_e2e_dlri-*; no server left on 3198; git status unchanged by e2e; apps/web/test-results empty (ignored)
- after FIX 1: lint:copy pass (524); vitest unit download-refusal.test.ts + apps/web/src/components: 26 files, 355 passed
## DONE (integration check)
