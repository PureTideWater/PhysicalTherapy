# fix-records progress
Started 2026-10-27T16:51:53Z. Nothing written yet.

## 1. Cross-file needs
- DONE terms page Document reference hint (F3 #1): apps/web/src/app/console/terms/page.tsx:67 "Where the signed-off document is kept: letters, digits, colons, slashes, dots, underscores and hyphens, such as terms/2026-11."
- DONE submissions/page.tsx response-document SelectField gets showChosen (F2 need)
- DONE harness (forms-harness.tsx): screening gets <Keys page>, new `hardwareKey` form (F3 #2)
- DONE split-form.browser.test.tsx: FRM-01 person-change test (F3 #3) + header line
- DONE action-form.browser.test.tsx: FRM-05 hardware-key test (F3 #4), U-UX-10
- TODO run those browser tests; e2e: hardware-key step (F3 #5) in forms-keep-input.spec.ts; F1 (a) Already-sent e2e step; F1 (b) other-person e2e step (needs persona forms-second in scripts/synthetic-personas.ts)
- DONE persona forms-second (scripts/synthetic-personas.ts); e2e steps (a) Already-sent and (b) other-person in forms-keep-input.spec.ts support test; title + header updated
- DECIDED: no hardware-key e2e step (server answers an address with no key with request options, no enumeration; the refusal only comes at the WebAuthn timeout, up to 60 s, the tour waits 90 s); harness test covers the order
- tsc apps/web: pass; eslint 7 files: clean; browser tests 36/36
- RUNNING e2e records-run1 (forms-keep-input + packets), log scratchpad/e2e-logs/records-run1.log
## 2. ADR 0077 — DONE (script scratchpad/records/adr_edit.py, applied once; backup adr0077.before.md)
- D1 pin + duplicate/Already sent + ActionState.duplicate; D2 locked note + secrets lead; D3 wrap rule narrowed + hardware key first; D4 cleared focuses; D6 select rule + showChosen (+CSSOM/CSP note: VERIFY in browser); D8 locked props + pressed look; D9 14 px hints; D10 same person; NEW D11 other person cleared; NEW D12 split form status line; 4 alternatives; consequences (titles, option groups, support mail, five personas); Not covered (no JS loses values; hand-written forms); Revisit (#42 upload form)
- e2e records-run1 (forms-keep-input + packets, --workers=2): 8/8 passed 17:05:40-17:08:43Z (new support steps (a) Already sent and (b) other person pass)
## 4. Test matrix
- DONE FRM-01, FRM-05, FRM-07, FRM-08 rows + FRM intro (test-matrix.md, matrix.ts) via scratchpad/records/matrix_edit.py (applied once)
- TODO registry assertedBy: FRM-01 + split-form.browser.test.tsx; FRM-06 + FRM-07 + fields.test.tsx (pre-existing gap); FRM-07 + components.test.tsx? (check title); FRM-08 + packets.spec.ts; then pnpm synth --all + synth tests
- DONE registry: FRM-01 + split-form.browser.test.tsx; FRM-06 + fields.test.tsx; FRM-07 + fields.test.tsx; FRM-08 + packets.spec.ts (reason reworded)
- DONE pnpm synth --all: 5 expected.json rewritten (FRM-01,05,06,07,08); synth unit tests 13 files 185/185; eslint registry/matrix clean
- NEXT: seed.db.test (new persona), CSP/CSSOM browser check, then design 12.2 + 3.5 + 10.2 + 10.3
- DONE CSP/CSSOM check (records/csp/check.mjs, Chromium 1194): cssom applies 'absolute', setAttribute('style') blocked (style-src-attr violation). ADR D6 sentence holds.
- DONE seed.db.test (new persona forms-second): 1/1 pass (log records/seed-db.log)
## 3. Design — STARTING (backup records/design.before.md)
- DONE ADR renumber (19:15Z): code cites "docs/adr/0077, D10" for the person mark (next.ts, form-keys, form-issues, split-form, next.test), so the other-person decision is folded into D10 (heading widened) and the split form's status line is D11 (no D12). Backup records/adr0077.before-renumber.md. No line >120 added.
- 19:20Z writing records/design_edit.py (3.5 wrap+titles, 2.1/2.6 duplicate words, 3.8 fallback, 4.6 quiet list, 5.1 select rule+showChosen, 5.3 locked props+pressed, 5.4 apostrophes, 10.2, 10.3, 11.2.6, new 12.2). Apply once from records/design.before.md.
- 19:32Z APPLIED design_edit.py (from design.before.md + design-12.2.md)
- 19:36Z re-APPLIED design_edit.py (code spans kept whole; 10.1 screening row; CSP wording)
- 19:38Z re-APPLIED design_edit.py (+9.1 decisions and Not covered)
- 19:40Z ADR: D3 names flex-col-reverse too (reflowed); Date line notes the 2026-10-27 revision
- 19:42Z checks after the doc edits: lint:copy 517 files clean; check:fixtures clean; gitleaks 8.24.3 (dir scan of my changed files) no leaks.
## DONE (all four parts). Design: 3.5 (states, wrap rule corrected, titles), 2.1/2.6 (pinned key, "already sent"), 3.8 (fallback skip), 4.6 (quiet list + status line; another person), 5.1, 5.3, 5.4, 9.1, 10.1 (screening row), 10.2, 10.3, 11.2.6, 12 row 8, new 12.2 (16 rows + 3 not-defects + also-in-round + 8 open proposals). Script records/design_edit.py + records/design-12.2.md, applied from records/design.before.md.
