# Adversarial review: D2 versus D (`roi_statement_rules()`, the `actionable_open_lines` block)

2026-11-12. PostgreSQL 18.4, scratch database `pr5_d4` only, synthetic rows only. Everything I created lived in a
schema `rv` inside transactions that were rolled back (checked afterwards: no `rv` schema remains). No other database
and no file outside this report was touched.

## Verdict

- **Equality: equal** for every `links` that passes `roi_links_valid` in every state the schema allows. No input found
  where one accepts and the other refuses. Two differences exist, both outside that set: a different SQLSTATE on some
  CHECK-failing inputs (both still refuse), and a state the schema forbids (two case lines on one service line) where
  D accepts and D2 raises 21000.
- **Quadratic plan: reachable.** A generic plan cached while the tables are tiny *and analyzed* reads `priced_line`
  and `case_line` by sequential scan inside the fence; if the tables then grow with no ANALYZE or VACUUM reaching the
  session, the same session's next large statement runs lines x table rows. Reproduced: over 70 s (cancelled) against
  0.43 s. A fresh plan was never quadratic in any state I tried. The practice-index variant in belief 5 I could not
  produce.

What was run and what was only reasoned is marked on each finding.

## Findings

### 1. Cached generic plan from tiny analyzed tables is quadratic after growth - should-fix

Run (stand-in tables `rv.priced_line`, `rv.case_line` = `LIKE public.x INCLUDING ALL`, forced RLS with the tenant
policy, executed as `tp_app` with `app.practice_ids` = practice A; D2's statement as a prepared statement and, separately,
inside a plpgsql function with `plan_cache_mode = auto`).

- 10 lines of practice A loaded (20 priced lines, 10 case lines), `ANALYZE` (relpages 2 and 1). Generic plan:

      Nested Loop
        -> HashAggregate (DISTINCT list)
        -> Seq Scan on priced_line p   Filter: id = x::uuid AND practice_id = $2 AND <policy>
             SubPlan 3 -> Seq Scan on case_line l   Filter: service_line_id = ... AND priced_line_id = ...

- Then the month loaded (61,590 / 30,795 rows), no ANALYZE, the same prepared plan executed with the 30,795-line
  statement: `ERROR: canceling statement due to statement timeout` at 70 s.
- The same through plpgsql, `plan_cache_mode = auto`: 7 calls of the block on the tiny tables (so the generic plan is
  adopted at call 6), growth, then the month's statement: cancelled at 30 s.
- Where the sequential scan is chosen (generic plan, whole-table size, analyzed):

  | lines in the tables (priced rows = 2x) | priced_line | case_line |
  | --- | --- | --- |
  | 10, 25 | Seq Scan | Seq Scan |
  | 50, 100 | priced_line_pkey | Seq Scan |
  | 200, 400, 1000 | priced_line_pkey | case_line_once |
  | 0, 10, 200 never analyzed | priced_line_pkey | case_line_once |

Reach, reasoned: it needs (a) both or either table analyzed while the whole table (all practices) is under roughly
100 priced lines / 200 case lines, (b) one session making its sixth or later statement insert in that state, (c) growth
to tens of thousands of rows with no ANALYZE, autovacuum or DDL on either table (any of them invalidates the plan;
autovacuum is on, naptime 60 s, analyze threshold 50 rows + 10 %), (d) the large statement in that same session. That
is a launch-week pooled connection in a one-minute window, an environment with autovacuum off, or a seed / test / e2e
run that loads and then writes statements in one transaction or quickly. Narrow, but the claim under review is "no
planner state", and this one is real. D is no better here (it is slow in every state); this is not a regression,
only a hole in the new bound. With `case_line` alone on a sequential scan (the 50 to 199 row band that autovacuum's
own first analyze can produce) the cost is lines x case_line rows; I did not time that variant separately.

Fix that worked (run): the same function with `SET plan_cache_mode TO force_custom_plan` in its header, same
sequence (7 calls tiny, growth, no ANALYZE): the month's block returned `(30795,30795,307698704)` in 427 ms. Each
execution replans against the tables' current size on disk. Cost: planning time on every execution, 4 to 18 ms
measured for this statement. Note this is a change to the function's header, outside the one statement the grant
covers, and it also applies to the function's other statements and to functions it calls; it needs its own approval.
I found no change inside the statement text that removes the hazard (PostgreSQL has no index hint).

### 2. Schema-forbidden state: two case lines on one service line - note

Run (unique constraint dropped on the stand-in, line 3 given a second case line, line 1's case line moved to another
practice): D returns `(10,10,113085)` and would ACCEPT a statement one of whose lines is on no visible case line (the
double pair hides the missing one); D2 raises `21000`. D2 fails closed where D is wrong, but the two differ, so D2's
equality rests on `case_line_once UNIQUE (service_line_id)` (not deferrable, verified in `pg_constraint`). If that
constraint is ever narrowed (partial, per practice and something else) D2 starts raising a cardinality error from a
BEFORE trigger. Worth one comment line in the function and, if not already there, a catalog-test assertion.

### 3. CHECK-failing input: SQLSTATE can differ, in the direction opposite to the one expected - note

