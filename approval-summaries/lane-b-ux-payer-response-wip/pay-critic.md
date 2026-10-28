# pay-critic progress (read-only design-conformance critic, co-001/ux-payer-response)
Started. Reading design in full (1499 lines).
## Gaps found
(none yet)
- Design read in full (1-9). Next: diff slice A (write-off), B (uploader, response-letter), C (submissions), D (contract), E (tests/docs).
- Read all diffs: slice A (write-off, triage route, case page, unit test, triage e2e), B (uploader, response-letter, harness, browser test, uploadGate), C (submissions lib/route/page, packets e2e, unattested e2e), D (contract-queries, tagging, abstraction, contracts route/page), E (db test, matrix, registry, ADR). 6.1 strings all exact. 4.1 rows exact. 4.4/4.5/4.6 items all present.
- Candidate nits so far: (n1) duplicate-original-listed but person chose other -> status 'none' (no 6.1 words; checker noted). (n2) letter chosen before upload began is never replaced (table says "since the upload began"; bold rule stricter; checker noted). (n3) ADR D4 lists "the console's count" as a list the letter leaves, though PR does not change it (design 5.1 has same words; Consequences qualifies).
- Next: trace correctness (state after successful record; redirect; letters after record).
- Correctness traced: write-off check (same SQL both sides, inside branch, FOR UPDATE), letter predicate + lock (lowercased IDs on all 5 paths, no deadlock: no row lock before advisory lock on either path), cross-practice (RLS + practice_id on all reads, receipt link same practice), typed values (controlled letter select, stable defaults, remount on other person), uploader buttons (Retry type=button, ReceiptStatus has none). No blocking/should-fix found.
- Further nits: (n4) DOCUMENT_USE_LOCK copied 3x; (n5) fixtures CAS-45..48 expected.json outside slice tables vs design "No synth fixture" (generator output, CAS-39 precedent); (n6) duplicate original beyond LIMIT 50 -> 'duplicate-unusable' words false, and thisCase group cut when >=50 unused; (n7) uploadGate paused state on Contracts/Reconciliation untested; (n8) tour 6.2 + PR description 3.9 outside repo.
- DONE: returning StructuredOutput.
