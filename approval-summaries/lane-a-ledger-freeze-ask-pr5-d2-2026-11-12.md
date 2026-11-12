# Ledger freeze exception, schema PR 5: a corrected text for the statement check (Appendix D2 in place of Appendix D; for the founder; text for the orchestrator to relay)

From Lane A (W34; the measurements of 2026-11-12 marked "second machine" are W35's), 2026-11-12, for schema PR 5
(the ledger-freeze batch). Follows the ask of 2026-11-07
(`approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`). Synthetic data only; IDs and counts, no statement
content. Nothing is built on what is asked here.

**In short:** three yes/no questions. The check you granted is correct but too slow to run; Question 1 asks for a text
that gives the same answers in under a second. Question 2 asks for one setting that closes the one case where the new
text could still be slow. Lane A recommends yes to both. Question 3 arises only if you say no to Question 1: whether
PR 5 is then built with Appendix A alone. Lane A makes no recommendation on it; it is yours to say.

## What you granted
On 2026-11-07 you answered Q1, Q2 and Q3 yes. That grant covers, word for word and for schema PR 5 only, Appendix A
(`roi_links_valid`, body `13c4dd46b9203095`) and Appendix D (`roi_statement_rules`, body `ba8293836b9cd5aa`): the
database refuses a new ROI statement unless each priced line it lists appears once, is a line of a case it lists, and
the actionable figure is their sum.

## What the measurement found
Before building, Lane A ran Appendix D on the real schema (PostgreSQL 18.4, synthetic rows, as the application's
role). One statement listing 30,795 priced lines on 1,200 cases:

- **Appendix D: 190 to 580 seconds** against a bound of 1 second (189 to 195 s with a month of lines in the practice,
  552 to 580 s with 1,000,000). The time grows with the square of the lines listed: the database re-reads the whole
  list for each line (474,150,615 comparisons at 30,795 lines). The daily reconcile job would hold its transaction
  for minutes for any practice with a few thousand actionable lines.
- The 0.2 s in the first ask was measured on stand-alone tables without the tenant policies; with them the plan differs.
- D refuses and accepts the right statements. Only its speed is at fault. The build stopped, as its rules say; a
  granted text is never repaired by the build.

## Question 1. May Lane A build Appendix D2 in place of Appendix D?

*Lane A recommends yes.*

- **The text:** the appendix below, exact. Body SHA-256 `ad925199131cb4117e43a97216f65c59ea09769f3bb0ee4f40f5b3bef748eca5`
  (first 16: `ad925199131cb411`), computed as the first ask computed D's: the SHA-256 of the text between the two
  `$function$` marks, which is what `domain-model.md` prints. It is computed from the function as PostgreSQL 18.4
  stores and prints it (`pg_get_functiondef`, after applying `lane-a-wip/schema-pr5/d2/D2-draft.sql` as the owner
  role; `lane-a-wip/schema-pr5/w35/out/functiondef_D2.txt`), and the draft file gives the same value; the same steps
  on D give the granted `ba8293836b9cd5aa`. The print is the draft file line for line but for the file's closing
  semicolon. The whole file's SHA-256 is `8053d62454b821e2c453ab706b2a6ee99d96439fdc32dfe273d26a54b7890b07`.
- **What differs:** one statement, the one that counts and sums the listed lines. Every other line, every message,
  every error code and the header are D's. The whole difference:

```diff
     SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')) AS linked,
-           (SELECT count(*) FROM priced_line p JOIN case_line l ON l.service_line_id = p.service_line_id AND l.priced_line_id = p.id
-             WHERE p.practice_id = NEW.practice_id AND l.practice_id = NEW.practice_id
-               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)
-               AND l.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
-           (SELECT coalesce(sum(p.variance_cents), 0) FROM priced_line p
-             WHERE p.practice_id = NEW.practice_id
-               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)) AS cents
+           count(*) FILTER (WHERE m.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
+           coalesce(sum(m.variance_cents), 0) AS cents
+      FROM (SELECT DISTINCT x::uuid AS id FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x) i
+     CROSS JOIN LATERAL (
+           SELECT p.variance_cents,
+                  (SELECT l.case_id FROM case_line l
+                    WHERE l.service_line_id = p.service_line_id AND l.priced_line_id = p.id AND l.practice_id = NEW.practice_id) AS case_id
+             FROM priced_line p
+            WHERE p.id = i.id AND p.practice_id = NEW.practice_id
+           OFFSET 0) m
       INTO lines;
```

  In words: D2 goes through the list once and looks each line up by its key; D asked the database to match the list
  against the tables and the database chose to re-read the list for every line.
- **The proof that it answers as D does:** 27 fixed statements through the real trigger and CHECK as the application's
  role (the 30,795-line month; a cent over; a line twice; another practice's line; a superseded line; a line that
  does not exist; empty lists; malformed IDs; and others) and 400 random statements through the two blocks alone (314
  with a repeated line). The outcomes, written to files, are byte for byte the same for D and D2: fixed,
  SHA-256 `ea6e3f348ce81e6651827ceb6f8791cd07ebc29d4f706b568681a39dc143361b` for both; random,
  `975cafdbbaba02c11e6527a5a96b601013543f22617105330599a2dd4089b04d` for both. Run again on a second machine and a
  new database, the 27 fixed statements give that same file (`ea6e3f34...`) for D, for D2 and for D2 with Question
  2's line, and the 400 random statements again agree between D and D2.
- **The times** (the whole insert of the 30,795-line statement, 8 to 11 runs a state; D took 190 to 580 s):

  | State of the database's statistics | D2 |
  | --- | --- |
  | never analyzed, first planned on empty tables | 0.77 to 0.84 s |
  | never analyzed, a month of lines | 0.78 to 1.03 s |
  | never analyzed, 1,000,000 lines in the practice | 0.86 to 0.99 s |
  | analyzed, a month of lines | 0.75 to 0.87 s |
  | analyzed at a month, then grown to 1,000,000, not analyzed again | 0.76 to 0.94 s |
  | analyzed, 1,000,000 lines | 0.78 to 0.86 s |
  | one practice alone in the database, analyzed | 0.46 to 0.67 s |
  | analyzed when the practice had 10 lines, then its month loaded, not analyzed again (second machine, three clean builds) | 0.42 to 0.66 s |

  A statement listing all 1,000,000 lines takes 34 to 37 s: the time now grows in step with the list, not with its
  square. Every state measured is within the 1-second bound.
  The last row was first measured once at 1.55 to 1.81 s, on a run where a full disk had left the other practices'
  rows out. That figure did not repeat. Measured again on a second machine (PostgreSQL 18.4, the same scripts and
  settings, nothing tuned): three databases built from scratch gave 0.42 to 0.66 s over 33 runs, and the state the
  faulty run was closest to (no other practice's rows at all, statistics from 20 priced lines) gave 0.32 to 0.53 s
  over 11 runs; every plan looks each line up by its key. The second machine is somewhat faster than the first: the
  "analyzed, a month of lines" row took 0.44 to 0.74 s there against 0.75 to 0.87 s above, so the last row compares
  with that row, not with the first machine's figures.
- **What the independent review found** (`reviews/lane-a-ledger-freeze-d2-equality.md`; its own 25 cases on copies of
  the tables, not the 427 above): equal on every statement the CHECK lets through; no statement that one accepts
  and the other refuses. Three things to know. (1) One reachable slow case: Question 2. (2) D2 relies on the
  existing rule that a service line has one case line (`case_line_once`); if that rule were ever dropped, D2 would
  refuse with an error where D would miscount. The schema forbids the state. (3) For a statement the CHECK refuses
  anyway, both refuse, in one found case with a different error code (22P02 under D, 23514 under D2).
- **On no:** Appendix D2 is not built, and Appendix D is not built either, because it fails its bound. Nothing in
  the database checks the actionable figure, as today. What becomes of the rest of PR 5 is Question 3.

## Question 2. May the function's header also carry one setting, so the database plans this check afresh each time?

*Lane A recommends yes.* Asked on its own because it lies outside the statement Question 1 changes. Built only with
a yes to Question 1.

- **The text:** one line added to the header of Appendix D2, after the `SET search_path` line; the body and its
  hash (`ad925199131cb411`) do not change:

```sql
 SET plan_cache_mode TO 'force_custom_plan'
```

  The whole statement with that line has SHA-256 `a27928876344ffa2f5c591d5254e0c66bc30d317ac01ca79442ddb9a4be7b523`.
  PostgreSQL 18.4 stores and prints the line exactly so (`pg_get_functiondef`;
  `lane-a-wip/schema-pr5/w35/out/functiondef_D2h.txt`), and the body's hash computed from that print is the same
  `ad925199131cb411`; if the built database prints it otherwise, the builder stops and reports.
- **Why:** the review found one way D2 can still take minutes. A database session that has written six or more
  statements while both tables were analyzed and tiny (under about 100 priced lines and 200 case lines in all
  practices together) keeps a plan made for tiny tables. If the tables then grow to tens of thousands of rows with
  no ANALYZE, autovacuum or schema change in between, that session's next large statement is slow again: stopped at
  30 s and at 70 s in the review's test. Measured through the real trigger (second machine; seven statements while
  the tables held 20 priced lines and 10 case lines, then the month loaded from another connection, then the
  30,795-line statement in the same session): D2 as in Question 1 took 237 s and 251 s (two runs); D2 with the
  setting took 0.34 to 0.42 s (six runs). Where it can happen: launch
  week inside a one-minute window, an environment with autovacuum off, or a seed or test run that loads and writes
  at once. D is no better there.
- **What it costs:** the database plans each statement of this function, and of the functions it calls while it
  runs, on every call: 4 to 18 ms for the check; a four-key statement takes 7 to 8 ms in all today. With the
  setting, through the real trigger on the second machine: the 30,795-line statement took 0.46 to 0.65 s in the
  last row's state (0.42 to 0.66 s without it) and 0.50 to 0.58 s analyzed at a month (0.44 to 0.74 s without it);
  a four-key statement 5 to 8 ms either way. The setting changes no answer: the 27 fixed statements give the same
  file as D's (Question 1's proof).
