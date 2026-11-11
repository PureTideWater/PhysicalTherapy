# Schema PR 2: why the two new bodies answer and refuse exactly as the two they replace

W11, 2026-11-11. For the two adversarial reviews to attack. "Old" is the body of migration 20261027090000 (installed on
edab4d4d: prosrc SHA-256 f151e27e… and abbcba68…); "new" is the granted body (5d0a94c0… and 834cdefc…). Catalog facts
below were read on a database migrated to 20261111090000 (PostgreSQL 18.4).

## 1. `ledger_line_net(line uuid, counted text)`

Old: `sum(e.amount_cents)` over the visible entries `e` with `e.service_line_id = line`, LEFT JOIN `t` (the entry
`e.evidence_id` names, only when `e` is a reversal or an adjustment), LEFT JOIN `r` (the entry `t.evidence_id` names,
only when `t` is an adjustment), kept when `e`'s counted stage equals `counted`.
New: the same sum over the visible entries with `e.practice_id = (SELECT l.practice_id FROM service_line l WHERE l.id =
line) AND e.service_line_id = line`, read in `seq` order, with `t` and `r` as scalar subqueries.

1. **The counted stage is the same expression.** For an entry that is no correction: its own stage, in both. For a
   correction: `t` is found by `ledger_entry_pkey` (at most one row, so the LEFT JOIN never multiplies a row and the
   scalar subquery never raises "more than one row"); no `t` gives NULL in both (old: `CASE WHEN NULL = 'adjusted' …
   ELSE NULL`; new: an empty scalar subquery); `t` not an adjustment gives `t.stage` in both; `t` an adjustment gives
   `r.stage`, or NULL when `r` is missing, in both. NULL never equals `counted`, so the row is left out in both. `t`
   and `r` are read under the same tenant policy in both (same table, same role). Neither form looks at
   `evidence_kind`. A NULL `counted` keeps no row in both, and `coalesce` gives 0.
2. **The added practice condition drops no entry (the invariant).** Let `E` be the visible entries of the line (old)
   and `E'` those that also carry the practice the subquery returns (new); `E' ⊆ E`.
   - *The line is a row the caller can read.* Then `E \ E'` is the visible entries of the line whose practice is not
     the line's. None can be stored by a role that is not a superuser: (a) an entry inserted with its practice in scope
     passes `ledger_entry_rules`: its case is of its practice, and a `case_line (case_id, service_line_id)` exists;
     `case_line_belongs` holds a case line to its case's practice and to a `priced_line` of that service line and
     practice; (b) an entry whose practice is not in scope skips those checks (`IF NOT practice_in_scope … RETURN NEW`)
     only to be refused by `ledger_entry_tenant`'s WITH CHECK; (c) both tables are FORCE ROW LEVEL SECURITY and every
     role, the owner included, is NOSUPERUSER NOBYPASSRLS (read: all twelve `tp_*` roles); (d) an entry never changes
     (`ledger_entry_rules` refuses UPDATE and DELETE before anything else); (e) `tp_app` holds no UPDATE on
     `service_line`, `"case"` or `ledger_entry` (table ACL `tp_app=r`; column UPDATE only on five `case_line` columns
     and two `ledger_match` columns, none a practice or a line). **For the database review to verify:** that a
     `priced_line` of a service line carries that service line's practice (the last link of (a)).
   - *The line is another practice's, out of scope.* New: the subquery reads no row, the practice is NULL, no entry
     matches, 0. Old: the line's entries carry its practice (the invariant), so the tenant policy hides them, 0.
     `service_line_tenant` and `ledger_entry_tenant` are the same predicate (`practice_id = ANY
     (current_setting('app.practice_ids', true)::uuid[])`), each the only policy on its table, permissive, for all
     roles and all commands; so "the caller can read the line" and "the caller can read the line's entries" are the
     same condition.
   - *The line is no row, or NULL.* New: 0. Old: `ledger_entry.service_line_id` is a foreign key to `service_line`, so
     no entry names a line that is no row, and `= NULL` matches none: 0.
