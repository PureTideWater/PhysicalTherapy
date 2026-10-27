# design-suitecap1-review progress
Started 2026-10-27. Reviewing /home/user/ops/designs/suite-cap-1-triage-locks.md (78 KB, 988 lines, mtime 17:01).
Clone: scratchpad/designs/suitecap1-review (base e908c21; #42 head 8aa45a46 fetched; design cites 098636e3).
Design read in full (run 2).
## Leads opened (to check)
L1 definer trigger + FORCE RLS: helpers/seeds that insert line_status without app.practice_ids (superuser/owner) now fail on head insert?
L2 backfill: practice table RLS -> array_agg empty -> empty head -> stage regression; migrate.ts isolation level / lock_timeout
L3 'ledger_line:'/'ledger_evidence:' keys used elsewhere (paired locks) -> D8 breaks pairing?; all ledger_entry writers under lockLedger?
L4 harness check 64 advisory locks vs loader TRACE_LOCK_BUCKETS (+1 practice lock = 65?) ; CAS-41.4 sampler during pricing
L5 cursor_tuple_fraction plan risk for DECLARE CURSOR
L6 report/triage isolation level (REPEATABLE READ -> 40001 on ON CONFLICT)
L7 insertStage savepoint/catch semantics vs lock release
L8 catalog rules on SECURITY DEFINER / indexes leading practice_id
L9 #42 / SS-01 / interest design touching line_status_rules or ledger functions
L10 large tests run in CI on PRs? CI max_locks setting
L11 pgboss retry_count / archive
L12 line_status_ledger_rules reads before lock
## Leads closed (sound)
## Findings so far