- **On no:** D2 is built with D's header, and the case above stays as a stated residual with exactly that trigger
  condition, recorded in the migration's notes and ended by any ANALYZE.

## Question 3. If you say no to Question 1, should PR 5 be built with Appendix A alone?

The first ask said that if the build's proof shows an appendix text itself wrong, the question at fault is treated as
your no and only the remaining text is built, which for a fault in D means Appendix A alone, with no database check
of the actionable figure.[^fault] Appendix D is not wrong in what it answers; it is too slow to ship. Lane A does not
stretch that rule to cover this case without your word.

- **Yes:** PR 5 is built with Appendix A alone, exactly as granted.
- **No, or no answer:** PR 5 is not built, nothing on the ledger changes, and the schema chain goes on without it.
- If you say yes to Question 1 this question does not arise.

[^fault]: The first ask's exact words (`approval-summaries/lane-a-ledger-freeze-ask-pr5-2026-11-07.md`, under "The
    questions"): "If the build's proof shows an appendix text itself wrong, the question whose change is at fault is
    treated as your no (in A, the five-key list is Q1's and the `coalesce` Q3's; a fault in lines an appendix keeps
    from today's body belongs to no question and stops the migration), and only the text the table names for the
    remaining answers is built (D only with A or B)."

## What stands unchanged
Appendix A, as granted, measured on its own: its body hashes to the granted `13c4dd46b9203095`; its CHECK costs
141 ms on the 30,795-line statement and about 0.2 ms on a 40-ID statement; nothing was found against it. Your Q1
and Q3 of 2026-11-07 are not asked again. All of the first ask's rules still hold: a grant covers the exact text
only, is never widened, and holds for schema PR 5 only. This is not the approval of record for the pull request;
you still approve that yourself. Nothing is built on any of the three questions until your answer is recorded.

## Not asked here
- **The migration's preflight scan.** The migration checks every stored statement against Appendix A before it
  finishes. At 1,000,000 stored statements in 1,000 practices that took 12 min 45 s against a limit of 5 minutes. It
  blocks nobody (it takes only reading locks), and at launch the table is empty, so the real first run is
  milliseconds. Three quarters of the time is the tenant policy re-reading the list of practices for every row, not
  the check. This is a known open point of PR 5's migration, for the builder's design step; it changes no ledger
  text, so it is not part of what you grant here.
- **The items of the earlier second ask** (`approval-summaries/lane-a-ledger-freeze-ask-2-2026-11-12.md`, a draft):
  not reopened and not answered by a reply to this one.

## The questions (yes or no)
Please answer each: "Question 1: yes or no. Question 2: yes or no. Question 3: yes or no." Each can be answered
alone. With Question 1 no, Question 2 lapses and Question 3 decides whether PR 5 is built with Appendix A alone;
with Question 1 yes, Question 3 does not arise.

## Appendix D2: the exact text asked (body `ad925199131cb411`)
`roi_statement_rules` as `pnpm db:domain-model` would print it after the migration, with Question 1 yes and Question
2 no. With Question 2 yes, the one line above follows the `SET search_path` line.

```sql
CREATE OR REPLACE FUNCTION public.roi_statement_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  sums record;
  lines record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an ROI statement keeps its figures; a new one is generated' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.proof_level, NEW.fees_cents, NEW.recovered_cents, NEW.interest_cents, NEW.approved_unposted_cents,
        NEW.actionable_open_cents, NEW.pursuit_hours, NEW.links, NEW.generated_by, NEW.generated_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.proof_level, OLD.fees_cents, OLD.recovered_cents, OLD.interest_cents, OLD.approved_unposted_cents,
        OLD.actionable_open_cents, OLD.pursuit_hours, OLD.links, OLD.generated_by, OLD.generated_at, OLD.created_at)
       OR OLD.document_key IS NOT NULL OR NEW.document_key IS NULL THEN
      RAISE EXCEPTION 'an ROI statement keeps its figures; only its printed PDF is recorded, once' USING ERRCODE = 'check_violation';
    END IF;
    IF practice_in_scope(NEW.practice_id) THEN
      IF app_actor_is_person() THEN
        RAISE EXCEPTION 'the statement job records the printed PDF, in no one''s name' USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF left(NEW.document_key, char_length('practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/')) <> 'practices/' || NEW.practice_id::text || '/reports/' || NEW.id::text || '/' THEN
        RAISE EXCEPTION 'a statement''s PDF is stored under its own practice and statement' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.generated_at := now();
  IF NEW.document_key IS NOT NULL OR NEW.pdf_sha256 IS NOT NULL THEN
    RAISE EXCEPTION 'a statement is printed after it is written' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.generated_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'an ROI statement is generated on demand by a person who reconciles postings, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.generated_by IS NOT NULL THEN
    RAISE EXCEPTION 'the quarterly statement is generated in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'recovered')) + (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'interest')) AS linked,
         (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x))
           + (SELECT count(*) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS found,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'recovered') x)) AS recovered,
         (SELECT coalesce(sum(e.amount_cents), 0) FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'interest') x)) AS interest
    INTO sums;
  IF sums.linked <> sums.found OR sums.recovered <> NEW.recovered_cents OR sums.interest <> NEW.interest_cents THEN
    RAISE EXCEPTION 'an ROI statement''s recovered and interest are the sums of the entries it links' USING ERRCODE = 'check_violation';
  END IF;
  -- Its actionable figure is the variance of the priced lines it links (from #93's F9; docs/adr/0082 Decision 7), each
  -- once and each a line of a case it links. A statement without the key (one written before this migration, or by the
  -- image before it during a deploy or after a rollback) keeps today's rule: its actionable figure is not checked.
  IF NEW.links ? 'actionable_open_lines' THEN
    SELECT (SELECT count(*) FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines')) AS linked,
           count(*) FILTER (WHERE m.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
           coalesce(sum(m.variance_cents), 0) AS cents
      FROM (SELECT DISTINCT x::uuid AS id FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x) i
     CROSS JOIN LATERAL (
           SELECT p.variance_cents,
                  (SELECT l.case_id FROM case_line l
                    WHERE l.service_line_id = p.service_line_id AND l.priced_line_id = p.id AND l.practice_id = NEW.practice_id) AS case_id
             FROM priced_line p
            WHERE p.id = i.id AND p.practice_id = NEW.practice_id
           OFFSET 0) m
      INTO lines;
    IF lines.linked <> lines.found OR lines.cents <> NEW.actionable_open_cents THEN
      RAISE EXCEPTION 'an ROI statement''s actionable figure is the variance of the priced lines it links, each once and each a line of a case it links' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
```
