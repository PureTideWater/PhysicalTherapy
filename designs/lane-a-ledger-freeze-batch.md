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
  savepoint (`.claude/skills/new-migration`; `packages/db/src/migrate.ts`). The build reads whether it also bounds a
  statement's run time (section 5, row 4).

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

**3.5 Self-check, the new bodies.** One `DO` block: both stored bodies' full SHA-256 equal the two granted hashes
(section 2), else raise. So a file whose pasted text differs from the granted text by one byte cannot be applied
anywhere, whatever a reviewer missed.

**3.6 The header comment** says what 20261113090000's says for its own case: the grant, its date and limits; what does
not change; why a preflight; that it is safe with the previous image and takes no lock a reader or writer waits for.

**Safe with the previous image, in this order only: the migration, then the image.**
- After the migration, before the new image: the old writer inserts four-key statements (A accepts them; D's new
  block is skipped without the key) and records PDFs (the UPDATE branch is today's; the CHECK passes four keys).
- After the new image: five-key statements; the old image (a rollback, or the other task during a deploy) reads
  `links` by key name and ignores the fifth.
- The new image before the migration would have every statement refused by today's CHECK (five keys): each reconcile
  job's statement step fails until the migration runs. The deploy runs migrations first (the migration custom
  resource); the build's deploy test covers both orders and the description states the order.
- A rollback of the image after five-key statements exist needs no data change. The migration is never rolled back; a
  fix is a new forward migration under a new exception.

## 4. The code beside it (not ledger-frozen; reviewed as usual)

**4.1 The writer lists the lines its figure counted, from the same rows in the same statement.**
- In `apps/worker/src/triage/actionable-now.ts`: the `FROM ... WHERE` of `ACTIONABLE_NOW` moves into one private
  constant that `ACTIONABLE_NOW` and a new `ACTIONABLE_NOW_LINE_IDS(alias)` both use, so the sum and the list cannot
  come to read different rows:
  `(SELECT coalesce(array_agg(p.id ORDER BY p.id), '{}')::text[] FROM case_line x JOIN priced_line p ON p.id =
  x.priced_line_id WHERE x.case_id = alias.id AND x.practice_id = alias.practice_id AND ACTIONABLE_NOW_LINE('x'))`.
  `ACTIONABLE_NOW`'s own text is unchanged byte for byte (a test pins its string).
- In `statements.ts`: `OPEN_CASES_ACTIONABLE` gains one column, `line_ids`, in the same `SELECT`. One statement is one
  snapshot, so a line that moves on between two queries cannot make the figure and the list disagree and get a correct
  statement refused. The figure's expression and the row order are today's.
- **Cost, to measure (not assumed):** the predicate (`priced_line_pricing_check`, a dozen index probes) then runs twice
  a line. If the writer's query at A's month (30,795 lines) grows by more than 1 s, the build replaces the two scalar
  subqueries by one `LEFT JOIN LATERAL` aggregate giving `cents` and `line_ids` from one pass over the same shared
  `FROM ... WHERE`, and the write-equality dump (T11) holds the figure equal. The choice and both timings go in the
  status file.
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
| 2 | 3.2 | ROW EXCLUSIVE on `pg_proc` (and `pg_depend`); the function's own row | to commit | another DDL on this function only | milliseconds |
| 3 | `set_config` (twice) | none | - | - | - |
| 4 | 3.3's scan | ACCESS SHARE on `roi_statement` and `practice` | to commit | only an ACCESS EXCLUSIVE taker (no runtime statement takes one; another migration is serialized by the runner) | **grows with the IDs stored, not the rows:** about 3.2 microseconds an ID by the ask's measurement (100 ms for 30,795), plus reading each row's `links`. An estimate, to be measured: 1,000,000 four-key statements of about 40 IDs, about 2 to 3 minutes. Readers, the reconcile and people's actions go on beside it. |
| 5 | 3.4 | as row 2 | to commit | as row 2 | milliseconds |
| 6 | 3.5's `DO` | ACCESS SHARE on `pg_proc` | to commit | nobody | milliseconds |

