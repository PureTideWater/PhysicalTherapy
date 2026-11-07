# Ledger freeze exception: the ROI statement's actionable figure, proved by the lines it counted (#93's F9; for the founder; text for the orchestrator to relay)

From acting Lane A (S2), 2026-11-07, for schema PR 5 (`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`,
section 5; the orchestrator's ruling (c) of 02:20 UTC: one combined ask, written now and relayed early). Not yet asked.
Base: `origin/claude/build-platform` at 8a722f80 (the merge of #131, 2026-11-07). The text was first written on
31a7345f; the 15 files #131 changed are screening and UX files, none cited here, so every cited line and both body
hashes were re-checked and hold on 8a722f80. Every figure below was measured on synthetic data only.

**What this asks:** three yes/no questions (the end of this text, with how to answer them: one answer to each
number): two about F9 (1a, 1b) and one about a separate gap in the same function (2). Whatever is granted, and passes
the build's proof, goes in one migration ("If the build's proof fails", below, says what happens otherwise).
- **1a.** Replace one ledger-frozen function body, `roi_links_valid`, word for word as written here, and require two
  things of the statement code: the writer stores in every new statement the priced lines its actionable figure
  counted, and no statement reader returns that list. The writer and reader code is not under the freeze; it is built
  with the body and reviewed as usual (part 3).
- **1b** (only if 1a is yes). Add a check to a second ledger-frozen body, `roi_statement_rules`, so the database refuses
  a statement whose figure is not the sum of those lines.
- **2.** Have `roi_links_valid` also refuse an empty links object.

**What it does not ask:** the plan let three SUITE-CAP-3 ledger functions join this ask if they were ready. None is. No
exact body exists for any of them. `ledger_line_stage`'s rewrite was only described, in the design's first version, as
taking "the same rewrite" as `ledger_line_net`; it was never written out or run (the SUITE-CAP-3 ask you granted on
2026-11-06 says "its new body was never run"). So there is no exact text to grant ("Not asked now", below). Nothing in
this ask touches the two bodies you granted on 2026-11-06 (`ledger_line_net`, `ledger_entry_rules`). Those go in schema
PR 2, alone, exactly as granted.

## The problem in plain words
An ROI statement stores an "actionable in cases still being worked" figure. Since #93 (merged 2026-11-02 as 877e662f,
ADR 0082) that figure is the live one: the shortfall on each worked case's lines that are still actionable at the
moment the statement is generated (`OPEN_CASES_ACTIONABLE` and `generateRoiStatement`,
`apps/worker/src/reconcile/statements.ts:122-153`). The statement keeps only the case IDs.

Lines then move on: they are paid, written off, or priced again. After that, the same cases give today's figure, not
the stored one. The HOM-01 test shows it (`apps/worker/src/triage/actionable-now.db.test.ts:80-111`, synthetic CAS-08). A
statement made on the case reads 90.00 on 3 lines. Once the re-run is accepted, the same case reads 0.00. Nobody can
later tell which lines made up the 90.00, or check that 90.00 was their sum.

Nothing checks the figure at any point either:
- `roi_links_valid` (`20261023120000_recovery_ledger.sql:231`, the CHECK on `roi_statement.links` at :255) accepts
  exactly today's four keys (and, through a null, an empty object; see the second gap below) and checks only their
  shape.
- `roi_statement_rules` (as redefined at `20261024120000_reconciliation_and_roi_documents.sql:35`) checks only
  recovered and interest when a statement is written.
- `recomputeStatement()` (`packages/ledger/src/statement.ts:68-78`) checks recovered, interest and approved-not-posted.

So the database accepts any non-negative actionable figure. The page and the PDF already say so: "The figure is not
recomputed later from the cases it counted." ADR 0082 (Decisions 6 and 7) records the gap and hands the fix to Lane A.
(Decision 6 says `roi_statement_rules()` also checks approved-unposted; it does not, only `recomputeStatement()` does,
and PR 5's amendment of ADR 0082 corrects that sentence.)

**A second gap, found while testing this one, is included (question 2):** today's `roi_links_valid` lets an empty links
object `{}` through. With no keys the key list is empty (null), the comparison gives null, and a CHECK treats null as
a pass. No code writes `{}` (the writer and `packages/db/src/row-factory.ts:439` both write four keys), but the database
does not stop it.

## What changes
One migration replaces `roi_links_valid`'s body (question 1a) and, only if question 1b is granted, `roi_statement_rules`'
body too. `CREATE OR REPLACE` keeps the owner `tp_owner` and the grants; every other attribute comes from the new text.
The text below restates the pinned `search_path` on both functions and `IMMUTABLE PARALLEL SAFE` on `roi_links_valid`,
and, like today's text, gives neither function a `SECURITY` clause nor `roi_statement_rules` a volatility, so those
stay at their defaults (invoker; volatile), as today. The statement writer and its readers change with it, to meet
question 1a's two requirements (part 3).

**No other change:**
- no table, column, constraint text, index, policy or trigger on `roi_statement` or any ledger table. The CHECK
  `roi_statement_links CHECK (roi_links_valid(links))` keeps its text;
- no amount, stage, matching rule, proof level or definition of recovered;
- no file under `packages/ledger/src`;
- the figure itself is computed exactly as today. Its value does not change, only what is stored beside it.

Replacing a function does not re-check the rows already stored. Statements written before the change keep their four
keys and are still accepted.

### 1. `roi_links_valid`: accepts a fifth key (question 1a; the `coalesce` is question 2)
One line changes (the key line); the rest is unchanged word for word. The whole function as it would be written:

```sql
CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k), '{}') IN (
           ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered'],
           ARRAY['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered'])
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;
```

What it accepts and refuses (all 16 shapes tested, below):
- **Accepted, as today:** exactly today's four keys, empty or holding IDs.
- **Newly accepted:** those four plus `actionable_open_lines`, the priced line IDs the figure counted.
- **Refused, as today:** any other set of keys (three, six, a different fifth key, the lines key without
  `actionable_open`); a value that is not a list; a list element that is not a lower-case UUID (a number, plain text,
  an upper-case UUID); links that are not an object (a list, JSON null).
- **Newly refused (question 2):** the empty object `{}`. This comes only from the `coalesce(..., '{}')`.

If you answer **no to question 2**, the key line is instead
`AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) IN (`, and `{}` stays accepted as today. Nothing
else differs (tested: it differs from the text above only on `{}`).

If you answer **no to question 1a and yes to question 2**, nothing else in this ask is built. The only change is today's
body with its key line replaced by `AND coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k), '{}') =
ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered']` (tested: it differs from today's body only on
`{}`).

**Why the database cannot "require the fifth key on new rows", as the plan worded it:**
- `roi_links_valid` is a CHECK of one value. It cannot tell a new row from an old one.
- PostgreSQL re-runs a CHECK on every update of the row. That includes the statement job's PDF record, an update that
  sets only `document_key` and `pdf_sha256`. Tested on PostgreSQL 16 and 18: once a body refuses four keys, the PDF
  record of an existing four-key statement fails with a check violation. A dump and restore would fail the same way.
  So the body must accept four-key rows for good.
- Refusing four-key inserts in the database would also break the previous image's statements during a deploy or after
  a rollback. The deploy runbook forbids that: "Migrations are add, backfill, remove (never a breaking change in one
  release)" (`docs/runbooks/deploy-and-rollback.md:330`).
- So within one release: the writer always stores the key, and its tests prove on the real schema that the key's lines
  add up to the figure ("For 1a", below). If question 1b is granted, the database also checks the figure whenever the
  key is there (part 2). Without 1b, the database checks only the key's shape.

### 2. `roi_statement_rules`: checks the figure against the lines it names (question 1b)
This is what makes the database prove the stored figure. Without it, the key alone (question 1a) still lets anyone
recompute the figure later, because priced lines never change (for statements stored before the remaining-ask change;
see below), but nothing refuses a statement whose figure is wrong.
It is a second frozen body, beyond the plan's "roi_links_valid and its writer", so it is asked on its own. Two
additions; every existing statement stays word for word:
- `DECLARE` gains `lines record;`.
- When a statement is written, after today's recovered-and-interest check and before `RETURN NEW`, a new block runs
  only if the statement carries `actionable_open_lines`. It refuses the statement unless every line is listed once,
  every line is a priced line of the statement's practice on a case the statement lists, and the stored figure is the
  sum of those lines' shortfalls (`variance_cents`).

A statement without the key (written before this change, or by the previous image during a deploy or after a rollback)
keeps today's rule: its actionable figure is not checked. The new block makes a ledger trigger read two tables outside
the ledger, `priced_line` (pricing) and `case_line` (triage), as the caller, under the caller's tenant policy. It reads
them only when an insert is attempted, never when a PDF is recorded. An insert is attempted far more often than a
statement is stored: the daily reconcile of every active practice (`apps/worker/src/platform/monitoring-schedule.ts:51`)
tries the statement of the quarter before every day (`apps/worker/src/reconcile/job.ts:43-47`), and PostgreSQL runs this
function and the links CHECK before the writer's `ON CONFLICT ... DO NOTHING` (`statements.ts:157`) drops the duplicate
(tested; Measurements). The whole function as it would be written:

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
           (SELECT count(*) FROM priced_line p JOIN case_line l ON l.service_line_id = p.service_line_id AND l.priced_line_id = p.id
             WHERE p.practice_id = NEW.practice_id AND l.practice_id = NEW.practice_id
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)
               AND l.case_id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open') x)) AS found,
           (SELECT coalesce(sum(p.variance_cents), 0) FROM priced_line p
             WHERE p.practice_id = NEW.practice_id
               AND p.id IN (SELECT x::uuid FROM jsonb_array_elements_text(NEW.links -> 'actionable_open_lines') x)) AS cents
      INTO lines;
    IF lines.linked <> lines.found OR lines.cents <> NEW.actionable_open_cents THEN
      RAISE EXCEPTION 'an ROI statement''s actionable figure is the variance of the priced lines it links, each once and each a line of a case it links' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
```

**Why a correct statement is never refused, while a line counts its variance and a case line keeps the priced line it
joined with (both true today):**
- A service line is in at most one case (`case_line_once`).
- A case line's priced line is a priced line of its own service line and practice (`case_line_belongs`), and never
  changes (`case_line_rules`).
- A priced line never changes and is never removed (`priced_line_immutable`, `20261018090000_pricing_runs.sql:167-173`).

So each line the writer lists is found exactly once, and its shortfall is the one the figure added. A line that moves on
while the statement is being written changes nothing here: the check reads only things that never change. The recovered
and interest refusal keeps its text and fires first, as today.

**Two planned changes this check would have to follow.** The block states a second time, beside `actionable-now.ts`
(ADR 0082's one definition of the figure), which priced line each counted line is and what it counts. Two planned
changes alter that. Neither touches a ledger table, so neither the freeze nor its reviewers would flag the block:
- **A line's remaining ask.** ADR 0082's "Revisit when" (and #93's follow-up "Lane A, a line's remaining ask") plans an
  additive migration, `line_remaining_ask_cents(case_line)`: a line's variance less what the payer has already approved
  on it (net of recoupments and of reversals of those approvals), never below zero, read at once by `ACTIONABLE_NOW_*`.
  It is not designed yet and is in none of the ten queued schema PRs. The figure counts only lines whose latest stage
  is actionable (`ACTIONABLE_NOW_LINE`, `actionable-now.ts:37-38`), and a line with a standing approval and no later
  recoupment is at payer approved or recovered (`ledger_line_stage`), out of the figure. So the change reaches only a
  line that a partial recoupment put back to actionable while part of its approval still stands (counted in a worked
  case's figure), as ADR 0082 already says ("A line that a partial recoupment put back to actionable counts its whole
  variance"). Such a line would then count less than its variance, the writer's figure would be smaller than the sum
  the block computes, and the block would refuse the statement.
- **Case lines following re-pricing (D30).** reconciliation-001's milestone 8 adds an append-only `case_line_pricing`
  history (D30), and milestone 11 makes re-pricing reach cases (`docs/product/reconciliation-001.md:160-173`, :194-200).
  D30 (a), which includes "case lines follow re-pricing through the append-only `case_line_pricing`" (:422), was
  accepted with reconciliation-001, and the combined audit found its no-triggers-on-pricing-tables choice already best
  (`audits/combined/combined-report.md:1498`; the audit says nothing of case lines following re-pricing). Neither
  that table nor `invalidated_by` exists yet. The block finds each listed line only through the case line's own priced
  line (`l.priced_line_id = p.id`), which never changes. Once the figure reads a case line's pricing in effect from
  `case_line_pricing`, the writer lists a re-priced line's newer priced line, the block finds no case line that names
  it, and it refuses the statement. Neither milestone alters a ledger table, so the ledger freeze does not apply to
  them, and milestone 8's own check looks only for DDL on ledger and pricing tables.

Either way, for a practice whose worked case counts such a line in its figure, the daily reconcile's statement step
fails every day and generating a statement on demand fails. Nothing wrong is stored, but statements stop. So, if 1b is
granted:
- each of those changes must replace `roi_statement_rules` in its own migration (the one that changes what the figure
  counts), under its own ledger freeze exception;
- from the remaining-ask change on, a new statement's figure depends on the ledger at the moment it was generated, so
  its line IDs alone no longer rebuild it. Keeping new statements provable then means storing what each line counted,
  which changes `roi_links_valid` too, under that same exception. Statements stored before then keep the property:
  their figure is a sum of variances, which never change. (This point holds with 1a alone as well. Re-pricing does not
  touch it: whichever priced line a statement lists, that line's variance never changes.)

PR 5 writes both requirements into ADR 0082 (the remaining-ask item, and a D30 line beside it) and into
reconciliation-001's milestone 8 and 11 items. It also ties each change to a test that fails first:
- the remaining-ask item's golden cases (each a partial recoupment, asking 1800 of 3000) must generate a statement.
  The block refuses it until it is replaced, so the remaining-ask change cannot pass its own tests without the
  replacement;
- HOM-01 already generates a second statement after CAS-08's re-run is accepted, and fails if it is not stored
  (`actionable-now.db.test.ts:65-68`, :98-109). Today that statement counts no line. Once case lines follow re-pricing,
  it would list the 3 newer priced lines and the block would refuse it, so the D30 change fails HOM-01 until it
  replaces `roi_statement_rules`.

**Why the check stays on the variance.** It is the only form in which the database recomputes the figure from rows that
never change, as this function already recomputes recovered and interest from the ledger entries a statement links. Two
other forms were weighed and not chosen:
- Store each line's counted cents beside its ID and check their sum. It would survive the remaining-ask change
  unchanged, but the database could then check little more than that the writer's own numbers add up, not that each
  one is right.
- Have the block and the writer call one shared SQL function for a line's amount. Changing the definition would be one
  known change. But once that amount reads the ledger, the block would read it at a different moment from the writer
  (a ledger entry written in between could refuse a correct statement), and changing that function would still change
  what a frozen trigger checks.

**Why the check stays on the case line's own priced line.** Keying it on the service line instead (any one listed
priced line of a listed case's service line) would survive D30 unchanged. It was weighed and not chosen:
- it would also accept a priced line the case never counted, such as an older pricing of the same service line or one
  from a re-run that was never accepted, so the database would no longer prove that the figure counts the case's own
  lines;
- it removes only one of the two couplings: the remaining-ask change must replace this function in any case;
- once case lines follow re-pricing, which priced line a case line counts at a given moment is recorded only in
  `case_line_pricing`, which the D30 change designs. That change is where the check learns to read it.

How a statement proves a figure that depends on the ledger, or on a case line's pricing history, is for those changes to
decide, once they are designed, each with its own exception.

### 3. The writer and the readers (question 1a)
None of these files is under the ledger freeze (reconciliation-001's "Ledger semantics" covers the ledger tables and
`packages/ledger/src`, not `apps/worker` or `apps/web`). The plan's gate names "roi_links_valid and its writer", so
question 1a also grants two requirements on this code, in these words; it does not grant the code itself:
- **The writer** stores, in every statement it writes, the IDs of the priced lines its actionable figure counted, under
  `actionable_open_lines`, and the figure itself is computed as today.
- **No statement reader returns that list:** the list page, the detail page, the CSV and the print job read today's
  four keys, or no links at all.

The code below is how the build would meet them. It is built with the body, not under the freeze, and reviewed as
usual: a reviewer's fix to it is made in place in PR 5, as long as both requirements still hold, and does not come back
to you.
- `apps/worker/src/triage/actionable-now.ts` (ADR 0082's one-predicate module) gains `ACTIONABLE_NOW_WITH_LINES`. Per
  case, it returns the same figure as `ACTIONABLE_NOW` and the IDs of the priced lines it sums, from one evaluation of
  `ACTIONABLE_NOW_LINE` per case line (behind `OFFSET 0`, as `ACTIONABLE_NOW_OF`):
  ```ts
  export const ACTIONABLE_NOW_WITH_LINES = (alias: string) => `(
      SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents,
             coalesce(array_agg(y.priced_line_id::text ORDER BY y.priced_line_id) FILTER (WHERE y.now), '{}') AS line_ids
        FROM (SELECT p.id AS priced_line_id, p.variance_cents, ${ACTIONABLE_NOW_LINE('x')} AS now
                FROM case_line x
                JOIN priced_line p ON p.id = x.priced_line_id
               WHERE x.case_id = ${alias}.id AND x.practice_id = ${alias}.practice_id
              OFFSET 0) y)`;
  ```
- `apps/worker/src/reconcile/statements.ts` changes in four places:
  - the import (:6) takes `ACTIONABLE_NOW_WITH_LINES` in place of `ACTIONABLE_NOW`, whose only use was the query below;
  - `OPEN_CASES_ACTIONABLE` (:122-125) reads each worked case through it:
    `SELECT c.id, a.cents::text AS actionable_cents, a.line_ids FROM "case" c CROSS JOIN LATERAL ${ACTIONABLE_NOW_WITH_LINES('c')} a`,
    and its comment (:116-121) names `ACTIONABLE_NOW_WITH_LINES`. The case set (`state NOT IN ('resolved',
    'closed_written_off')`) and the order (`opened_at, id`) are unchanged;
  - `OpenCaseRow` (:111-114) gains `line_ids`;
  - the stored links (:153) gain `actionable_open_lines: open.flatMap((row) => row.line_ids)`.

  `roiStatement()` still sums the cases' figures as today.
- **The readers.** Today every statement read selects the whole `links` (`STATEMENT_COLUMNS`,
  `apps/worker/src/reconcile/print.ts:78-80`, which `STATEMENT_SELECT` in `apps/web/src/lib/reconciliation/queries.ts:710-712`
  builds on). That includes the statements list, 20 a page (:730-744), whose `summaryOf` (:714-728) never reads it. At
  practice A's size a list page of five-key statements would pull about 24.6 MB of JSON into the web server and hold
  about 40 MB of memory (Measurements). On-demand statements are never deduplicated (the unique index
  `roi_statement_quarterly` covers only quarterly ones), so such rows pile up. No reader uses the new key (showing it is
  left out, below). So:
  - `STATEMENT_COLUMNS` selects `s.links - 'actionable_open_lines' AS links` in place of `s.links`. The detail page
    (`statementOf`, :772), the CSV (`storedOf`, :811) and the print job (`printRoiStatement`, print.ts:85) then read
    exactly today's four keys, from four-key and five-key rows alike;
  - `listStatements` reads its own column list, `STATEMENT_SELECT`'s without `links`, and `summaryOf` takes a row
    without `links`.

Both statements, the quarterly one and the one a person generates, go through this writer. The previous image's
readers take the four keys by name (`storedStatement()`, print.ts:74), so a five-key statement reads the same there.
They still read the whole value, so during a deploy or after a rollback the previous image's list page of five-key
statements costs what the Measurements show for today's query.

### Left out of F9 on purpose
- **Showing the check on the page, the PDF and the CSV** (`recomputeStatement()`, `roiStatementCsv()`). That would change
  `packages/ledger/src`, which the freeze limits to additions, so it would come later with its own text. Nothing is lost
  meanwhile. The stored lines never change, so anyone can sum them on any later read, and with 1b the database has
  already refused a statement whose figure was not their sum. The page's words stay as they are. They remain true: the
  figure is the one counted when the statement was generated.
- **The remaining-ask change** (ADR 0082, "Revisit when") **and case lines following re-pricing** (D30, milestones 8 and
  11). Neither is part of F9. Their effect on this ask is in part 2: with 1b, each must replace `roi_statement_rules` in
  its own migration under its own exception, and from the remaining-ask change on the stored IDs rebuild only the
  figures of statements stored before it.
- **#93's open question 3** (should `case.actionable_cents` hold the live figure): a product ruling that reverses ADR
  0082's stored case total. F9 does not depend on it either way. ADR 0082's "Revisit when" puts the key together with
  that question (Lane A's PR 11). PR 5 separates them, so PR 5 amends ADR 0082 to say so.
- **Refusing four-key inserts in a later release** (the "remove" step of add, backfill, remove), once no image that
  writes four keys can run. It would change `roi_statement_rules`, so it would be asked with its own text.

## Why
F9 is #93's design-review finding, handed to Lane A on 2026-11-02 at 02:35 UTC (`LANES.md`, "Handed to Lane A"; #93's body,
"For Lane A (left out)"). #93 has no review comments, issue comments or reviews (read through `gh api`).

Today a stored statement cannot prove its actionable figure. With 1a, every new statement names the exact priced lines
it counted. With 1b, the database also refuses one whose figure is not their sum. Because priced lines never change, a
practice, an auditor or a later reader can always rebuild the 90.00 from its three lines, even after the lines are
paid, written off or priced again. That holds for every statement stored before the remaining-ask change (part 2).

## Measurements
All runs used synthetic data on private PostgreSQL 16.15 and 18.4 clusters (production and CI run 18) on a 4-CPU
container, one run each unless noted, on small copies of the tables that keep only the columns the checks or reads use.
**None ran on the migrated schema or on any branch head.** The build runs the proof below on the real schema. Same
results on both versions unless a figure is given for each.
- `roi_links_valid` ran exactly as written above.
- The 30,795-line rows ran the new block of `roi_statement_rules` alone, its exact text, in a test trigger (insert only,
  with `practice_in_scope` stubbed to true).
- The whole `roi_statement_rules` as written above ran only on a copy with one case and 3 lines (the "Whole function"
  row).
- **No run inserted the writer's own output.** Every statement tested was built in SQL (every line at 30.00) or typed by
  hand, in the shape the writer would write. The writer's query ran only on the 2,000-line copy, where its figures and
  listed lines were compared, never inserted against the new block or the whole function. So the claim that a correct
  statement is never refused rests on the argument in part 2. The build's tests on the real schema (HOM-01 extended,
  the writer test, the sum test, the second-day test) are its first end-to-end proof.
- The read rows ran the readers' exact query texts through node-postgres, as both apps read (it parses each `links`
  with `JSON.parse`), on a copy of `roi_statement`'s columns with no constraint or trigger. The print read joined a
  stand-in for `practice` and ran without `FOR UPDATE`. Median of 7 runs after 2 warm-ups.

| What | Result |
| --- | --- |
| `roi_links_valid`, 16 link shapes, today's body against the new one | Today's four keys accepted by both. Five keys newly accepted. `{}` newly refused (today: null, so the CHECK passes). All 11 other shapes refused by both. Key order the same under the C and en_US.utf8 collations |
| The PDF record on a stored four-key statement | Under a body that refuses four keys: fails with a check violation. Under the new body: passes |
| One practice with 4 cases and 30,795 lines (practice A's month, by count), plus a second practice with 3 lines; the block alone | A statement shaped as the writer would write it (built in SQL, every line 30.00; 30,795 line IDs, 923,850.00) accepted. Rebuilding it from its stored line IDs gives 923,850.00 |
| The same data, statements that must be refused | All six refused with the new message: one cent off; a line listed twice; another practice's line; a line of a case the statement does not list; a priced line on no case; a nonzero figure with no lines |
| The same data, statements that must pass | A four-key statement at any figure accepted (as today). A five-key statement with no case, no line and 0.00 accepted |
| Practice A's 30,795 lines again, with the once-per-quarter index the writer's `ON CONFLICT` names: the quarter's statement stored, then tried again on a later day (`ON CONFLICT ... DO NOTHING`, as the writer) | The block and the CHECK run, then the duplicate is dropped: nothing stored, no error. Tried again one cent off: refused with the new message, although the quarter's statement is already stored. A toy table showed the same order: a BEFORE INSERT trigger and a CHECK each refuse a duplicate that `ON CONFLICT` would have dropped |
| Whole function as written above, on the 3-line copy | A statement shaped as the writer would write it (typed by hand, 3 lines at 30.00) accepted. LED-11's shape (recovered off) refused with today's recovered message first. Actionable one cent off refused with the new message. A four-key statement at any figure accepted. The PDF record accepted on a four-key and a five-key row |
| The writer's query against today's (40 cases, 2,000 lines, random stages, write-offs and pricing checks; two separate random data sets) | Same figure for all 24 worked cases. Each case's listed lines, summed again from `priced_line`, give its figure (24 of 24; 723 lines, 32,743.51 on 16; 715 lines, 33,219.21 on 18) |
| Cost of the new block, the 30,795-line statement (three runs each) | Stored: PG16 265 to 280 ms, against 99 ms with the block off; PG18 316 to 326 ms, against 128 to 129 ms. Tried again and dropped: PG16 240 to 241 ms, against 72 ms; PG18 280 to 283 ms, against 97 to 99 ms. So the block adds about 0.2 s to every attempt. Attempts are not once a quarter: one on every daily reconcile of every active practice, and one on each on-demand generation. Each attempt also runs the writer's query and sends the roughly 1.2 MB links |
| Cost of `roi_links_valid` (three runs each) | Four keys with 30,795 IDs: 73 to 75 ms today and with the new body (PG18: 99 to 102 ms both). Five keys with 61,590 IDs: 148 to 151 ms (PG18: 196 to 201 ms). The PDF record of the 30,795-line statement (two runs): 75.5 and 78.2 ms (PG18: 100.3 and 101.4 ms) |
| Size | The links of the 30,795-line statement take 1,232,096 bytes stored, about 1.2 MB, and 1,232,066 bytes as text |
| Reading statements back: 20 five-key statements at 30,795 lines (one quarterly, 19 on demand), against the same 20 with four keys | **List page** (20 statements), today's query: 75.2 ms (PG18: 75.7 ms), against 0.4 ms for four-key statements. It receives 24.6 MB of JSON and holds 39.6 MB of memory until the page is built. With the key stripped: 4.6 ms (PG18: 4.9 ms). Without `links`, as the build reads it: 0.4 ms. **Detail page and CSV** (one query) **and the print read**, one statement each, today's query: 5.0 to 6.5 ms, against 0.2 to 0.3 ms for a four-key statement. With the key stripped, as the build reads them: 0.5 to 0.7 ms |

The pricing check in the writer's query was a stand-in, so the writer's time at real size was not measured. The build
measures it on the real schema.

## What proves the amounts and refusals are unchanged
For every grant:
- LED-01 to LED-18, LED-23 to LED-25 (from #126, once merged) and the ledger oracle, byte for byte. No ledger table,
  function in a reconcile pass, amount or stage changes.
- LED-11's tests as registered (`packages/synth/src/cases/registry.ts:410`): `apps/worker/src/reconcile/ledger.db.test.ts`,
  `apps/worker/src/reconcile/chain.db.test.ts`, `apps/web/src/lib/routes/reconciliation-routes.db.test.ts` (which
  generates a statement on demand through the changed writer), `packages/ledger/src/roi.test.ts` and
  `packages/ledger/src/statement.test.ts`, unchanged. LED-18's statement test (`payment-terms.db.test.ts`), which also
  runs the writer, unchanged.
- A deploy test: the previous image's four-key writer still writes under the new bodies, and a five-key row reads the
  same through the previous image's reader. The PDF record passes on both.
- A write-equality dump of every statement the writer stores, on this synthetic data: the statements HOM-01's three
  cases generate (CAS-08 before and after its re-run is accepted, the case whose rule release is withdrawn, and the
  case with a line moved on to payer approved), those the LED worlds generate (LED-11's database tests and LED-18's
  statement test), and one synthetic month of several worked cases (the two cases of CAS-03 and CAS-05 lines that the
  home's HOM-01 test triages, with one of their lines written off). Each statement is written twice from the same
  database state: by today's writer before the migration and by the new writer after it, each in a transaction rolled
  back after its dump, so the quarterly statement is never dropped as a repeat. Compared: practice, period, proof
  level, every `*_cents` column (fees, recovered, interest, approved-unposted, actionable), pursuit hours,
  `generated_by`, and the links on the four existing keys. Left out: `id` (a new UUID each time) and the three
  timestamps (`generated_at`, which the trigger sets to the time of writing, `created_at` and `updated_at`). The dump
  is taken as written, before any print, so the PDF columns are empty on both.
- A preflight in the migration: it stops unless each body it replaces is today's (on 8a722f80, `roi_links_valid` body
  hash `49416713dd4d13dd`; with 1b, `roi_statement_rules` `5a8bc6319828acb2`) and unless every stored statement passes
  the new `roi_links_valid`.
- The catalog test, the cross-tenant test, and the schema gate as usual. `domain-model.md` and `packages/db/functions`
  are regenerated in the same pull request (one function hash changes in Appendix C, two with 1b), with your approval
  of record.

For 1a:
- The 16-shape test of part 1 on the migrated schema: today's four keys accepted, five keys newly accepted, the 11 other
  shapes refused as today, and `{}` as question 2 is answered. This is the one refusal 1a changes.
- HOM-01 extended, written to fail first on today's base. The CAS-08 statement stores its 3 line IDs. After the re-run
  is accepted, those IDs still sum to the stored 90.00, while the case reads 0.00, and the second statement is stored
  with no line.
- A writer test: every statement it writes carries the key.
- A sum test on the real schema, over the same data as the write-equality dump (HOM-01's three cases, the LED worlds
  and the month of several worked cases). For every statement the writer stores, it asserts four things: the
  `variance_cents` of the priced lines listed under `actionable_open_lines` add up to `actionable_open_cents`; each
  listed line is a line of a case the statement lists; each line is listed once; and the figure equals the sum of
  today's `ACTIONABLE_NOW` over the listed cases, read in the same transaction. It covers a line written off, a
  withdrawn release, a line moved on, several cases in one statement and a line whose pricing is no longer current.
  It is the real-schema proof that a stored statement's figure can be rebuilt from its stored IDs, whether or not 1b
  is granted or built.
- A reader test: a five-key statement reads back through the detail page, the CSV and the print job with exactly today's
  four keys, and the list page's query selects no `links`.

For 1b:
- The recovered and interest refusal keeps its text and code and still fires first (LED-11's tests above).
- A refusal test on the migrated schema for each case in the table above, each with its exact message and code.
- A cross-practice test: as the app's database role, a statement that names another practice's priced line is refused.
- A second-day test: the daily reconcile the day after the quarter's statement was written (as `chain.db.test.ts:313-314`
  runs 2026-10-02) runs the check, stores nothing, and the job succeeds.

For 2: the `{}` refusal is tested only if granted.

## Risk and rollback
- **Money:** no ledger amount, stage or recovered total changes, and the actionable figure is computed as today.
- **A statement refused by mistake** (by the new `roi_links_valid`, or with 1b by the new block): nothing wrong is ever
  stored. A person generating one sees an error. For the quarterly statement the effect is daily, not quarterly: the
  reconcile job tries the quarter before's statement on every day's run, after the day's reconcile pass has committed.
  Each day's attempt then fails, is retried, and raises the operator's alert on the third failure, and the print of any
  statement not yet printed is not queued again that day. That repeats every day until fixed, even once the quarter's
  statement is stored. The ledger itself stays up to date. The tests above guard against it, including the second-day
  test.
- **The two planned changes (1b):** if the remaining-ask change shipped without replacing `roi_statement_rules`, the
  refusal above would happen for every practice whose worked case counts, in its figure, a line that a partial
  recoupment put back to actionable while part of its approval still stands. If case lines followed re-pricing without
  replacing it, the same would happen for every practice whose worked case counts a re-priced line. PR 5 records both
  requirements (ADR 0082; reconciliation-001's milestones 8 and 11), and each change's own tests fail first: the
  remaining ask's golden cases, and HOM-01's statement after the re-run (part 2).
- **Deploy and rollback:** safe with the previous image in both directions. Four-key statements are still accepted, and
  five-key rows are read by key name. While the previous image runs, its readers read five-key rows whole, at the cost
  the Measurements show for today's query. No table lock, and no re-check of stored rows. An applied migration is never
  reverted. A fix would be a new, forward migration.
- **The `{}` refusal (question 2):** a stored `{}` row would fail its PDF record or a dump and restore. No code writes
  one, and the preflight stops the migration if one exists.
- **Size:** about 20 lines of SQL (3 for 1a, 18 for 1b), 15 lines in `actionable-now.ts`, a few in `statements.ts`, one
  in `print.ts` and a few in `queries.ts`, plus tests.

## Not asked now
None of these joins PR 5. The plan lets a queued ledger item join PR 5 only if it is granted in the same founder message
as this ask, designed and measured before PR 5's build starts, and none is asked here. Each would be asked on its own,
with exact text and before-and-after figures, and, if granted, built in a later schema pull request as its own
migration.
- **`ledger_entry_within_evidence`, the posted-so-far sum (SUITE-CAP-3 design 14.4 item 12): later.** No new body
  exists, and its cause was not found. What was measured, on shape F, synthetic data, 4 CPUs, one run each:
  - Without the two granted bodies (design 8.3a): its posted-so-far sum took 0.47, 0.47, 0.77 and 2.41 ms a call at
    2,000, 6,000, 10,000 and 30,795 lines, so 0.9, 2.8, 7.7 and 74.1 s a pass. At practice A's month the whole function
    took 81.1 s of the 1,653.1 s pass (`cap3_fx_30795_cand_none_7b_r1`).
  - Its plan (design C1, on a copy of the 10,000-line data with the ledger never analyzed): the sum reads
    `ledger_entry_by_evidence` by `evidence_id`, the right index, so the plan choice is not the cause.
  - With the two granted bodies applied: 75.6 s of the 309.9 s step-7b pass at A's month (`cap3_fx_30795_cand_nk_7b_r1`,
    candidate 0b6e90eb on base cc3dd7f6, PostgreSQL 18). This is the "76 s of 310". The design does not say whether it
    is the whole function or its sum: it calls it "`ledger_entry_within_evidence`, 75.6 s (its posted-so-far sum, 2.3 ms
    and about 400 buffer hits a call ...)" (14.1) and "the largest term left at A's month after 14.1's fixes (75.6 of
    310 s)" under the heading "posted-so-far sum" (item 12).
  - None of these per-function seconds can be rebuilt from committed files, and neither can `ledger_line_stage`'s 8.2 s
    below. They came from the runs' `functions.tsv` and `pss.tsv`, which stayed in an earlier session's scratchpad
    (`lane-b-suite-cap-3-wip/TSV-NOT-COMMITTED.md`) and no longer exist. The committed file of the 309.9 s pass
    (`results-crit/cap3_fx_30795_cand_nk_7b_r1-7b.json`) has no per-function trigger times: it gives the ledger_entry
    inserts as one total, 141.5 s.

  Next, needing no exception: trace the trigger's plan at A's month on #126's merged head with PR 2's two bodies
  applied, before step 7b moves back, and keep the per-function times in a committed file. If that finds a body change,
  it is measured and then asked. If the fix needs an index on `ledger_entry`, that is a change to a frozen table, and
  the ask will say so. It buys margin for moving 7b back (about 345 s against the 360 s sizing bound); it is not a money
  or correctness fix.
- **`ledger_line_stage` (item 7): not needed.** About 8.2 s of the 309.9 s pass (about 2.6%; not rebuildable from
  committed files, above), and it does not grow faster than the lines. Your 2026-11-06 grant left it out. It is looked at
  again only if a profile after the 7b move shows it.
- **`ledger_match_rules`' interest branch (item 11): later.** The standing-match check exists only on #126 (still a
  draft, head 9824f4e9 on 2026-11-07), under #126's own grant. No new body exists, and it was never measured (no
  SUITE-CAP-3 shape has interest of that kind). Next, on #126's merged head: a plan reading of it on a never-analyzed
  copy, and LED-25 at size with many interest matches. It is asked only if they show the slow plan.
- **SUITE-CAP-3's index or table parts: none.** The design needs no index, table or column (design 14.0).

## Who builds it, and when
Lane A (acting: S2) builds it as schema PR 5. One schema pull request runs at a time. PR 5 opens after PRs 1 to 4
merge, or earlier only by the orchestrator's skip-ahead ruling when an earlier PR's gate is unmet (each skip recorded
in the plan and in the PR). It carries only what you grant here and never adds an item you have not granted. It records
the grant in ADR 0082 (Decision 7 and "Revisit when": the key no longer waits for PR 11; with 1b, the remaining-ask item
gains the two points in part 2, and a D30 line beside it gains the same requirement; and, whatever the answers,
Decision 6's sentence that `roi_statement_rules()` checks approved-unposted is corrected, since only
`recomputeStatement()` does) and in reconciliation-001's "Ledger semantics" freeze list, beside the earlier grants,
and, with 1b, in its milestone 8 and 11 items. Then CO-02's approval line, and ADR 0063's approval and green checks.

**If the build's proof fails.** None of the measurements ran on the migrated schema, and PR 5's database review reads
the plan of each changed function, so a granted body can still fail after you answer. A grant never covers a changed
body, so a failing part is left out, never reworded:
- If 1b's body fails the proof on the real schema or the database review, PR 5 ships 1a (and 2, if granted) without it,
  as if 1b had been answered no, and the pull request and ADR 0082 say why. A corrected 1b comes back to you as its own
  ask, with its exact text and new measurements, and, only if granted, goes in a later schema pull request, not PR 5.
- If 1a's `roi_links_valid` body fails, nothing of question 1 is built, since 1b needs 1a's key. Question 2, if
  granted, is built alone in its stated form for a no to 1a, and a corrected 1a comes back to you, for a later schema
  pull request in the same way. A fault in the writer or a reader is not a failure of 1a: it is fixed in place in
  PR 5, as long as part 3's two requirements still hold.
- If only question 2's `coalesce` fails, the key line is built in its stated form for a no to question 2, and the `{}`
  refusal comes back to you, for a later schema pull request in the same way.

## The questions (yes or no)
**How to answer.** Please reply with one answer to each number, filling in this line:

> 1a: yes or no. 1b: yes or no. 2: yes or no.

1b is read as no whenever 1a is no. A reply that does not answer each number (such as "Granted, as written") grants
nothing yet: the orchestrator asks you for the three answers before anything is built. An exception covers exactly its
own text and is never widened, and 1b carries risks 1a does not, so no answer is guessed.

1a. **May Lane A replace the body of `roi_links_valid` as written above (part 1), in one migration in schema PR 5, with
   the statement writer and its readers meeting part 3's two requirements, and `roi_statement_rules` unchanged?**
   Every new ROI statement would then store the priced lines its actionable figure counted, and no statement read
   would carry that list. For every statement stored before the remaining-ask change, anyone can recompute the figure
   later from those lines. From the remaining-ask change on (ADR 0082, "Revisit when"), a new statement's stored IDs no
   longer rebuild its figure; keeping that would change `roi_links_valid` again, under its own exception (part 2).
   Statements already stored keep four keys and stay accepted. No ledger amount, stage or recovered total changes. The
   only refusal that changes is `roi_statement`'s links CHECK, which newly accepts the fifth key (part 1's 16-shape
   test). Proved by LED-01 to LED-18, LED-23 to LED-25, the ledger oracle, LED-11's tests, the 16-shape test, the sum
   test, the deploy test and the write-equality dump.
1b. **If 1a is yes: may the same migration also replace the body of `roi_statement_rules` as written above (part 2)?**
   The database would then refuse a new statement whose actionable figure is not the sum of its listed lines'
   shortfalls. This brings three things 1a does not: a ledger trigger that reads pricing and triage tables
   (`priced_line`, `case_line`); a new refusal that, made by mistake, fails the daily reconcile's statement step for a
   practice every day until fixed (nothing wrong stored); and a tie to two planned changes, a line's remaining ask and
   case lines following re-pricing (D30), each of which must then replace `roi_statement_rules` in its own migration
   under its own exception. If no, 1a stands alone.
2. **May the same `roi_links_valid` body also refuse an empty links object `{}`** (the `coalesce` in its key line)? If
   no, the body is built with the key line given above for that answer, and `{}` stays accepted as today. If question 1a
   is no, only today's body with that one line changed, as given above.

A grant covers, for the questions answered yes, exactly the function bodies and the stated forms of the key line above,
word for word, and, for the writer and the readers, part 3's two requirements, not their code. It goes in one migration,
less any part that fails the build's proof as said above. It is never widened. Any other change to a ledger table or
function, including the remaining-ask change, case lines following re-pricing and those under "Not asked now", needs
its own ruling.
