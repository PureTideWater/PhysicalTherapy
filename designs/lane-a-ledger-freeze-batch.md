# Schema PR 5, the ledger-freeze batch: an ROI statement's actionable figure, proved by the lines it counted (design note)

W29 (Lane A), 2026-11-12. Base `claude/build-platform` 93e137f9 (#143). Synthetic data only. Nothing is built: this
note is what a build session follows, on the WIP ref `co-001/wip-ledger-freeze-batch`, when the orchestrator says so.

## 1. Scope: exactly the grant, and what is outside it

**The grant** (`approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`, "Decided": the founder, 2026-11-07,
relayed 19:26 UTC): Q1, Q2 and Q3 yes; exactly Appendix A (`roi_links_valid`, body `13c4dd46b9203095`) and Appendix D
(`roi_statement_rules`, body `ba8293836b9cd5aa`), word for word, for schema PR 5 only, never widened; the ask's lapse
and fault rules apply as written; it is not the approval of record.

**In PR 5:**
1. one migration (by `/new-migration`) that replaces those two function bodies with those two texts, byte for byte,
   between a preflight and a self-check (section 3);
2. "built alongside, not part of the grant" as the ask lists it, and nothing more: the writer stores the fifth key;
   the detail page, CSV and print job read only today's four keys; the preflight, tests and records;
3. the regenerated `docs/product/domain-model.md` and `packages/db/functions` (section 7).

**Not in PR 5** (each is in `approval-summaries/lane-a-ledger-freeze-ask-2-2026-11-12.md` or stays where the first ask
left it): any other ledger function (`ledger_line_net` in every planner state, `ledger_entry_within_evidence`,
`ledger_match_rules`' interest branch); the `service_line.practice_id` guard; D19's per-chain interest entry; the
"remove" step (refusing a new statement without the key); the reader recompute (ADR 0082 Decision 7, a
`packages/ledger/src` change); a database check of approved-unposted; #93's open question 3. No table, column,
constraint text, index, policy, trigger definition, grant, amount, stage or definition of recovered changes, and
nothing under `packages/ledger/src` or `packages/pricing/src` changes.

**Narrow readings taken** (each is a question in the second ask, never a liberty here):
- N1. The ask's fault rule would build Appendix B in place of A if a fault traced to Q3. The "Decided" block says the
  grant covers "exactly Appendix A ... and Appendix D". The narrow reading: B and C are not granted. If the build's
  proof faults Q1's or Q3's text, the migration is not built, the build stops and the orchestrator is told. D alone is
  never built (the ask: D only with A or B).
- N2. "One migration in schema PR 5 ... alone": PR 5 holds this migration and no other schema item.
- N3. The plan's gate line names "its writer" as frozen; the ask says the writer is not ledger-frozen and gives the
  reason (no ledger table or trigger, nothing under `packages/ledger/src`, no amount, stage, matching rule or recovered
  total). The founder granted the ask with that text in it, so the writer change is built, in `apps/worker` only.

## 2. Facts checked on the base

- Today's stored bodies are the ones the ask was written on: `roi_links_valid`
  `49416713dd4d13ddf0766e35db60cc7306cebb8e06ee89ea7345beae2b5e51a3`, `roi_statement_rules`
  `5a8bc6319828acb29a7f57aad9ebd57501734a71826a1e4d1d6953db9e85965c` (SHA-256 of the text between the dollar quotes in
  `packages/db/functions/*.sql`; the first 16 digits are the ask's "today's").
- The ask's Appendix A and D texts hash to `13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4` and
  `ba8293836b9cd5aafd67dddf29d891f9f958059109c043f59f5223605ab42360` (computed from the ask's file; the first 16
  digits are the granted ones). The build recomputes both from a database before it trusts them.
- `roi_statement.links` is `jsonb NOT NULL CONSTRAINT roi_statement_links CHECK (roi_links_valid(links))`
  (20261023120000:255). The trigger `roi_statement_rules` is `BEFORE INSERT OR UPDATE OR DELETE ... FOR EACH ROW`.
  `tp_app` may INSERT and may UPDATE only `(document_key, pdf_sha256)` (20261024120000:88). The table is FORCE ROW
  LEVEL SECURITY under `roi_statement_tenant`.
- The writer: `generateRoiStatement` in `apps/worker/src/reconcile/statements.ts`. It reads `OPEN_CASES_ACTIONABLE`
  (one row a case not resolved or closed, its figure by `ACTIONABLE_NOW('c')`), passes the cases to
  `roiStatement()` (`packages/ledger/src/roi.ts`: the figure is `sumCents` of every open case's figure, and
  `links.actionableOpen` is every open case's ID, whatever its figure), and inserts.
- The figure's predicate: `apps/worker/src/triage/actionable-now.ts`. `ACTIONABLE_NOW(alias)` is
  `coalesce(sum(p.variance_cents), 0)` over `case_line x JOIN priced_line p ON p.id = x.priced_line_id` where
  `x.case_id = alias.id AND x.practice_id = alias.practice_id AND ACTIONABLE_NOW_LINE('x')` (not written off, latest
  stage actionable, `priced_line_pricing_check(x.priced_line_id) = 'current'`).
- `case_line_once` is `UNIQUE (service_line_id)`: a service line is in at most one case, so a priced line is on at
  most one case line through Appendix D's join (`l.service_line_id = p.service_line_id AND l.priced_line_id = p.id`).
- The readers: `apps/web/src/lib/reconciliation/queries.ts` (`STATEMENT_SELECT`, `statementOf`) and
  `apps/worker/src/reconcile/print.ts` (:80) select `s.links` whole.
- A migration reads a forced-RLS table as `tp_owner` only after
  `set_config('app.practice_ids', <every practice>, true)` and sets it back to `'{}'`
  (20261109090000_line_status_heads.sql:127-132). Without it a scan of `roi_statement` returns no row.
- The runner sets `lock_timeout` and retries a cancelled wait from the migration's first line, each try under a
  savepoint (`.claude/skills/new-migration`; `packages/db/src/migrate.ts`). It bounds no statement's run time.

## 3. The migration (one file; name and timestamp from `/new-migration`, sorting after PR 4's)

Short name `roi_statement_actionable_lines`. Runs as `tp_owner`, in the runner's transaction. No `BEGIN`, `COMMIT`,
`lock_timeout`, `EXCEPTION WHEN OTHERS` or DDL on a table. In this order:

**3.1 Preflight, the starting bodies.** One `DO` block, as 20261113090000's: each of the two functions' `pg_proc.prosrc`
hashed whole by SHA-256 and compared to today's two full hashes (section 2); otherwise
`RAISE EXCEPTION ... USING ERRCODE = 'object_not_in_prerequisite_state'`, naming the function and the grant's date. A
migration that comes to sort before this one and changes either body makes it refuse: the grant replaces these bodies,
so another starting body is the founder's question again, never a silent rebase. (PR 4 touches neither: the build
checks that on PR 4's merged tree before it places the file.)

**3.2 `CREATE OR REPLACE FUNCTION roi_links_valid(links jsonb)`**: Appendix A, the whole statement as the ask prints it
(the same `RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'pg_catalog', 'public', 'pg_temp'`),
the body pasted from the ask's file, not retyped. Owner and grants are kept by `CREATE OR REPLACE` (`tp_owner`;
EXECUTE to `tp_app` only); the migration writes no `ALTER`, `GRANT` or `REVOKE`.

**3.3 Preflight, the stored statements.** PostgreSQL does not check stored rows again when a function a CHECK calls is
replaced, so the migration does:
- `SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true);`
- one `DO` block: `IF EXISTS (SELECT 1 FROM roi_statement s WHERE roi_links_valid(s.links) IS NOT TRUE) THEN RAISE
  EXCEPTION` (the count of refused statements in the message, no ID list, no links text;
  `ERRCODE = 'check_violation'`). `IS NOT TRUE`, not `NOT`, so a null answer (which a CHECK would pass) also stops it.
- `SELECT set_config('app.practice_ids', '{}', true);`
The raise undoes 3.2 with the rest of the try. It calls the new function itself, in place of a copy of its
expression that could drift from it. By the bodies, the only rows today's CHECK passes and A refuses are the ones
whose `links` is the empty object: today's key comparison is null for `{}` (so the CHECK passes) and true only for the
four keys, which A also accepts; A's other two conjuncts are today's. So this scan can only fail on a stored `{}`,
which no code writes; under N1 a failure stops the build and goes to the orchestrator.

**3.4 `CREATE OR REPLACE FUNCTION roi_statement_rules()`**: Appendix D, the whole statement, pasted from the ask's file.
The trigger on `roi_statement` is not dropped, created or altered.

**3.5 Self-check, the new bodies.** One `DO` block, written as 3.1's (`to_regprocedure(...)` and `IS DISTINCT FROM`, so
a function that is missing refuses too): both stored bodies' full SHA-256 equal the two granted hashes (section 2),
else raise. The files are LF in every checkout (`.gitattributes`), so the bytes hashed are the bytes pasted. So a file whose pasted text differs from the granted text by one byte cannot be applied
anywhere, whatever a reviewer missed.

**3.6 The header comment** says what 20261113090000's says for its own case: the grant, its date and limits; what does
not change; why a preflight; that it is safe with the previous image and takes no lock a reader or writer waits for.

**Safe with the previous image, in this order only: the migration, then the image.**
- After the migration, before the new image: the old writer inserts four-key statements (A accepts them; D's new
  block is skipped without the key) and records PDFs (the UPDATE branch is today's; the CHECK passes four keys).
- After the new image: five-key statements; the old image (a rollback, or the other task during a deploy) reads
  `links` by key name and ignores the fifth.
- The new image before the migration would have every statement refused by today's CHECK (five keys): each reconcile
  job's statement step fails until the migration runs. The deploy runs migrations first (every service depends on the
  migration run: `infra/lib/constructs/compute.ts:429-431`); the build's deploy test covers both orders and the description states the order.
- A rollback of the image after five-key statements exist needs no data change. The migration is never rolled back; a
  fix is a new forward migration under a new exception.

## 4. The code beside it (not ledger-frozen; reviewed as usual)

**4.1 The writer lists the lines its figure counted, from the same rows in the same statement.**
- In `apps/worker/src/triage/actionable-now.ts`: the `FROM ... WHERE` of `ACTIONABLE_NOW` moves into one private
  constant that `ACTIONABLE_NOW` and a new `ACTIONABLE_NOW_LINE_IDS(alias)` both use, so the sum and the list cannot
  come to read different rows:
  `(SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id =
  x.priced_line_id WHERE x.case_id = alias.id AND x.practice_id = alias.practice_id AND ACTIONABLE_NOW_LINE('x'))`.
  `ACTIONABLE_NOW`'s own text is unchanged byte for byte (a test pins its string). The file is not frozen, but the web's
  triage queries, the digest and `triage/public.ts` import it, so the description names the change and T16's pin.
- In `statements.ts`: `OPEN_CASES_ACTIONABLE` gains one column, `line_ids`, in the same `SELECT`. One statement is one
  snapshot, so a line that moves on between two queries cannot make the figure and the list disagree and get a correct
  statement refused. The figure's expression and the row order are today's.
- **Cost, to measure (not assumed):** the predicate (`priced_line_pricing_check`, a dozen index probes) then runs twice
  a line. If the writer's query at A's month (30,795 lines) grows by more than 1 s, the build reads each line once the
  way `ACTIONABLE_NOW_OF` already does (actionable-now.ts:75-86): a derived table behind `OFFSET 0` whose `now` column
  is `ACTIONABLE_NOW_LINE('x', 'st.stage')`, the figure `coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0)` and
  the list `array_agg(y.id ORDER BY y.id) FILTER (WHERE y.now)`. The predicate is still `ACTIONABLE_NOW_LINE`, written
  nowhere else. On either path T5 runs today's `ACTIONABLE_NOW('c')` as a query of its own for every case and compares
  it with the writer's figure, so a slip that moved the figure and the list together (which D would accept) fails a
  test. The choice and both timings go in the status file.
- `generateRoiStatement` builds the stored links as today plus
  `actionable_open_lines`: the `line_ids` of exactly the cases in `statement.links.actionableOpen` (today: every open
  case), concatenated in the cases' order. `roiStatement()` and everything in `packages/ledger/src` are untouched: the
  key is added where the stored object is assembled (`statements.ts`, the `links` constant).
- `RoiLinks` (`packages/db/src/schema/ledger.ts`) gains `readonly actionable_open_lines?: readonly string[]`, optional
  because stored four-key statements stay.
- No number is computed in a new place: the figure is still `roiStatement()`'s sum of the query's per-case figures.
  The writer adds no check of its own in TypeScript (it holds no variances); the database's D is the check.

**4.2 The readers ship only today's four keys.** `STATEMENT_SELECT` (web) and `print.ts`'s select replace `s.links` by
`jsonb_build_object('recovered', s.links -> 'recovered', 'interest', s.links -> 'interest', 'approved_unposted',
s.links -> 'approved_unposted', 'actionable_open', s.links -> 'actionable_open') AS links`, so a statement listing
30,795 lines (about 1.2 MB of IDs) is never sent to the page, the CSV or the print job. No word, figure or layout a
person sees changes; if the build finds one that does, the UX and brand review runs on it.

**4.3 Records.** ADR 0082: a dated amendment (Decision 6's correction: `roi_statement_rules` does not check
approved-unposted; Decision 7: the database now checks the actionable figure of a statement carrying the key; the
reader recompute still open). `docs/product/reconciliation-001.md`, "Ledger semantics": the grant's line (the founder,
2026-11-07, relayed 19:26 UTC, the question as put) and an "Amended" line naming the migration and the two bodies.
Test-matrix rows and any ADR number: asked of the orchestrator at the build, none taken here.

## 5. Locks: what each statement takes, and for how long

`CREATE OR REPLACE FUNCTION` changes the function's own catalog row. It takes no lock on `roi_statement`, though the
table's CHECK and trigger call the functions. No statement here takes more than ACCESS SHARE on a table.

| # | Statement | Lock | Held | Who waits | Time at 1,000,000 stored statements |
| --- | --- | --- | --- | --- | --- |
| 1 | 3.1's `DO` | ACCESS SHARE on `pg_proc` | to commit | nobody | milliseconds, whatever the size |
| 2 | 3.2 | ROW EXCLUSIVE on `pg_proc` (and `pg_depend`, `pg_shdepend`); the function's own row. Checking A's body locks no table (it names none); D is plpgsql, checked for syntax only | to commit | another DDL on this function only | milliseconds |
| 3 | `set_config` (twice) | none | - | - | - |
| 4 | 3.3's scan | ACCESS SHARE on `roi_statement` and `practice` | to commit | only an ACCESS EXCLUSIVE taker (no runtime statement takes one; another migration is serialized by the runner) | **grows with the IDs stored, not the rows:** about 3.2 microseconds an ID by the ask's measurement (100 ms for 30,795), plus reading each row's `links`. An estimate, to be measured: 1,000,000 four-key statements of about 40 IDs, about 2 to 3 minutes. Readers, the reconcile and people's actions go on beside it. |
| 5 | 3.4 | as row 2 | to commit | as row 2 | milliseconds |
| 6 | 3.5's `DO` | ACCESS SHARE on `pg_proc` | to commit | nobody | milliseconds |

- **Row 4 is the only one that grows, and nothing bounds it.** The runner sets `lock_timeout` only
  (`packages/db/src/migrate.ts:112-114`); nothing in the repository sets `statement_timeout`, `transaction_timeout` or
  an idle-in-transaction limit, and the migration task is not stopped at its 50 minutes (Queues item 35's infra
  proposal). So the scan runs to its end and holds back vacuum's horizon for as long (database review, finding 1). It
  blocks nobody. Its cost is not only the IDs: with every practice in scope the tenant policy's
  `practice_id = ANY (current_setting(...)::uuid[])` is a filter evaluated a row, and may parse the whole list of
  practices each time, so the time may grow with rows times practices (finding 2, suspected, not measured). The build
  measures it on PostgreSQL 18 at 1,000,000 four-key statements of 40 IDs with 1,000 and with 10,000 practices, and at
  10,000 five-key statements of 30,795 IDs, and records all three. If the measured time at 1,000,000 passes 5 minutes, the build stops and tells
  the orchestrator; it does not swap in the cheaper `links = '{}'` test on its own (3.3's argument says that test is
  equivalent, but the ask promised "every stored statement passes the new `roi_links_valid`", and which proof the
  preflight runs is then a decision to record, not a tuning).
- **At launch the table is empty in production** (nothing is deployed), so the real first run is milliseconds. The
  1,000,000 figure is for the record and for a database restored and migrated again.
- **A statement inserted while the migration runs** is checked by today's bodies (the new ones are invisible until
  commit). It has four keys, which A accepts, unless it is `{}`, which no code writes; the catalog test T2b holds that
  no stored statement fails the CHECK after the suite's migrations.
