# Ledger freeze exception: two ledger function bodies, `ledger_line_net` and `ledger_entry_rules` (for the founder; text for the orchestrator to relay)

From SUITE-CAP-3 (Lane B, reconcile at real size), 2026-11-06; revised the same day by the design's completeness check.
The founder granted the exception at 2026-11-06 22:40 UTC on that text (committed at 22:28 UTC). Everything changed
since came from the design review's rounds 1, 3 and 4 (2026-11-07, design section 18), and none of it touches the two
function bodies, which are exactly as granted:
- Two statements the founder read were corrected. (1) "inside the 360 s the release checks allow" now says that no check
  enforces 360 s; it is the margin the capacity work sizes a 900 s job by, and the weekly run fails only when the job
  needs a second attempt (round 1). (2) "In every case the writes matched row for row" now says the rows were compared
  at F 10,000 and R 2,000 only. At A's month only the counts and the cents were compared. Encrypted text was compared
  only as present or absent (rounds 3 and 4).
- Three proof items were added for Lane A's pull request: the note on why the practice condition and the ordering are
  there, a cross-practice test, and a plan test that reads the installed functions (rounds 1 and 4).
- Two sentences were reworded. Why the answer is the same now rests on the tenant policy (round 4). The "about 35 s more"
  is now marked as measured on the search's first form (round 3).
Design: `designs/lane-b-suite-cap-3-reconcile.md`, sections 1.5, 8.3a, 8.4 and 14.1. All figures were measured on
synthetic data only, one run each on a 4-CPU container.

**What changed from the first draft of this ask:** the first draft asked for a `ledger_line_net` body that was measured
only on one practice shape. On the weekly run's step-7b practice (F) it saves nothing, so it is replaced below by a body
measured on both shapes. The match lookup in `ledger_entry_rules`, which the first draft said would come later, is now
measured and asked here. `ledger_line_stage` is no longer asked: its cost is small and its new body was never run.

## What changes
Two ledger functions get new bodies in one migration (`CREATE OR REPLACE`, which keeps owner, grants and settings). No
table, column, index, trigger, amount, stage or rule changes. Each function gives the same answer, and refuses the same
entries with the same errors, as it does today.

Why they are slow: during a reconcile pass the database has no statistics for the ledger rows the pass is writing. Then
both functions pick a slow way to find one row:
- `ledger_line_net` (the per-line sum each new ledger entry is checked against) reads every entry of the practice to
  find one line's entries.
- `ledger_entry_rules` (the checks on each new entry) reads every standing match of the practice to find the entry's one
  match.

The new bodies name exactly the index that finds the row: the line's own entries through the line index, and the match
by its primary key.

### 1. `ledger_line_net`

```sql
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(x.amount_cents), 0)::bigint
    FROM (SELECT e.amount_cents, e.stage, e.evidence_id
            FROM ledger_entry e
           WHERE e.practice_id = (SELECT l.practice_id FROM service_line l WHERE l.id = line)
             AND e.service_line_id = line
           ORDER BY e.seq) x
   WHERE CASE WHEN x.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = x.evidence_id)
              ELSE x.stage END = counted
$function$;
```

