# PR 5 ledger freeze ask (ask-v2.md): review issues rejected

## Round of thirteen issues (2026-11-07, base 8a722f80)
None rejected. Each was checked against 8a722f80 (reconciliation-001, ADR 0082, print.ts, actionable-now.ts,
statement.ts, functions.ts), the queue plan, HANDOFF.md, LANES.md and read/readcost.mjs, and each holds. The draft
before this round is kept at `v2/ask-v2.before-round-4.md`. Prose before the appendix: 12,299 characters (was 11,541);
the four SQL bodies are unchanged (hashes 13c4dd46b9203095, c50446070bb177d8, 1aba51347f92789c, ba8293836b9cd5aa).
Notes where the fix needed a choice:
- Issues 1 and 9 are the same finding (PRs 8 and 11, not milestones); applied once.
- Issue 6: "With any yes" became "With the migration" (and "with a yes to Q1 or Q3"), since a yes to Q2 alone builds
  nothing. The appendix intro now says "at most one of A, B or C".
- Issue 7: the fallback moved into the grant sentence; the Risk bullet is gone.
- Issue 10: Lane A recommends yes to all three, on merit. The looser check is named as the two forms the design
  weighed together (counted cents summed; lines matched by service line), since only together would they survive both
  later changes.
- Issue 11 (Q3): verified that a `{}` statement is unreadable today: print.ts's storedStatement passes
  `row.links.recovered` (undefined) to recomputeStatement, whose `linked()` maps it, so the detail page
  (queries.ts statementOf), the CSV (storedOf, roiStatementCsv) and the print job all throw.