- **Sessions that have the old bodies cached** call the new ones from their next call after the commit (a function's
  cached plan is dropped when its catalog row changes). A reconcile transaction that inserts a statement around the
  commit is checked by either body; both accept what the old image writes.
- **Each insert afterwards (not the migration):** D's block reads `priced_line` and `case_line` as the caller, under
  their tenant policies, with ordinary row reads (ACCESS SHARE; no row lock, no advisory lock). The ask measured about
  0.2 s at 30,795 lines on stand-alone tables without policies. Section 6's T14 measures it on the real schema.

## 6. Tests, written failing first, and the proof each change needs

Every fixture comes from `packages/synth`. A test that needs a matrix row asks the orchestrator for its number.

| # | Test | Proves | Fails first because |
| --- | --- | --- | --- |
| T1 | Migration test: each function with a different starting body | 3.1 refuses, by name | no such migration |
| T2 | Migration test, the real file through the runner as `tp_owner` (never a superuser): a stored `{}` statement (inserted in scope as the app's role, which today's CHECK and trigger allow at recovered 0) | 3.3 refuses, the count in the message, and leaves both bodies today's | today's bodies accept `{}` |
| T2c | The same file with its first `set_config` taken out, run the same way | 3.3 then sees no statement and passes: the test demands that this variant does NOT refuse the stored `{}`, proving T2's refusal comes from the opened scope and that T2 is not run as a superuser (who skips the policy) | - |
| T2b | Catalog: after all migrations, every stored statement passes the CHECK; both stored body hashes are the granted ones; owner, grants, volatility, `search_path` as before | nothing but the two bodies changed | hashes are today's |
| T3 | The 16 shapes of `links` (four keys; five; a fifth key by another name; three keys; `{}`; a non-object; a non-array value; a non-string element; a malformed, upper-case or braced UUID; four empty lists; five empty lists) | A accepts and refuses exactly as its text says; four-key and four-empty stay accepted | five keys refused, `{}` accepted |
| T3b | The same shapes inserted as `tp_app` in scope | what a person's request really gets: D's `x::uuid` casts and `jsonb_array_elements_text` run in the BEFORE trigger, ahead of the CHECK, so a malformed ID or a non-array value under a links key the trigger reads is refused with 22P02 or 22023, not `check_violation` (as today's recovered and interest lists already are). Each shape's SQLSTATE is pinned; nothing is stored for any refused shape; the application's error path shows no quoted value to a person or a log | five keys refused by the CHECK |
| T4 | HOM-01 extended (synthetic CAS-08): the statement counts 90.00 on 3 lines and stores their IDs; after the re-run is accepted the case counts 0.00 and the statement's 90.00 is rebuilt from the stored IDs by one query | Q1's purpose | no fifth key |
| T5 | The sum: on generated worlds (random stages, write-offs, stale pricing, unpriced lines with null, zero and negative variance, several cases, a case with no line left) the listed lines' `variance_cents` add up to the figure, the figure equals today's `ACTIONABLE_NOW` per case, no ID twice, every listed line on a listed case; today's `ACTIONABLE_NOW('c')`, run as its own query a case, equals the writer's figure for it | the writer and D read the same rows | no list |
| T6 | Q2's refusals, each with D's message and `check_violation`: one cent over, one cent under, a line twice, another practice's line, a line of an unlisted case, a priced line on no case, a superseded priced line of the same service line, a nonzero figure with an empty list, a zero figure with a nonzero line. And one acceptance, recorded as such: a statement listing a written-off or stale line of a listed case, with a figure matching its list, is accepted (D checks the sum and the cases, not that the lines were the right ones; the ask's Why says so) | D refuses each wrong statement, and what it does not check is on record | today nothing checks the figure |
| T7 | Cross-practice, as the app's role in practice A's scope: practice B's priced line IDs in A's list | refused, and the message carries no row of B | not checked today |
| T8 | A second day: yesterday's statement stays, today's is checked on today's rows; a repeat with yesterday's list after a line moved on is refused only if its figure no longer matches its own list. And the daily repeat: the `day` job inserts with `ON CONFLICT DO NOTHING` (job.ts:43-47; statements.ts:155-157), and a BEFORE INSERT trigger fires before the conflict is found, so D runs every day on a fresh statement for a quarter already stored; the test holds that the repeat passes D, stores nothing and leaves the stored statement as it was | D checks the list against the figure, never against "still actionable"; the daily repeat cannot fail a quarter already written | no list |
| T9 | The PDF record (the UPDATE) passes on a stored four-key and a stored five-key statement, and D's block does not run on UPDATE (a five-key statement whose lines were since re-priced still records its PDF) | a stored statement is never checked again | five keys refused at insert |
| T10 | Deploy: the previous image's writer (four keys) and PDF record against the migrated database; the new image's five-key rows read by the previous readers; the new writer against the unmigrated database is refused (the stated order) | section 3's "safe with the previous image" | - |
| T11 | Write-equality dump: today's writer against the new one on the same state, each rolled back, over HOM-01's three cases, the LED worlds and a month of worked cases: equal but for the ID, the three timestamps and the fifth key | no figure, link or column changes | - |
| T12 | Readers: detail, CSV and print receive four keys for a five-key statement, and the bytes they print are today's | 4.2 | readers ship `links` whole |
| T13 | LED-01 to LED-18, LED-23 to LED-25 and the ledger oracle, byte for byte, their test files untouched (`git diff --stat` on them is empty) | no ledger amount, stage, refusal or recovered total changes | must stay green throughout |
| T14 | (the daily repeat of T8 is timed here too) D's block planned and timed on the real schema, with the tenant policies, other practices' rows present, in three planner states (`priced_line` and `case_line` never analyzed and empty at plan time; never analyzed at A's month; analyzed), at A's month and with 1,000,000 priced lines in the practice | the lesson of #143: a ledger trigger's plan on a new deployment | - |
| T15 | Two guards the ask promised ("PR 5 ties each to a test that fails until it replaces `roi_statement_rules`"): (a) the figure's per-line amount is `priced_line.variance_cents` and nothing else (a pin on the shared fragment and T5's property); (b) the line a case counts is `case_line.priced_line_id` (a catalog pin: no `case_line_pricing` table and no second priced-line column on `case_line`); (c) the four rules that make the writer's join (`priced_line` by ID only) and D's (service line, priced line and both practices) the same rows: `case_line_belongs` (a case line is a priced line of its own service line and practice), `case_line_rules` (case, service line and priced line never change), `case_line_once`, and the no-delete and no-truncate triggers on `case_line`, each pinned by a refusal test or a catalog pin (money review, finding 2). Each failure message names `roi_statement_rules` and the exception it will need | the two planned drifts, and a loosening of the rules D leans on, cannot land silently | - |
| T16 | `ACTIONABLE_NOW`'s string is today's, byte for byte | 4.1 moved a fragment, changed nothing | - |

