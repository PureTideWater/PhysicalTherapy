# Schema PR 5 (the ledger-freeze batch): status

## RESUME-BLOCK (W35, session_019i9ifAqmhWzhrv9YbKKE4R; 2026-11-12 about 07:50 UTC; W35's brief is done; W35 has stood down)
- **Where it stands:** the founder's ask for D2 (`approval-summaries/lane-a-ledger-freeze-ask-pr5-d2-2026-11-12.md`)
  now carries measured figures for W34's gaps 1 and 2. Not sent, not answered. Nothing is built. Everything in W34's
  block below still holds except its "Closed by W34" bullet and step (5)'s "none of which is measured yet".
- **Gap 3, ruled by the orchestrator (2026-11-12 07:50 UTC): neither reading is taken for the founder.** The ask
  now has a Question 3, in the orchestrator's words: on Question 1 no, is PR 5 built with Appendix A alone (yes), or
  not built (no, or no answer); with Question 1 yes it does not arise. The first ask's words are its footnote, and
  "What stands unchanged" says nothing is built on any of the three until the answer is recorded. W34's "On Question
  1 no: PR 5 is not built" below is superseded by Question 3's answer. The first ask's rule, its exact words (`lane-a-ledger-freeze-ask-pr5-2026-11-07.md`, "The questions"):
  "If the build's proof shows an appendix text itself wrong, the question whose change is at fault is treated as your
  no (in A, the five-key list is Q1's and the `coalesce` Q3's; a fault in lines an appendix keeps from today's body
  belongs to no question and stops the migration), and only the text the table names for the remaining answers is
  built (D only with A or B)." So: a fault in Appendix D is treated as a no to Q2 (D is Q2's text), and what is built
  is the table's text for Q1 and Q3 as answered, which is Appendix A, without D; a fault in Appendix A is a no to Q1
  (the five-key list) or to Q3 (the `coalesce`), and what is built is the table's row for the answers left
  (Q1 no, Q3 yes: Appendix C; Q1 yes, Q3 no: Appendix B; both no: unchanged), D never without A or B; a fault in a
  line kept from today's body belongs to no question and stops the migration. The two readings W35 set out, neither taken:
  1. *The first ask's rule governs:* D's fault is the founder's no to Q2, so on Question 1 no PR 5 is still built,
     with Appendix A alone and no check of the actionable figure in the database.
  2. *The new ask governs:* Question 1 no means PR 5 is not built at all, and the schema queue goes on without it.
  3. *What it turns on:* whether "the build's proof shows an appendix text itself wrong" covers a text that answers
     correctly and fails only its time bound, and whether a new ask may narrow what the first one said is built.
- **Gap 1, S4 clean (statistics from when the practice had 10 lines, the other 200 practices' 1,000,000 lines
  present, then its month loaded, no ANALYZE): within the bound.** Three databases built from scratch, D2 as drafted,
  the whole insert of the 30,795-line statement: 0.42 to 0.66 s over 24 runs (`plan_cache_mode` auto) and 0.44 to
  0.60 s over 9 runs (session forced generic). Every plan: `priced_line_pkey` and `case_line_once` index scans, one
  per listed line; no bitmap scan. W30's 1.55 to 1.81 s (the run degraded by a full disk) did not repeat, and nor did
  it in the state that run was closest to (no other practice's rows; both tables analyzed at 20 and 10 rows, then
  the month loaded, a new session): 0.32 to 0.53 s over 11 runs. This machine is faster than W30's: its control,
  analyzed at the month, ran 0.44 to 0.74 s (W30: 0.75 to 0.87 s). Nothing was tuned.
