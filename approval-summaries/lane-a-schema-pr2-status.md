# Schema PR 2: the ledger lookups (SUITE-CAP-3's two ledger-function bodies, under the founder's grant of 2026-11-06)

Lane A, W11 (https://claude.ai/code/session_019i9ifBgvfeZAe47vuU7EUC), from 2026-11-11 11:22 UTC. Plan:
`approval-summaries/lane-a-schema-queue-plan-2026-11-07.md` section 2. Grant: `approval-summaries/founder-asks-2026-10-27.md`,
"Decided 2026-11-06"; the granted text: `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md` at 38123394.

## RESUME-BLOCK (current at 2026-11-11 15:55 UTC)
- **State: draft PR #143 is OPEN** (https://github.com/PureTideWater/PhysicalTherapy/pull/143), head **c4272c33** on
  `co-001/ledger-function-bodies` (= `co-001/wip-ledger-function-bodies`), base 3bff4fd6. W11 is subscribed. Its
  description is `lane-a-wip/schema-pr2/pr-description.md`.
- **The full local suite ran once on c4272c33, all green** (`lane-a-wip/schema-pr2/suite-summary.txt`): only
  `--check --require-approval` fails, on the blank approval line. Unit 13,500; infra 815; golden 381; oracle 738;
  database 10,220 (1 skipped); e2e 87. Mutation left to CI.
- **CI, attempt 1 (run 43043707704, 14:58 UTC):** static, lint, build, images, capacity, `screening-capacity gate`,
  `mutation` and `approval-of-record` green; `domain model` red on the blank approval line alone (its log: the document
  and the function files match the schema on CI's PostgreSQL 18.6). `unit`, `db 1-4` and `e2e 1-2` failed BEFORE any
  test: the runner could not resolve Ubuntu's archive hosts while `playwright install --with-deps chromium` fetched
  system packages (not this PR's). **Failed jobs re-run once at 15:53 UTC** (W11); a second failure of a test job is
  real and gets read. Check-in set for 16:38 UTC. The container restarted again about 15:50 UTC (checkout intact).
- **Next, in order:** (1) CI on c4272c33: every check green but `domain model` and `all green` (the blank line); a red
  check otherwise: reproduce, fix, show it passing, push; (2) then post the suggested approval line as ONE
  pull-request comment: `gh api repos/PureTideWater/PhysicalTherapy/pulls/143/comments -f commit_id=<head sha>
  -f path=docs/product/domain-model.md -f side=RIGHT -F line=<the last line's number> -f body=$'```suggestion\nApproved
  by: Tyler Williams  Date: <YYYY-MM-DD>  Document SHA-256: `47fae5d1e01a8417244275f6c56cb603a367c90595882e89a615485964c7d10e`\n```'`
  followed by the Claude Code footer lines (take the exact line from `pnpm -s db:domain-model --check
  --require-approval` on a fresh database; never write the line or approvers.json; never a review); (3) update the
  description's "CI on this head" row; mark ready if the lane's practice asks; send the orchestrator the link with the
  description's "What the founder should know before approving"; (4) end the turn; merge only after the founder's
  "Commit suggestion" commit and green required checks, with the base an ancestor of the head (rule 2a: if the base
  moved, merge it, fast checks, generators, push, wait for CI); then unsubscribe and record the merge here.
- **Not in this PR:** ADR 0093's status line (rides PR 3); step 7b's move (a no-migration follow-up); the every-state
  `ledger_line_net` body (candidate for schema PR 5's ask); a guard on `service_line.practice_id` (proposal).
- **After any restart:** setup script if PostgreSQL is down; `git -C /home/user/PhysicalTherapy checkout
  co-001/ledger-function-bodies` (a restart put the checkout back on `claude/build-platform` once).

## The run of record (the tree the PR merges onto: base 3bff4fd6; `run-of-record-compare.txt`, `run-of-record-queue.log`)
Seeds migrated from the base without the migration; before = those bodies (hashes abbcba68…/f151e27e… recorded per
run), after = the placed migration applied as tp_owner in one transaction (834cdefc…/5d0a94c0… recorded per run).
| seed | pass before | pass after | `ledger_line_net` | `ledger_entry_rules` | dumps |
| --- | ---: | ---: | ---: | ---: | --- |
| spread R, 2,000 lines | 54.7 s | 18.8 s | 36.8 s to 3.1 s | 2.1 s to 1.3 s | IDENTICAL row for row, in order, `seq` included (20,635 rows) |
| F, 10,000 lines | 226.8 s | 76.0 s | 94.8 s to 2.2 s | 54.4 s to 3.9 s | IDENTICAL (102,907 rows) |
| A's month, 30,795 lines | 1,745.5 s | 333.2 s | 858.9 s to 7.4 s | 565.3 s to 15.5 s | IDENTICAL (316,770 rows); 30,795 approved, posted and recovered; 494,780,000 cents posted, in both |

Not a quiet container throughout: the delta reviews (psql only) and this session's pushes ran beside A's "after"
pass. The first run (below) is the quieter one for A's "after" (317.1 s).

## Reviews, round 2 (delta; `review-database-delta.md`, `review-money-delta.md`): nothing blocking
Every finding checked, then applied as wording (ADR 0087, reconciliation-001, the test's comments, the description):
the match lookups are a sequential scan on a ledger analyzed while empty; the plan cache is what keeps a pass's first
plan; the slow state starts at about 160 entries; "refuses more, never less" narrowed; the owner role also runs
content loads; R's seed is analyzed-empty; a second superuser-only differing state named (an entry whose line is no
row, foreign key off); `compare.py` now requires the settle-order check to match (all three dumps re-compared).
Left as it is, with the reason in the description: the migration's own comment says "a few hundred to some tens of
thousands" (true of that range; it points to the ADR), since rewriting the migration needs the marker again.
Both test files: 14 of 14 green on the new bodies (13:05 UTC; the worker file's comments changed since, no code).

## Checks done
- **The grant's text (build start, plan section 2):** the two SQL blocks of the ask at the grant commit 38123394 and
  in the ask today are identical (sha256 of both extractions 34f4e868e44ed251…). The plan and the grant agree.
- **The base under the plan:** on edab4d4d both installed bodies are still migration 20261027090000's: prosrc SHA-256
  f151e27ea09f28c1… (`ledger_line_net`) and abbcba68f46fd135… (`ledger_entry_rules`). #126, #134, #136, #137, #140 and
  #141 changed neither. The granted `ledger_entry_rules` differs from the installed one in exactly the two statements.
- **Decision (W11, the safer reading of an exact grant):** the design's section 14.1 proposed marker comments
  (`-- plan-guard: …`) inside the two bodies for the plan test to cut statements by. They would change the granted
  bodies' text, so they are not used: the bodies are the ask's bytes, and the plan test finds each statement in the
  installed body itself (the whole SQL body of `ledger_line_net`; every read of `ledger_match` in `ledger_entry_rules`,
  exactly two expected), so an edited body is still what it plans.
- **The draft applied by hand** (as tp_owner, one transaction, on a database migrated to 20261111090000):
  `pg_get_functiondef` of each function equals the ask's block byte for byte; each function's pg_proc row is the same
  but its body (oid, owner, ACL, search_path, SECURITY INVOKER, volatility, strictness, language, cost); the triggers of
  ledger_entry are the same; new body hashes 5d0a94c0a294a732… (`ledger_line_net`) and 834cdefc070b08db…
  (`ledger_entry_rules`); a second apply is refused by the preflight. Locks taken: ACCESS SHARE on `ledger_entry` and
  `service_line` only (the SQL body's check), nothing a reader or writer waits for.
- **The proof tests on the base (no migration):** `apps/worker/src/reconcile/ledger-lookups.db.test.ts`, in its final
  form 7 pass and 4 fail (first form: 8 and 2). The four that fail are the plan guard's cases, as the ask requires it to fail first: `ledger_line_net`'s line read takes
  `ledger_entry_by_date` (expected `ledger_entry_by_line`), and `ledger_entry_rules`' correction lookup takes
  `ledger_match_standing` (expected `ledger_match_pkey`). The refusal tests (no match; another practice's match with
  both practices in scope; a reversed match on the entry path and on the correction path; a correction whose match the
  scope cannot read) and the cross-practice and net tests pass on the base. Log:
  `lane-a-wip/schema-pr2/plan-guard-fails-on-base-edab4d4d.log`.
- **Write-equality, first run (WIP tree = edab4d4d's code; before = the tree's migrations, after = the draft applied):**
  spread R, 2,000 lines: IDENTICAL row for row, in order, `seq` included (20,635 rows; settle entries in match `seq`
  order). F 10,000 and A's month: running (`lane-a-wip/schema-pr2/probe/`, queue log in the session's scratchpad).

## Reviews, round 1 (2026-11-11 11:45 UTC; reports `lane-a-wip/schema-pr2/review-database.md`, `review-money.md`)
Each finding was checked before any change.
- **DB 2 (plan), CONFIRMED and widened (`plan-probe` runs, W11):** as tp_app, generic plan, never-analyzed ledger. New
  `ledger_line_net`: `ledger_entry_by_line` at 0 to 120 entries; `ledger_entry_by_date` + Filter + Sort at 200 to
  80,000; `ledger_entry_by_line` at 100,000. Old body: `ledger_entry_by_date` up to 200, bitmap at 1,000,
  `ledger_entry_by_line` from 4,000. Analyzed with rows: both `ledger_entry_by_line`. Analyzed empty: sequential scans
  (both). The match lookups: `ledger_match_pkey` in every state (new). So the design's "whatever the statistics" is
  false, and in the middle state the new body is the slower one. Told to the orchestrator 11:50 UTC with the decision:
  build exactly the granted bodies (the grant's condition is unchanged money, which holds); state the limit in the
  migration's comment, ADR 0087's note and the PR description; the plan test holds the states where the claim is true
  (empty, and first rows). A body right in every state needs a new founder ruling (candidate: PR 5's ask).
- **DB 1 / money 1 (the invariant), CONFIRMED:** `tp_owner` may UPDATE `service_line.practice_id` (no guard trigger);
  `tp_app` may not; no migration or function does. Wording corrected in the draft, `equivalence.md` item 5 and
  reconciliation-001. Proposal outside the item: a guard trigger on `service_line.practice_id` (its own schema PR).
- **Money 2 (note), CONFIRMED:** a direct call with a NULL line under a malformed `app.practice_ids` gives 0 (old) and
  22P02 (new). Recorded in `equivalence.md` 5a; no code path.
- **Money 3, 4 (test gaps), ACCEPTED:** added a two-practice scope with the other practice first, and superuser-made
  corrections whose target is no row.
- **Money 5 (method), ACCEPTED:** the dumps cover a pass's writes (no correction, no refusal); said so in
  reconciliation-001 and to be said in the PR description.
- **DB 4 (note), ACCEPTED:** the plan test counts reads spelled FROM or JOIN, with or without the schema.
- **DB 3, 5 (notes):** analyzed-empty plans are sequential (recorded above); the generated function files come with
  the migration's placement.
- Next: run the reworked worker test on the base (plan group must fail, the rest pass); a delta review after the
  migration is placed reads only what changed since round 1.

## Write-equality, first run (edab4d4d's code; before = the tree's migrations, after = the draft applied)
| seed | pass before | pass after | `ledger_line_net` | `ledger_entry_rules` | dumps |
| --- | ---: | ---: | ---: | ---: | --- |
| spread R, 2,000 lines | 53.7 s | 19.0 s | 36.2 s to 3.1 s | 2.0 s to 1.3 s | IDENTICAL row for row, in order, `seq` included (20,635 rows) |
| F, 10,000 lines | 220.9 s | 79.2 s | 92.1 s to 2.2 s | 52.2 s to 4.0 s | IDENTICAL row for row, in order, `seq` included (102,907 rows) |
| A's month (F's shape, 30,795 lines) | 1,770.2 s | 317.1 s | 863.3 s to 7.1 s | 589.4 s to 15.0 s | IDENTICAL row for row, in order, `seq` included (316,770 rows); 30,795 approved, posted and recovered, 494,780,000 cents posted, in both |
| **the middle state:** F 10,000 on a ledger pre-filled with 20,000 never-analyzed entries of another tenant | 132.0 s | 168.5 s | 2.0 s to 90.8 s | 52.2 s to 4.1 s | same approved and posted cents (161,270,000 each); rows not dumped |

These are the first run, on the WIP tree. **The run of record is on the tree the PR merges onto (after #142).**

## Open
- The marker refusal (above).
