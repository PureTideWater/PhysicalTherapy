# Adversarial review, money: lane-a-ledger-freeze-batch (schema PR 5)

Scope: arithmetic, rounding, trace, immutability of the design note's writer change (4.1) against granted
Appendix A / D. Date 2026-11-12. Base checkout 93e137f9 (verified with `git rev-parse`). Read-only; synthetic only.

Files read:
- /home/user/ops/designs/lane-a-ledger-freeze-batch.md (whole)
- /home/user/ops/approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md (Appendix A, Appendix D, Decided)
- /home/user/PhysicalTherapy/apps/worker/src/triage/actionable-now.ts
- /home/user/PhysicalTherapy/apps/worker/src/reconcile/statements.ts (105-180), reconcile/job.ts (30-60)
- /home/user/PhysicalTherapy/packages/ledger/src/roi.ts, packages/ledger/src/statement.ts (110-126)
- /home/user/PhysicalTherapy/packages/money/src/cents.ts (parseCents)
- /home/user/PhysicalTherapy/packages/db/functions/{case_line_belongs,case_line_rules,priced_line_immutable,priced_line_pricing_check}.sql
- /home/user/PhysicalTherapy/packages/db/migrations/20261018090000_pricing_runs.sql, 20261019160000_triage_cases_and_audit_reports.sql,
  20261023120000_recovery_ledger.sql:253; apps/worker/src/triage/execute.ts:245-265, :444

Summary: no fault in granted text found; no blocker. 2 should-fix, 5 notes.

## Findings

1. should-fix: the cost fallback in 4.1 computes the figure in a new expression, and no test then pins it to ACTIONABLE_NOW.
   Evidence: note 4.1 "Cost" bullet (lines 133-137) replaces the two scalar subqueries "by one LEFT JOIN LATERAL aggregate
   giving `cents` and `line_ids`". The same section says "The figure's expression and the row order are today's" (line 132)
   and "No number is computed in a new place" (line 144). T16 pins only ACTIONABLE_NOW's string (actionable-now.ts:41-42),
   and on the fallback path the writer would no longer call ACTIONABLE_NOW, so T16 passes vacuously. T11 compares fixed worlds only.
   Failing scenario: the lateral is written with the stage taken from a LEFT JOIN that treats a missing line_status as
   actionable, or with `sum(...) FILTER` placed outside the fence. Some generated world (a line with no stage event) is then
   off, and the list follows the same rows. D accepts it, because D checks only that the figure matches the list. T5 also passes
   if its "equals today's ACTIONABLE_NOW" compares the writer to itself, and T11 passes if its worlds lack that shape.
   Fix for the note: if the fallback is taken, build it from the existing ACTIONABLE_NOW_LINE (or the ACTIONABLE_NOW_OF
   pattern, actionable-now.ts:75-86, which already does one pass). T5 must also evaluate `ACTIONABLE_NOW('c')` as a separate
   query for each case and compare it to the writer's `cents` over generated worlds. Verified from text; the failure itself is hypothetical.

2. should-fix: T15 misses the third drift that would make D refuse a correct statement: the join equivalence.
   Evidence: ACTIONABLE_NOW joins `priced_line p ON p.id = x.priced_line_id` and does not filter p.practice_id
   (actionable-now.ts:41-42). D's `found` joins on `l.service_line_id = p.service_line_id AND l.priced_line_id = p.id` and both
   practice_ids (Appendix D). They agree only because case_line_belongs checks that the priced line belongs to the same
   service line and practice (case_line_belongs.sql:19-21) and fires only `AFTER INSERT` (20261019160000:542), and because
   case_line_rules forbids any UPDATE of case_id/service_line_id/priced_line_id (case_line_rules.sql:25-28; trigger :523).
   case_line_once is UNIQUE(service_line_id) (:207), and case_line_never_deleted / case_line_no_truncate exist (:543, :657).
   Failing scenario: a later migration lets PR 11's "refresh" UPDATE case_line.priced_line_id (or relaxes belongs).
   ACTIONABLE_NOW then counts a line that D's join cannot find (linked > found), every statement is refused, and the reconcile
   fails daily. Add a catalog/behaviour pin, with a message naming roi_statement_rules, covering: belongs' predicate, rules'
   frozen-column tuple, case_line_once, and the no-delete/no-truncate triggers. Verified that all four hold today.

