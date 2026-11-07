# Ledger freeze exception: the ROI statement's actionable figure, proved by the lines it counted (#93's F9; for the founder; text for the orchestrator to relay)

From acting Lane A (S2), 2026-11-07, for schema PR 5 (the queue plan of 2026-11-07, section 5), sent early. Base:
`origin/claude/build-platform` at 8a722f80. Synthetic data only.

**In short:** three separate yes/no questions, one per change to a ledger-frozen function; any combination can be
answered. A grant covers only the exact function text in the appendix. Lane A recommends yes to all three.

## What changes
An ROI statement stores its "actionable in cases still being worked" figure with those cases' IDs, not the lines it
counted, so once the lines move on (paid, written off, priced again) nobody can tell which made it: in the HOM-01 test
(synthetic CAS-08) a statement counts 90.00 on 3 lines, and after a re-run is accepted the case counts 0.00. Nothing
checks the figure: `roi_links_valid` checks the links' shape, `roi_statement_rules` only recovered and interest.

- **Q1. `roi_links_valid` accepts a fifth links key, `actionable_open_lines`**: the priced lines the figure counted.
  Only the key line changes; four-key statements stay accepted.
- **Q2. `roi_statement_rules` checks the figure** of a new statement carrying that key. The rest is today's, word for
  word, and its refusals still come first.
- **Q3. `roi_links_valid` refuses an empty links object `{}`.** Today `{}` passes (its key list is null, and a CHECK
  passes on null), yet the detail page, CSV and print job fail on it. No code writes it; four empty lists stay
  accepted.

All by `CREATE OR REPLACE` (owner and grants kept); no table, column, constraint text, index, policy, trigger
definition, amount, stage or definition of recovered changes, and the figure is computed as today. After the
migration's preflight, the CHECK runs on a stored statement again only when its printed PDF is recorded (the one
change a statement allows); a stored statement's actionable figure is never checked.

**What is built:** with a yes to Q1 or Q3, one migration in schema PR 5, after PRs 1 to 4 (or by the orchestrator's
skip-ahead), alone; otherwise schema PR 5 is not opened and the queue moves to PR 6. `roi_statement_rules` becomes
Appendix D only with yes to both Q1 and Q2 (without Q1 no statement carries the lines it checks); `roi_links_valid`
becomes:

| Q1 | Q3 | `roi_links_valid` becomes |
| --- | --- | --- |
| yes | yes | Appendix A |
| yes | no | Appendix B (`{}` still accepted) |
| no | yes | Appendix C (four keys only, `{}` refused) |
| no | no | unchanged |

**Built alongside, not part of the grant** (not ledger-frozen, though the plan's gate line names "its writer": storing
one more key changes no ledger table or trigger, nothing under `packages/ledger/src`, and no amount, stage, matching
rule or recovered total, the same reason ADR 0082 Decision 6 gives; reviewed as usual): with Q1, the writer storing
the priced-line IDs its figure counted, and the detail page, CSV and print job reading only today's four keys (the
list page none); with the migration, its preflight, tests and records (ADR 0082, reconciliation-001); in any case,
ADR 0082 Decision 6's correction (`roi_statement_rules` does not check approved-unposted), docs-only if no migration
is built.