- Issue 13 (when the two Q2-bound changes arrive): the task text was cut off inside its evidence ("PR"), so no fix was
  received. Applied on the visible part: neither has a date; the remaining ask is in no queue (only ADR 0082's "Revisit
  when" and #93's follow-up), and reconciliation-001's PRs 8 and 11 come after the rest of "Handed to Lane A" (the
  plan's ten schema PRs), 6c, 6d, 6e and PR 7 (HANDOFF.md "Next, in order"). Any issue after it was not seen; re-send
  it if one exists.

## Round of twelve issues (2026-11-07, base 8a722f80, re-fetched: origin/claude/build-platform is still 8a722f80)
None rejected. Each was checked against 8a722f80 (print.ts, job.ts, apps/web roi.ts, packages/db/functions
roi_links_valid.sql), the queue plan (sections 5 and 9), #93's body and the ask itself, and each holds. Issue 1 was
also re-run on PostgreSQL 18.4 (port 5433, database tp_r5_check, dropped): a stored four-key row's PDF-record UPDATE
fails the CHECK under a body that requires the fifth key, and passes under Appendix A. The draft before this round is
kept at `v2/ask-v2.before-round-5.md`; the appendix is byte-identical (four bodies unchanged). Notes where the fix
needed a choice:
- Issues 2 and 8 are the same finding (A missing from the fallback list); applied once, with the function's correct
  name (issue 8's fix spells it `roi_linksValid`).
- Issues 5, 6 and 12 are the same finding (Q3's "costs nothing"). Lane A keeps yes in both cases, on merit (the
  founder's rule does not weigh build effort, and a stored `{}` can never be corrected or deleted, since
  `roi_statement_rules` refuses both, so it would stay unreadable). The cost without Q1 is stated: a migration of its
  own in schema PR 5, with a preflight, a deploy test, the approval of record and a turn of the schema queue.
- Issue 9: "schema PR 5 is not opened and the queue moves to PR 6" added after "no migration is built"; the ADR 0082
  Decision 6 fix then goes in a docs-only pull request (said in "Built alongside").
- Issue 10: the fast way out (a writer change that stops storing the fifth key; not frozen, no grant; statements
  written meanwhile neither checked nor rebuildable) and the slow way (a corrected D under a new exception, in a later
  schema PR, days to weeks) are both named. Lane A decides the writer change, since unfrozen code must not be put under
  a grant, does it the day the check is shown wrong (not the writer), tells the founder, and sends the corrected D's
  ask, which the founder rules on. The "skips that day's re-queue of unprinted PDFs" detail (job.ts) was verified but
  left out for length.
- Issue 11: said in Risk that until the "remove" step the check can be switched off without the founder, and in "Why
  the key is not required" that Lane A will ask for the remove step, under its own exception, for the first schema PR
  after PR 5 is deployed. Written "with Q1 built", not "with Q2 built": the plan wants the key required on new rows
  whether or not Q2 is granted. The separate "Not asked now" bullet on the remove step was folded into that sentence.
- Length: prose before the appendix is 13,385 characters (was 12,299). The twelve fixes add about 1,300; wording was
  tightened throughout (about 250 saved), but no further cut was found that did not drop a fact an earlier round
  required (measurement figures, the dump's columns, the PR 8 and 11 descriptions, the looser-check reasons). If the
  orchestrator wants it nearer 12,000, the least costly cuts are the Measurements row on `roi_links_valid` timing and
  the PG18 figures in parentheses.

## Round of nine issues (2026-11-07, base 8a722f80, re-fetched: origin/claude/build-platform is still 8a722f80)
None rejected. Each was checked against 8a722f80 (reconciliation-001.md :240 and "Ledger semantics", ADR 0082
Decisions 6 and 7, Consequences and "Revisit when", deploy-and-rollback.md :3, :20, :36 and :330, job.ts,
statements.ts, packages/ledger/src statement.ts and roi.ts, print.ts :100, the ROI detail page :62), the ops docs
(designs/ledger-interest-once.md section 10.1, HANDOFF.md :64 and :710, LANES.md :338, the queue plan's sections 1
and 5, #93's "Freeze exception") and the ask itself, and each holds. The draft before this round is kept at
`v2/ask-v2.before-round-6.md`; the appendix is byte-identical (four bodies unchanged). Notes where the fix needed a
choice:
- Issue 1: the suggested parenthetical is used word for word, and "not `apps/worker` or `apps/web`" is gone. To fit
  the corrected rule, the Risk bullet's "touch no ledger table" now reads "touch no ledger table or function".
- Issue 2: the suggested sentences are used; the shared proofs are named once, by heading the proof list "Shared,
  with the migration", not listed again in the questions (length).
- Issue 4: the "remove" step can land before the launch tag. Every image from PR 5 on writes five keys, and nothing
  runs before the first release, so Lane A asks once PR 5 merges ("after PR 5 is deployed" is gone). The ask does not
  tie it to the next schema PR, since PR 6 needs no freeze exception and the plan's section 5 says a frozen item
  would block a PR it joined. Stated as a trade for the founder to weigh in that ask: landing before launch also
  ends the no-grant way out of a mistaken Q2 refusal before production ever has it.
- Issue 5: defined in the same paragraph as the runbook's phrase: `roi_statement_rules` refuses, on insert, a new
  statement without the key; nothing to backfill.
- Issue 6: Lane A's answer is that it does not recommend a database check of approved-unposted. Unlike recovered,
  interest and the actionable figure (plain sums), it is the ledger's per-line netting at the proof level
  (`approvedUnproved`, roi.ts:80), so a SQL copy could drift and refuse correct statements. The reader already
  recomputes it at display (a mismatch alert) and at print (print.ts throws `StatementMismatchError`). This is a
  judgement, not a measurement; the orchestrator may want it reviewed.
- Issue 9: "Lane A can later rebuild ... with a database query, as the tests do". Support is not named, because no
  support path that runs database queries was found.
- Length: prose before the appendix is 13,399 characters (was 13,385). The nine fixes add about 1,650. About the same
  was cut: the measurements are bullets with PG18's times only (production's; the results held on both versions);
  the dropped-repeat and `roi_links_valid` timings shrink to "costs as today"; the dump's "before any print" is gone,
  and so are SUITE-CAP-3's item numbers and #93 question 3's schema PR 9 placement; Q1's recommendation points to
  "Why". Reaching 12,000 would mean dropping facts that this round or an earlier one required. The cheapest further
  cuts are the 16-shape measurement bullet (about 150; the proof list keeps the 16-shape test), "LED-11's registered
  tests and LED-18's statement test unchanged" (65), the last of the looser check's three reasons (55) and the Q2
  question's cost sentence (150; Risk keeps it).

## Round of seven issues (2026-11-07, base 8a722f80, re-fetched: origin/claude/build-platform is still 8a722f80)
None rejected. Each was checked first: issue 1 against skeptic-r4/chk_time.out, rerun18/a.out (t4_time, t5_trig_time)
and t3_trigger.sql (the t5 table's CHECK calls the proposed body, so 128 to 129 ms includes it); issue 2 against
read/readcost.5492.out; issue 4 against deploy-and-rollback.md :3 and :75-76 and job.ts at 8a722f80; issues 5 and 7
against ADR 0082 Decision 7 and "Revisit when" at 8a722f80 and the first ask's part 2 (lane-a-ledger-freeze-ask-pr5.md:
"This point holds with 1a alone as well"). The draft before this round is kept at `v2/ask-v2.before-round-7.md`; the
appendix is byte-identical (four bodies unchanged). Notes where the fix needed a choice:
- Issue 3: the fault-attribution parenthesis covers every appendix, not only A ("lines an appendix keeps from today's
  body belong to no question"), since B, C and D also keep today's lines; this narrows nothing and widens nothing.
- Issue 4: "no grant needed" and the suggested "no freeze exception needed" were merged; the "remove" step sentence
  carries "days to weeks" once. The closing sentence now says Lane A changes the writer "while that helps".
- Issue 5: said one way in Why (the remaining ask changes `roi_links_valid` under an exception whatever Q2's answer;
  with Q2 that exception also replaces `roi_statement_rules`) and in Risk (only re-pricing adds an exception the freeze
  would not flag). Q2's cost sentence and the looser check's third reason now match ("settle now ... the stored
  format that change must set anyway").
- Issue 7: the reader recompute is named as the alternative, with what each catches and when; the "Not asked now"
  bullet on showing the check now names it "the reader recompute (ADR 0082 Decision 7)".
- Length: prose before the appendix is 13,985 characters (was 13,399). The seven fixes add about 1,500; about 900
  was cut by wording, plus: the 16-shape measurement bullet (the proof list keeps the test), "LED-11's registered tests
  and LED-18's statement test" (now "their tests unchanged"), `ledger_line_stage`'s note, `recomputeStatement`'s name,
  "with exact text", and the ADR 0082 citation for "nothing deployed before launch". Reaching 12,000 would drop facts
  this round or an earlier one required; the cheapest further cuts are the Q2 question's cost sentence (Risk holds it,
  about 230), the dump's case list (about 90) and the SUITE-CAP-3 items' reasons (about 40).

## Round of one issue (2026-11-07, base 8a722f80, re-fetched: origin/claude/build-platform is still 8a722f80)
None rejected. Checked: t3_trigger.sql, rev/t8_daily.sql and t5_trig_time.sql install only the test trigger
`t.roi_statement_rules_block()` (BEFORE INSERT, no recovered or interest check), whose IF ... END IF block is byte
for byte D's; the whole of D ran only in skeptic-r4/d_test4.out (6 priced lines; LED-11 refused first at "== 2", the
PDF record "UPDATE 3" at "== 14") and t6_full.sql (3 lines); at 30,795 lines the PDF record ran only under the CHECK
(rerun18/a.out, t4_time: "UPDATE 1", the five-key row). The Measurements bullet is split as suggested, word for word;
the appendix is byte-identical. Prose before the appendix: 14,138 characters (was 13,985).

## Round of two issues (2026-11-07, base 8a722f80, re-fetched: origin/claude/build-platform is still 8a722f80)
None rejected. Checked: in rerun18/a.out only t3's statement 1 lists 30,795 lines ("1 accepted | 92385000 | 30795");
statements 2 to 6 list one or two lines, 9 none, 7 (four keys, 9000) one case; rev/t8_daily repeats the full payload
and refuses it at cents + 1; t4_time's "UPDATE 1" is that row under the CHECK. infra/lib/constructs/database.ts:138
sets VER_18 and :172 autoMinorVersionUpgrade; 18.4 is only the test server (rerun18/server.log:1). One wording change
from the suggested text: "at one or two lines each" became "listing two lines or fewer", since Q2's sixth proof (a
nonzero figure with no lines, statement 9) lists none. Appendix byte-identical; prose before it 14,201 characters (was
14,138).