Why the answer is the same: every entry the app or a migration can store carries its line's practice. An entry written
in the app's practice scope must be of a case of its practice and of a line of that case (the existing rules), and the
ledger's tenant policy refuses any entry outside that scope; no database role but a superuser can get past the policy,
and a superuser could as well switch the rules off. So adding the line's practice drops no entry. Adding up whole
cents does not depend on the order. A reversal or adjustment still counts as the stage of the entry it finally corrects
(its target, or the target's target when the target is itself an adjustment), one whose target is missing still counts
as nothing, and every other entry counts as its own stage.

The added practice condition and the `ORDER BY e.seq` change no answer; they are there only so the database reads the
line's entries through the line index on a ledger it has no statistics for. Removing either would bring back the slow
read without failing any correctness test, so the migration's comment says so and Lane A's pull request adds a test
that checks which index each new statement uses (below).

### 2. `ledger_entry_rules`
Two statements change; the rest of the function is unchanged word for word.
- A correction's match: `NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = NEW.match_id AND m.reversed_at IS NULL)`
  becomes `(SELECT m.reversed_at IS NULL FROM ledger_match m WHERE m.id = NEW.match_id) IS NOT TRUE`.
- An entry's match: `SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id AND m.practice_id =
  NEW.practice_id AND m.reversed_at IS NULL; IF NOT FOUND THEN` becomes `SELECT * INTO matched FROM ledger_match m WHERE
  m.id = NEW.match_id; IF NOT FOUND OR matched.practice_id IS DISTINCT FROM NEW.practice_id OR matched.reversed_at IS NOT
  NULL THEN`.

Each raises the same error as today for exactly the same entries: no match, a match of another practice, or a reversed
match. The whole function as it would be written:

```sql
CREATE OR REPLACE FUNCTION public.ledger_entry_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target ledger_entry;
  matched ledger_match;
  dated date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a ledger entry is never changed or deleted; a correction is a new entry' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.stage = 'adjusted' THEN
      IF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'ledger.adjust'), false) THEN
        RAISE EXCEPTION 'a specialist corrects an amount after review, in their own name, with the ledger adjustment permission' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person writes a ledger entry in their own name, with the reconciliation permission' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job writes ledger entries in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a ledger entry is of a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM case_line c WHERE c.case_id = NEW.case_id AND c.service_line_id = NEW.service_line_id) THEN
    RAISE EXCEPTION 'a ledger entry of a line is of a line of its case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO target FROM ledger_entry t WHERE t.id = NEW.evidence_id AND t.practice_id = NEW.practice_id;
    IF NOT FOUND OR target.stage = 'reversed' OR (target.stage = 'adjusted' AND NEW.stage <> 'reversed') THEN
      RAISE EXCEPTION 'a correction names an entry of a counted stage, or a reversal an adjustment' USING ERRCODE = 'check_violation';
    END IF;
    IF (target.case_id, target.service_line_id, target.match_id) IS DISTINCT FROM (NEW.case_id, NEW.service_line_id, NEW.match_id) THEN
      RAISE EXCEPTION 'a correction is of its entry''s case, line and match' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.match_id IS NOT NULL AND (SELECT m.reversed_at IS NULL FROM ledger_match m WHERE m.id = NEW.match_id) IS NOT TRUE THEN
      RAISE EXCEPTION 'a correction is of an entry whose match stands; a reversed match''s entries are never corrected again' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stage = 'reversed' AND NEW.amount_cents <> -target.amount_cents THEN
      RAISE EXCEPTION 'a reversal offsets its entry exactly' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'a person reverses or adjusts an entry, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.allocated THEN
      RAISE EXCEPTION 'a correction is never allocated' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := target.effective_on;
    RETURN NEW;
  END IF;
  IF NEW.evidence_kind = 'payer_response' THEN
    -- An amount a payer response accepts (the submissions' table, 20261023090000), for its case.
    IF NEW.match_id IS NOT NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a recorded response, with no match' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.received_on INTO dated FROM payer_response r JOIN submission s ON s.id = r.submission_id
     WHERE r.id = NEW.evidence_id AND r.practice_id = NEW.practice_id AND s.case_id = NEW.case_id AND r.kind IN ('accepted', 'partial');
    IF dated IS NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a response accepting an amount for its case' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := dated;
    RETURN NEW;
  END IF;
  SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id;
  IF NOT FOUND OR matched.practice_id IS DISTINCT FROM NEW.practice_id OR matched.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'an entry comes from a standing match' USING ERRCODE = 'check_violation';
  END IF;
  IF matched.evidence_id IS DISTINCT FROM NEW.evidence_id OR (matched.service_line_id IS NOT NULL AND matched.service_line_id IS DISTINCT FROM NEW.service_line_id)
     OR (matched.kind IN ('posting', 'deposit') AND NEW.service_line_id IS NULL) THEN
    RAISE EXCEPTION 'an entry carries its match''s evidence, for its match''s line' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (CASE NEW.stage
       WHEN 'approved' THEN matched.kind = 'claim' AND matched.outcome = 'approved'
       WHEN 'recouped' THEN (matched.kind = 'claim' AND matched.outcome = 'decreased') OR matched.kind = 'recoupment'
       WHEN 'interest' THEN matched.kind = 'interest'
       WHEN 'posted' THEN matched.kind = 'posting'
       ELSE matched.kind = 'deposit'
     END) THEN
    RAISE EXCEPTION 'a % entry comes from a match of its kind', NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.allocated IS DISTINCT FROM matched.allocated THEN
    RAISE EXCEPTION 'an entry is allocated when its match is' USING ERRCODE = 'check_violation';
  END IF;
  SELECT CASE matched.kind
           WHEN 'posting' THEN (SELECT p.posted_on FROM posting_row p WHERE p.id = matched.posting_row_id)
           WHEN 'deposit' THEN (SELECT e.deposited_on FROM eft_row e WHERE e.id = matched.eft_row_id)
           ELSE (SELECT r.bpr16_date FROM remittance r WHERE r.id = matched.remittance_id)
         END INTO dated;
  NEW.effective_on := dated;
  RETURN NEW;
END;
$function$;
```

## Why
SUITE-CAP-3 fixes the reconcile pass's own work in the worker. After that fix, most of the time left in a large pass is
the ledger's own checks on each new entry, and these two are the largest.

Measured on the current base (cc3dd7f6, SUITE-CAP-1b merged) with SUITE-CAP-3's worker fix in place, step-7b pass
(approvals and postings in one pass), against the reconcile job's 900 s limit:

| practice shape, lines | worker fix only | with both new bodies | ledger entry inserts, before → after |
| --- | ---: | ---: | ---: |
| F (the weekly run's), 10,000 | 219.1 s (24%) | 84.9 s (9%) | 161.3 → 29.1 s |
| F at practice A's full month, 30,795 | 1,653.1 s (184%) | 309.9 s (34%) | 1,468.9 → 141.5 s |
| R (lines spread over cases), 2,000 | 43.7 s | 19.2 s | 33.3 → 8.6 s |

Apart, at F 10,000: the `ledger_entry_rules` change alone 160.0 s, the `ledger_line_net` change alone 128.1 s. At F 10,000
and R 2,000 the writes with the new bodies matched the writes without them row for row (every ledger match, entry and
stage event, `seq` values included; 102,907 rows at F 10,000, 20,635 at R 2,000). Encrypted text in those rows was
compared only as present or absent, not by its words; these runs write no such note, and SUITE-CAP-3's own test
compares the words. At A's month the approved and posted
counts, the lines recovered and the posted cents matched (30,795 approved, 30,795 posted, 30,795 recovered,
$4,947,800.00 posted, in both runs); the rows were not
compared there. The recovered totals were the same in every case.

What it is for: today step 7b of the weekly run cannot move back to practice A's full month, because the pass there takes
1,653 s against the 900 s limit. With both bodies it takes 310 s, inside 360 s, the 2.5-times margin the capacity
work sizes a 900 s job by (no check enforces 360 s; the weekly run fails only when the job needs a second attempt).
Practice A's real month should add up to about 35 s more (SUITE-CAP-3's claim searches, measured in their
first form; the build re-measures them in their final form at A's size before this figure is relied on), so the margin is small: one more ledger check
(`ledger_entry_within_evidence`, 76 s of the 310) is the next one to look at. Lane A measures again on its own base
before step 7b moves back.

## What proves the amounts are unchanged
- LED-01 to LED-18 and LED-23 to LED-25 (the latter from the interest fix, #126), byte for byte.
- The ledger oracle test.
- The write-equality dumps, before against after, on practice F (10,000 lines) and spread R (2,000 lines): every
  ledger match, entry and stage event, `seq` values included, and the same recovered totals.
- A test for each changed refusal in `ledger_entry_rules`: no match, a match of another practice, a reversed match, each
  refused with today's error.
- A cross-practice test: `ledger_line_net` called directly by the app's database role with another practice's line
  gives 0, before and after the change (one test, written on the interest fix's base).
- A plan test: on a ledger with no statistics, `ledger_line_net` reads through the line index and both match lookups in
  `ledger_entry_rules` through the match's primary key, so a later edit cannot quietly bring the slow reads back. The
  test plans the statements as they stand in the installed functions, taken from the database's own copy of each
  function, never from a copy kept in the test, so editing a function body is what it checks. It first makes sure the
  ledger really has no statistics (automatic analysis switched off on the two ledger tables, and a check that neither
  was ever analyzed). It is shown to fail against today's two bodies before the new ones are applied.
- The schema gate as usual: `domain-model.md` and `packages/db/functions` regenerated in the same pull request, with
  your approval of record on it.

## Who builds it, and when
Lane A builds it in one schema pull request after the interest fix (#126) merges, because only one schema pull request
runs at a time. #126 changes neither function, so both apply on top of it as written; #126 adds one index on the
matches, so Lane A measures again on that base. SUITE-CAP-3 does not wait on this: it has no migration and merges on its
own.

## The question (yes or no)
May Lane A change the bodies of the ledger functions `ledger_line_net` and `ledger_entry_rules` as written above, in one
migration after #126? Every amount, stage, refusal and recovered total must stay unchanged, proved by LED-01 to LED-18,
LED-23 to LED-25, the ledger oracle, the refusal tests and the write-equality dumps.