3. **The order changes nothing.** `sum` over bigint cents (numeric, cast to bigint, the same expression as before) is
   order-free.
4. **Nothing else of the function changes.** LANGUAGE sql, STABLE, SECURITY INVOKER, `search_path`, owner, EXECUTE to
   `tp_owner` and `tp_app` only. Its one caller is `ledger_entry_within_line()` (a trigger function, EXECUTE to no one),
   fired by whoever inserts a ledger entry: only `tp_owner` and `tp_app` hold INSERT there, and both hold SELECT on
   `service_line` (so the new read never fails on a privilege the old body did not need: `tp_app=r`).
5. **Where the two differ (not reachable without a superuser):** an entry stored with a practice other than its
   line's (triggers and RLS off) is counted by the old body in a scope that sees it and not by the new one.
6. **A new read lock:** the new body reads `service_line` (ACCESS SHARE) inside every ledger insert's trigger. It
   conflicts only with ACCESS EXCLUSIVE on `service_line`.

## 2. `ledger_entry_rules()`: the two statements

**A correction's match.** Old: `NEW.match_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id =
NEW.match_id AND m.reversed_at IS NULL)`. New: `NEW.match_id IS NOT NULL AND (SELECT m.reversed_at IS NULL FROM
ledger_match m WHERE m.id = NEW.match_id) IS NOT TRUE`. `id` is the primary key: zero or one visible row.

| the match | old | new |
| --- | --- | --- |
| no visible row | NOT EXISTS: true, refused | NULL IS NOT TRUE: true, refused |
| standing | false, passes | TRUE IS NOT TRUE: false, passes |
| reversed | true, refused | FALSE IS NOT TRUE: true, refused |

Neither tests the match's practice here (the target entry, read just above with `t.practice_id = NEW.practice_id`, must
carry the same case, line and match as the correction). Same message, same SQLSTATE (the RAISE is untouched).

**An entry's match.** Old: `SELECT * INTO matched … WHERE m.id = NEW.match_id AND m.practice_id = NEW.practice_id AND
m.reversed_at IS NULL; IF NOT FOUND THEN RAISE`. New: `SELECT * INTO matched … WHERE m.id = NEW.match_id; IF NOT FOUND
OR matched.practice_id IS DISTINCT FROM NEW.practice_id OR matched.reversed_at IS NOT NULL THEN RAISE` (the same RAISE).

| the match | old | new |
| --- | --- | --- |
| `NEW.match_id` NULL, or no visible row | not found, refused | not found, refused |
| a visible row of another practice | filtered out, not found, refused | found; practice differs, refused |
| a visible reversed row of the practice | filtered out, refused | found; `reversed_at IS NOT NULL`, refused |
| a visible standing row of the practice | found, `matched` is that row | found, `matched` is that row |

On the passing path `matched` is the same row, so every later check and `effective_on` are the same. `FOUND` is not
read again. `ledger_match.practice_id` and `ledger_entry.practice_id` are NOT NULL, so `IS DISTINCT FROM` and `=` agree.
Both are plain reads (no row lock) in both forms.

## 3. What the tests hold of this
- `apps/worker/src/reconcile/ledger-lookups.db.test.ts`: every row of the two tables above (the no-row correction case
  by a superuser-made state), `ledger_line_net` for another practice's line, a line that is no row and no line, its
  own sums and corrections; each case passes on the old bodies and on the new. The plan guard on the installed bodies.
- `packages/db/src/ledger-lookups.db.test.ts`: on the previous head, the file changes the two bodies and nothing else
  the catalog holds of any function or trigger; refuses any other starting body; holds only ACCESS SHARE.
- LED-01 to LED-18, LED-23 to LED-25 (`ledger.db.test.ts`, `pass-equality-led.db.test.ts`), the ledger oracle, CAS-49.
- The write-equality dumps (status file).
