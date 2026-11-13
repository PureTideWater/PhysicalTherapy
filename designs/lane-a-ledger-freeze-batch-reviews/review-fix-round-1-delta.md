# Schema PR 5, fix round 1: delta review (git diff e2a56dc3 HEAD)

Branch co-001/ledger-freeze-batch, commits 1303768f and 65bdf5f3. Read-only review. No tests run: the property test
fails itself if any `seen` counter stays at zero, so whether it passes is for the suite run going on in parallel.

No BLOCKER and no MAJOR findings.

## Findings

MINOR-1 docs/runbooks/deploy-and-rollback.md:631-635. "up to twenty tries" leaves out the run's 30-minute budget
(packages/db/src/migrate.ts:73-81, checked only between tries at :373). The read takes about 200 s even with the
pages cached, so the budget, not twenty, sets the real number of tries (about nine warm, fewer cold). A try that
starts just before 30 minutes can run past the task's 50 minutes on cold storage. Also, the unchanged sentence at
:629-630 still says "against a limit of five minutes for this migration", which the new text says is not a limit.
Fix: "up to twenty tries and no new try after thirty minutes of the run; a try under way is not stopped", and change
"a limit" at :630 to "a target".

MINOR-2 apps/worker/src/reconcile/statement-paths.property.db.test.ts:349-350. `seen.movedOn` counts the kind of
join that was asked for, not the stage the line ends at. If an uncased line is already `actionable` and the join is
`flagged` or `validated`, then `order.slice(indexOf(stage)+1, upTo+1)` is empty and the line joins as actionable, but
it is still counted as moved on. So this counter can be met by a world that never holds a flagged or validated case
line. Fix: read the line's latest stage after the insert and count only `flagged`/`validated` (the same for noStage).

MINOR-3 statement-paths.property.db.test.ts:364 and :396. A null `variance_cents` is mapped to '0', so `seen.zero`
treats null and zero as the same thing. The header (:222) says the null state is covered, but no counter shows that
a null-variance line was ever listed. Fix: keep null in the map, add `seen.nullVariance`, and use `?? '0'` only
inside the sum.

MINOR-4 apps/worker/src/reconcile/statement-lines.db.test.ts:47 (now :48 in HEAD). `expect(rest.recovered_cents).not.toBe('0')`
also passes if the key is missing (undefined) or null. Fix: `toMatch(/^[1-9][0-9]*$/)`, or compare to the expected
sum as text.

NOTE-1 statement-lines.db.test.ts:150-155 (diff). "logs the code alone" is pinned by `attemptErrorCode(failure)`,
a pure function, together with `JSON.stringify(logs).not.toContain(message)`. That second check also passes when
nothing is logged, and the worker's own failure log line is not captured. `queued == []` is true because the handler
throws before `queueUnprinted` (job.ts:45-52). That is real, but it follows from the order of the code. Optional:
send the failure through the worker's attempt logger and assert the line it writes.

NOTE-2 property (:384-391) compares one-pass, plain and ACTIONABLE_NOW with each other. If all three share a wrong
inclusion rule, it still passes. That fits its stated claim (LED-26); the absolute rules stay with the named tests.

## Sound
- No floats on cents. `Number(...)` remains only on counts (statement-lines :138, property :370). Cents are compared
  as text or BigInt. `BigInt(... ?? 'MISSING')` throws on a listed line that has no priced_line, so the sum cannot
  pass vacuously.
- EXACT_SCALARS (statement-twins.ts:425-426). A JSON null becomes SQL NULL and then JSON null; the string "null" stays
  "null", so the two stay different. Numbers keep their exact text (numeric scale included). Objects and arrays are
  left whole (links holds only ID arrays).
- The previous-head test is faithful. It migrates a scratch database with only the files that sort before
  20261115090000 from MIGRATIONS_DIR. Compared with the base, the only migration this branch changes is the new one,
  and it is the last of the 53. It takes `pg_get_functiondef` of the two functions and replays it into a fresh world
  (PricingWorld.open -> createMigratedDatabase), so nothing shared is touched. The migration's only DDL is those two
  CREATE OR REPLACE FUNCTIONs (:87, :194). The probe pins five=false/four=true. The assertions are real: 23514 with
  table roi_statement and constraint roi_statement_links, 0 statements and 0 audits counted by the owner, nothing
  queued, and the same for the practice with no actionable line.
- Isolation: the property runs each example in BEGIN ... ROLLBACK with SET LOCAL scope, one practice per world.
  Fixed seed 20261113, explicit timeouts, named examples for worlds 1 and 2 (the order pushed matches), and every
  `seen` counter must be above zero.
- No PHI: practice labels are synthetic plus a UUID fragment, the fixtures are CAS-03/CAS-08, and no names, member
  IDs or document text appear.
- Runbook: the retry from the migration's first line is true (migrate.ts:349-377: BEGIN, apply, and on a
  ProcessInterrupts 55P03 roll back, pause and run again). So is the claim that the closing lock's refusal is not
  retried: NOWAIT is inside the migration's own loop, which raises 55P03 itself, and isLockTimeout at :109 does not
  match that.
