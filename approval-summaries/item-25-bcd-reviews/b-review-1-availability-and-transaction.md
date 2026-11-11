# Review B1: availability and transaction correctness, Queues item 25 (b)

Branch co-001/screening-upload-bounded-wait, `git diff origin/claude/build-platform..HEAD` (commits d20469fb, fe04a4f5).
Read-only review: no repository file was changed (`git status --porcelain` empty before and after). Synthetic data only.
The one test was run: `routes.db.test.ts -t "waits past the limit"` passed (1 passed, 56 skipped, 7.4 s).
This review says nothing about HIPAA compliance.

## Findings

### B1-1 should fix: a client whose ROLLBACK or BEGIN failed goes back to the pool without being destroyed
- apps/web/src/lib/screening/routes.ts:208 (BEGIN), :216 (`ROLLBACK').catch(() => undefined)`), :220 (`client.release()`).
- The scope library's own transaction (packages/db/src/authz/scope.ts:210 and :229) calls `release(true)` when BEGIN
  fails and `release(discard)` when ROLLBACK fails. This wrapper calls `release()` either way. A client that could not
  be rolled back goes back to the pool unless pg-pool's private check (`!client._queryable || client._ending`,
  pg-pool index.js:392) happens to drop it.
- Failing scenario: COMMIT ends without an answer (CommitOutcomeUnknownError) or ROLLBACK is refused while the socket
  still counts as queryable (a pool wrapper or a test double that implements ScopePool without pg-pool's check, or a
  pg version that changes the private flag). The client goes back in a transaction, or aborted (25P02). The next public
  or signed-in request that gets it either fails or runs inside the abandoned transaction. Today's pg-pool drops a
  socket that is really dead, so I found no way to trigger this through the route itself. The gap is that the code
  depends on a private pool field where the library does not.
- Smallest fix: copy scope.ts. Use `let discard = false`; set it to true in the ROLLBACK catch; call
  `client.release(true)` if BEGIN throws; end with `client.release(discard)`. Better still, use the library's transaction
  with its lockTimeout parameter if `@tp/db/runtime` can export it for a public route, so the two cannot drift apart.

### B1-2 should fix (mostly not new): the 3 s limit applies to each lock wait, not to the request, and nothing limits the holder's own run time
- packages/db/functions/submit_screening.sql:74 (two advisory locks in turn), :142 and :147 (FOR UPDATE on each
  prospect and run row being replaced), :159 (DELETE), plus key-share waits from the foreign-key checks on the inserts.
  PostgreSQL applies lock_timeout to every one of these waits, advisory locks included, so each wait is bounded.
  lock-timeout.ts already says this.
- Worst case for one request: an attacker sends two uploads, (practice P, address A) and (practice Q, address B). A
  victim upload of (P, B) can wait about 3 s on the first advisory key, get it when its holder commits, then wait up to
  3 s more on the second key, then up to 3 s on each conflicting row. Each replaced-row wait needs a different holder,
  and replacement keeps few accepted rows per key, so in practice the total is about 6 to 9 s, not unbounded.
- The bigger hold is not a lock wait at all, and this PR leaves it as it was: an upload's own `submit_screening` call
  of up to 50,000 rows (array unnest, sha256, six inserts, the statement-level `screening_result_inserted` trigger)
  holds a connection from the `application` pool. That pool has 10 connections (apps/web/src/lib/server/pools.ts:10)
  and every signed-in request shares it. No statement_timeout limits that call. The rate limit
  (apps/web/src/lib/http/rate-limit.ts:52) allows 10 uploads an hour per client address and 20 a day per account. An
  attacker with about 10 client addresses and 10 accounts can keep about 10 large uploads in flight at once, filling
  the pool for as long as each statement runs, with or without lock contention.
- Smallest fix, no migration needed: set `statement_timeout` in the same transaction, after lock_timeout, using
  `set_config(..., true)`. Size it above the largest honest upload as measured by the capacity harness. Also add a
  per-process limit on how many screening submits can hold a pool connection at once (a semaphore of 2 to 3 of the 10).
  A submit past that limit gets the same SCREENING_BUSY sentence and never waits for a connection.

### B1-3 note: three seconds compared with the first upload's own run time
- Not measured: I could not time a 50,000-row `submit_screening` within the budget, and the capacity runbook does not
  report the web's store phase on its own. A double click in one tab cannot cause this: upload-form.tsx:208/:264 (the
  `inFlight` guard and useGuardedSubmit) sends once.
