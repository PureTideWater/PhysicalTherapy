# Lane B: ux-home-figures status (co-001/ux-home-figures)

One actionable figure on the home and the ROI statement, and the Recovered tile names its period (the UX review's PR 9;
UX-003 (C-009), UX-015 (C-048), UX-140 (C-183); `designs/lane-b-ux-review.md` §3.2 "UX PR 9";
`designs/lane-b-ux-review/synthesis/prs.json` order 9). Run by session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session
started 2026-10-27 by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), as the follow-on of PR 5
(`co-001/ux-download-refusals`, merged as #78, 83d71fd, 2026-10-28 06:51 UTC).

## Now (2026-10-28 07:50 UTC)
- **Stage 1 done:** the design `designs/lane-b-ux-home-figures.md` (D1 to D11; the predicate in `apps/worker/src/triage/actionable-now.ts`, exported through `@tp/worker/triage`, since `@tp/triage` holds no SQL) and its adversarial review (`wf_132e0b59-2b4`: build with changes; no migration; no frozen code; 13 findings, all taken, dispositions at the design's end, which win). ADR 0082 is taken. **Next: stage 2, builders.**
- **Branch:** `co-001/ux-home-figures`, worktree `/home/user/ux-home-figures`, cut from claude/build-platform 83d71fd,
  pushed (no commits of its own yet). No PR.
- **Reserved:** ADR 0082 if needed; test-matrix HOM-01 to HOM-04, a new series; `packages/synth` module 20 (HOM) if needed.
- **Reviews (the brief):** the UX and brand review, and the payment-engine review (`.claude/agents/payment-engine-reviewer.md`,
  as a default workflow agent with that checklist). It changes how a dollar figure is computed and shown: code computes
  every number (CLAUDE.md rule 1), money stays integer cents.
- **For Lane A, if found:** anything that needs a migration or changes frozen code (the engine under packages/pricing,
  the ledger's existing behaviour) is recorded here and left out.
- **#42 files:** none of the review's file list is in #42's (217 files at 06:52 UTC; #42 still open).

## Log
- 2026-10-28 06:55 UTC: PR 5 merged (#78); PR 9 started: branch cut, status file written.
- 2026-10-28 07:45 UTC: design and review done (wf_132e0b59-2b4); dispositions written.

## Waiting on someone
- Nothing.

## For Lane A (left out of this PR)
- **F9:** a fifth `roi_links_valid()` key, `actionable_open_lines` (the priced_line IDs a statement's actionable figure counted, whose `variance_cents` never change), so a stored statement's actionable figure can be recomputed. A migration.
- **Open question 3 (PR 11):** should the refreshed stored `case.actionable_cents` hold the live figure (`ACTIONABLE_NOW`)? That would make the home an indexed read with bounded time. If the CAS-41 gate (F1) fails, the home's statement goes there too.

## Proposals (improve as you go, outside this PR)
- **After #42:** the monthly summary's actionable bucket (`lib/monitoring/queries.ts`, its CSV and PDF) counts a case line only through the line predicate and reports the rest apart as out of the figure (F2); "stage-five" in `components/help.ts`, and a copy-lint rule against stage numbers.
- The audit report's run-scoped actionable (no pricing check; its "not cash until it posts" note, which has no proof level to word it by): a follow-up of its own.
- The digest's set of cases nearing their deadline (state open, from today) differs from the home's (every worked state, passed deadlines included): align them in one definition, in its own PR.
