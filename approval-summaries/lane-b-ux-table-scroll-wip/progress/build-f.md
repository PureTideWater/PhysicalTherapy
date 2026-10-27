# build-f progress (slice F: guard, ADR, matrix, synth)

Worktree /home/user/ux-table-scroll, HEAD 47b97c81 (A, B1, B2, C, D committed). Do not commit.

## Steps
- [x] 1. Read design (section 12 wins), review JSON, scout notes. No ADR index/README in docs/adr (none to update).
- [x] 2. apps/web/src/app/tables.test.ts written: 3 tests pass (87 tables, 4 bare in AFTER_42 files), eslint clean. Rules 1-4, import-binding resolution (relative specifiers resolved to components/scroll-table; no @/ alias exists), messages name the exemption line.
- [x] 3. ADR 0078 written (section 6 text + DR-01,03,04,05,06,07a/b,08,10,11,12,13,14,16); ADR 0056 Status continuation line "and [0078]" + italic pointer after the Chrome paragraph (:53).
- [x] 4. test-matrix TBL section + matrix.ts (generated from scratchpad/build-f/tbl-rows.json, byte-equal) + registry.ts + common.ts TBL: 17 + types.ts TBL: done
- [x] 5. pnpm synth --all: wrote only TBL-01..04/expected.json (628 unchanged, EMR 16 unchanged). fixtures.test: 22/23 pass; the one failure is TBL-01..03 assertedBy apps/web/e2e/tables-phone.spec.ts (builder E, not yet written). RECHECK later.
- [x] 6. tables.test.ts 3/3; tools/brand-colors + apps/web/src/app 16/16; lint:copy 516 files OK; eslint (own 5 ts files) 0; tsc apps/web + packages/synth 0. verify-content does not read docs (content/releases only): not run.
- [x] 7. tables-phone.spec.ts appeared (E); fixtures.test 23/23. E's a11y.ts matches ADR 0078 Decision 6 (rendered guard + scrollersAtOdds poll before axe). tables.test.ts rerun 3/3, eslint 0.

ALL DONE (not committed). Handover: TBL-03 assertedBy lists reports.spec.ts and onboarding.spec.ts; E had not yet edited them at 15:22: E must add their atPhoneWidth calls, or the integrator trims TBL-03 assertedBy and reruns pnpm synth --all.