- **Row 4 is the only one that grows.** It blocks nobody, but a long transaction holds back vacuum's horizon and, if
  the runner bounds a statement's time, could be cancelled. The build (a) measures it at 1,000,000 four-key statements
  of 40 IDs and at 10,000 five-key statements of 30,795 IDs, on PostgreSQL 18, and records both; (b) reads the
  runner's bound. If the measured time at 1,000,000 passes 5 minutes or the runner's bound, the build stops and tells
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
| T2 | Migration test: a stored `{}` statement (inserted in scope as the app's role, which today's CHECK and trigger allow at recovered 0) | 3.3 refuses, the count in the message, and leaves both bodies today's | today's bodies accept `{}` |
| T2b | Catalog: after all migrations, every stored statement passes the CHECK; both stored body hashes are the granted ones; owner, grants, volatility, `search_path` as before | nothing but the two bodies changed | hashes are today's |
| T3 | The 16 shapes of `links` (four keys; five; a fifth key by another name; three keys; `{}`; a non-object; a non-array value; a non-string element; a malformed, upper-case or braced UUID; four empty lists; five empty lists) | A accepts and refuses exactly as its text says; four-key and four-empty stay accepted | five keys refused, `{}` accepted |
| T4 | HOM-01 extended (synthetic CAS-08): the statement counts 90.00 on 3 lines and stores their IDs; after the re-run is accepted the case counts 0.00 and the statement's 90.00 is rebuilt from the stored IDs by one query | Q1's purpose | no fifth key |
| T5 | The sum: on generated worlds (random stages, write-offs, stale pricing, unpriced lines with null variance, several cases, a case with no line left) the listed lines' `variance_cents` add up to the figure, the figure equals today's `ACTIONABLE_NOW` per case, no ID twice, every listed line on a listed case | the writer and D read the same rows | no list |
| T6 | Q2's refusals, each with D's message and `check_violation`: one cent over, one cent under, a line twice, another practice's line, a line of an unlisted case, a priced line on no case, a superseded priced line of the same service line, a nonzero figure with an empty list, a zero figure with a nonzero line | D refuses each wrong statement | today nothing checks the figure |
| T7 | Cross-practice, as the app's role in practice A's scope: practice B's priced line IDs in A's list | refused, and the message carries no row of B | not checked today |
| T8 | A second day: yesterday's statement stays, today's is checked on today's rows; a repeat with yesterday's list after a line moved on is refused only if its figure no longer matches its own list | D checks the list against the figure, never against "still actionable" | no list |
| T9 | The PDF record (the UPDATE) passes on a stored four-key and a stored five-key statement, and D's block does not run on UPDATE (a five-key statement whose lines were since re-priced still records its PDF) | a stored statement is never checked again | five keys refused at insert |
| T10 | Deploy: the previous image's writer (four keys) and PDF record against the migrated database; the new image's five-key rows read by the previous readers; the new writer against the unmigrated database is refused (the stated order) | section 3's "safe with the previous image" | - |
| T11 | Write-equality dump: today's writer against the new one on the same state, each rolled back, over HOM-01's three cases, the LED worlds and a month of worked cases: equal but for the ID, the three timestamps and the fifth key | no figure, link or column changes | - |
| T12 | Readers: detail, CSV and print receive four keys for a five-key statement, and the bytes they print are today's | 4.2 | readers ship `links` whole |
| T13 | LED-01 to LED-18, LED-23 to LED-25 and the ledger oracle, byte for byte, their test files untouched (`git diff --stat` on them is empty) | no ledger amount, stage, refusal or recovered total changes | must stay green throughout |
| T14 | D's block planned and timed on the real schema, with the tenant policies, other practices' rows present, in three planner states (`priced_line` and `case_line` never analyzed and empty at plan time; never analyzed at A's month; analyzed), at A's month and with 1,000,000 priced lines in the practice | the lesson of #143: a ledger trigger's plan on a new deployment | - |
| T15 | Two guards the ask promised ("PR 5 ties each to a test that fails until it replaces `roi_statement_rules`"): (a) the figure's per-line amount is `priced_line.variance_cents` and nothing else (a pin on the shared fragment and T5's property); (b) the line a case counts is `case_line.priced_line_id` (a catalog pin: no `case_line_pricing` table and no second priced-line column on `case_line`). Each failure message names `roi_statement_rules` and the exception it will need | the two planned drifts cannot land silently | - |
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
  way), as the ask's Risk section says.

## 9. Open points for the build session (none widens the grant)

1. Measure section 5's row 4 and T14 before the writer is finished: either can stop the PR.
2. Read the runner's statement-time bound (`packages/db/src/migrate.ts`; ADR 0009's amendment of 2026-11-11).
3. Find whether anything today changes `case_line.priced_line_id` or `case_line.case_id`, or deletes a case line,
   between the writer's read and its insert in the same transaction (a mistaken refusal, retried by the job, never a
   wrong figure). If something can, name it in the description.
4. Check on PR 4's merged tree that its migration touches neither function and sorts before this one.
