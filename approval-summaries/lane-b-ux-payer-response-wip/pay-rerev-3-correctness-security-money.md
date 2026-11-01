# Re-review round 3: correctness, security, money (HEAD cf6d0f42; fix3 uncommitted in worktree, in flight)
Started 2026-11-01 20:00 UTC (no earlier progress file). Read rerev-1/2 and fix3 progress.
## Checked
## Findings
- R1 (round 1, receivedOn bounds): DB trigger payer_response_belongs refuses received_on < submitted_on or > today UTC (23514 -> underPacketRules form refusal). Bounded. OK.
- S2-N2 zod: empty/blank/missing -> RECEIVED_ON_EMPTY on field. Calendar validity regex-only, pre-existing. OK.
- S2-N3 SQL grouping + partitioned limit: own uploads first within limit, this_case unlimited. app_actor_id() is the person. OK.
- DOCUMENT_USE_LOCK export/import: same SQL, no cycle (tagging imports nothing from packets). Lock before check. OK.
- Upload gate: SUSPENSION_FOR_UPLOADS keys; uploader title fallback; all gate consumers typed UploadGate. Server gate unchanged. OK.
- response-letter: auto-choose only when empty or field's own; duplicate-not-chosen(-other-case) statusText names copy time; never overrides person. OK.
- response-card texts vs letterHint: consistent across 4 states. OK.
- case_rules.sql vs RESPONSE_HINT at HEAD: true except reopened line (round-2 polish, fix3 addressing in worktree, uncommitted).
- responseDocumentChoosable: same RESPONSE_DOCUMENT predicate, lock first, practice-scoped. Route accepts any choosable letter even past the list limit (unchanged, fine).
- Re-ran workbench-routes db -t "S2-N|Denied|uploader|limit|Received" on 5433 (tree = HEAD + fix3 uncommitted): 3 passed.
- fix3 in-flight (uncommitted) read: hint clause for reopened line true to case_rules (resolved_lines branch precedes reopened_lines, covered by "a line at Payer approved or later"); suspendedGate fallback fine.
## Findings
None. DONE: verdict all fixes hold; no new defect.