Run, 11 malformed inputs (cases 20 to 30 of my probe). Ten gave the same result in both. One differed:

    links: actionable_open = ["zz"], actionable_open_lines = ["11111111-1111-4111-8111-111111111111"] (no such line)
    D : ERR 22P02        D2: (1,0,0)  -> the trigger's own 23514 (linked <> found)

D2 never evaluates the case list when no priced line is found (the hashed SubPlan is built on first use); D's plan on
those tables evaluated it. So it is not only "D lazy, D2 eager": each is lazy about a different list, and D's
laziness is plan-dependent. Both refuse the insert in every case, and reasoned: no accept/refuse split is possible,
because a `links` that fails `roi_links_valid` is refused by the CHECK after the trigger whatever the trigger did, and
a `links` that passes it contains only arrays of canonical UUID strings, on which neither cast nor
`jsonb_array_elements_text` can raise (the regex's `$` matches only at the end of the string in PostgreSQL, so no
trailing newline slips through). If any caller maps 22P02 / 22023 / 23514 to different messages, tell it; otherwise
nothing to do. Inputs that fail the CHECK but cast cleanly (upper-case or braced UUIDs, JSON null elements, a
missing `actionable_open` key) gave identical figures in both.

### 4. Reachable states: all equal - note (belief 1, 2 confirmed)

Run, 14 CHECK-passing or near cases at state 0, each returning identical `(linked, found, cents)` and identical types
`bigint/bigint/numeric`: baseline `(10,10,113085)`; duplicate line `(11,10,..)`; superseded line listed `(11,10,..)`;
other practice's line listed, invisible under RLS `(11,10,..)`; unpriced line with null variance and no case line
`(11,10,..)`; only that line `(1,0,0)`; cases listed twice `(10,10,..)`; one case missing `(10,9,..)`; empty cases
`(10,0,..)`; empty lines `(0,0,0)`; unknown line `(1,0,0)`. Then state 1 (triggers bypassed): line 1's case line in
another practice and line 2's case line naming the superseded priced line of the same service line: both `(10,8,..)`,
and `(11,8,..)` with the superseded line listed.

Reasoned: `priced_line_pkey (id)` gives at most one `p` per distinct id, so DISTINCT + lateral yields exactly D's
`IN` set; `cents` sums over that set in both, independent of case lines; the scalar subquery carries D's three join
conditions unchanged; a null `case_id` and a null list element both make `IN` not true, as a missing join row does in
D. Numerics (belief 4): `sum(bigint)` is numeric in both and cannot overflow, `coalesce` gives 0 on no rows, the
aggregate with no GROUP BY still returns one row on an empty list (run: `(0,0,0)`), `count` is bigint. Both blocks
are one statement, so one snapshot each.

### 5. The other planner freedoms did not bite - note (belief 5)

- Hashed SubPlan, run: `work_mem = 64kB` (the minimum), `hash_mem_multiplier = 1`, `enable_hashagg = off`, fresh
  generic plan, verbose: `count(*) FILTER (WHERE (ANY (((SubPlan 3)) = (hashed SubPlan 2).col1)))`, 346 ms. DISTINCT
  became Sort + Unique (external merge, 632 kB). Reasoned: the hashing test uses the estimate (100 rows of 16 bytes,
  a few kB) against `work_mem x hash_mem_multiplier` and does not consult `enable_hashagg`, so it cannot become a
  rescanned SubPlan at any legal setting.
- Practice index instead of the primary key, run: another practice holding 61,590 / 30,795 rows, analyzed, practice A
  absent (so `practice_id = A` is estimated at one row), generic plan made then, A's month loaded, no ANALYZE: plan
  used `priced_line_pkey` and `case_line_once`, 414 ms cached, 310 ms fresh custom. Statistics from 10 lines then
  growth, fresh custom plan: the same two indexes, 438 ms. I could not make the planner pick
  `priced_line_by_service_line` or `case_line_by_case`; reasoned, the unique index is never costlier for a one-row
  equality probe, but the margin is a near-tie when the practice is estimated at one row, so I would not call it
  proven for every statistics state.
- Simpler text, reasoned only (not run): dropping OFFSET 0 lets the lateral subquery be pulled up and frees the join
  order, which is D's failure (one estimated priced line outside, the list rescanned inside). A plain join to the
  DISTINCT list has the same freedom. `p.id = ANY (ARRAY(SELECT ...))` is linear only on an index path; as a filter
  the array is a run-time parameter, not hashed, and is searched per row. I have no simpler text that is at least as
  safe; D2's shape stands, with finding 1's header setting as the one addition.

## Not checked

- The real trigger end to end (an `INSERT INTO roi_statement`) in finding 1's state: `public` tables in `pr5_d4`
  are large and I did not shrink them; the stand-in uses the same statement, policy and role.
- The 27 fixed and 400 random cases of the existing harness (`eq/setup.sql`, `eq/run.sql`): not loaded.
- Timing of D in finding 1's state; the `case_line`-only sequential scan variant; states with millions of rows;
  several practices in `app.practice_ids`; `jit` variations; parallel settings.
- Whether any application code distinguishes the SQLSTATEs in finding 3.