- Two tabs, or two colleagues uploading for one practice, can. If the first store runs longer than 3 s, the second is
  refused with "nothing was sent ... send it again". That statement is true for the second upload. The first is stored
  and will be emailed, and a resend replaces it. I think refusing is right: the old answer pinned a connection with no
  limit.
- Cost of a resend: one more screening rate-limit hit, one more paid address validation (the global limit is 1,000 a
  day) and one more row in `screening_queue_tally` for the account's daily share.
- Smallest fix: none needed in this PR. Have the capacity harness record the web store phase at 50,000 rows and confirm
  it stays well under 3 s.

### B1-4 note: COMMIT with an unknown outcome is reported as a generic failure, though the run may be stored
- routes.ts:212 (committed), :749-763 (catch). CommitOutcomeUnknownError has no SQLSTATE, so the route rethrows it and
  the person sees a server error.
- The run may still have been stored. If it was, the sweep sends it, and a resend replaces it (the tally counts it
  twice). The route never reports an unstored upload as sent, which is the property that matters, and the autocommit
  version behaved the same way when it lost a connection.
- TransactionNotCommittedError cannot happen here: every failure inside `work` throws before COMMIT is sent.

### B1-5 note: SCREENING_UPLOAD_BUSY also counts waits behind a schema change
- routes.ts:756. An ACCESS EXCLUSIVE lock from a migration on a screening table, held more than 3 s, also surfaces as
  55P03 and is logged as SCREENING_UPLOAD_BUSY. The person's answer is right. Only an alarm reading that code would
  mistake a deploy for contention. You could note this in the runbook or alarm description, or add a field to tell the
  two apart.

### B1-6 should fix: the test proves the bound on one advisory lock, not the rollback, and not the other waits
- apps/web/src/lib/screening/routes.db.test.ts:1330-1357.
- Without the timeout, the upload would wait until the 40 s test timeout and the test would fail. Good.
- The lower bound of 2.5 s and the upper bound of 15 s leave a wide margin around a 3 s wait, so flakes are unlikely.
  The upper bound includes the route's own work, and the address checks are stubbed.
- Gap 1: the check at :1349 (`NOT granted` advisory locks = 0) passes even without the ROLLBACK, because a 55P03 ends
  the wait whether or not the transaction is rolled back. The missing ROLLBACK is only caught indirectly: pg-pool's idle
  list is LIFO, so the follow-up upload reuses the aborted client and fails with 25P02. That depends on pool order.
- Gap 2: only the contact-address key is held. Neither the practice key nor a FOR UPDATE wait on a run held by
  `operator_screening_claim`/`complete` is tested.
- Smallest fix: after the refusal, assert `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
  AND state LIKE 'idle in transaction%'` = 0. Add one case that holds a replaced run's row FOR UPDATE, and one that
  holds the practice key. Add a unit test with a fake client whose ROLLBACK rejects, asserting release(true) once B1-1
  is fixed.

## What I could not break
- Every lock wait inside submit_screening() and its triggers is bounded. The triggers on screening_prospect, upload,
  outcome, run, queue_tally and result (marketing_campaign_listed_only, reject_change, screening_kept_until_expiry,
  screening_*_rules, *_mail_gate, screening_run_mail_refusal, screening_result_inserted, screening_queue_tally_kept)
  take no explicit locks. screening_queue_tier takes none. No NOWAIT, LOCK TABLE or pg_sleep appears in the function.
- A 55P03 inside this try can only come from lock_timeout, because nothing uses NOWAIT, so the mapping catches nothing
  it should not.
- No screening table has a DEFERRABLE constraint, so lock_timeout cannot fire at COMMIT. If one is added, committed()
  passes the server's ERROR through unchanged (refusedByServer) and the route still maps 55P03.
- `set_config(..., true)` is transaction-local, so lock_timeout does not stay set on a pooled connection after COMMIT
  or ROLLBACK.
- After the commit: the queue-place read (:771) and the enqueue (:783) run on fresh connections after COMMIT and are
  unchanged. As before, the worker's sweep sees the run only once it is committed, because the old autocommit
  statement also committed at its end. READ COMMITTED semantics inside the function are unchanged.
- SCREENING_BUSY and the warn line carry no practice, address or ZIP, only error_code and request_id. The test checks
  the log lines for the synthetic address.
- The function file was not changed by this branch (`git diff --stat` touches no packages/db/functions or migrations),
  so nothing here needs a migration.