- **Gap 2, Question 2's header line through the real trigger:** S4, three builds: 0.47 to 0.65 s (24 runs), 0.46 to
  0.57 s with the session forced generic (the header overrides it). Control, analyzed at the month: 0.50 to 0.58 s.
  The four-key statement: 5 to 8 ms with or without. **The review's finding 1 reproduces through the real trigger:**
  seven statements in one session while the tables held 20 priced lines and 10 case lines (analyzed), the month
  loaded from another connection, no ANALYZE, then the 30,795-line statement in that session: D2 without the header
  251 s (primed with the empty statement) and 237 s (primed with the practice's own 10-line statement), neither
  cancelled (limit 600 s); D2 with the header 0.34 to 0.42 s (six runs). No plan was captured for the slow runs.
- **Equality with the header:** the 27 fixed statements through the real trigger and CHECK as the application role,
  on a new database (the month, 200 other practices, analyzed): D, D2 and D2 with the header give one file,
  SHA-256 `ea6e3f348ce81e6651827ceb6f8791cd07ebc29d4f706b568681a39dc143361b`, which is also W30's `d2/eq/cases_D.txt`.
  The 400 random statements through the two blocks agree too (`c64f8dda9922c7e6...` on this database's rows).
- **The function as the database stores it** (`pg_get_functiondef`, PostgreSQL 18.4; `w35/out/functiondef_*.txt`):
  the body between the `$function$` marks hashes to
  `ad925199131cb4117e43a97216f65c59ea09769f3bb0ee4f40f5b3bef748eca5` for D2 with and without the header, and to
  `ba8293836b9cd5aafd67dddf29d891f9f958059109c043f59f5223605ab42360` for D; `sha256(prosrc)` in the database agrees.
  The header prints as ` SET plan_cache_mode TO 'force_custom_plan'`, after the `SET search_path` line, exactly as
  the ask writes it; `proconfig` holds `plan_cache_mode=force_custom_plan`. The print is the draft file line for
  line but for the file's closing semicolon.
- **Records:** `lane-a-wip/schema-pr5/w35/` at the ops root: `jobW35.sh`, `jobW35b.sh` (they reuse `d2/gen_sess.sh`,
  `d2/setup_d2.sql`, `measurements/load_lines.sql`, `d2/eq/*.sql` unchanged), `A.sql` (cut from the first ask),
  `D.sql`, `D2.sql` (copies of `d2/D-as-granted.sql`, `D2-draft.sql`), `D2h.sql` (D2 with the one header line; file
  SHA-256 `a27928876344ffa2...`, the ask's), and `out/` (each run's timings, the logs, the dumps, the prints; of each
  32 MB plan output only the line statement's first and last plan is kept, as `*.plan.txt`). Base database migrated
  by `pnpm db:migrate` at 93e137f9; its two bodies hash to today's `49416713dd4d13dd` and `5a8bc6319828acb2`.
- **Holds:** none. The scratch cluster (`/var/lib/pr5w35`, port 5433) is stopped and removed with this session.

## RESUME-BLOCK, superseded in part by W35's above (W34, session_019i9ifCEAcrGwW4JmYcRswT; 2026-11-12; W34's brief is done)
- **Where it stands:** the founder's ask for D2 is written, not sent and not answered:
  `approval-summaries/lane-a-ledger-freeze-ask-pr5-d2-2026-11-12.md`. The orchestrator relays it. Question 1: Appendix
  D2 in place of Appendix D (body `ad925199131cb411`, the SHA-256 of the text between the `$function$` marks of
  `lane-a-wip/schema-pr5/d2/D2-draft.sql`; the same steps on `D-as-granted.sql` give the granted `ba8293836b9cd5aa`;
  not yet printed by a database). Question 2, its own question by the orchestrator's ruling: one header line,
  ` SET plan_cache_mode TO 'force_custom_plan'`, after the `SET search_path` line (the review's finding 1).
- **Nothing is built:** no migration file, nothing in the application repository, no WIP commit, no pull request.
- **After a grant, the builder:** (1) records the answer under a "Decided" heading in the ask, as relayed, never as the
  founder; (2) builds PR 5 with Appendix A as granted and, with Question 1 yes, `roi_statement_rules` exactly as the
  ask's appendix (byte for byte `D2-draft.sql`), with Question 2's line only on its yes; (3) checks that
  `pnpm db:domain-model` prints body `ad925199131cb411` and, with Question 2 yes, the header line as the ask writes
  it, and stops and reports on any difference, never adapting the text; (4) with Question 2 no, writes the residual
  and its trigger condition (the review's finding 1) in the migration's notes; (5) re-runs `d2/jobE.sh` and
  `d2/eq/run.sql` on the built migration (PostgreSQL 18, at least 10 GB of disk free), including the state S4 clean
  and, with Question 2 yes, every state with the setting, none of which is measured yet; (6) designs the preflight
  first (the three options below): it is open and not part of either question.
- **On Question 1 no:** PR 5 is not built; the schema queue goes on without it.
- **Closed by W34 from W30's files:** S4 (statistics from when the practice had 10 lines, then its month loaded) stays
  measured once, degraded: 1.55 to 1.81 s. The clean rerun did not finish: `d2/out/jobE.log` stops as `e3 S4` begins,
  `e3_load_10.txt` is empty and there is no `e3_load_month.txt`, so the `e3_S4_*` files there are the first run's.
  Not re-run: this machine has no PostgreSQL 18 and the scratch databases are gone. The ask says so.
- **The preflight scan, options for the builder's design step (not designed, not asked of the founder):**
  1. run the proof as the owner outside the tenant policy, with the practice checked in the query itself;
  2. batch the scan by practice, so the policy's scope is one practice a batch;
  3. raise nothing: keep the scan as it is (ACCESS SHARE only; milliseconds on the empty table at launch).
- **Holds:** none.

## RESUME-BLOCK, superseded by W34's and W35's above (W30, session_019i9ifDPVj1VzzJE78QWvC3; updated 2026-11-12 about 07:10 UTC; hands over at the context line, mid design step)
- **Where it stands:** PR 5 is not built (the orchestrator's ruling, 06:00 UTC: right to stop; the item became a bounded
  design step: a corrected text "Appendix D2", proved equal, reviewed, and a new ask for the founder). Steps 1 to 4 of
  that ruling are done but for one fix-round decision; **step 5 (the ask) is NOT drafted**: the next session writes
  `approval-summaries/lane-a-ledger-freeze-ask-pr5-d2-2026-11-12.md` from the section "Appendix D2" below.
- **Nothing is built on D2:** no migration file, nothing in the application repository, no counter, no WIP commit.
- **Open for the next session, in order:** (1) the review's finding 1 (below): decide with the orchestrator whether the
  ask carries it as a stated residual or adds a second question for `SET plan_cache_mode TO force_custom_plan` in the
  function's header (a change outside the block, so its own question); (2) read `lane-a-wip/schema-pr5/d2/out/` for
  the S3-1M repeat, S4 and S5 of the second timing run (it was still running at hand-over; if those files are absent,
  re-run `jobE.sh` on fresh databases, about 10 minutes, with at least 10 GB of disk free); (3) draft the ask; (4)
  tell the orchestrator its path.
- **The orchestrator's stand-down (sent 06:39 UTC, read 07:07 UTC, after the D2 work was already recorded):** the D2
  request is withdrawn for this session; a fresh design session answers three questions from this file. What is here
  for each: (1) *a D2 equal to D row for row, with a linear plan in every planner state and across cached plans:*
  a draft with its proof and review is below; the cached-plan state of the review's finding 1 is NOT solved.
  (2) *which proof the preflight runs, and under which scope, so the policy is not parsed again for each row:* not
  designed; the figures are in section 2 below. (3) *what of Appendix A stands as measured:* all of it (last bullet
  of "Appendix D2" below).
- **Measurement scripts:** `lane-a-wip/schema-pr5/measurements/` (D and the preflight: `setup_d.sql`, `load_lines.sql`,
  `gen_sess.sh`, `jobA.sh`, `jobA2.sh`, `jobD4.sh`, `pre_load1.sql`, `pre_load3.sql`, `pre_scan.sql`, `sample.sql`) and
  `lane-a-wip/schema-pr5/d2/` (D2: `setup_d2.sql`, `jobE.sh`, `eq/setup.sql`, `eq/run.sql`). The appendices are cut
  from the ask's file by section heading into `A.sql` and `D.sql`; the databases are copies of one migrated by
  `pnpm db:migrate`.
- **Holds:** nothing but scratch databases `pr5_*` on this session's machine (gone with it).

## Appendix D2, a draft (W30, 2026-11-12): the design step's results

- **Texts:** `lane-a-wip/schema-pr5/d2/D-as-granted.sql` (the ask's Appendix D) and `D2-draft.sql`. They differ in one
  statement only, the `SELECT ... INTO lines` inside `IF NEW.links ? 'actionable_open_lines'`; every other line,
  message, SQLSTATE and the function's header are D's. The draft file's SHA-256 begins `8053d62454b821e2` (the file
  with its `CREATE OR REPLACE` line; the body's hash as the domain model prints it is still to compute from a
  database for the ask).
- **How D2 reads:** the line list is made distinct once and drives the query; each listed line is looked up by its
  primary key inside a `LATERAL` subquery fenced with `OFFSET 0`, which the planner can only run once per listed
  line; the line's case comes from its one case line (`case_line_once`); the case is tested with
  `count(*) FILTER (WHERE m.case_id IN (...))`, a hashed lookup the planner does not turn into a join. No list is
  re-read per line in any plan.
- **Equal to D (step 3):** 27 fixed statements through the real trigger and CHECK as the application role (the
  30,795-line month; a cent over; a line twice; another practice's line; four keys; empty lists; a missing key; a
  superseded line; a line that is no row; nulls; malformed and upper-case IDs; a non-list; a sixth key) and 400
  random statements through the two blocks alone (314 of them with a repeated line): the dumps are byte-identical
  (`d2/eq/cases_D.txt` and `cases_D2.txt`, SHA-256 `ea6e3f348ce81e66...`; `rand_D.txt` and `rand_D2.txt`,
  `975cafdbbaba02c1...`). Harness: `d2/eq/setup.sql`, `run.sql`, on a database with 1,000,000 lines in the practice.
- **Times (whole insert of the 30,795-line statement; the block itself is 0.15 to 0.3 s less), second run, clean disk:**
  never analyzed, planned on empty tables: 0.79 to 0.84 s (forced generic 0.77 to 0.83 s); never analyzed at the
  month: 0.79 to 1.03 s; never analyzed with 1,000,000 lines in the practice: 0.86 to 0.99 s; analyzed at the month:
  0.81 to 0.87 s; statistics stale at 1,000,000: 0.76 to 0.94 s; analyzed at 1,000,000: 0.78 to 0.86 s; one practice
  alone, analyzed (first run): 0.46 to 0.67 s. A statement listing all 1,000,000 lines: 35 to 37 s (linear). D2's block
  alone in the forced-generic sessions: 0.63 to 0.75 s with plan output on. Against D: 190 to 580 s.
  The first timing run (`out3`) lost two states to a full disk and is not used, except S5.
- **Not within 1 s:** statistics taken when the practice had 10 lines, then its month loaded, no ANALYZE since
  (first run, other practices' rows missing because of the full disk): 1.55 to 1.8 s, primary-key probes through a
  bitmap scan. Linear, but past the note's bound; the second run's figure is in `d2/out/e3_S4_*` if it finished.
- **The review (step 4):** `reviews/lane-a-ledger-freeze-d2-equality.md`. Verdict: equal for every `links` the CHECK
  passes in every state the schema allows; no input that one accepts and the other refuses. Findings, each read
  against the texts by this session but NOT re-run:
  1. *should-fix:* a generic plan cached while both tables were analyzed and tiny (under about 100 priced lines and
     200 case lines: sequential scans inside the fence) stays quadratic if the tables then grow with no ANALYZE,
     autovacuum or DDL in between (cancelled at 30 s and 70 s on stand-in tables). Narrow window; D is no better
     there. The reviewer's working fix, `SET plan_cache_mode TO force_custom_plan` in the function header (427 ms),
     is outside the block, so it is a question for the founder, not a liberty. Not decided.
  2. *note:* D2 leans on `case_line_once`; with it dropped D2 raises 21000 where D counts two pairs. The schema
     forbids the state; the note's T15 (c) already pins the constraint.
  3. *note:* for a `links` the CHECK refuses, both refuse, sometimes with a different SQLSTATE (one case found: a
     malformed case ID with a line list matching no priced line gives 22P02 under D and 23514 under D2).
  4. *note:* 14 reachable cases and two odd states equal, types bigint, bigint, numeric.
  5. *note:* the hashed lookup stays hashed at `work_mem` 64 kB; the practice indexes were never chosen.
- **Appendix A stands, measured on its own:** it hashes to the granted value; its CHECK costs 141 ms on the
  30,795-line statement and about 197 microseconds on a 40-ID statement; nothing found against it. What does not
  stand as designed is the preflight's scan (12 min 45 s at 1,000,000 statements, section 2 below): that is the
  migration's, not A's text, and which proof the preflight runs is still to decide (the cost is the policy's
  per-row filter; a scan a practice at a time, or the `links = '{}'` test, would avoid it).

## The first stop (W30, 2026-11-12 about 06:50 UTC), kept for the record
- **Facts checked (do not re-derive):** on a database migrated to 93e137f9 (PostgreSQL 18.4), today's bodies hash to
  `49416713dd4d13ddf0766e35db60cc7306cebb8e06ee89ea7345beae2b5e51a3` (`roi_links_valid`) and
  `5a8bc6319828acb29a7f57aad9ebd57501734a71826a1e4d1d6953db9e85965c` (`roi_statement_rules`); the ask's Appendix A and D,
  applied as `tp_owner` and read back from `pg_proc.prosrc`, hash to
  `13c4dd46b9203095db8f26e124ed3652e5ec58bf5a46f0b28fd561b6cd1f2da4` and
  `ba8293836b9cd5aafd67dddf29d891f9f958059109c043f59f5223605ab42360`: the granted values. The texts are sound as text;
  what fails is their running time.
- **Holds:** nothing running; no WIP ref pushed; no counters. Scratch databases `pr5_*` on this session's machine only.

## Step 1's measurements (W30, 2026-11-12; SYNTHETIC rows only)

Scripts and raw output: `lane-a-wip/schema-pr5/measurements/` (`out/` holds each run's output; the plans are in the
`*_explain_*` files). PostgreSQL 18.4, the machine's defaults (`shared_buffers` 128 MB, `work_mem` 4 MB, `jit` on,
`plan_cache_mode` auto), 4 cores. Databases migrated by the runner to 93e137f9; rows loaded by a superuser with
triggers off (`session_replication_role = replica`), CHECKs on; the measured statements run as the roles that run them
in production (`tp_app` in a job's scope for the insert; `tp_owner` for the migration's steps).

### 1. Appendix D's block on the real schema: FAILS the note's bound (1 s at the month, in every state)

One insert of a five-key statement listing 30,795 priced lines on 1,200 cases of practice A (each service line also has
one superseded priced line), as `tp_app` in a job's scope, rolled back. Except in S5, 200 other practices hold
1,000,000 priced lines and case lines. "D's block" is the nested statement's own time (`auto_explain`, node timing off).

| State | Whole insert | D's block | Plan of the `found` count |
| --- | --- | --- | --- |
| S1: never analyzed, tables empty when the session first planned (7 inserts on empty tables), then the month loaded | 191.3 s | 191.0 s | nested-loop semi join |
| S1 with a forced generic plan | 193.5 s (189.0 s without `auto_explain`) | 193.3 s | the same |
| S2: never analyzed, at the month, a fresh session | 189.8 s | 189.5 s | the same |
| S2-1M: never analyzed, 1,000,000 lines in the practice (the statement still lists 30,795) | 558.1 s | 557.9 s | the same (1,361,077,410 comparisons) |
| S3: analyzed, at the month | 194.5 s | 194.2 s | the same |
| S3-stale: analyzed at the month, then grown to 1,000,000 lines, not analyzed again | 552.0 s | 551.8 s | the same |
| S3-1M: analyzed at 1,000,000 lines, inserts 1 to 5 of a session | 3.5 to 4.2 s | 3.4 s | hash semi join |
| S3-1M: the same session's insert 6 (the cached generic plan) | 579.9 s | - | (the slow plan; stopped during insert 7) |
| S5: one practice alone holds lines, analyzed, at the month | 191.7 s, 190.8 s | 191.5 s, 190.6 s | nested-loop semi join |
| S5 with a forced generic plan | 192.0 s | 191.8 s | the same |
| For comparison: a four-key statement (D's block skipped), every state | 7 to 8 ms (18 to 20 ms the first) | - | - |

- **Cause (the plans agree):** in the `found` count the planner expects 1 row from the join of `case_line` and
  `priced_line` (the tenant policy's `practice_id = ANY (...)` and the body's `practice_id = NEW.practice_id` are
  both applied to each table and their selectivities multiplied) and 100 elements from
  `jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')`. So it joins them by a nested-loop semi join whose
  inner side re-reads the whole list for each line: 30,795 lines against 30,795 IDs, 474,150,615 comparisons. The time
  grows with the square of the listed lines: about 1 s at 2,200 lines, about 190 s at 30,795. The `cents` sum (a hash
  semi join) and the `linked` count are fast in every state.
- The ask's 0.2 s was measured on stand-alone tables without policies (the note, section 5); on the real schema with
  the policies the plan differs.
- A's CHECK on the same five-key statement: 141 ms. Statement 3.2 (A) applies in 46 ms, 3.4 (D) in 14 ms.
- **What it would mean in production:** the reconcile job inserts the quarterly statement daily (the BEFORE trigger
  fires before `ON CONFLICT`), so each practice with a few thousand actionable lines would hold its reconcile
  transaction for minutes every day; at A's month over 3 minutes, at 1,000,000 lines over 9.
- Not measured (the run was cut once the bound had failed in every state): a 1,000,000-line list; a practice loaded
  since the last ANALYZE; the writer's statement step.

### 2. The preflight scan at 1,000,000 stored statements: FAILS the note's limit (5 minutes)

The migration's steps 3.2 to 3.4 as the runner runs a file (`tp_owner`, one transaction, `lock_timeout` 5 s), rolled
back. 1,000,000 four-key statements of 40 IDs (table 2,135 MB) over 1,000 practices.

| Case | Time of 3.3's scan |
| --- | --- |
| 1,000,000 four-key statements, 1,000 practices in scope (scope text 37,001 characters) | **764.9 s (12 min 45 s)**, measured whole, once |
| the same, 10,000 practices in scope (370,001 characters) | about 97 minutes, extrapolated: 5,000 statements in 29.06 s (5.8 ms a statement); the whole run not made |
| 10,000 five-key statements of 30,795 line IDs (table 12 GB), 1,000 practices in scope | about 25 minutes, extrapolated: 100 statements in 15.3 s (153 ms a statement); the whole run not made |

- **Where the time goes (20,000 statements sampled, 1,000 practices):** the new `roi_links_valid` alone, no policy:
  3.93 s (197 microseconds a statement, about 4.9 an ID; 1,000,000 statements about 3.3 minutes). With the tenant
  policy as the owner role: 15.92 s (796 microseconds a statement). So three quarters of the scan is the policy's
  `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`, evaluated as a filter on each row of the
  sequential scan, the scope's text parsed again each time: it grows with rows times practices. The database review's
  finding 2 (suspected, not measured) is confirmed. A count of the same 1,000,000 statements through the policy
  alone takes 0.77 s, because that query reads an index with the policy as its condition, evaluated once.
- **Locks at the end of the migration's transaction (`pg_locks`):** ACCESS SHARE on `roi_statement` and its three
  indexes and on `practice` and two of its indexes; the transaction's own ID locks; nothing stronger on any table. As
  the note's section 5 says, the scan blocks nobody; it holds back vacuum's horizon for as long as it runs.
- At launch the table is empty, so the real first run is milliseconds (the note, section 5); the figure is for the
  record and for a database restored and migrated again.
- The second whole run was lost to this session's own sampling beside it (it held the function's catalog row past the
  5 s `lock_timeout`); the samples above ran for under a minute beside the measured run.

### What stops, by the brief and the note
- Section 6 of the note: T14's bound is 1 s at the month in every state; past it "the build stops and tells the
  orchestrator". Measured: 190 s and more in seven of eight states, and in the eighth from a session's sixth insert.
- Section 5 of the note: past 5 minutes at 1,000,000 statements "the build stops and tells the orchestrator; it does
  not swap in the cheaper `links = '{}'` test on its own". Measured: 12 min 45 s.
- The brief: a fault in a granted text is never repaired by the build, and only A and D are granted.

## RESUME-BLOCK (W29, session_019i9ifE4gRYJeq78K4egWh3; 2026-11-12, after the reviews and the fix round; W29's brief is done)
- **Done:** the plan's "Revision 2026-11-12" (build-ops f742dcfc); the note `designs/lane-a-ledger-freeze-batch.md`;
  the second ask, a draft, `approval-summaries/lane-a-ledger-freeze-ask-2-2026-11-12.md`; two reviews of the note
  (`reviews/lane-a-ledger-freeze-batch-money.md`, `reviews/lane-a-ledger-freeze-batch-database.md`), one fix round.
- **Facts W29 checked on the base:** the writer is `apps/worker/src/reconcile/statements.ts` (`generateRoiStatement`,
  `OPEN_CASES_ACTIONABLE`); the figure's predicate is `apps/worker/src/triage/actionable-now.ts`; `case_line_once` is
  UNIQUE (service_line_id); a migration reads a forced-RLS table by `set_config('app.practice_ids', <all practices>,
  true)` and sets it back to `'{}'` (20261109090000_line_status_heads.sql:127-132).
