# design-interest-review progress
Started 2026-10-27. Reviewing /home/user/ops/designs/ledger-interest-once.md (87007 bytes, mtime 15:44).
## Leads opened
## Leads closed (sound)
## Findings
- Read design fully (1068 lines) at 16:15.
- Clone at scratchpad/designs/interest-review (base e908c21). #42 head moved 098636e3 -> d14f0ac5 (49 commits over base); since 098636e3 changed mail_streams.sql, test-matrix.md, schema/operations.ts, watched-paths.txt; no ledger function touched (ledger_match_rules unchanged on #42).
## Leads (open)
- L1 named L6 'left' keyed per (L6,claim) vs per L6: lines approved by different claims w/ same CLP07 hash, or pooled->named switch after out-of-order load -> double credit or Postgres refusal => reconcile stuck
- L2 take-back requires standing approved claim match to X (ledger_match_rules); person-reversed claim match or superseded -> take-back skipped/refused
- L3 adjustment of negative interest entry vs frozen ledger_entry_within_line
- L4 deploy window: pg-boss retry exhaustion; whole-practice reconcile blocked on rollback
- L5 seq numbering of existing rows = heap order not insertion order (after UPDATE reversals)
- L6 ledger_entry_rules with both IDs; entryProblems location (rules.ts vs stages.ts) vs exception file list
- L7 N1 for negative parts
- L8 founder rulings / LANES / 15b status