**Budgets and what a failure means.**
- T14's bound: D's block at A's month at most 1 s in every state, and the reconcile's statement step no slower than
  today by more than 1 s. Past it, the build stops and tells the orchestrator. A slow plan is not a wrong answer, so
  the ask's fault rule does not decide it; whether it "traces to Q2's text" is the founder's reading, not the build's.
- A failing T3 traces to A's text; a failing T6 to T9 on a statement the writer correctly wrote traces to D's text.
  Under N1 either stops the migration and goes to the orchestrator. A failure in the writer, readers or tests is fixed
  in that code.
- T13 failing stops everything.

**Gates before the PR is ready:** `pnpm test`, `pnpm test:db` (catalog and cross-tenant), `pnpm test:golden`,
`pnpm lint`, `pnpm typecheck`, `pnpm lint:logs`, `pnpm verify-content`, the engine-freeze check (no engine file
changes), `pnpm db:domain-model --check` (and `--require-approval` once the founder's line is in). The full local
suite once; CI is the suite of record. The base is merged right before the last push.

## 7. The domain-model regeneration

- On a freshly migrated database: `pnpm db:domain-model --out --strict` (the default directory). Expected changes, and
  no others: `packages/db/functions/roi_links_valid.sql` (the key line; hash `13c4dd46b9203095`),
  `packages/db/functions/roi_statement_rules.sql` (`lines record;` and the block; hash `ba8293836b9cd5aa`), and
  `docs/product/domain-model.md` (the two hashes in the function appendix, and its own hash line). Any other changed
  file stops the build.
- The two generated files are compared with the ask's Appendix A and D, byte for byte from `CREATE OR REPLACE` to the
  closing `$function$;` (a script, its output in the status file), besides 3.5's hash check.
- The PR's description opens with `pnpm -s db:domain-model --summary-since origin/claude/build-platform
  --function-diffs list`, whole and unedited, then the template's sections.
- The skill's hazard list, read against both diffs. Expected: none (no SECURITY DEFINER; no `set_config` or `SET` in a
  function, only the migration's own two transaction-local `set_config` calls, named in the description; no built
  SQL; no LEAKPROOF or STRICT change; no volatility change, `roi_links_valid` stays IMMUTABLE and no policy calls
  either function; no grant, owner or overload change). To name in the description all the same: a trigger function on
  a ledger table now reads `priced_line` and `case_line` as the caller (Q2, as the founder read it), and an IMMUTABLE
  function a CHECK calls changes what it accepts, which is why 3.3 exists.
- The approval line is never written by the build: the line `--check --require-approval` names goes up as one
  suggested change on the document's last line through the GitHub API
  (`gh api repos/<owner>/<repo>/pulls/<n>/comments`), with the Claude Code footer, and the founder commits it.

## 8. Reviews at the build, and what the founder should know

- Two adversarial reviews, about 20 tool calls each, a report file each: **money** (the payment-engine reviewer: the
  figure equals the listed lines' sum on every world; one cent off is refused; T11's dumps; T13 untouched; nothing
  rounds or converts; no recovered total or stage moves) and **the database** (the security reviewer: 3.1 to 3.5's
  order and retry safety, section 5's table against the measured times, D's reads under the tenant policies and T7,
  the deploy order). A fix round's review reads its delta only; at most two fix rounds.
- For the description's "What the founder should know before approving": (1) the two bodies are the ones he granted,
  and the migration refuses to apply any other text (3.5); (2) a statement written by an image before PR 5 keeps an
  unchecked actionable figure for good, and four-key inserts stay accepted until the "remove" step he is asked for
  after the merge; (3) if D refuses a correct statement by mistake the practice's reconcile fails daily until the
  writer stops storing the key (the fast way out, a deploy) or a corrected D lands under a new exception (the slow
  way), as the ask's Risk section says; (4) D proves that the figure is the sum of the lines the statement lists and
  that each is a line of a case it lists, not that the list is complete or was the right one, and a statement inserted
  outside any practice scope (the owner role by hand, a restore) is not checked at all, as today for recovered and
  interest.

## 9. Open points for the build session (none widens the grant)

1. Measure section 5's row 4 and T14 before the writer is finished: either can stop the PR. Neither was measured for
   this note or by its reviews.
2. Settled by the database review: the runner bounds no statement's time (section 5).
3. Settled by both reviews: nothing changes `case_line.case_id` or `priced_line_id` or deletes a case line
   (`case_line_rules`, `case_line_never_deleted`), and a priced line is immutable, so the gap between the writer's read
   and its insert cannot cause a refusal. T15 (c) keeps it so.
4. Whether the restore drill loads statements with triggers off (the money review suspects it, unverified): if so, the
   description's point (4) names it.
5. Check on PR 4's merged tree that its migration touches neither function and sorts before this one.

## 10. Reviews of this note (2026-11-12), and the one fix round

Two bounded adversarial reviews: `reviews/lane-a-ledger-freeze-batch-money.md` (0 blockers, 2 should-fix, 5 notes) and
`reviews/lane-a-ledger-freeze-batch-database.md` (0 blockers, 4 should-fix, 7 notes; it measured nothing). Neither
found a fault in a granted text. Each finding was checked against the code before the note changed.

| Finding | Checked | Change |
| --- | --- | --- |
| Money 1: the cost fallback wrote the figure a new way | true: `ACTIONABLE_NOW_OF` (actionable-now.ts:75-86) is the existing single-pass form | 4.1's fallback reuses `ACTIONABLE_NOW_LINE` behind the same fence; T5 compares with `ACTIONABLE_NOW('c')` run alone |
| Money 2: four `case_line` rules hold the writer's join and D's equal | true: `case_line_belongs`, `case_line_rules`, `case_line_once`, the no-delete and no-truncate triggers | T15 (c) |
| Money 3: D does not prove the list complete or right | true, and the ask says so | T6's recorded acceptance; section 8, point (4) |
| Money 4: no reachable disagreement; negative and zero variance untested | accepted | T5's worlds; open point 3 settled |
| Money 5: the daily job's repeat insert runs D before the conflict | true: job.ts:43-47, statements.ts:155-157; a BEFORE INSERT trigger fires before `ON CONFLICT` | T8 and T14 |
| Money 6: an out-of-scope insert is unchecked | true (`IF NOT practice_in_scope ... RETURN NEW`, today's line) | section 8, point (4); open point 4 |
| Money 7: no golden line named for the stored list | accepted as a note: `fixtures/golden` holds priced lines, and no priced line changes | none |
| Database 1: nothing bounds the scan's time | true: no `statement_timeout` or `transaction_timeout` in `packages/db/src` or `infra` | section 5 rewritten; open point 2 settled |
| Database 2: the policy's cost with every practice in scope | plausible, not measured | section 5: measured at 1,000 and 10,000 practices |
| Database 3: T2 as a superuser would pass vacuously | true in kind (a superuser skips row-level security) | T2 through the runner as `tp_owner`; T2c |
| Database 4: malformed five-key links are refused by a cast in the trigger, not the CHECK | true: a BEFORE trigger runs ahead of the CHECK; today's recovered block does the same | T3b |
| Database 5, 6, 9, 10: D's reads under the policies; no scope leak; retry order; migration before image | confirmed (`compute.ts:429-431`) | section 3's evidence line |
| Database 7: `pg_shdepend`; why validation locks no table | accepted | section 5, row 2 |
| Database 8: write 3.5 as the precedent's check | accepted | 3.5 |
| Database 11: `actionable-now.ts` has other importers | true | 4.1 |

Not taken, recorded for the build: a lock listing from `pg_locks` during a run of the migration (the database review
did not get to it), to go in the build's status file beside section 5's measured times.
