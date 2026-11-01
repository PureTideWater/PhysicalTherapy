# PR #85 reviewer 2 (security+money), new findings only
Started 2026-11-01. Clone /home/user/rev85-sec at 90ec40ab.
## Paths traced
## New findings
- [x] write-off.ts/triage.ts/caseLineState: FOR UPDATE OF cl, same window_passed SQL as triage; no new path beyond F1.
- [x] tagging.ts/abstraction.ts lock order: tag does plain SELECT on source_document then advisory; no row locks crossing -> no deadlock seen. opaqueId = z.uuid lowercased, response documentId lowercased: same lock text.
- [x] contract writers: createDraftVersion/attachDocument (tagging), amend/supersede, updateDraftVersion (abstraction.ts:189, check docs).
- NEW N1 (should-fix, introduced): RESPONSE_HINT under Response omits that Denied without "Reopen" marks the case Resolved (case_rules.sql ELSE branch :69-70); only acceptances named. submissions/page.tsx RESPONSE_HINT.
- [x] recordResponseAction: submission check, lock+check, recordResponseOnce (latest-response compare; no submission lock, pre-existing). worker recordPayerResponse only other writer (document null).
- [x] uploader inside form: buttons type=button, ReceiptList hidden; ReceiptStatus no buttons.
- candidate N2 (polish): letter uploaded in case B's form, not yet recorded, sits in case A's top "unused" group (D3 deliberate-choice promise does not hold); same root as design 2.8 residual.
- NEW N2 (should-fix, predates; design 2.1 kept it): Received on prefilled today; payer_response_rules computes next_window_ends_on = case_next_dispute_window(case, level, received_on) = received_on + appeal days, which case_rules sets as the case deadline and readiness's next_window_passed gate reads. Untouched default overstates the next-level deadline.
- N3 = candidate above, polish, predates (narrowed by the PR).
- [x] packet evidence attachable list (packets/queries.ts:183) lists every letter incl. other cases' response letters, no status='stored' filter: predates, not in scope of the diff; noted only.
- DONE: returning StructuredOutput.
