# p4 build D progress
Started 2026-10-28. Worktree /home/user/ux-screening-result-tables. Do not commit.
## Steps
- [x] read design, review, scout notes, slices A/B/C progress
- [x] ADR 0078 amendment (after Decision 5; 994 not 1263; plus one sentence on the rows copy taking the unpriced tone first, DR-03)
- [x] test-matrix TBL-05..08 + reword TBL-01/03/04 + intro (texts in scratchpad/p4d/rows.json; TBL-06 994 + top rows overflow; TBL-08 title "words and tones", phone tone, nouns agree)
- [x] matrix.ts byte-equal (generated from rows.json by script)
- [x] registry.ts (4.8; TBL-08 also assertedBy screening-phone.spec.ts, DR-03)
- [x] pnpm synth --all -> 7 written (TBL-01,03,04 rewritten; TBL-05..08 new), nothing else changed
- [x] watched.ts --write: +table-parts.tsx, +stacked-rows.tsx, AND -apps/web/src/lib/copy/words.ts (result-summary.tsx no longer imports counted(); report as deviation)
- [x] checks: synth fixtures test + watched.test.ts 29/29; pnpm verify-content pass; pnpm lint:copy 517 files pass; eslint matrix.ts/registry.ts clean; tsc packages/synth clean
- [x] synth fixtures test + watched.test.ts: 29/29 pass
STATUS: slice D DONE, not committed. Logs in scratchpad/p4d/.
