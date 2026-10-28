# Lane B item: the packet verifier reads a five-digit day count as a code (`co-001/packet-day-counts`)

Session: https://claude.ai/code/session_019i9ifC3LkwNtonZfNSNmCp (the follow-on of redact-placeholders, which merged as #80, 0dd1ba7). Started 2026-10-28 00:25 UTC by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg). GitHub login: PureTideWater.
Reserved: ADR 0086 if needed; test-matrix CAS-43 to CAS-44; `packages/synth` the same if needed (module 5). packages/packets is a money package: keep its mutation shard's score; reviews: payment-engine checklist and correctness.
Source: product observation (b) in `approval-summaries/lane-b-test-flakes-status.md`: `packages/packets/src/facts.ts` `quoted(source.quote, dayCounts)` sends a five-digit number in a contract-window quote to codes, so a narrative's "10000 visits" passes when the window says 10000 days.

## Log (UTC)
- 2026-10-28 00:25: worktree `/home/user/packet-day-counts` cut from `claude/build-platform` 0dd1ba7, installed. First reading: the scanner (`scan.ts`) types a figure by its shape alone (five digits are a code), and the facts are sets by type, so a figure a quote holds passes in any role the narrative gives it. Analysis, design, design review and build running as one workflow.
- 2026-10-28 00:20: resumed per the orchestrator's 00:15 notice (this session had already continued after the 00:00 reset: #80 merged 00:15). Design workflow wf_cd5cf1da-e8b running (`workflow-scripts/lane-b-packet-day-counts-design-build-wf_cd5cf1da-e8b.js`); safety check-in at 05:28 UTC; setup script re-run in the background (PostgreSQL for the later suite).
- 2026-10-28 ~04:10: design (`designs/lane-b-packet-day-counts.md`: 42 false passes and 2 false failures in 62 probes; root cause the shape-only typing and per-kind fact sets; fix: one role reader `roles.ts` for the narrative, every quoted text and the browser, facts held with their roles, quoted figures repeated only beside their own words) and its review done; the builder started.
- 2026-10-28 05:13: the builder was stopped by the account's 5-hour limit (reset 05:10). Its work in progress pushed to `co-001/wip-packet-day-counts` (uncommitted in the worktree for the builder). Workflow resumed (same run, design and review from cache; the builder continues from `progress/pdc-builder.md`). Safety check-in moved to 10:24 UTC.
- For Lane A (from the design, outside this item): a migration to accept and require `tp-packet-verifier/3`, so a version the old verifier passed shows "verifier outdated". This PR keeps the report format `tp-packet-verifier/2` (the export job re-runs the verifier, so a stored version the new rules fail is refused before it reaches a payer).

## Waiting on someone
None. (A Lane A migration for `tp-packet-verifier/3` is proposed above, not needed by this PR.)

## Next step
The design workflow's result; then a draft PR, two reviews (payment-engine-reviewer and correctness), fix round with the full local suite and the packets mutation shards, verification, merge.
