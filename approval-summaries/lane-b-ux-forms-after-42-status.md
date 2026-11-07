COUNTER REQUEST (S3, 2026-11-07 01:20 UTC): one test-matrix row for "The shell's skip link" (placeholder FRM-<1>; the design recommends the next CI row beside CI-19). No ADR (ADR 0077 amended).

# Lane B: ux-forms-after-42 status (`co-001/ux-forms-after-42`)

Held by Lane B session S3 https://claude.ai/code/session_01FcouKQJppM8BdCui7NVQUa from 2026-11-06 23:00 UTC (assigned by Lane B's orchestrator at 22:57 UTC, from S5's queue). GitHub login PureTideWater. Every choice takes the recommended option (security the safer) and is recorded here.

Scope: design `designs/lane-b-ux-forms.md` section 7.8 (and 5.4's console support Ticket hint, 11's proposals as applicable), re-read against the current base. #42 merged 2026-11-02 as 22789493. Avoid the screening result screens (S5's UX PR 4b); rule 6 for shared files. Counters only via the orchestrator (COUNTER REQUEST).

Open questions: none.

<!-- RESUME-BLOCK -->
## Current state
- **2026-11-06 23:00 UTC:** claimed; base 31a7345f (#130). Next: design refresh (7.8 against the base) with one reviewer and a critic, as a workflow; then build, before/after shots, draft PR, the UX and brand review, fix round with the full suite once, one push, CI, verification, merge.
- **2026-11-07 00:35 UTC:** design refresh wf_8ed4a036-bce (`workflow-scripts/lane-b-ux-forms-after-42-design-wf_8ed4a036-bce.js`) stopped by the account's 5-hour limit at its start (reset 00:10 UTC) and resumed in the same run; PostgreSQL restarted by setup-container after a worker restart. Progress `lane-b-ux-forms-after-42-wip/progress/`. Local branch co-001/ux-forms-after-42 = 31a7345f (nothing to push yet).
- **2026-11-07 01:20 UTC:** design done (wf_8ed4a036-bce: four scouts, writer, one adversarial reviewer with two skeptics per finding (16 of 17 kept; R6 refuted), a critic (11, all confirmed, 3 blocking: tables.test.ts, matrix.ts word-for-word, the legal surfaces), applied): `designs/lane-b-ux-forms-after-42.md`, section 10 the dispositions. Slices U (upload form on the shared core, method=post, stale, noscript), C (Ticket hint, users-page tables in ScrollTable, skip link), W1 (#42 words: ZIP, correspondence, public forms; legal surfaces untouched), W2 (one separator rule, guard test), E (e2e, records, ADR 0077 amendment, BRAND.md). 35 shot ids (some tour states to add on claude/build-ops). Two reviews (UX and brand; security and privacy). Next: build workflow.
<!-- RESUME-BLOCK -->
