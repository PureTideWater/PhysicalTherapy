# i126b rv-db round 1 (delta c49367c5..d2fdd106) -- second-round db reviewer
## prior notes (i126-rv-db.md, delta to 23369ae6) carried over; verify vs d2fdd106
## checked
## found
- clone rv2-db-1 at d2fdd106, install ok. first-parent own commits: 16 (prior 14 + 35e7762a? + d2fdd106 unit test only)
- packages/db/functions: no change in delta (incl. base merges); migration changed only in 99579d0c (header + DO lock loop): consistent with functions unchanged
- runner: real run = one txn per migration (migrate.ts:195); dry run = ONE txn for all pending (migrate.ts:158-176)
- 0083's loop takes SHARE/SHARE ROW EXCL (readers pass); 0084's takes ACCESS EXCLUSIVE (any reader blocks a try) -- note, check runbook coverage
- lock-loop test packages/db/src/ledger-interest.db.test.ts reads loop from file; OK