3. note: D proves self-consistency and traceability, not completeness or actionability.
   Evidence: Appendix D sums variance over the listed IDs and checks only that each is a case_line of a listed case. It never
   reads line_status, written_off_reason or priced_line_pricing_check. T8 says this is intended.
   Case: a statement that lists a written-off, moved-on or stale line of an open case and has a matching figure is accepted.
   So is a statement that omits an actionable line from both the figure and the list. Only the writer (T5/T11/T16) guards
   completeness. Not a fault in the granted text, since D's comment says exactly this. However, the note's title ("proved by the
   lines it counted") and the founder-facing text should not claim D proves the figure is the actionable amount. Suggest a T6
   row that documents the acceptance of a written-off listed line, so nobody relies on D for it.

4. note: question 1, every listed divergence was checked, and none reachable on the app path makes writer and D disagree.
   - null variance_cents: allowed only for unpriced lines (20261018090000:90-94). Both sides use `sum`, which ignores nulls
     and is coalesced to 0, and the ID is listed and counted in `found` on both sides. Equal. Triage inserts case lines only
     where `p.variance_cents > 0` (execute.ts:260), so null and negative reach case_line only through owner-role test
     factories. T5 should still generate negative and zero variances, because the DB does not forbid them on case_line.
     The table CHECK `actionable_open_cents >= 0` (20261023120000:253) would refuse a negative figure today; this is not new.
   - superseded priced line: excluded from the list by `priced_line_pricing_check(...) = 'current'`, which is in the same
     fragment. D does not re-check currency, so a re-run committed between the writer's SELECT and its INSERT cannot cause a refusal.
   - other practice / other service line: impossible through case_line_belongs + case_line_rules (finding 2).
   - duplicates: impossible from the writer, because there is one row per case and each priced line is on at most one
     case_line. If one is forged, `linked` counts it twice and `found` and `cents` (via `IN`) once, so D refuses it. Correct.
   - zero-line case: `coalesce(array_agg ..., '{}')` contributes nothing and its figure is 0. Equal.
   - order of concatenation: D is order-free. Types: `sum(bigint)` is numeric of scale 0, `::text` gives a canonical integer
     string, and parseCents uses BigInt (cents.ts:45-50). D compares numeric with bigint exactly. No rounding anywhere.
   - snapshot: priced_line_pricing_check is STABLE (priced_line_pricing_check.sql:11), so both subqueries in the one SELECT
     read one snapshot. The note's claim holds.
   - cases listed vs cases whose lines are listed: both come from the same OPEN_CASES_ACTIONABLE rows. Equal.
   Answer to note 9.3: nothing can change case_line.case_id/priced_line_id or delete a case line (verified above). The
   writer's SELECT and INSERT run as separate READ COMMITTED statements, which is harmless because D reads only immutable
   columns. Only case state could change, and D does not read it.

5. note: D runs again every day on the quarterly path, including when the quarter's statement already exists.
   Evidence: job.ts:42-46 calls generateRoiStatement on every `day` payload. The INSERT uses
   `ON CONFLICT ... DO NOTHING` (statements.ts:155-157), and PostgreSQL fires BEFORE INSERT row triggers before conflict
   detection. So the line_ids aggregation and D's 30,795-ID check run daily for a row that is then discarded. Any D refusal
   would also fail the job for a quarter already written. This is not a wrong number. T14's budget and T8 should cover this
   conflicting-insert path explicitly (a five-key repeat that passes D and returns null).

6. note: a five-key statement may be unchecked without anyone noticing.
   Evidence: Appendix D returns before the new block when `NOT practice_in_scope(NEW.practice_id)`. An owner-role insert
   (a migration backfill, a test factory such as row-factory.ts:437-440, or a restore) skips the check. tp_app cannot do
   this under FORCE RLS. Suspected, not verified: whether the restore drill loads roi_statement rows with triggers disabled.
   T4's "rebuilt from the stored IDs" therefore holds only for rows the app inserted. This is worth one line in the description.

7. note: rules check (questions 2, 3, 5, and the golden line).
   - Floats / JS number: none in the design. IDs stay strings (`::text[]`), cents stay bigint/text, and the writer adds no
     arithmetic (roi.ts:108 sumCents is unchanged). Verified.
   - Immutability: priced_line refuses UPDATE/DELETE (priced_line_immutable.sql; trigger 20261018090000:173) and TRUNCATE
     (:206), and pricing_run refuses DELETE (:23, :165). A stored list can always be re-summed to the stored figure under the
     practice's scope. Nothing in the design writes to pricing_run, priced_line, line_status, ledger_entry, or a recovered total.
   - Grant scope: no file under packages/ledger/src or packages/pricing/src changes. RoiLinks lives in
     packages/db/src/schema/ledger.ts, which is not the ledger package. No other ledger function is touched. Verified in the note.
   - Golden line: CLAUDE.md asks for a golden line and a property test for new behaviour. T5 is the property test. T4
     (HOM-01 extended) is a fixture test, but the note names no line under fixtures/golden for the stored list. Add one or state
     why HOM-01 serves.

## Areas checked with nothing found
- Fault in granted text: none found. For writer-produced statements, D's linked/found/cents agree with ACTIONABLE_NOW on every
  reachable state I could build from the triggers above.
- Rounding before the final step, Medicare flags, date windows, approved-unposted in totals: the design touches none of them.