**Why the key is not required on new rows,** as the plan asks: a CHECK cannot tell new rows from old and runs on every
update, so requiring the key fails a stored four-key statement's PDF record (tested), and refusing four-key inserts in
PR 5 would break the image before it (the runbook's "add, backfill, remove"); before launch, nothing is deployed, so
accepting four keys serves only test databases and CI. With Q1 built, every image from PR 5 on stores the key
(tested), and Lane A will ask, under its own exception once PR 5 merges, for the "remove" step (`roi_statement_rules`
refusing a new statement without the key; nothing to backfill) to land before the launch tag, so production never
accepts a four-key insert, nor has Risk's fast way out (yours to weigh then).

## Why
With Q1, every new statement names the exact lines it counted, and a priced line never changes
(`priced_line_immutable`), so Lane A can later rebuild the 90.00 from its three lines with a database query, as the
tests do; the practice sees no change until a later `packages/ledger/src` change shows the lines. With Q2, the
database checks that sum and that each line belongs to a listed case, not that they were the right lines (still
actionable, not written off, on current pricing, none left out): the writer's tests do. Limit: a line a partial
recoupment put back to actionable counts its whole shortfall today, a known overstatement. Lane A's planned "remaining
ask" change (ADR 0082) counts only what is still owed; line IDs then no longer rebuild the figure, so keeping
statements rebuildable changes `roi_links_valid` again, under your exception whatever you answer here (with Q2, that
exception also replaces `roi_statement_rules`).

## Measurements
Synthetic stand-alone tables with only the columns the checks read, 8a722f80's function texts, PostgreSQL 16.15 and
18.4 (4 CPUs; times from 18.4, as production is set to PostgreSQL 18). Not yet measured, so the build does: the
writer's own output against the new checks, and its query at real size.
- D's added block alone, its exact text in a test trigger, with practice A's month by count (30,795 priced lines): the
  writer's statement of all of them (923,850.00) accepted, and the CHECK passed its PDF record; a second day's repeat of
  it checked, then dropped, and refused one cent off; each wrong statement under Q2's proofs, listing two lines or
  fewer, refused; a four-key statement passed with any figure.
- The whole of D, on a six-line world: LED-11's wrong recovered still refused first, with today's message; the PDF
  record passed on four and five keys.
- The writer's new query gave today's figure for all 24 worked cases of 40 (2,000 lines, random stages and
  write-offs), its listed lines re-summing to it.
- Writing: D adds about 0.2 s per attempt (316 to 326 ms against 128 to 129 at that size), daily per active practice
  and per on-demand statement. `roi_links_valid` checks each ID as fast as today, but the fifth key adds one ID per
  counted line: about 0.1 s more at that size (100 ms for 30,795 lines; under 1 ms for four keys holding only case
  IDs) per insert attempt and again when the PDF is recorded, already in the 128 to 129 ms.
- Reading, as built: the list page reads no links (0.4 ms; its 20 statements read whole take 75 ms and 24 MB of JSON),
  and detail, CSV and print read four keys in under 1 ms (0.6 to 0.7). During a deploy the previous image reads whole
  rows: about 5 ms for one, 75 ms for its list page.

## What proves amounts and refusals unchanged
Shared, with the migration: LED-01 to LED-18 and LED-23 to LED-25 (from #126, once merged) and the ledger oracle, byte
for byte, their tests unchanged; a preflight that stops the migration unless each replaced body is today's and every
stored statement passes the new `roi_links_valid`; a deploy test (the previous image writes four-key statements and
records PDFs, and with Q1 reads five-key ones); catalog, cross-tenant and schema-gate checks, with `domain-model.md`
regenerated for your approval of record.

Q1: a write-equality dump of today's writer against the new one (same state, each rolled back, over HOM-01's three
cases, the LED worlds and a month of worked cases; equal but for the ID, three timestamps and the fifth key); the
16-shape test; HOM-01 extended, failing first on today's base; a sum test (listed shortfalls add up to the figure,
which equals today's predicate); a reader test. Q2: a refusal test, with message and code, for each wrong statement
(one cent off, a line twice, another practice's line, a line of an unlisted case, a priced line on no case, a nonzero
figure with no lines); a cross-practice test as the app's role; a second-day test. Q3: the `{}` refusal.

## Risk and rollback
- **Money:** no ledger amount, stage or recovered total changes.
- **A correct statement refused by mistake** (the tests guard against it): nothing wrong is stored; a person sees an
  error. The daily reconcile tries it after the day's ledger work, so each day it fails, the practice's whole
  reconcile runs three times (the operator alerted on the third) and its unprinted prints are not re-queued. Fast way
  out: the writer stops storing the fifth key (no freeze exception needed; in production the writer change still needs
  your approval and a release tag, as any deploy does), leaving statements written meanwhile unchecked and not
  rebuildable. Slow way, the only one after the "remove" step: a corrected D under a new exception, in a later schema
  PR, days to weeks. If that step lands before launch, production has only the slow way: until a corrected D passes,
  each affected practice's quarterly statement fails every day and every on-demand statement for it is refused. The
  day the check (not the writer) is shown wrong, Lane A would tell you, send that ask, and change the writer while
  that helps.
- **Q2 only:** a ledger trigger starts reading `priced_line` and `case_line` (as the caller, under the tenant policy,
  on insert only), and two planned changes would make it refuse some correct statements. The remaining ask needs your
  exception anyway if statements are to stay rebuildable (it changes `roi_links_valid`; Why); with Q2 that same
  exception must also replace `roi_statement_rules`. Only case lines following re-pricing (reconciliation-001's PR 8,
  the append-only `case_line_pricing` history, and PR 11, re-pricing that reaches cases; decision D30) touches no
  ledger function, so under Q2 it alone adds an exception the freeze would not otherwise flag. Neither has a date (the
  remaining ask is not queued; PRs 8 and 11 follow the plan's ten schema PRs); PR 5 ties each to a test that fails
  until it replaces `roi_statement_rules`.
- **Deploy and rollback:** safe with the previous image both ways (it reads links by key name, five-key rows whole:
  cost above). No lock. A fix is a new forward migration.

## Not asked now
Each would be its own ask, with its own text, for a later schema PR.
- SUITE-CAP-3's other ledger items (`ledger_entry_within_evidence`, no body yet; `ledger_match_rules`' interest
  branch, never measured).
- The reader recompute (ADR 0082 Decision 7): showing the check on the page, PDF and CSV changes
  `packages/ledger/src`. The page's words stay true meanwhile.
- A database check of approved-unposted: only the reader recomputes it (the page marks a mismatch, the print job
  refuses it). Lane A does not recommend one: unlike recovered, interest and the actionable figure (plain sums), it is
  the ledger's per-line netting at the proof level, so a copy in SQL could drift and refuse correct statements.
- #93's open question 3 (whether the case's stored total holds the live figure): a product ruling.

## The questions (yes or no)
Please answer each: "Q1: yes or no. Q2: yes or no. Q3: yes or no." A reply missing one grants nothing yet (the
orchestrator asks again), though with Q1 no, Q2 lapses unanswered. A grant covers exactly the appendix text named for
your answers, word for word, is never widened, and holds for schema PR 5 only: a yes not built there lapses, and a
later schema PR asks again with its own text. If the build's proof shows an appendix text itself wrong, the question
whose change is at fault is treated as your no (in A, the five-key list is Q1's and the `coalesce` Q3's; a fault in
lines an appendix keeps from today's body belongs to no question and stops the migration), and only the text the table
names for the remaining answers is built (D only with A or B). A fault in the writer, readers or tests is fixed in
that code, with no grant. A failing shared proof stops the migration until it passes, unless it traces to one
question's text (a stored `{}` failing the preflight under A or C is Q3's), which is then treated as your no.

**Q1.** May Lane A replace `roi_links_valid` so new ROI statements can also store the priced lines their actionable
figure counted (Appendix A if Q3 is yes, B if no), old statements staying accepted?

*Lane A recommends yes* (see Why).

**Q2.** May Lane A replace `roi_statement_rules` so the database refuses a new statement carrying the line list unless
each listed line appears once, is a priced line of its practice on a case the statement lists, and the figure is their
sum (Appendix D)? Built only with Q1. It brings a ledger trigger reading pricing and triage tables, a daily failure if
it refuses by mistake, and two planned replacements: within the remaining ask's exception (needed anyway), and in an
exception of its own when case lines follow re-pricing.

*Lane A recommends yes:* the database then recomputes this figure from rows that never change, as it does recovered
and interest; a mistaken refusal stores nothing wrong; and neither later change can pass its tests without replacing
it. Without it, the only check would be the reader recompute (Not asked now), which would mark a wrong figure on the
page and refuse its print but leave the statement stored for good; the database check refuses it at write. Unlike
approved-unposted, this figure is a plain sum, and a test catches each planned drift. A looser check (each line's
counted cents stored and summed, lines matched by service line) would survive both changes but check little more than
the writer's sums, accept a priced line the case never counted, and settle now, before the remaining ask is designed,
the stored format that change must set anyway.

**Q3.** May `roi_links_valid` also refuse an empty links object `{}` (Appendix A with Q1, C without)?

*Lane A recommends yes:* a stored `{}` could never be corrected or deleted, so it would stay unreadable. With Q1 it
adds one `coalesce` to the same migration, nothing measurable; without Q1 it is a migration of its own in schema PR 5
(Appendix C: a preflight, a deploy test, your approval of record and a turn of the schema queue).

## Appendix: the exact text granted
Each function as `pnpm db:domain-model` would print it after the migration; at most one of A, B or C is built (table
above). Each hash is that body's SHA-256 (first 16 characters), as domain-model.md's function appendix prints it;
today's are `49416713dd4d13dd` (`roi_links_valid`) and `5a8bc6319828acb2` (`roi_statement_rules`).

### A. `roi_links_valid` if Q1 and Q3 are yes (body `13c4dd46b9203095`)
The key line accepts four or five keys; `coalesce` turns `{}`'s null key list into a refusal.

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

### B. `roi_links_valid` if Q1 is yes and Q3 no (body `c50446070bb177d8`)
A without the `coalesce`: `{}` still passes, as today.

```sql
CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k) IN (
           ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered'],
           ARRAY['actionable_open', 'actionable_open_lines', 'approved_unposted', 'interest', 'recovered'])
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;
```

### C. `roi_links_valid` if Q1 is no and Q3 yes (body `1aba51347f92789c`)
Today's body with `coalesce` added to its key line: four keys only, `{}` refused.

```sql
CREATE OR REPLACE FUNCTION public.roi_links_valid(links jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT jsonb_typeof(links) = 'object'
     AND coalesce((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(links) k), '{}') = ARRAY['actionable_open', 'approved_unposted', 'interest', 'recovered']
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_each(links) e
        WHERE jsonb_typeof(e.value) <> 'array'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(e.value) v WHERE jsonb_typeof(v) <> 'string' OR v #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
$function$;
```

### D. `roi_statement_rules` if Q1 and Q2 are yes (body `ba8293836b9cd5aa`)
Today's body plus `lines record;` in `DECLARE` and the block from the comment to its `END IF;` before the last
`RETURN NEW`; every other line is today's, word for word.

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
