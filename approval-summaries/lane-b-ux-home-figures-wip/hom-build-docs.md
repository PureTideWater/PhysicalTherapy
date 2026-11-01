# hom-build-docs progress (ADR 0082, test-matrix HOM, synth module 20)
Started 2026-11-01 fresh in /home/user/ux-home-figures.
## Done
- ADR: docs/adr/0082-read-every-live-actionable-figure-through-one-predicate-in-the-workers-triage-entry-count-its-lines-with-it-and-keep-the-stored-case-total-as-the-cases-ask.md
- test-matrix.md: "## Home figures (HOM)" after DLR, HOM-01..04 (amended by F1,F4,F5,F7,F8,F9,F12)
- synth: HOM in CASE_MODULES, HOM: 20, matrix.ts rows, registry none(9,...) HOM-01..04 (NOTE: do not run prettier on synth: no repo config, it reformats whole files)
- pnpm synth --all: only fixtures/synthetic/HOM-0{1..4}/expected.json written (650 unchanged)
- synth vitest: 184 pass, 1 fail = "points only at tests that exist": HOM-02/03 name apps/web/src/components/dashboard/headline.test.tsx (and HOM-02 components/format.test.ts), the screens builder's files, not yet created. Re-run once they exist.
- eslint synth files 0; tsc synth 0; lint:copy pass (539 files)
## DONE (pending only the screens builder's two test files)
