# dlr-build-docs progress (records builder)
Started 2026-10-27. Tasks: 1 ADR 0079, 2 test-matrix DLR section, 3 synth DLR (types, common, matrix, registry, fixtures), 4 brand-copy roots check.
## Status
- [ ] 1 ADR
- [ ] 2 test-matrix
- [ ] 3 synth
- [ ] 4 brand-copy
## Commands
- read: design (all), review json, dlr-api.md, core/coverage/packets/reports progress (all DONE), handler/route/invoke diffs, download-refusal.ts, component, routes' returnTo, tests list, e2e header, synth registry/matrix/types/common, fixtures.test.ts, brand-copy COPY_ROOTS
- decisions: ADR sections follow 0072/0073 ("Alternatives considered" = the task's "Rejected options"); DLR completesIn 11 (production readiness: error pages; compliance export is M11); DLR section after RCC (last)
- probe (tsx scratch phi-probe.ts): keptCodes keeps "Call 555 0100 to restore access" (no PHI finding) -> residual spoofing into the codes input via a crafted link (page re-reads ?codes= only with ?refused=); recorded in ADR Consequences + notes for security review; not changed (core, design R08 accepted)
- [x] 1 ADR written: docs/adr/0079-answer-a-downloads-refusal-to-a-browser-navigation-with-303-to-the-page-it-was-opened-from-in-closed-codes-and-keep-the-json-outcome-for-scripts.md
- [x] 2 test-matrix: '## Download refusals (DLR)' appended after RCC; 4 rows, NF=5 each (no '|' in cells)
- [x] 3a synth: matrix.ts rows generated from md by script (scratchpad dlr-matrix-rows.ts); types.ts 'DLR'; common.ts DLR: 18; registry.ts DLR-01..04 none(11, ...) after RCC-08
- [ ] 3b pnpm synth --all; git status; synth tests
- synth unit (13 files incl fixtures.test.ts): 185 pass, exit 0; pnpm synth --all: 4 written (DLR-01..04), 628 unchanged, 0 removed; git status: only DLR fixtures + my files
- [x] 4 brand-copy: 'coverage' in SKIPPED_DIRECTORIES skipped app/p/[practiceId]/coverage, components/coverage (letter.tsx NEW), lib/coverage -> removed from set (coverage report is root /coverage/), scan.test.ts fixture + real-tree cases added; probe: 0 findings in the 7 newly read files
- checks (one locked batch, log scratchpad/dlr-docs-checks.log): vitest brand-copy scan.test.ts 44 pass; pnpm lint:copy 524 files clean (was 517); eslint 6 files exit 0; tsc -p packages/synth exit 0; tsc -p tools: pending
- tsc -p tools --noEmit: exit 0
- ADR rewrapped (one paragraph); no model identifiers in my files
## DONE (records): ADR 0079, test-matrix DLR, synth (types/common/matrix/registry + 4 fixtures), brand-copy coverage-dir fix
